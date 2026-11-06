#!/usr/bin/env node
/**
 * api-server.js — 知识库 HTTP API 服务（零依赖）
 *
 * 功能：
 * 1. 只读查询端点：实体列表 / 实体详情 / 语义检索
 * 2. 写入端点：会话消息入库（复用 auto-ingest 批处理链）
 * 3. 认证：设置 AING_API_KEY 后，除 /health 外全部要求 Bearer 认证
 * 4. 输入防护：实体 ID 白名单字符校验（阻断路径穿越）、请求体 1MB 上限
 *
 * ❌ 已砍除组件：多租户 / X-Tenant-ID 会话隔离（2026-09-14 用户决定）。本包定位为单用户个人知识代谢引擎：
 * 租户前缀从未真正隔离数据（共库共表，仅会话键加前缀），却使能力声明虚高并引入文件名净化负担。
 * 门禁 C10f 扫到 tenant 残留即红，防止死代码复活。
 *
 * 用法：
 *   node src/api-server.js
 *
 * 环境变量：
 *   AING_API_PORT   监听端口，默认 3789
 *   AING_API_KEY    认证密钥（未设置则仅监听 127.0.0.1，只读本机开放）
 *
 * 端点：
 *   GET  /health                        健康检查（公开）
 *   GET  /api/entities                  实体列表
 *   GET  /api/entity/<id>               实体详情 + 最新 KESPI
 *   GET  /api/query?q=<词>&limit=<N>    全链检索（answer-pack）
 *   POST /api/ingest                    会话消息入库 {sessionId, role, content}
 *
 *   ── 意识神经控制 + 备忘录（agent ↔ aing 的主界面）──
 *   GET  /api/consciousness             意识神经状态（kernel.status：焦点/唤醒/通道健康/注意力）
 *   GET  /api/consciousness/briefing    备忘录（热点+告警+维护建议+意识反应，agent 冷启动第一读物）
 *   POST /api/consciousness/event       agent 向 kernel 投递意识事件（channel/intensity/target/...）
 *   GET  /api/consciousness/lineage     最近决策谱系（sense→assess→deliberate→verify→record）
 *   POST /api/consciousness/sense       agent 感知（经 adapter.search 检索 → controller.sense 记录）
 *   POST /api/consciousness/assess      agent 评估（投递事件 → kernel.ingest → controller.assess 记录）
 *   POST /api/consciousness/inhibit     抑制某目标（kernel.inhibit；唯一清除路径 = 到期，见 src/neural.js）
 *   POST /api/consciousness/deliberate  协商维护（controller.deliberate → adapter.deliberateMaintenance，只出共识不执行）
 *   POST /api/consciousness/verify      记录校验（controller.verify → decision lineage，不需外部 adapter）
 *   POST /api/consciousness/record      记录结果与教训（controller.record → decision lineage）
 *   GET  /api/consciousness/approvals-pending   待人批审批请求（approvals-pending 持久层只读清单，W2 2026-11-03）
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');
const { SessionStore } = require('./auto-ingest');
const { searchCandidates } = require('./query');
const { ConsciousnessKernel } = require('./consciousness-kernel');
const { ConsciousnessController, MODES } = require('./consciousness-controller');
const { HermesAingAdapter } = require('./hermes-aing-adapter');
const { buildMemo } = require('./memo');

const PORT = parseInt(process.env.AING_API_PORT, 10) || 3789;
const API_KEY = process.env.AING_API_KEY || null;
const BODY_LIMIT = 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9\-_\u4e00-\u9fff]+$/; // 实体 ID 白名单，天然阻断 ../ 穿越

// 标签净化（2026-11-06 洞②收口）：标签是加载单位 + KESPI KA 加权（纪律 7），
// API 外来写面的标签须限定：每标签 ≤100 字 / 去控制字符 / 每实体 ≤20 个。
// 防恶意/误传标签污染 query 检索召回、自动建链加权、KA 评分。
function sanitizeTags(raw) {
  if (!Array.isArray(raw)) return '[]';
  const clean = raw
    .map(t => String(t || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 20);
  return JSON.stringify(clean);
}

const sessions = new SessionStore();
let store = null;
let vectorSearch = null;

// M4 自我报告：知识库根路径（模块级常量，briefing handler 需要读 self-state/训练证据/决策链）
const KB_ROOT = path.resolve(__dirname, '..');

// 意识神经层（agent ↔ aing 的真正界面）
let consciousnessKernel = null;
let consciousnessController = null;
let aingAdapter = null;

function json(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function authorized(req) {
  if (!API_KEY) return true; // 未设密钥 = 本机信任模式
  const header = String(req.headers['authorization'] || '');
  const expected = `Bearer ${API_KEY}`;
  // N2: 常数时间比较，消除 Bearer 凭据的时序侧信道（长度先行相等是 Node API 要求，仅泄露长度）
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let aborted = false;
    const chunks = [];
    req.on('data', c => {
      if (aborted) return;                       // 已超限：停止累积（内存有界），socket 保持活俾 response 写完
      size += c.length;
      if (size > BODY_LIMIT) {
        aborted = true;
        // P2-3（2026-11-02 代码审查）：旧实现 req.destroy() 后写 response 会 ERR_STREAM_DESTROYED，
        // 且 reject 无状态码 → 顶层 catch 一律 500。现：标记 aborted + req.resume() 排干余体，
        // socket 唔拆（response 能正常写 413），错误带 status=413 交顶层 catch 映射。
        const err = new Error('请求体超过 1MB 上限');
        err.status = 413;
        err.code = 'BODY_TOO_LARGE';
        reject(err);
        req.resume();                            // 排干剩余 body，socket 干净收尾
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', (e) => { if (!aborted) reject(e); });
  });
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname.replace(/\/+$/, '') || '/';

  // 健康检查：永远公开
  if (p === '/health') {
    return json(res, 200, { status: 'ok', mode: API_KEY ? 'auth' : 'local-trust', uptime: process.uptime() });
  }

  // 其余端点统一认证
  if (!authorized(req)) {
    return json(res, 401, { error: '未认证：需要 Authorization: Bearer <AING_API_KEY>' });
  }

  // 实体列表
  // Agent-first：一次调用判定要不要管（C7 同源的运行时产品状态）
  if (p === '/api/status' && req.method === 'GET') {
    const st = store.getStats();
    let distillDebt = 0, pendingKespi = 0, computed = 0;
    try {
      // kespi_status 真源在 wiki/entities/*.md frontmatter（双脑契约：文件是事实源）
      const dir = path.join(__dirname, '..', 'wiki', 'entities');
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
            const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/kespi_status:\s*(\w+)/);
          if (!m) continue;
          if (m[1] === 'pending') pendingKespi++;
          if (m[1] === 'computed') computed++;
        }
      }
    } catch (e) { /* wiki 目录缺失（全新包） */ }
    try {
      const debt = store.all("SELECT COUNT(*) as n FROM entities WHERE status = 'pending-distillation'");
      distillDebt = debt.length ? debt[0].n : 0;
    } catch (e) { /* 列不存在（旧包） */ }
    return json(res, 200, {
      status: 'ok',
      mode: API_KEY ? 'auth' : 'local-trust',
      uptime: Math.round(process.uptime()),
      entities: st.entities, links: st.links,
      avgKespi: st.avgKespi, pendingErrors: st.pendingErrors,
      kespiLifecycle: { computed, pending: pendingKespi },
      distillationDebt: distillDebt
    });
  }
  if (p === '/api/entities' && req.method === 'GET') {
    const entities = store.getEntities().map(e => ({
      id: e.id, name: e.name, type: e.type, updated_at: e.updated_at
    }));
    return json(res, 200, { count: entities.length, entities });
  }

  // 实体详情
  const entityMatch = p.match(/^\/api\/entity\/([^/]+)$/);
  if (entityMatch && req.method === 'GET') {
    const id = decodeURIComponent(entityMatch[1]);
    if (!ID_PATTERN.test(id)) {
      return json(res, 400, { error: '非法实体 ID' });
    }
    const entity = store.getEntity(id);
    if (!entity) return json(res, 404, { error: `实体不存在: ${id}` });
    let kespi = null;
    try { kespi = store.getLatestKespi(id); } catch (e) { /* 无记录 */ }
    return json(res, 200, { entity, latestKespi: kespi });
  }

  // 检索（agent-first：走 searchCandidates 全链融合，不再是裸向量检索）
  if (p === '/api/query' && req.method === 'GET') {
    const q = url.searchParams.get('q');
    if (!q) return json(res, 400, { error: '缺少查询词 ?q=' });
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 8, 50);
    const namesOnly = url.searchParams.get('names') === '1';
    const forceSlow = url.searchParams.get('slow') === '1';
    const pack = url.searchParams.get('pack') !== '0'; // 默认带 answer-pack

    const { candidates, semanticAvailable, avgSim, slowExpanded } = await searchCandidates(q, { limit, namesOnly, forceSlow });

    const visible = candidates.filter(e => namesOnly ? e._nm > 0 : true);
    const results = visible.slice(0, limit).map(e => {
      const item = {
        id: e.id, name: e.name, type: e.type,
        scores: {
          final: Number(e._final || 0).toFixed(3),
          semantic: Number(e.score || 0).toFixed(3),
          keyword: Number(e._kw || 0).toFixed(3),
          name: Number(e._nm || 0).toFixed(3),
          kespi: e._kespi != null ? Number(e._kespi).toFixed(2) : null,
          slowRecall: !!e._slowRecall
        },
        updated_at: e.updated_at || null
      };
      if (pack) {
        // answer-pack：agent 不用再二次查详情
        item.snippet = (e.content || '').slice(0, 200).replace(/\n/g, ' ');
        try { item.tags = JSON.parse(e.tags || '[]'); } catch (err) { item.tags = []; }
        try {
          const links = store.all('SELECT target_id FROM links WHERE source_id = ? UNION SELECT source_id FROM links WHERE target_id = ?', [e.id, e.id]);
          item.neighbors = links.map(l => l.target_id || l.source_id).filter(id => id !== e.id).slice(0, 5);
        } catch (err) { item.neighbors = []; }
      }
      return item;
    });

    return json(res, 200, {
      query: q,
      mode: semanticAvailable ? 'semantic-384' : 'hash-64',
      avgSim: Number(avgSim.toFixed(3)),
      slowExpanded,
      count: results.length,
      results
    });
  }

  // 会话消息入库（单用户：会话键就是 sessionId，不再拼租户前缀）
  // role: user（用户提问）/ assistant（agent回复）/ analysis（agent分析）/ research（收集资料）
  if (p === '/api/ingest' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.sessionId || !body.content) {
      return json(res, 400, { error: '需要 {sessionId, content} 字段' });
    }
    const r = sessions.addMessage(String(body.sessionId), {
      // A2b（2026-11-05 修单）：透传原始 role，不再在入口 `|| 'user'` 静默兜底——空/缺/非法 role
      // 交 addMessage 的 normalizeRole（缺省返 null）+ unknown-role 分支拒收（400），
      // 旧法在入口预设为 'user' 令那分支对空 role 成死码（agent 不标角色被记成人的话）。
      role: body.role == null ? '' : String(body.role),
      content: String(body.content),
      distillation: body.distillation,
      source: body.source || null,
      // metadata（搜索词/rank/请求对象等采集元数据）自 2026-09-14 起不接收：只入贴出来的详情
    });
    // accepted 只代表"已收进持久缓冲"，不代表已入库。旧响应只回 accepted:true，
    // 实测两条消息后进程退出 → raw 新增 0，调用方却被告知成功（2026-09-14）。
    // 真实落盘看 flushed（本批已写 raw/ 并触发编译链）。自报 distillation 只作提议，
    // 入库档一律 status:pending-distillation，等 distill.js 兑付。
    if (r.rejected === 'unknown-role') {
      // 说话人无法确定时不猜：400 把合法值报回去，避免 Agent 的话被记成用户提问
      return json(res, 400, {
        accepted: false,
        session: String(body.sessionId),
        rejected: 'unknown-role',
        role: r.role,
        allowedRoles: r.allowedRoles,
        aliases: { agent: 'assistant', bot: 'assistant', tool: 'research' },
      });
    }
    if (r.accepted === false) {
      // 采集过程行剥完就空了：如实告知拒收，不假装已缓冲
      return json(res, 422, {
        accepted: false,
        session: String(body.sessionId),
        rejected: r.rejected,
        reason: '正文全部是贴出来之前的采集步骤（命令行/请求行/响应头/报文），按「只入贴出来的详情」口径拒收，未缓冲未入库' 
      });
    }
    return json(res, 200, {
      accepted: true,
      session: String(body.sessionId),
      // A2c（2026-11-05）：显式回实际 role，不再 `|| 'user'` 误导（入口已拒空 role，此处必非空合法）
      role: String(body.role),
      buffered: r.buffered,
      flushed: r.flushed
    });
  }

  // ── 意识神经控制 + 备忘录（agent ↔ aing 的主界面）──

  // 备忘录（agent 仪表台）：aing 状态 + 组件链接状态 + 待办 + 会话交接
  // agent 出场手持这份备忘录，用户只看其中的待办和会话交接
  if (p === '/api/consciousness/briefing' && req.method === 'GET') {
    // 备忘录组装面已抽至 src/memo.js：HTTP 与 CLI 共用同一函数（单一口径，防双脑脱节）
    return json(res, 200, buildMemo({ store, vectorSearch, sessions, consciousnessKernel, aingAdapter, KB_ROOT }));
  }

  // 意识神经状态
  if (p === '/api/consciousness' && req.method === 'GET') {
    return json(res, 200, consciousnessKernel.status());
  }

  // agent 向 kernel 投递意识事件
  if (p === '/api/consciousness/event' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.channel || !body.target) {
      return json(res, 400, { error: '需要 {channel, target} 字段；channel ∈ structure/semantic/temporal/kespi/behavior/feedback/anomaly/intent/generic' });
    }
    const result = consciousnessKernel.ingest([{
      channel: body.channel,
      target: body.target,
      source: body.source || 'agent',
      signalType: body.signalType || 'observed',
      intensity: body.intensity != null ? Number(body.intensity) : 0.5,
      confidence: body.confidence != null ? Number(body.confidence) : 0.7,
      evidence: body.evidence || {},
      suggestedAction: body.suggestedAction || 'observe',
      tags: body.tags || [],
      requiresApproval: !!body.requiresApproval
    }]);
    return json(res, 200, result);
  }

  // agent 感知（经 adapter.search 检索 → controller.sense 记录谱系）
  if (p === '/api/consciousness/sense' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.query) return json(res, 400, { error: '需要 {query} 字段' });
    const lineage = await consciousnessController.sense({
      query: body.query,
      limit: body.limit || 8,
      taskId: body.taskId || null
    });
    return json(res, 200, lineage);
  }

  // agent 评估（投递事件 → kernel.ingest → controller.assess 记录谱系）
  if (p === '/api/consciousness/assess' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.events || !body.events.length) return json(res, 400, { error: '需要 {events: [...]} 字段' });
    const lineage = consciousnessController.assess({
      events: body.events,
      taskId: body.taskId || null
    });
    return json(res, 200, lineage);
  }

  // ── W2 控制面（2026-09-14）：inhibit / deliberate / verify / record ──
  // 与 src/neural.js 同一组转发：这里不写任何阈值与默认值（纪律 5），默认值归 kernel / event 自己那处。
  if (p === '/api/consciousness/inhibit' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.target || !String(body.target).trim()) return json(res, 400, { error: '需要 {target} 字段；可选 {reason, hours}' });
    const target = String(body.target).trim();
    const reason = body.reason ? String(body.reason) : 'agent-api';
    let rec;
    if (body.hours !== undefined && body.hours !== null && body.hours !== '') {
      const h = Number(body.hours);
      if (!Number.isFinite(h) || h <= 0) return json(res, 400, { error: `hours 必须是正数小时，收到 "${body.hours}"` });
      rec = consciousnessKernel.inhibit(target, reason, h * 3600000);   // 仅单位换算；缺省时长归 kernel.inhibit 默认值
    } else {
      rec = consciousnessKernel.inhibit(target, reason);
    }
    return json(res, 200, { ...rec, isInhibited: consciousnessKernel.isInhibited(target), note: 'kernel 无撤销 API：到期自动失效是唯一清除路径' });
  }

  if (p === '/api/consciousness/deliberate' && req.method === 'POST') {
    const body = await readBody(req);
    const lineage = await consciousnessController.deliberate({
      urgency: body.urgency || undefined,
      signals: body.signals,
      taskId: body.taskId || null,
    });
    return json(res, 200, lineage);
  }

  if (p === '/api/consciousness/verify' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, consciousnessController.verify(body));
  }

  if (p === '/api/consciousness/record' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, consciousnessController.record(body));
  }

  // 最近决策谱系（sense→assess→deliberate→verify→record 链路）
  if (p === '/api/consciousness/lineage' && req.method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 10, 50);
    try {
      const lines = fs.readFileSync(consciousnessController.lineageFile, 'utf8').trim().split('\n').slice(-limit);
      const records = lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
      return json(res, 200, { count: records.length, records });
    } catch (e) { return json(res, 200, { count: 0, records: [] }); }
  }

  // ── W2 (2026-11-03)：待人批审批请求（只读；人批入口是 neural.js approve，本路由不执行写入）──
  if (p === '/api/consciousness/approvals-pending' && req.method === 'GET') {
    try {
      const { pendingList, allState } = require('./approvals-pending');
      const pending = pendingList();
      const consumed = allState().consumed;
      return json(res, 200, {
        pendingCount: pending.length,
        pending: pending.map(x => ({ requestId: x.requestId, feedbackId: x.feedbackId || null, requestedWriteScope: x.requestedWriteScope || [], status: x.status || 'awaiting-independent-approval', pendingAt: x.pendingAt || null })),
        consumedCount: Array.isArray(consumed) ? consumed.length : 0,
        lastConsumed: Array.isArray(consumed) && consumed.length ? { requestId: consumed[consumed.length - 1].requestId, decision: consumed[consumed.length - 1].decision, decidedAt: consumed[consumed.length - 1].decidedAt } : null,
        note: '只读清单；人批走 node src/neural.js approve <requestId>；本路由不执行 provider 写入（红线：providerWriteAllowed=false）',
      });
    } catch (e) { return json(res, 200, { pendingCount: 0, pending: [], consumedCount: 0, note: 'approvals-pending 不可用：' + e.message }); }
  }

  // 旧 /api/context 保留兼容，但推荐用 /api/consciousness/briefing
  if (p === '/api/context' && req.method === 'GET') {
    const ctx = { generatedAt: new Date().toISOString() };

    // panel.json（意识层卡 3）
    try {
      const panel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'panel.json'), 'utf8'));
      ctx.panel = panel;
    } catch (e) { ctx.panel = null; }

    // 运行时状态
    const st = store.getStats();
    ctx.health = {
      entities: st.entities, links: st.links,
      avgKespi: st.avgKespi, pendingErrors: st.pendingErrors
    };

    // 最近时间线（最新 5 条会话实体）
    try {
      const recent = store.all("SELECT id, name, source, created_at FROM entities WHERE type='Conversation' ORDER BY created_at DESC LIMIT 5");
      ctx.timeline = recent;
    } catch (e) { ctx.timeline = []; }

    // pending todos
    try {
      const todos = store.all("SELECT id, name, tags FROM entities WHERE type='Todo' AND status='active' ORDER BY created_at");
      ctx.todos = todos;
    } catch (e) { ctx.todos = []; }

    // stale 告警（超 14 天未更新的活跃实体）
    try {
      const stale = store.all("SELECT id, name, type FROM entities WHERE status='active' AND updated_at < datetime('now','-14 days') LIMIT 10");
      ctx.stale = stale;
    } catch (e) { ctx.stale = []; }

    return json(res, 200, ctx);
  }

  // ── agent 自管理：创建实体（Todo/Skill/Output，type 自由字符串零迁移）──
  // 身份闸（2026-11-06 洞①收口）：API 写面不授予 active 身份 / 置信——旧默认
  // status 'active' + confidence 0.7 让外来者绕开 distill.js 兑付，造出「未核验内容
  // 带着知识资产身份」进库（与 ingest 面自报身份铁律 C10g③ 并行的侧门，已封）。
  // 现统一落 pending-distillation / confidence 0；active 只由 distill.js 兑付。
  if (p === '/api/entity' && req.method === 'POST') {
    // 2026-09-17 F3：代谢持库时 503 拒写（常驻服务不能拿旧快照盖新盘），客户端重试即可
    if (require('./metabolism-lock.js').metabolismBusy()) {
      return json(res, 503, { error: 'metabolism-busy', hint: '代谢持库中，本轮跑完重试 / retry after the current cycle' });
    }
    const body = await readBody(req);
    if (!body.name || !body.type) {
      return json(res, 400, { error: '需要 {name, type} 字段；type 自由字符串（Todo/Skill/Output/Concept/...）' });
    }
    // P1-2（2026-11-02 代码审查）：body.id 分支原先**无长度上限**（仅 name 分支 slice(0,80)），
    // 客户端可传任意长 id 进 DB 主键与后续 wiki/entities/ 文件名（Windows 255 字节上限）。
    // 现两条派生路径共用同一上限 128（常量单源），截断后空串/纯非法字符即 400。
    const ID_MAX = 128;
    let id;
    if (body.id != null && String(body.id).trim() !== '') {
      id = String(body.id).trim();
      if (id.length > ID_MAX) id = id.slice(0, ID_MAX);   // 先截断再校验，避免超长主键膨胀
    } else {
      id = String(body.name).replace(/[^\w\u4e00-\u9fff-]+/g, '-').slice(0, 80).toLowerCase();
    }
    if (!id || !ID_PATTERN.test(id)) {
      return json(res, 400, { error: `id 非法或超长（仅允许字母/数字/-_中文，上限 ${ID_MAX} 字符；截断后为空亦拒）` });
    }
    if (store.getEntity(id)) {
      return json(res, 409, { error: `实体已存在: ${id}` });
    }
    const tags = sanitizeTags(body.tags);   // 洞②收口：tags 过净化闸再入 DB（≤100 字/个、≤20 个、去控制字符）
    // 身份闸（2026-11-06 洞①收口）：API 写面不授予 active 身份/置信——旧默认 status 'active' +
    // confidence 0.7 让外来者绕开 distill.js 兑付，把未核验内容抬成知识资产（与 ingest 面自报身份
    // 铁律 C10g③ 并行的侧门，现已封）。统一落 pending-distillation / confidence 0，客户端自报的
    // status / confidence 一律忽略；active 只由 distill.js 兑付（distill.js:263 是 active 唯一写位）。
    store.db.run(
      'INSERT INTO entities (id, name, type, content, tags, status, confidence, source_file) VALUES (?,?,?,?,?,?,?,?)',
      [id, String(body.name), String(body.type), String(body.content || ''), tags, 'pending-distillation', 0, body.source_file || null]
    );
    store._save();
    return json(res, 201, { id, name: body.name, type: body.type, status: 'pending-distillation', confidence: 0, note: '身份铁律：API 写面不授予 active 身份/置信（洞①收口 2026-11-06）；active 只由 distill.js 兑付' });
  }

  // ── agent 自管理：状态翻转（pending→active→archived 等）──
  const patchMatch = p.match(/^\/api\/entity\/([^/]+)$/);
  if (patchMatch && req.method === 'PATCH') {
    if (require('./metabolism-lock.js').metabolismBusy()) {
      return json(res, 503, { error: 'metabolism-busy', hint: '代谢持库中，本轮跑完重试 / retry after the current cycle' });
    }
    const id = decodeURIComponent(patchMatch[1]);
    if (!ID_PATTERN.test(id)) {
      return json(res, 400, { error: '非法实体 ID' });
    }
    const entity = store.getEntity(id);
    if (!entity) return json(res, 404, { error: `实体不存在: ${id}` });
    const body = await readBody(req);
    const updates = [];
    const params = [];
    // 身份闸（2026-11-06 洞①收口）：API PATCH 不可授予 active 身份——
    // active 唯一写位 = distill.js:263（兑付 pending-distillation）。
    // API 面允许降至 pending-distillation / archived / voided，但 403 拒绝抬 active。
    if (body.status) {
      const s = String(body.status);
      if (s === 'active') {
        return json(res, 403, { error: 'active 身份只由 distill.js 兑付（洞①收口 2026-11-06）；API 写面可设 pending-distillation / archived / voided，不可直接抬 active', allowedStatuses: ['pending-distillation', 'archived', 'voided'] });
      }
      updates.push('status = ?'); params.push(s);
    }
    if (body.content) { updates.push('content = ?'); params.push(String(body.content)); }
    if (body.tags) { updates.push('tags = ?'); params.push(sanitizeTags(body.tags)); }   // 洞②收口
    // confidence 移除对外写面（2026-11-06 洞①收口）：知识置信归代谢链管（compile 默认 / distill 兑付），
    // API 外來者唔定置信——同身份铁律並列：未験証內容唔獲知識資產數字。
    if (updates.length === 0) {
      return json(res, 400, { error: '无更新字段（可更新 status/content/tags；confidence 不可经 API 修改——洞①收口 2026-11-06）' });
    }
    updates.push("updated_at = datetime('now')");
    params.push(id);
    store.db.run(`UPDATE entities SET ${updates.join(', ')} WHERE id = ?`, params);
    store._save();
    return json(res, 200, { id, updated: Object.keys(body).filter(k => ['status','content','tags'].includes(k)), note: 'confidence 不对外写（洞①收口）；status active 需走 distill.js' });
  }

  // ── agent 增量感知：上次会话以来变了什么 ──
  if (p === '/api/delta' && req.method === 'GET') {
    const since = url.searchParams.get('since');
    if (!since) return json(res, 400, { error: '缺少 ?since=<ISO时间戳>' });
    let sinceTs = since;
    try {
      const d = new Date(since);
      if (Number.isNaN(d.getTime())) throw new Error('since 格式无效');
      // 断线 K（2026-11-03 第五轮，同形 P2-4）：旧 sinceTs 用 toISOString() 出 ISO-T-Z 串，
      // 去跟 entities.created_at/updated_at 的 SQLite datetime('now')（「YYYY-MM-DD HH:MM:SS」
      // 空格 UTC）做字典序比较——同刻边界实体因 space(0x20) < T(0x54) 被漏算。
      // 归一成空格-UTC 秒格式后再比（.temp/probe-delta.js 真证 d-new 漏→命中）。
      sinceTs = d.toISOString().replace('T', ' ').replace(/\.\d+Z?$/, '');
    } catch (e) { return json(res, 400, { error: 'since 格式无效' }); }
    const added = store.all("SELECT id, name, type FROM entities WHERE created_at >= ? ORDER BY created_at DESC", [sinceTs]);
    const updated = store.all("SELECT id, name, type, updated_at FROM entities WHERE updated_at >= ? AND created_at < ? ORDER BY updated_at DESC", [sinceTs, sinceTs]);
    return json(res, 200, { since: sinceTs, added: added.length, updated: updated.length, items: { added, updated } });
  }

  // ── 标签驱动加载（AGENTS.md 纪律 #7：标签是加载单位）──
  const tagMatch = p.match(/^\/api\/tags\/([^/]+)$/);
  if (tagMatch && req.method === 'GET') {
    // 标签是加载单位（纪律 #7）：本端点必须同时吃裸标签 "x" 与 9 段数值标签 "x:N"。
    // 旧写法用整串全等比较，一旦语料按 compile 的 9 段格式规范化（存为 "x:5"），
    // /api/tags/x 会静默返回 0 命中——查询侧与写入侧格式不一致。/ (parse name + optional strength)
    const parseTag = (raw) => {
      const s = String(raw).trim().toLowerCase();
      const m = s.match(/^(.+):([1-9])$/);
      // 裸标签缺省强度 = 5（纪律 #7：不带 :N 默认中位值），与 auto-link / kespi-check / sprout 同一约定。
      // 不可写 null：Math.max(null, …) 会被强制成 0，让裸标签实体在强度排序里假归零。
      return m ? { name: m[1], strength: parseInt(m[2], 10) } : { name: s, strength: 5 };
    };
    const wantRaw = decodeURIComponent(tagMatch[1]).trim();
    const want = parseTag(wantRaw);
    // 仅当请求串显式带 :N 才作下限过滤；裸名查询 = 挂过即命中。
    // （若把缺省强度 5 当前置下限，弱关联文档 [x:1-4] 会被静默过滤，查询侧比写入侧更严）
    const wantFloor = /:[1-9]$/.test(wantRaw.toLowerCase()) ? want.strength : null;
    const all = store.getEntities({ status: 'active' });
    const matched = all.reduce((acc, e) => {
      let tags = [];
      try { tags = JSON.parse(e.tags || '[]'); } catch (err) { tags = []; }
      const hits = tags.map(parseTag).filter(t => t.name === want.name);
      if (!hits.length) return acc;
      // 请求带强度（/api/tags/x:7）= 下限过滤；不带 = 只要挂过该标签即命中 / strength acts as a floor
      const strength = Math.max(...hits.map(h => h.strength));
      if (wantFloor !== null && strength < wantFloor) return acc;
      acc.push({ id: e.id, name: e.name, type: e.type, strength, tags });
      return acc;
    }, []).sort((a, b) => b.strength - a.strength);
    return json(res, 200, { tag: want.name, minStrength: wantFloor, count: matched.length, entities: matched });
  }

  return json(res, 404, { error: `未知端点: ${req.method} ${p}` });
}

async function main() {
  store = new KnowledgeStore();
  await store.init();
  vectorSearch = new VectorSearch(store);
  await vectorSearch.init();
  try {
    await vectorSearch.enableSemantic();
    console.log('🔎 检索模式: 语义 (384 维本地模型)');
  } catch (e) {
    console.log('🔎 检索模式: hash (64 维；语义模型未就绪)');
  }

  // 意识神经层初始化（agent ↔ aing 的真正界面）
  consciousnessKernel = new ConsciousnessKernel({ baseDir: KB_ROOT, mode: 'coordination-only' });
  aingAdapter = new HermesAingAdapter({
    kbRoot: KB_ROOT,
    sessions,
    store,
    vectorSearch,
    consciousnessKernel
  });
  consciousnessController = new ConsciousnessController({
    adapter: aingAdapter,
    baseDir: KB_ROOT,
    mode: MODES.COORDINATION_ONLY
  });
  console.log('🧠 意识神经层已就绪（coordination-only）');

  const host = API_KEY ? '0.0.0.0' : '127.0.0.1';
  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => {
      // P2-3（2026-11-02 代码审查）：尊重 readBody 带出嘅语义状态码（超限 413 唔再一律 500）；
      // 无 status 嘅未知异常仍落 500。res 未写完前 writeHead 合法（socket 未 destroy）。
      const code = (e && Number.isFinite(e.status)) ? e.status : 500;
      json(res, code, { error: e && e.message ? e.message : 'internal error' });
    });
  });

  setInterval(() => {
    for (const [sid, session] of sessions.sessions) {
      if (session.messages.length > 0) sessions.checkAndIngest(sid);
    }
  }, 10000);

  server.listen(PORT, host, () => {
    console.log('🌐 aing API 服务启动');
    console.log(`   监听: http://${host}:${PORT}`);
    console.log(`   认证: ${API_KEY ? 'Bearer (AING_API_KEY 已设置)' : '本机信任模式（未设 AING_API_KEY，仅监听 127.0.0.1）'}`);
    console.log('   意识神经: /api/consciousness /api/consciousness/briefing /api/consciousness/event /api/consciousness/sense /api/consciousness/assess /api/consciousness/lineage');
    console.log('   知识检索: /api/query /api/entities /api/entity/<id> /api/context');
    console.log('   入库写入: /api/ingest /api/entity(PATCH) /api/delta /api/tags/<tag>');
  });
}

main().catch(e => {
  console.error('API 服务启动失败:', e.message);
  process.exit(1);
});
