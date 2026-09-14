#!/usr/bin/env node
/**
 * auto-ingest.js — 会话自动入库脚本
 * 
 * 功能：
 * 1. 监听对话消息
 * 2. 提取关键信息（实体、关系、标签）
 * 3. 编译成 wiki/ 格式
 * 4. 触发生长脑代谢
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const growthConfig = require('./growth.config');
const { scrubCollectionTrace } = require('./ingest-scrub'); // 只入贴出来的详情：采集过程行在入口剥除   // 阈值唯一来源（纪律第 5 条）

// ========== 配置（阈值全部来自 growth.config.js 的 ingest 段）==========
const INGEST = growthConfig.ingest || {};
const CONFIG = {
  // 默认指向部署包自身（src/auto-ingest.js 的上一级），兼容 KB_ROOT 环境变量覆盖
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  // rawDir：入库产物落点。运行态与版本化知识源分离，免得每次入库都往 git 跟踪目录里
  // 塞未跟踪档——院际换血 sync-opt 的「工作树不 clean」与 robocopy 串院两条事故链共用这个入口。
  rawDir: INGEST.rawDir || 'raw/inbox',
  wikiDir: 'wiki',
  logDir: 'logs',

  // 入库触发条件（改自配置，不再硬编码）
  minMessageLength: Number.isFinite(INGEST.minMessageLength) ? INGEST.minMessageLength : 20,
  maxMessagesPerBatch: Number.isFinite(INGEST.maxMessagesPerBatch) ? INGEST.maxMessagesPerBatch : 5,
  batchIntervalMs: Number.isFinite(INGEST.batchIntervalMs) ? INGEST.batchIntervalMs : 30000,
  sessionIdleMs: Number.isFinite(INGEST.sessionIdleMs) ? INGEST.sessionIdleMs : 15000,
  bufferFile: INGEST.bufferFile || 'data/ingest-buffer.jsonl',

  // 自动触发链：compile(raw→wiki) → import(wiki→db) → vector(语义可搜)
  pipelineScripts: ['src/compile.js', 'src/import-from-wiki.js', 'src/index-vectors.js'],
};

// P1a: Agent 蒸馏结果规范化（对话 → Agent 蒸馏 → 结构化 frontmatter → 编译）
function normalizeDistillation(input = {}) {
  const entities = Array.isArray(input.entities)
    ? input.entities
        .filter(entity => entity && typeof entity === 'object')
        .map(entity => ({
          name: String(entity.name || '').trim(),
          type: String(entity.type || 'Concept').trim(),
          tags: Array.isArray(entity.tags)
            ? entity.tags.map(tag => String(tag).trim()).filter(Boolean)
            : [],
          confidence: Number.isFinite(Number(entity.confidence))
            ? Math.max(0, Math.min(1, Number(entity.confidence)))
            : 0.7,
          evidence: String(entity.evidence || '').trim()
        }))
        .filter(entity => entity.name)
    : [];

  const tags = [
    ...(Array.isArray(input.tags) ? input.tags : []),
    ...entities.flatMap(entity => entity.tags)
  ]
    .map(tag => String(tag).trim())
    .filter(Boolean);

  return {
    summary: String(input.summary || '').trim(),
    entities,
    tags: [...new Set(tags)].slice(0, 20)
  };
}

// ========== 入库契约：生产端节名单与档渲染 ==========
// 生产端写出的节必须始终是 distill.js 的 RAW_SECTIONS 子集。
// 事故记录（2026-09-14 实测）：本文件早前把「## 原始消息」换成角色分区节，消费端没跟着改，
// 真实入库会话 100% 被判「no raw messages」拒蒸（影子 3/3 FAIL、蒸馏债永久还不上）；
// 历史版本与人工档仍用「## 原始消息」。两侧名单都由代码导出，门禁 C10g 静态比对 + 端到端实测。
const PRODUCED_SECTIONS = ['用户提问', 'Agent 回复', 'Agent 分析', '收集资料'];
const ROLE_SECTION = { user: '用户提问', assistant: 'Agent 回复', analysis: 'Agent 分析', research: '收集资料' };

// role 契约（2026-09-14 OPT 真机补漏）：渲染器旧写法 byRole[m.role] ? m.role : 'user'
// 会把未知 role 静默归到「用户提问」。实测调用方按直觉传 role:"agent"（合法值其实是
// assistant）时，Agent 说的话整段落进用户提问节——说话人被改写比漏字段更毒：蒸馏器按节
// 名取料，之后谁都无法从档里分辨这是用户说的还是 Agent 说的。故：别名先归一，
// 归一后仍不认识的整条拒收，绝不静默改写说话人。
const ROLE_ALIASES = {
  agent: 'assistant', bot: 'assistant', ai: 'assistant', llm: 'assistant', '助手': 'assistant',
  analyst: 'analysis', '分析': 'analysis',
  researcher: 'research', tool: 'research', '工具': 'research', '检索': 'research',
};
const ROLES = Object.keys(ROLE_SECTION);
function normalizeRole(raw) {
  const key = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!key) return 'user'; // 缺省仍是 user（旧调用方兼容）
  const canonical = ROLE_ALIASES[key] || key;
  return ROLES.indexOf(canonical) >= 0 ? canonical : null;
}

const slug = s => String(s).replace(/[^\w\u4e00-\u9fff-]+/g, '-');

/**
 * 把一批会话消息渲染成 raw 档（frontmatter + 正文）。纯函数，便于门禁与单测复用。
 *
 * 身份铁律（纪律第 4 条 + locked 项 B5 红线）：status / confidence 由服务端决定。
 * 客户端在 body.distillation 里自报的摘要与实体只是**提议**，旧实现直接把它写成
 * status:"active" + confidence:0.99 并立刻触发编译链入库——未核验内容凭自报获得知识资产身份，
 * 现已封死：一律 pending-distillation、confidence 0，等 distill.js 机械蒸馏兑付。
 */
function renderConversationDoc({ sessionId, messages, distillation, serverEntities, serverTags, timestamp }) {
  const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, '-');
  const ts = timestamp || new Date().toISOString();
  const fileStamp = ts.replace(/[:.]/g, '-');
  const proposal = normalizeDistillation(distillation || {});
  const hasProposal = proposal.entities.length > 0 || Boolean(proposal.summary);
  const bodyText = messages.map(m => m.content).join('\n\n');

  const byRole = { user: [], assistant: [], analysis: [], research: [] };
  for (const m of messages) {
    const role = normalizeRole(m.role) || 'user';
    byRole[role].push(m);
  }

  const primary = proposal.entities[0];
  const frontmatter = {
    name: primary ? (slug(primary.name).slice(0, 80) || ('会话-' + ts)) : ('会话-' + ts),   // 自报名先净化：未净化的引号/换行会写坏 frontmatter 行
    type: primary ? primary.type : 'Conversation',
    // id 恒等于文件名干，不由客户端自报名派生。旧写法 id = 会话-自报实体名有三重病害：
    // ① 同会话多批自报同名 → 同 id 互相覆盖；② 非法字符净化后退化成 `e2e-probe--`；
    // ③ raw 文件名与实体 id 不一致 → consciousness-layer 拿 raw 名去 wiki/entities 找实体必然找不到，
    //    狂报「原始资料尚未编译到 wiki/」假告警（影子实测一轮入库就刷出 15 条）。
    id: safeSessionId + '-' + fileStamp,   // id 恒等于文件名干，不由客户端自报名派生（三重病害见上注）
    tags: [...new Set([...(serverTags || []), ...proposal.tags])].map(t => String(t).trim()).filter(Boolean).slice(0, 20),
    status: 'pending-distillation',
    confidence: 0,
    source: String(sessionId),
    sourceType: 'conversation',
    distillationStatus: hasProposal ? 'agent-proposed' : 'pending',
    messageCount: messages.length,
    traceScrubbed: messages.reduce((n, m) => n + (m.traceRemoved || 0), 0)
  };

  const sections = ['## 蒸馏摘要', '', '待生成（由 distill.js 机械蒸馏填充，客户端不得代填）'];
  for (const [role, title] of [['user', '## 用户提问'], ['assistant', '## Agent 回复'], ['analysis', '## Agent 分析'], ['research', '## 收集资料']]) {
    const ms = byRole[role];
    if (!ms.length) continue;
    sections.push('', title);
    for (const m of ms) {
      sections.push(`> [${m.timestamp}]${role === 'research' && m.source ? ' 来源: ' + m.source : ''}`);
      sections.push(String(m.content));
      if (m.traceRemoved) {
        // 引用行（> 开头）不会被 distill 当原话，这条说明只是留痕，不引入新内容
        sections.push("> 本条剥除 " + m.traceRemoved + " 行采集过程痕迹（命令行/请求行/响应头/报文），按\"只入贴出来的详情\"口径不留存 / trace lines stripped, not stored");
      }
      sections.push('');
    }
  }
  if (hasProposal) {
    // 自报内容保留原样（是证据），但明确标为未核验，且不进 status/confidence
    sections.push('', '## Agent 提议（未核验 / agent-proposed）');
    if (proposal.summary) sections.push(proposal.summary.split(/\r?\n/).map(l => '> ' + l).join('\n'), '');
    for (const e of proposal.entities) {
      sections.push(`> 提议实体：[[${e.name}]] type=${e.type} confidence=${e.confidence}${e.evidence ? ' evidence=' + e.evidence : ''}`);
    }
  }
  const extracted = [...new Set((serverEntities || []).map(String).filter(Boolean))];
  sections.push('', '## 提取实体', '', extracted.length
    ? extracted.map(n => `- [[${n}]]`).join('\n') + '\n\n（服务端规则抽取，未核验；正式实体由 compile 与 distill 决定）'
    : '待 Agent 蒸馏');
  sections.push('', '## 标签', frontmatter.tags.length ? frontmatter.tags.join(', ') : '无', '',
    frontmatter.tags.map(t => `[tag:${t}]`).join(' '));

  const content = `# ${frontmatter.name}\n\n${sections.join('\n')}\n`;
  const rawDoc = `---\n${Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n${content}`;
  return { fileName: `${safeSessionId}-${fileStamp}.md`, frontmatter, rawDoc, bodyText };
}

// ========== 会话存储 ==========
class SessionStore {
  // 静态实例登记簿必须在类内声明。旧实现只在文件末尾写 SessionStore.instances = []，
  // 而 main() 在模块求值阶段就 new SessionStore() → CLI 一次性模式当场崩
  // （Cannot read properties of undefined (reading 'push')）。2026-09-14 实测：
  // docs/Engineering/AUTO-INGEST.md 里唯一那条 CLI 命令从未跑通过。
  static instances = [];

  constructor() {
    this.sessions = new Map();
    this.lastIngestTime = Date.now();
    // 内容级去重：已入库批次指纹账本（防轮询器/重发器重复入库同一内容）
    this.dedupFile = path.join(CONFIG.kbRoot, 'data', 'ingest-hashes.json');
    this.ingestedHashes = new Set();
    try {
      if (fs.existsSync(this.dedupFile)) {
        for (const h of JSON.parse(fs.readFileSync(this.dedupFile, 'utf8'))) {
          this.ingestedHashes.add(h);
        }
      }
    } catch (e) { /* 账本损坏则从空开始，不影响入库 */ }
    // WAL：accepted 与落盘之间的持久缓冲。旧实现只存内存，进程一停整段会话蒸发
    //（影子实测：POST 两条后杀进程 → raw 新增 0，而客户端已收到 accepted:true）。
    this.bufferFile = path.join(CONFIG.kbRoot, CONFIG.bufferFile);
    this.replayBuffer();
    SessionStore.instances.push(this);
    SessionStore.installExitHooks();
  }

  /** 把未 flush 的消息重放回内存（重启不丢会话） */
  replayBuffer() {
    try {
      if (!fs.existsSync(this.bufferFile)) return 0;
      const lines = fs.readFileSync(this.bufferFile, 'utf8').split(/\r?\n/).filter(Boolean);
      let n = 0;
      for (const line of lines) {
        try {
          const rec = JSON.parse(line);
          const session = this.getSession(rec.sessionId);
          session.messages.push({
            id: rec.ts || Date.now(),
            timestamp: rec.timestamp || new Date().toISOString(),
            role: rec.message.role || 'user',
            content: scrubCollectionTrace(rec.message.content).kept, // 旧 WAL 可能存着剥除上线前的原文，重放时补剥
            length: String(rec.message.content || '').length,
            source: rec.message.source || null,
            traceRemoved: rec.message.traceRemoved || 0
          });
          if (rec.message.distillation) session.distillation = rec.message.distillation;
          n++;
        } catch (e) { /* 单行损坏跳过，不阻断启动 */ }
      }
      if (n) console.log(`🔁 从 WAL 重放 ${n} 条未入库消息 / replayed from buffer: ${n} messages`);
      return n;
    } catch (e) { return 0; }
  }

  /** 追加一条到 WAL（每次 addMessage 都落盘，所以 accepted 之后崩也不丢） */
  appendBuffer(sessionId, message) {
    try {
      fs.mkdirSync(path.dirname(this.bufferFile), { recursive: true });
      fs.appendFileSync(this.bufferFile, JSON.stringify({ sessionId: String(sessionId), message, ts: Date.now(), timestamp: new Date().toISOString() }) + '\n', 'utf8');
    } catch (e) {
      console.error(`⚠️ WAL 写入失败（消息仍在内存，但重启会丢）/ buffer write failed:`, e.message);
    }
  }

  /** 用当前内存态重写 WAL（已 flush 的会话自然不在里面） */
  compactBuffer() {
    try {
      const out = [];
      for (const [sid, session] of this.sessions) {
        for (const m of session.messages) {
          out.push(JSON.stringify({ sessionId: sid, message: { role: m.role, content: m.content, source: m.source, traceRemoved: m.traceRemoved, distillation: session.distillation || undefined }, ts: m.id, timestamp: m.timestamp }));
        }
      }
      fs.mkdirSync(path.dirname(this.bufferFile), { recursive: true });
      fs.writeFileSync(this.bufferFile, out.length ? out.join('\n') + '\n' : '', 'utf8');
    } catch (e) { /* 压缩失败不影响入库本身 */ }
  }

  static installExitHooks() {
    if (SessionStore._hooksInstalled) return;
    SessionStore._hooksInstalled = true;
    const flushAll = (why) => {
      for (const inst of SessionStore.instances) {
        try { inst.flushAll(); inst.compactBuffer(); } catch (e) {
          console.error(`❌ 退出前 flush 失败，未入库消息留在 WAL 可重启回放 / flush on ${why} failed, WAL kept:`, e.message);
        }
      }
    };
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.on(sig, () => { flushAll(sig); process.exit(0); });
    }
    process.on('exit', () => flushAll('exit'));
  }

  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        entities: new Set(),
        tags: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    return this.sessions.get(sessionId);
  }

  addMessage(sessionId, message) {
    const session = this.getSession(sessionId);
    // role 扩展：user（用户提问）/ assistant（agent回复）/ analysis（agent分析）/ research（收集资料）
    // 旧调用方传 role:user/assistant 仍兼容；新增 role:analysis/research 不影响
    // 只入「贴出来的详情」：贴出来之前为拿到它所经历的采集步骤（命令行 / 请求行 / 响应头 /
    // 报文 / 计时统计）在入口就地剥除，一行都不留——不写旁路、不进 WAL、不留原文，只在档内记
    // 一个剥除行数。影子实测（2026-09-14）：不剥时这些行被 distill 当「原话要点」写进蒸馏摘要
    //（8 行里 5 行是过程行），并提出 https / example 当标签（标签是加载单位），还能被关键词检索
    // 当资料召回。采集元数据 metadata（搜索词 / rank / 耗时 / 请求对象）按同一口径停止接收。
    const role = normalizeRole(message.role);
    if (!role) {
      console.log(`⛔ role "${message.role}" 不在白名单（${ROLES.join('/')}，别名 agent/bot→assistant），整条拒收 / unknown role rejected, 说话人不改写`);
      return {
        accepted: false,
        buffered: session.messages.length,
        flushed: false,
        rejected: 'unknown-role',
        role: String(message.role == null ? '' : message.role),
        allowedRoles: ROLES,
      };
    }
    const scrubbed = INGEST.scrubTrace === false
      ? { kept: String(message.content || ''), removed: 0 }
      : scrubCollectionTrace(message.content);
    if (!scrubbed.kept.trim()) {
      console.log(`⛔ 正文全是采集过程痕迹，按「只入贴出来的详情」口径拒收：不落 WAL、不入库 / trace-only payload rejected (session ${sessionId})`);
      return { accepted: false, buffered: session.messages.length, flushed: false, rejected: 'collection-trace-only' };
    }
    const record = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      role,                              // 归一后的规范 role（别名 agent/bot 已展开）
      content: scrubbed.kept,
      length: scrubbed.kept.length,
      source: message.source || null,      // 出处仅留字面标注：服务器不访问、不核验、不代抓取
      traceRemoved: scrubbed.removed       // 本条剥掉的采集过程行数——只留计数，不留内容
    };
    session.messages.push(record);
    session.updatedAt = Date.now();
    if (message.distillation) session.distillation = message.distillation;
    this.appendBuffer(sessionId, { ...record, distillation: message.distillation });

    // 提取实体和标签（结果此前被算出后丢弃＝死代码，现已真正并入档内「提取实体」节）
    this.extractEntities(record.content, session); // 规则抽取同样只见详情

    // 检查是否需要入库
    const flushed = this.checkAndIngest(sessionId);
    // 回执暴露剥除计数（2026-09-14）：调用方要能证明「只入贴出来的详情」这条口径在本条上真的生效
    const traceRemoved = session.messages.reduce((s2, m) => s2 + (m.traceRemoved || 0), 0);
    return { buffered: session.messages.length, flushed: Boolean(flushed), traceRemoved };
  }

  extractEntities(content, session) {
    // 简单实体提取（可替换为更智能的 NER）
    const patterns = [
      { regex: /# ([\w-]+)/g, type: 'tag' },
      { regex: /\[\[([^\]]+)\]\]/g, type: 'entity' },
      { regex: /\*\*([^\*]+)\*\*/g, type: 'entity' }
    ];
    
    for (const pattern of patterns) {
      const matches = content.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          const entity = match.replace(pattern.regex, '$1').trim();
          if (pattern.type === 'tag') {
            session.tags.add(entity);
          } else {
            session.entities.add(entity);
          }
        }
      }
    }
  }

  /**
   * 触发条件（2026-09-14 修）：全部按**本会话**判定。
   * 旧实现用全局 lastIngestTime——任意一次入库都会重置它，导致只发了 1-2 条消息的会话
   * 要么等别的会话来触发、要么随进程退出消失（实测 accepted 后杀进程 raw 新增 0）。
   *   full   本会话消息数达批次上限
   *   idle   本会话静默超过 ingest.sessionIdleMs（尾巴消息靠它落盘）
   *   aged   本会话首条消息等超过 batchIntervalMs（持续有流量时不至于永远不入库）
   */
  checkAndIngest(sessionId) {
    const session = this.getSession(sessionId);
    if (!session.messages.length) return false;
    const now = Date.now();
    const full = session.messages.length >= CONFIG.maxMessagesPerBatch;
    const idle = (now - session.updatedAt) >= CONFIG.sessionIdleMs;
    const aged = (now - session.createdAt) >= CONFIG.batchIntervalMs;
    if (!(full || idle || aged)) return false;
    const done = this.ingestSession(sessionId);
    this.lastIngestTime = now;
    return done;
  }

  /** 立即入库所有挂起会话（调度器/退出兜底用） */
  flushAll() {
    let n = 0;
    for (const [sid, session] of [...this.sessions]) {
      if (session.messages.length && this.ingestSession(sid)) n++;
    }
    if (n) console.log(`🧾 flushAll 入库 ${n} 个会话 / flushed ${n} sessions`);
    return n;
  }

  ingestSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session.messages.length) return false;
    const bodyText = session.messages.map(m => m.content).join('\n\n');

    if (bodyText.length < CONFIG.minMessageLength) {
      console.log(`⏸️ 内容过短（<${CONFIG.minMessageLength} 字符），本批不入库、消息留在缓冲 / too short, kept in buffer`);
      return false; // 内容太短，跳过
    }

    // 去重键含 sessionId（2026-09-14 修）：旧实现只哈希正文，两个不同客户端发同样文本时，
    // 第二个会话的整批消息被静默清空——而它早已收到 accepted:true。
    const batchKey = crypto.createHash('sha1').update(String(sessionId) + '\0' + bodyText, 'utf8').digest('hex');
    if (this.ingestedHashes.has(batchKey)) {
      const dropped = session.messages.length;
      console.log(`⏭️ 同会话内容指纹命中，跳过重复入库 (${sessionId})，丢弃挂起的 ${dropped} 条 / duplicate batch, ${dropped} messages dropped`);
      try {
        fs.mkdirSync(path.dirname(this.dedupFile), { recursive: true });
        fs.appendFileSync(path.join(CONFIG.kbRoot, 'data', 'ingest-duplicates.jsonl'),
          JSON.stringify({ at: new Date().toISOString(), sessionId: String(sessionId), dropped, batchKey }) + '\n', 'utf8');
      } catch (e) { /* 记录失败不阻断 */ }
      session.messages = [];
      this.compactBuffer();
      return false;
    }

    const rendered = renderConversationDoc({
      sessionId,
      messages: session.messages,
      distillation: session.distillation,
      serverEntities: [...session.entities],
      serverTags: [...session.tags]
    });

    // 写入 raw/（会话 ID 入文件名前已在 renderConversationDoc 内净化非法字符，
    // 否则 Windows 下写 raw/ 直接 ENOENT。旧版本的租户前缀 "default::" 已砍除，本净化保留。）
    const rawPath = path.join(CONFIG.kbRoot, CONFIG.rawDir, rendered.fileName);
    try {
      fs.mkdirSync(path.dirname(rawPath), { recursive: true });
      fs.writeFileSync(rawPath, rendered.rawDoc, 'utf-8');
    } catch (e) {
      console.error(`❌ 入库写盘失败，消息保留在 WAL 中可重试 / write failed, kept in WAL:`, e.message);
      return false;
    }

    // 入库成功后清空本批消息，防止轮询器对同一会话重复入库
    session.messages = [];
    // 记录并持久化批次指纹
    this.ingestedHashes.add(batchKey);
    try {
      fs.mkdirSync(path.dirname(this.dedupFile), { recursive: true });
      fs.writeFileSync(this.dedupFile, JSON.stringify([...this.ingestedHashes].slice(-5000)), 'utf-8');
    } catch (e) { /* 账本写失败不阻断入库 */ }
    this.compactBuffer();

    console.log(`✅ 入库完成: ${rendered.fileName} / Ingest done: status=${rendered.frontmatter.status}（自报蒸馏只作提议，待 distill 兑付）`);

    // 触发编译
    this.triggerCompile(rawPath);
    return true;
  }

  triggerCompile(rawPath) {
    for (const script of CONFIG.pipelineScripts) {
      const scriptPath = path.join(CONFIG.kbRoot, script);
      if (!fs.existsSync(scriptPath)) {
        console.error(`⚠️ 跳过不存在的脚本: ${script} / Skipping missing script:`);
        continue;
      }
      try {
        // 运行态入库链一律禁掉 compile 的自动提交：compile.js 的 gitCommit() 会执行
        // `git add -A` + `commit --no-verify`，等于让一条会话入库消息把工作树里所有未提交改动
        // 打包提交（2026-09-14 实测：self-test 探针 flush 后当场生成 "chore: compile knowledge base"，
        // 把 26 个尚未获批的改动一并卷走）。人工 `npm run compile` 的行为保持不变。
        execSync(`node "${scriptPath}"`, {
          cwd: CONFIG.kbRoot,
          stdio: 'inherit',
          timeout: 60000,
          env: { ...process.env, AING_NO_AUTOCOMMIT: '1' }
        });
        console.log(`🔧 完成: ${script} / Done:`);
      } catch (e) {
        console.error(`⚠️ ${script} 失败: / script failed:`, e.message);
        break; // 链式步骤，前面失败就停
      }
    }
  }
}

// ========== CLI 入口 ==========
// 两种用法（2026-09-14 修掉两处反模式）：
//   1) 一次性投递（默认）—— 落 WAL 并立即成档，跑完退出，不占进程：
//        node src/auto-ingest.js <session-id> "<json 或纯文本>"
//   2) 常驻批处理（显式开启，老行为）：
//        node src/auto-ingest.js --keep
//      满 5 条或 30 秒成批；要持续接入更推荐 npm run server + POST /api/ingest。
// 旧实现的两处缺陷：① 缺第二个参数时默认伪造 {role:'user',content:'test'} —— 每次误调用都
// 往库里落一条假消息（历史「selftest/probe 残留实体」就是这么长出来的）；② 投完不退出，
// setInterval 把一次性调用变成空转常驻进程。现：缺参即非零退出，一次性模式投完即走。
function usage() {
  console.error('用法 / Usage:');
  console.error('  node src/auto-ingest.js <session-id> "<json|纯文本>"   一次性投递（默认，投完退出）');
  console.error('  node src/auto-ingest.js --keep                        常驻批处理（满 ' + CONFIG.maxMessagesPerBatch + ' 条或 ' + (CONFIG.batchIntervalMs / 1000) + 's 成批）');
  console.error('  消息体可为 JSON {role,content,source}，或直接给纯文本（按 role=user 入）。');
  console.error('  只存「贴出来的详情」：贴出来之前的采集步骤（命令行/请求行/响应头/报文）在入口剥除。');
}

function main() {
  const argv = process.argv.slice(2);
  const flags = argv.filter(a => a.startsWith('--'));
  const pos = argv.filter(a => !a.startsWith('--'));
  const badFlag = flags.filter(f => f !== '--keep');
  if (badFlag.length) {
    console.error('❌ 未知参数 / unknown flag: ' + badFlag.join(' '));
    usage();
    process.exit(2);
  }
  const store = new SessionStore();

  if (flags.includes('--keep')) {
    console.log('🧬 aing 自动入库常驻模式 / auto-ingest daemon (batch mode)');
    console.log(`📂 知识库: ${CONFIG.kbRoot}`);
    console.log(`⏱️  批处理条件: 满 ${CONFIG.maxMessagesPerBatch} 条 或 ${CONFIG.batchIntervalMs / 1000}s / batch trigger`);
    console.log('📡 等待消息（持续接入建议改用 npm run server + POST /api/ingest）...');
    setInterval(() => {
      for (const [sid] of store.sessions) store.checkAndIngest(sid);
    }, 10000);
    return;
  }

  if (pos.length < 2) {
    console.error('❌ 需要 <session-id> 和 <消息内容> 两个参数 / both sessionId and message are required');
    console.error('❌ 旧版会替你伪造一条 content:"test" 的假消息，现已取消（宁可报错，不脏库）');
    usage();
    process.exit(2);
  }

  const sessionId = pos[0];
  const raw = pos.slice(1).join(' ');
  let message;
  try {
    message = JSON.parse(raw);
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('JSON 不是对象');
  } catch (e) {
    message = { role: 'user', content: raw };  // 纯文本按 user 投
  }

  const r = store.addMessage(sessionId, message);
  if (r.accepted === false) {
    console.error('⛔ 拒收 / rejected: ' + r.rejected + (r.reason ? ' — ' + r.reason : ''));
    process.exit(3);
  }
  let flushed = r.flushed;
  if (!flushed) {
    // 一次性模式：不等批次条件，直接把这条会话写成 raw 档
    flushed = Boolean(store.ingestSession(sessionId));
  }
  console.log(JSON.stringify({
    ok: true,
    session: sessionId,
    buffered: r.buffered,
    flushed: Boolean(flushed),
    traceRemoved: r.traceRemoved || 0,
    rawDir: path.join(CONFIG.kbRoot, CONFIG.rawDir)
  }));
  if (!flushed) {
    console.error('⚠️ 已落 WAL 但未成档（多为内容短于 minMessageLength=' + CONFIG.minMessageLength + '）→ 数据不丢，补投或等批次');
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

// （原此处「SessionStore.instances = []」已删：类内 static 声明即完成初始化，
//   留在末尾反而会把模块求值期已注册的实例清空，CLI 首条消息必崩。2026-09-14）

module.exports = { SessionStore, CONFIG, PRODUCED_SECTIONS, ROLE_ALIASES, ROLES, normalizeRole, renderConversationDoc, ROLE_SECTION };
