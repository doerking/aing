#!/usr/bin/env node
/**
 * api-server.js — 知识库 HTTP API 服务（零依赖）
 *
 * 功能：
 * 1. 只读查询端点：实体列表 / 实体详情 / 语义检索
 * 2. 写入端点：会话消息入库（复用 auto-ingest 批处理链）
 * 3. 认证：设置 AING_API_KEY 后，除 /health 外全部要求 Bearer 认证
 * 4. 多租户：写入端点按 X-Tenant-ID 隔离会话（无该头时默认 tenant=default）
 * 5. 输入防护：实体 ID 白名单字符校验（阻断路径穿越）、请求体 1MB 上限
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

const PORT = parseInt(process.env.AING_API_PORT, 10) || 3789;
const API_KEY = process.env.AING_API_KEY || null;
const BODY_LIMIT = 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9\-_\u4e00-\u9fff]+$/; // 实体 ID 白名单，天然阻断 ../ 穿越

const sessions = new SessionStore();
let store = null;
let vectorSearch = null;

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
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error('请求体超过 1MB 上限'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
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

  // 会话消息入库（按租户隔离会话）
  // role: user（用户提问）/ assistant（agent回复）/ analysis（agent分析）/ research（收集资料）
  if (p === '/api/ingest' && req.method === 'POST') {
    const tenant = String(req.headers['x-tenant-id'] || 'default').replace(/[^a-zA-Z0-9\-_]/g, '-');
    const body = await readBody(req);
    if (!body.sessionId || !body.content) {
      return json(res, 400, { error: '需要 {sessionId, content} 字段' });
    }
    sessions.addMessage(`${tenant}::${String(body.sessionId)}`, {
      role: String(body.role || 'user'),
      content: String(body.content),
      distillation: body.distillation,
      source: body.source || null,
      metadata: body.metadata || null
    });
    return json(res, 200, { accepted: true, tenant, role: body.role || 'user' });
  }

  // ── 意识神经控制 + 备忘录（agent ↔ aing 的主界面）──

  // 备忘录（agent 仪表台）：aing 状态 + 组件链接状态 + 待办 + 会话交接
  // agent 出场手持这份备忘录，用户只看其中的待办和会话交接
  if (p === '/api/consciousness/briefing' && req.method === 'GET') {
    const briefing = aingAdapter.generateBriefing();
    const kernelStatus = consciousnessKernel.status();

    // 组件链接状态：检测各组件是否在线
    const componentLinks = {
      consciousnessKernel: { status: kernelStatus.state, events: kernelStatus.activeEventCount, focus: kernelStatus.focusTargets?.slice(0, 3) || [] },
      vectorSearch: { status: vectorSearch?.mode || 'offline', semantic: vectorSearch?.mode === 'semantic-384' },
      knowledgeStore: { status: 'online', entities: store.getStats().entities },
      metabolism: { status: 'available', lastRun: null }, // 代谢链非常驻，标记可用即可
      autoIngest: { status: 'online', pendingSessions: [...sessions.sessions.values()].filter(s => s.messages.length > 0).length }
    };

    // 会话交接：最近 3 条会话的时间线（上次聊到哪）
    let sessionHandoff = [];
    try {
      sessionHandoff = store.all("SELECT id, name, type, created_at FROM entities WHERE type='Conversation' ORDER BY created_at DESC LIMIT 3");
    } catch (e) {}

    // 待办事项：agent 和用户的待办
    let todos = [];
    try {
      todos = store.all("SELECT id, name, tags, status FROM entities WHERE type='Todo' AND status='active' ORDER BY created_at");
    } catch (e) {}

    // 用户面（对用户负责的部分）：只有待办 + 会话交接
    const userFacing = {
      todos: todos.map(t => ({ id: t.id, name: t.name, tags: (() => { try { return JSON.parse(t.tags || '[]'); } catch (e) { return []; } })() })),
      sessionHandoff: sessionHandoff.map(s => ({ id: s.id, name: s.name, created_at: s.created_at }))
    };

    // agent 仪表台（完整）
    return json(res, 200, {
      generatedAt: new Date().toISOString(),
      // ── agent 仪表台 ──
      consciousness: kernelStatus,
      componentLinks,
      alerts: briefing.briefing.alerts,
      hotspots: briefing.briefing.hotspots?.slice(0, 5) || [],
      recommendations: briefing.briefing.recommendations || [],
      priority: briefing.priority,
      // ── 对用户负责的部分 ──
      userFacing
    });
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

  // 最近决策谱系（sense→assess→deliberate→verify→record 链路）
  if (p === '/api/consciousness/lineage' && req.method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 10, 50);
    try {
      const lines = fs.readFileSync(consciousnessController.lineageFile, 'utf8').trim().split('\n').slice(-limit);
      const records = lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
      return json(res, 200, { count: records.length, records });
    } catch (e) { return json(res, 200, { count: 0, records: [] }); }
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
  if (p === '/api/entity' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.name || !body.type) {
      return json(res, 400, { error: '需要 {name, type} 字段；type 自由字符串（Todo/Skill/Output/Concept/...）' });
    }
    const id = body.id || String(body.name).replace(/[^\w\u4e00-\u9fff-]+/g, '-').slice(0, 80).toLowerCase();
    if (!ID_PATTERN.test(id)) {
      return json(res, 400, { error: 'id 含非法字符（仅允许字母/数字/-_中文）' });
    }
    if (store.getEntity(id)) {
      return json(res, 409, { error: `实体已存在: ${id}` });
    }
    const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';
    store.db.run(
      'INSERT INTO entities (id, name, type, content, tags, status, confidence, source_file) VALUES (?,?,?,?,?,?,?,?)',
      [id, String(body.name), String(body.type), String(body.content || ''), tags, String(body.status || 'active'), Number(body.confidence || 0.7), body.source_file || null]
    );
    store._save();
    return json(res, 201, { id, name: body.name, type: body.type, status: body.status || 'active' });
  }

  // ── agent 自管理：状态翻转（pending→active→archived 等）──
  const patchMatch = p.match(/^\/api\/entity\/([^/]+)$/);
  if (patchMatch && req.method === 'PATCH') {
    const id = decodeURIComponent(patchMatch[1]);
    if (!ID_PATTERN.test(id)) {
      return json(res, 400, { error: '非法实体 ID' });
    }
    const entity = store.getEntity(id);
    if (!entity) return json(res, 404, { error: `实体不存在: ${id}` });
    const body = await readBody(req);
    const updates = [];
    const params = [];
    if (body.status) { updates.push('status = ?'); params.push(String(body.status)); }
    if (body.content) { updates.push('content = ?'); params.push(String(body.content)); }
    if (body.tags) { updates.push('tags = ?'); params.push(JSON.stringify(body.tags)); }
    if (body.confidence != null) { updates.push('confidence = ?'); params.push(Number(body.confidence)); }
    if (updates.length === 0) {
      return json(res, 400, { error: '无更新字段（可更新 status/content/tags/confidence）' });
    }
    updates.push("updated_at = datetime('now')");
    params.push(id);
    store.db.run(`UPDATE entities SET ${updates.join(', ')} WHERE id = ?`, params);
    store._save();
    return json(res, 200, { id, updated: Object.keys(body).filter(k => ['status','content','tags','confidence'].includes(k)) });
  }

  // ── agent 增量感知：上次会话以来变了什么 ──
  if (p === '/api/delta' && req.method === 'GET') {
    const since = url.searchParams.get('since');
    if (!since) return json(res, 400, { error: '缺少 ?since=<ISO时间戳>' });
    let sinceTs = since;
    try { sinceTs = new Date(since).toISOString(); } catch (e) { return json(res, 400, { error: 'since 格式无效' }); }
    const added = store.all("SELECT id, name, type FROM entities WHERE created_at >= ? ORDER BY created_at DESC", [sinceTs]);
    const updated = store.all("SELECT id, name, type, updated_at FROM entities WHERE updated_at >= ? AND created_at < ? ORDER BY updated_at DESC", [sinceTs, sinceTs]);
    return json(res, 200, { since: sinceTs, added: added.length, updated: updated.length, items: { added, updated } });
  }

  // ── 标签驱动加载（AGENTS.md 纪律 #7：标签是加载单位）──
  const tagMatch = p.match(/^\/api\/tags\/([^/]+)$/);
  if (tagMatch && req.method === 'GET') {
    const tag = decodeURIComponent(tagMatch[1]);
    const all = store.getEntities({ status: 'active' });
    const matched = all.filter(e => {
      let tags = [];
      try { tags = JSON.parse(e.tags || '[]'); } catch (err) {}
      return tags.some(t => String(t).toLowerCase() === tag.toLowerCase());
    }).map(e => ({ id: e.id, name: e.name, type: e.type, tags: (() => { try { return JSON.parse(e.tags || '[]'); } catch (err) { return []; } })() }));
    return json(res, 200, { tag, count: matched.length, entities: matched });
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
  const KB_ROOT = path.resolve(__dirname, '..');
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
    handle(req, res).catch(e => json(res, 500, { error: e.message }));
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
