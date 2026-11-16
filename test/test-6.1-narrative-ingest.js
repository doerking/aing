'use strict';
// M6 任务 6.1 failing test —— 锁 SPEC-6.1 能力显现入库（六段叙事）七条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-narr-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const store = require('../src/knowledge-store.js');
let N;
try { N = require('../src/capability-narrative.js'); if (typeof N.buildCapabilityNarrative !== 'function') throw new Error('buildCapabilityNarrative 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/capability-narrative.js 未实现 SPEC-6.1'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const MESSAGES = [
  { role: 'user', content: '跑一下文档投喂试用，看检索是否答非所问。' },
  {
    role: 'assistant', content: [
      { type: 'reasoning', text: '先复现再改：隔离库跑 compile→import→vector，再拿真查询量。' },
      { type: 'text', text: '先建隔离库，再量八条查询。' },
      { type: 'tool_use', id: 'call-1', name: 'Bash', input: { command: 'node trial.js' } },
      { type: 'tool_use', id: 'call-2', name: 'agent', input: { prompt: '并行查文档口径' } },
      { type: 'tool_use', id: 'call-3', name: 'Read', input: { file: 'x'.repeat(900) } }
    ]
  },
  { role: 'tool', content: [{ type: 'tool_result', content: 'compile 18 实体 / vector 36 条' }] },
  { role: 'tool', content: [{ type: 'tool_result', content: 'y'.repeat(2000) }] },
  { role: 'tool', content: [{ type: 'tool_result', content: '读取失败：路径不存在' }] }
];

const CALIBS = [
  { time: 1, type: 'approval', summary: '审批通过 Bash', target: { callId: 'call-1', toolName: 'Bash' } },
  { time: 2, type: 'feedback', summary: '不要用真库试，隔离库跑' },
  { time: 3, type: 'goal', summary: '目标改为先冻结评测集' }
];

(async () => {
  // AC-1 六段齐全
  const out = N.buildCapabilityNarrative(MESSAGES, {}, CALIBS);
  const md = String(out.markdown || '');
  const sections = ['场景（触发）', '思维（能力内核）', '手段（工具执行）', '编排（子agent）', '产出', '会话级校准'];
  ac('AC-1 六段齐全', sections.every(s => md.includes(s)), JSON.stringify(sections.filter(s => !md.includes(s))));

  // AC-2 手段/编排归位
  const stats = out.stats || {};
  const shouDuan = (md.split('手段（工具执行）')[1] || '').split('编排（子agent）')[0] || '';
  const bianPai = (md.split('编排（子agent）')[1] || '').split('产出')[0] || '';
  ac('AC-2 手段/编排归位', shouDuan.includes('Bash') && !shouDuan.includes('agent ·') && bianPai.includes('agent') &&
    !bianPai.includes('Bash') && stats.subagentCalls === 1 && stats.toolCalls === 3, JSON.stringify({ subagentCalls: stats.subagentCalls, toolCalls: stats.toolCalls }));

  // AC-3 截断与思维开关
  const truncated = md.includes('…[截断]') && !md.includes('x'.repeat(700)) && !md.includes('y'.repeat(1300));
  const noThink = N.buildCapabilityNarrative(MESSAGES, { reasoningMode: 'none' }, CALIBS).markdown;
  ac('AC-3 截断与思维开关', truncated && !String(noThink).includes('思维（能力内核）'), JSON.stringify({ truncated }));

  // AC-4 校准分流
  const approvalAttached = md.includes('**审批校准**: 审批通过 Bash');
  const sessionLevel = md.includes('会话级校准') && md.includes('不要用真库试') && md.includes('目标变更');
  const approvalNotSessionLevel = !(md.split('会话级校准')[1] || '').includes('审批通过');
  ac('AC-4 校准分流', approvalAttached && sessionLevel && approvalNotSessionLevel, JSON.stringify({ approvalAttached, sessionLevel, approvalNotSessionLevel }));

  // AC-5 落库形状
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'sentinel', name: '哨兵', type: 'Concept', content: '只用来守 last_access', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00'");
  store._persist();
  const r1 = await N.ingestNarrative(store, { sessionId: 's1', topic: '文档投喂试用', at: '2026-11-16T19:00:00Z', messages: MESSAGES, calibrations: CALIBS, trigger: 'session-end' });
  const row = (() => { const s = db.prepare("SELECT * FROM entities WHERE id='conv-s1'"); const ok = s.step(); const o = ok ? s.getAsObject() : null; s.free(); return o; })();
  let content = {};
  try { content = JSON.parse(row.content); } catch (_) {}
  ac('AC-5 落库形状', r1.ingested === true && !!row && row.type === 'Conversation' &&
    content.format === 'capability-narrative-v1' && typeof content.markdown === 'string' &&
    Array.isArray(content.turns) && content.stats && Array.isArray(content.calibrations) &&
    String(row.tags).includes('conv:9') && String(row.tags).includes('src:narrative') && String(row.tags).includes('src:calibration'),
    JSON.stringify({ r1, row: row && { type: row.type, tags: row.tags }, fmt: content.format }));

  // AC-6 幂等 + 缺料拒入
  const r2 = await N.ingestNarrative(store, { sessionId: 's1', messages: MESSAGES });
  let thrown = '';
  try { await N.ingestNarrative(store, { sessionId: 's2' }); } catch (e) { thrown = e.message; }
  const cnt = (() => { const s = db.prepare('SELECT COUNT(*) AS n FROM entities'); s.step(); const n = s.getAsObject().n; s.free(); return n; })();
  ac('AC-6 幂等 + 缺料拒入', r2.skipped === true && /narrative-required/.test(thrown) && cnt === 2, JSON.stringify({ r2, thrown, cnt }));

  // AC-7 铁律
  const la = db.prepare("SELECT last_access FROM entities WHERE id='sentinel'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'capability-narrative.js'), 'utf8');
  ac('AC-7 铁律', String(laV) === '2021-06-01 00:00:00' && !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
