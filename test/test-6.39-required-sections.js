'use strict';
// M6 任务 6.39 failing test —— 必填段随能力面浮动（SPEC-6.39）
// 要修的病：6.30 分母恒为六段——没工具、没子agent、没校准的会话被逼把三段落写成 20 字凑数。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-req-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');

const S = K.NARRATIVE_SECTIONS || N.SECTIONS;
const BASE = [S[0], S[1], S[4]];                       // 场景 / 思维 / 产出
const mdOf = (keys, body = '甲'.repeat(60)) => keys.map(k => `### ${k}\n${body}`).join('\n\n');
const narrative = (markdown, capability) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: [], stats: Object.assign({ bodyChars: markdown.length }, capability ? { capability } : {}), calibrations: []
});
const cap = (o) => Object.assign({ toolCalls: 0, subagentCalls: 0, calibrations: 0, source: 'session' }, o);

const MESSAGES = [
  { role: 'user', content: '跑一下文档投喂试用，看检索是否答非所问。' },
  { role: 'assistant', content: [
    { type: 'reasoning', text: '先复现再改：隔离库跑 compile→import→vector，再拿真查询量。' },
    { type: 'text', text: '先建隔离库，再量八条查询。' },
    { type: 'tool_use', id: 'call-1', name: 'Bash', input: { command: 'node trial.js' } },
    { type: 'tool_use', id: 'call-2', name: 'agent', input: { prompt: '并行查文档口径' } },
    { type: 'tool_use', id: 'call-3', name: 'Read', input: { file: 'x'.repeat(900) } }
  ] },
  { role: 'tool', content: [{ type: 'tool_result', content: 'compile 18 实体 / vector 36 条' }] },
  { role: 'tool', content: [{ type: 'tool_result', content: 'y'.repeat(2000) }] },
  { role: 'tool', content: [{ type: 'tool_result', content: '读取失败：路径不存在' }] }
];
const CALIBS = [
  { time: 1, type: 'approval', summary: '审批通过 Bash', target: { callId: 'call-1', toolName: 'Bash' } },
  { time: 2, type: 'feedback', summary: '不要用真库试，隔离库跑' }
];

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, content]);
  const getContent = (id) => { const s = db.prepare('SELECT content FROM entities WHERE id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? r.content : null; };
  const cov = (md, opts) => (typeof K.narrativeCoverage === 'function' ? K.narrativeCoverage(md, opts || {}) : null);
  const req = (content) => (typeof K.requiredSections === 'function' ? K.requiredSections(content) : null);

  // AC-1 无能力面 → 必填 3 段，三段齐 coverage=1 / factor=1
  const plain = narrative(mdOf(BASE), cap({}));
  const r1 = req(plain);
  ac('AC-1 无工具无子agent无校准 → 必填 3 段且三段齐 coverage=1',
    Array.isArray(r1) && r1.length === 3 && BASE.every(k => r1.includes(k)) &&
    cov(mdOf(BASE), { required: r1 }) === 1 &&
    Math.abs(K.narrativeFactor(plain) - 1) < 1e-9,
    JSON.stringify({ required: r1, cov: cov(mdOf(BASE), { required: r1 }), factor: K.narrativeFactor(plain) }));

  // AC-2 有工具调用 → 手段进必填集，写 3 段 = 3/4
  const withTool = narrative(mdOf(BASE), cap({ toolCalls: 3 }));
  const r2 = req(withTool);
  ac('AC-2 有工具调用 → 手段必填，只写基准三段 coverage=0.75',
    Array.isArray(r2) && r2.length === 4 && r2.includes(S[2]) &&
    Math.abs(cov(mdOf(BASE), { required: r2 }) - 0.75) < 1e-9,
    JSON.stringify({ required: r2, cov: cov(mdOf(BASE), { required: r2 }) }));

  // AC-3 有子agent → 编排进必填集
  const withSub = narrative(mdOf(BASE), cap({ subagentCalls: 1 }));
  const r3 = req(withSub);
  ac('AC-3 有子agent → 编排必填',
    Array.isArray(r3) && r3.length === 4 && r3.includes(S[3]) && !r3.includes(S[2]),
    JSON.stringify({ required: r3 }));

  // AC-4 有校准素材 → 会话级校准进必填集
  const withCal = narrative(mdOf(BASE), cap({ calibrations: 2 }));
  const r4 = req(withCal);
  ac('AC-4 有校准素材 → 会话级校准必填',
    Array.isArray(r4) && r4.length === 4 && r4.includes(S[5]),
    JSON.stringify({ required: r4 }));

  // AC-5 无能力证据 → 六段全必填（旧 fixture 口径不变，防缩分母）
  const unknown = narrative(mdOf(BASE));
  const r5 = req(unknown);
  ac('AC-5 无 stats.capability → 六段全必填、三段 coverage=0.5',
    Array.isArray(r5) && r5.length === 6 && Math.abs(cov(mdOf(BASE)) - 0.5) < 1e-9,
    JSON.stringify({ required: r5, cov: cov(mdOf(BASE)) }));

  // AC-6 内部构建入库写下 stats.capability
  const inRes = await N.ingestNarrative(store, { sessionId: 'sess-req-1', messages: MESSAGES, calibrations: CALIBS });
  const c1 = inRes && inRes.ingested ? JSON.parse(getContent('conv-sess-req-1')) : {};
  const c1cap = (c1.stats || {}).capability || null;
  ac('AC-6 内部构建写 stats.capability（toolCalls/subagentCalls/calibrations/source）',
    !!c1cap && c1cap.toolCalls === 3 && c1cap.subagentCalls === 1 && c1cap.calibrations === 2 && c1cap.source === 'session',
    JSON.stringify({ ingested: inRes, capability: c1cap }));

  // AC-7 外部 full 叙事按 messages 实测能力面，自述不能缩分母
  const sections = {}; for (const k of S) sections[k] = '外部件自述：本单元无工具调用。';
  const extRes = await N.ingestNarrative(store, {
    sessionId: 'sess-req-2', messages: MESSAGES,
    narrative: { mode: 'full', sections, title: '外部叙事', tags: ['x'] }
  });
  const c2 = extRes && extRes.ingested ? JSON.parse(getContent('conv-sess-req-2')) : {};
  const c2cap = (c2.stats || {}).capability || null;
  const r7 = req(JSON.stringify(c2));
  ac('AC-7 外部 full 叙事 capability 来自 messages（source=messages, toolCalls=3, 必填含手段）',
    !!c2cap && c2cap.source === 'messages' && c2cap.toolCalls === 3 &&
    Array.isArray(r7) && r7.includes(S[2]) && r7.includes(S[3]),
    JSON.stringify({ ingested: extRes, capability: c2cap, required: r7 }));

  // AC-8 非必填段写了不加分（多写无效段不抬 coverage）
  const noisy = mdOf(BASE) + '\n\n' + mdOf([S[2], S[3], S[5]], '无');
  ac('AC-8 非必填段写「无」不抬 coverage（仍为 1）',
    Math.abs(cov(noisy, { required: req(plain) }) - 1) < 1e-9,
    JSON.stringify({ cov: cov(noisy, { required: req(plain) }) }));

  // AC-9 必填段正文不足阈值 → 不算有效（6.31 口径不回归）
  const shortOut = mdOf([S[0], S[1]], '甲'.repeat(60)) + '\n\n### ' + S[4] + '\n短';
  ac('AC-9 必填段正文不足 20 字 → coverage 2/3',
    Math.abs(cov(shortOut, { required: req(plain) }) - 2 / 3) < 1e-9,
    JSON.stringify({ cov: cov(shortOut, { required: req(plain) }) }));

  console.log(`\n----- 6.39 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
