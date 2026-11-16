'use strict';
// M6 任务 6.4 failing test —— 锁 SPEC-6.4 任务轨迹消费七条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-traj-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const store = require('../src/knowledge-store.js');
let T;
try { T = require('../src/trajectory.js'); if (typeof T.syncSessions !== 'function') throw new Error('syncSessions 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/trajectory.js 未实现 SPEC-6.4'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const N = require('../src/capability-narrative.js');
const { ingestSession } = require('../src/session-ingest.js');
const MESSAGES = [
  { role: 'user', content: '核对轨迹出口。' },
  { role: 'assistant', content: [
    { type: 'reasoning', text: '先看有没有表。' },
    { type: 'text', text: '轨迹出口已补。' },
    { type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'node t.js' } },
    { type: 'tool_use', id: 'c2', name: 'agent', input: { prompt: '并行查' } }
  ] },
  { role: 'tool', content: [{ type: 'tool_result', content: 'ok' }] }
];

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // AC-1 表形状
  const cols = (() => { const s = db.prepare('PRAGMA table_info(task_trajectories)'); const o = []; while (s.step()) o.push(s.getAsObject().name); s.free(); return o; })();
  const idx = (() => { const s = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_trajectories'"); const o = []; while (s.step()) o.push(s.getAsObject().name); s.free(); return o; })();
  const wantCols = ['id', 'task_type', 'route', 'tools', 'step_sequence', 'success', 'retries', 'duration_ms', 'score_soft', 'score_hard', 'evidence', 'source', 'created_at'];
  ac('AC-1 表形状', wantCols.every(c => cols.includes(c)) && idx.length >= 3, JSON.stringify({ cols, idx }));

  // 造两条会话：六段 + 三源
  await N.ingestNarrative(store, { sessionId: 'n1', topic: '轨迹样本', messages: MESSAGES, trigger: 'session-end' });
  await ingestSession(store, { sessionId: 's2', topic: '三源样本', reply: '已复核', searchShown: ['来源甲'], rationale: '先对表' });
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00' WHERE id='conv-n1'");
  store._persist();

  const r1 = await T.syncSessions(store, {});
  const row1 = (() => { const s = db.prepare("SELECT * FROM task_trajectories WHERE id='traj-conv-n1'"); const ok = s.step(); const o = ok ? s.getAsObject() : null; s.free(); return o; })();
  let ev1 = {}, tools1 = [], seq1 = [];
  try { ev1 = JSON.parse(row1.evidence); tools1 = JSON.parse(row1.tools); seq1 = JSON.parse(row1.step_sequence); } catch (_) {}

  // AC-2 六段会话轨迹
  ac('AC-2 六段会话轨迹', !!row1 && row1.task_type === 'session' && row1.source === 'session-narrative' &&
    Number(row1.success) === 1 && tools1.includes('Bash') && tools1.includes('agent') &&
    seq1.includes('场景') && seq1.includes('手段') && seq1.includes('产出') && seq1.includes('编排') &&
    ev1.convId === 'conv-n1' && ev1.toolCalls === 2, JSON.stringify({ row: row1 && { t: row1.task_type, s: row1.source, ok: row1.success }, tools1, seq1, ev1 }));

  // AC-3 三源会话轨迹
  const row3 = (() => { const s = db.prepare("SELECT * FROM task_trajectories WHERE id='traj-conv-s2'"); const ok = s.step(); const o = ok ? s.getAsObject() : null; s.free(); return o; })();
  let seq3 = [];
  try { seq3 = JSON.parse(row3.step_sequence); } catch (_) {}
  ac('AC-3 三源会话轨迹', !!row3 && row3.source === 'session-three-source' && Number(row3.success) === 1 &&
    seq3.includes('回复') && seq3.includes('搜索展示') && seq3.includes('事由分析'), JSON.stringify({ row3: row3 && { s: row3.source, ok: row3.success }, seq3 }));

  // AC-4 幂等 + 退役跳过
  const r4a = await T.syncSessions(store, {});
  await ingestSession(store, { sessionId: 'gone', topic: '退役会话', reply: '会被退役' });
  db.run("UPDATE entities SET invalid_at='2026-01-01 00:00:00' WHERE id='conv-gone'");
  store._persist();
  const r4b = await T.syncSessions(store, {});
  const gone = (() => { const s = db.prepare("SELECT COUNT(*) AS n FROM task_trajectories WHERE id='traj-conv-gone'"); s.step(); const n = s.getAsObject().n; s.free(); return Number(n); })();
  ac('AC-4 幂等 + 退役跳过', r4a.logged === 0 && r4a.skipped >= 2 && gone === 0, JSON.stringify({ r4a, r4b, gone }));

  // AC-5 代谢轮轨迹（成功 + 失败）
  const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
  const mk = (onCycle) => ({
    id: 'fake', strand: 'raw', band: 'background', reads: [], writes: [],
    budgetTick: 1, reversible: true, onCycle
  });
  const okOrch = new MekoOrchestrator({ store });
  okOrch.registerStep(mk(async () => ({ ok: true })));
  const okRun = await okOrch.runCycle('测试', { rounds: 1, budgetMs: 60000 });
  const badOrch = new MekoOrchestrator({ store });
  badOrch.registerStep(mk(async () => { throw new Error('故意失败'); }));
  const badRun = await badOrch.runCycle('测试', { rounds: 1, budgetMs: 60000 });
  const cyc = (() => { const s = db.prepare("SELECT * FROM task_trajectories WHERE task_type='metabolism' ORDER BY rowid"); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })();
  const okRow = cyc.find(r => Number(r.success) === 1);
  const badRow = cyc.find(r => Number(r.success) === 0);
  let badEv = {}; try { badEv = JSON.parse(badRow.evidence); } catch (_) {}
  ac('AC-5 代谢轮轨迹', okRun.ok === true && badRun.ok === false && !!okRow && !!badRow &&
    badEv.failedStep === 'fake' && Number(okRow.duration_ms) >= 0, JSON.stringify({ ok: okRun.ok, bad: badRun.ok, n: cyc.length, badEv }));

  // AC-6 查询与统计
  const list = await T.listTrajectories(store, { taskType: 'metabolism' });
  const st = await T.stats(store);
  ac('AC-6 查询与统计', list.length === 2 && st.byType.session === 2 && st.byType.metabolism === 2 && st.total === 4,
    JSON.stringify({ list: list.length, st }));

  // AC-7 链上可见 + 铁律
  const meta = require('../src/metabolism.js');
  const la = db.prepare("SELECT last_access FROM entities WHERE id='conv-n1'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'trajectory.js'), 'utf8');
  ac('AC-7 链上可见 + 铁律', meta.DEFAULT_STEPS.includes('trajectory') && String(laV) === '2021-06-01 00:00:00' &&
    !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
