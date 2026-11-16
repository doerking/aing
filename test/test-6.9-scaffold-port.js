'use strict';
// M6 任务 6.9 failing test —— 锁 SPEC-6.9 原版脚手架三件移植八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-port69-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let RK, LR, CD, S, M;
try {
  RK = require('../src/retrieval-kpi.js');
  LR = require('../src/lineage-reflect.js');
  CD = require('../src/capability-dispatch.js');
  S = require('../src/self-optimize.js');
  M = require('../src/metabolism.js');
  for (const k of ['runKpi']) if (typeof RK[k] !== 'function') throw new Error('retrieval-kpi.' + k + ' 未导出');
  for (const k of ['reflect']) if (typeof LR[k] !== 'function') throw new Error('lineage-reflect.' + k + ' 未导出');
  for (const k of ['dispatchCapabilities']) if (typeof CD[k] !== 'function') throw new Error('capability-dispatch.' + k + ' 未导出');
} catch (e) {
  console.error('❌ 红（正确的红）—— 6.9 脚手架三件未实现（retrieval-kpi / lineage-reflect / capability-dispatch）');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

const LONG = '检索与反思测试正文，长度足够且不带特殊结构。'.repeat(10);
const NARR = ['# 能力单元 1', '', '## 产出',
  '第一行原话：核对消费侧。', '第二行原话：旧记录在工作区。', '',
  '# 提取实体', '这条不该入。'].join('\n');

const rows = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const one = (db, sql, b = []) => rows(db, sql, b)[0] || null;
const snap = (db) => JSON.stringify({
  entities: rows(db, 'SELECT * FROM entities'),
  links: rows(db, 'SELECT * FROM links'),
  vectors: rows(db, 'SELECT * FROM entity_vectors'),
  access: rows(db, 'SELECT * FROM access_hits')
});

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  const db = store._getDb();

  const insEnt = db.prepare(`INSERT INTO entities
    (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at,last_access)
    VALUES (?,?,?,?,?, 'active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
  for (const [id, name, content] of [
    ['raw-alpha', 'AlphaOne', LONG],
    ['raw-beta', 'BetaTwo', LONG],
    ['raw-gamma', 'GammaThree', LONG],
    ['raw-narr', 'NarrativeOne', NARR],
    ['raw-consumed', 'ConsumedOne', NARR]
  ]) insEnt.run([id, name, 'Concept', content, '["t"]']);
  insEnt.free();
  const insDp = db.prepare(`INSERT INTO distill_points (base_id,digest,raw_count,line_count,points_json,updated_at)
    VALUES ('raw-consumed','d1',2,2,'[]',CURRENT_TIMESTAMP)`);
  insDp.run(); insDp.free();
  store._persist();

  // ── AC-1 三件导出 + 链上登记 ─────────────────────────────
  const reg = M.REGISTRY || {};
  const chain = ['capability-dispatch', 'lineage-reflect', 'retrieval-kpi'];
  ac('AC-1 三件导出 + 默认链登记',
    chain.every(id => M.DEFAULT_STEPS.includes(id) && reg[id] && typeof reg[id].fn === 'string' && typeof reg[id].guard === 'function'),
    JSON.stringify({ steps: M.DEFAULT_STEPS.length, missing: chain.filter(id => !M.DEFAULT_STEPS.includes(id)) }));

  // ── AC-2 检索 KPI 落轨迹 + 幂等 ──────────────────────────
  const kpi1 = await RK.runKpi(store, { cycleId: 'cyc-69', sample: 3, k: 1, baseline: 0.5 });
  let tr = one(db, "SELECT * FROM task_trajectories WHERE id='traj-rkpi-cyc-69'");
  const ev = tr ? JSON.parse(tr.evidence) : {};
  await RK.runKpi(store, { cycleId: 'cyc-69', sample: 3, k: 1, baseline: 0.5 });
  const nKpi = Number(one(db, "SELECT COUNT(*) AS n FROM task_trajectories WHERE task_type='retrieval-kpi'").n);
  ac('AC-2 检索 KPI 轨迹（recall/MRR/幂等）',
    tr && tr.task_type === 'retrieval-kpi' && tr.source === 'retrieval-kpi' &&
    Number(tr.success) === 1 && Number(tr.score_soft) === kpi1.recall &&
    ev.sample === 3 && ev.k === 1 && ev.recall === kpi1.recall && ev.mrr === kpi1.mrr && nKpi === 1,
    JSON.stringify({ tr: tr && { success: tr.success, soft: tr.score_soft }, ev, nKpi }));

  // ── AC-3 检索 KPI 只读 ───────────────────────────────────
  const s0 = snap(db);
  await RK.runKpi(store, { cycleId: 'cyc-69b', sample: 3, k: 1 });
  const s1 = snap(db);
  ac('AC-3 检索 KPI 只读（双链/向量/访问零变化）', s0 === s1, JSON.stringify({ same: s0 === s1 }));

  // ── AC-4 谱系反思归组 + 撤回计入失败 + 幂等 ──────────────
  const insFa = db.prepare(`INSERT INTO field_actions (id,action,target,before_json,after_json,cycle_id,reversible,reversed_at,created_at)
    VALUES (?,?,?,'{}','{}','cyc-69',1,?,CURRENT_TIMESTAMP)`);
  insFa.run(['fa-1', 'rebond', 'raw-alpha->raw-beta', null]);
  insFa.run(['fa-2', 'rebond', 'raw-alpha->raw-gamma', null]);
  insFa.run(['fa-3', 'reconcile', 'raw-beta', '2026-11-16T00:00:00.000Z']);
  insFa.free();
  const insCyc = db.prepare(`INSERT INTO meko_cycles (id,cycle_type,kespi_snapshot,kespi_source,executed_at,status)
    VALUES (?,?,?,?,?, 'success')`);
  insCyc.run(['mc-1', 'maintain', 0.50, 'kespi_scores', '2026-11-16T00:00:00.000Z']);
  insCyc.run(['mc-2', 'maintain', 0.60, 'kespi_scores', '2026-11-16T01:00:00.000Z']);
  insCyc.free();
  store._persist();

  const r1 = LR.reflect(store, { cycleId: 'cyc-69' });
  const rb = one(db, "SELECT * FROM task_trajectories WHERE id='traj-reflect-rebond-cyc-69'");
  const rc = one(db, "SELECT * FROM task_trajectories WHERE id='traj-reflect-reconcile-cyc-69'");
  const rbe = rb ? JSON.parse(rb.evidence) : {};
  LR.reflect(store, { cycleId: 'cyc-69' });
  const nRef = Number(one(db, "SELECT COUNT(*) AS n FROM task_trajectories WHERE task_type='reflect' AND source='lineage-reflect'").n);
  ac('AC-4 谱系反思（归组/失败/幂等）',
    r1.actions.length === 2 && rb && rc &&
    Number(rb.success) === 1 && Number(rb.score_soft) === 1 && rbe.n === 2 && rbe.stood === 2 && rbe.kespiTrend === 0.1 &&
    Number(rc.success) === 0 && Number(rc.score_soft) === 0 && nRef === 2,
    JSON.stringify({ r1: r1.actions, rb: rb && { success: rb.success, soft: rb.score_soft, ev: rbe }, rc: rc && { success: rc.success, soft: rc.score_soft }, nRef }));

  // ── AC-5 谱系反思只写轨迹 ────────────────────────────────
  const fa0 = JSON.stringify(rows(db, 'SELECT * FROM field_actions'));
  const mc0 = JSON.stringify(rows(db, 'SELECT * FROM meko_cycles'));
  LR.reflect(store, { cycleId: 'cyc-69c' });
  const fa1 = JSON.stringify(rows(db, 'SELECT * FROM field_actions'));
  const mc1 = JSON.stringify(rows(db, 'SELECT * FROM meko_cycles'));
  ac('AC-5 谱系反思只写轨迹', fa0 === fa1 && mc0 === mc1, JSON.stringify({ fa: fa0 === fa1, mc: mc0 === mc1 }));

  // ── AC-6 能力叙事派单（只开未消费）──────────────────────
  const d1 = CD.dispatchCapabilities(store, { cycleId: 'cyc-69' });
  const capT = one(db, "SELECT * FROM opt_tickets WHERE entity_id='raw-narr' AND dim='cap'");
  const consumedT = one(db, "SELECT * FROM opt_tickets WHERE entity_id='raw-consumed' AND dim='cap'");
  const d2 = CD.dispatchCapabilities(store, { cycleId: 'cyc-69' });
  ac('AC-6 能力派单（未消费开单/已消费不开/幂等）',
    d1.opened === 1 && capT && capT.kind === 'capability-unconsumed' && capT.action === 'memo-card' &&
    capT.status === 'open' && !consumedT && d2.opened === 0,
    JSON.stringify({ opened: d1.opened, cap: capT && { kind: capT.kind, action: capT.action, status: capT.status }, consumed: !!consumedT, second: d2.opened }));

  // ── AC-7 cap 复核 + 不毕业 ──────────────────────────────
  await S.dispatchTickets(store, { cycleId: 'cyc-69' });
  const proposed = one(db, "SELECT * FROM opt_tickets WHERE entity_id='raw-narr' AND dim='cap'");
  const insDp2 = db.prepare(`INSERT INTO distill_points (base_id,digest,raw_count,line_count,points_json,updated_at)
    VALUES ('raw-narr','d2',2,2,'[]',CURRENT_TIMESTAMP)`);
  insDp2.run(); insDp2.free();
  const ver = S.verifyTickets(store, { cycleId: 'cyc-69' });
  const capV = ver.verified.find(v => v.dim === 'cap');
  const grad = await S.graduateToGene(store, { cycleId: 'cyc-69' });
  const capGene = one(db, "SELECT * FROM genes WHERE name='opt:capability-unconsumed:memo-card'");
  const capAfter = one(db, "SELECT * FROM opt_tickets WHERE entity_id='raw-narr' AND dim='cap'");
  ac('AC-7 cap 复核为 verified + 不毕业',
    proposed && proposed.status === 'proposed' && capV && capAfter.status === 'verified' && !capGene &&
    grad.skipped.some(s => s.id === capT.id),
    JSON.stringify({ proposed: proposed && proposed.status, verified: !!capV, capStatus: capAfter && capAfter.status, gene: !!capGene, skipped: grad.skipped.length }));

  // ── AC-8 铁律：无物理删、不直连 store、双链零变化 ──────
  for (const f of ['retrieval-kpi.js', 'lineage-reflect.js', 'capability-dispatch.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    if (/DELETE\s+FROM/i.test(src)) { ac('AC-8 铁律', false, f + ' 含 DELETE FROM'); return; }
    if (/require\(['"][^'"]*knowledge-store/.test(src)) { ac('AC-8 铁律', false, f + ' 直连 knowledge-store'); return; }
  }
  const ent0 = JSON.stringify(rows(db, 'SELECT * FROM entities'));
  const lnk0 = JSON.stringify(rows(db, 'SELECT * FROM links'));
  await RK.runKpi(store, { cycleId: 'cyc-69d' });
  LR.reflect(store, { cycleId: 'cyc-69d' });
  CD.dispatchCapabilities(store, { cycleId: 'cyc-69d' });
  const ent1 = JSON.stringify(rows(db, 'SELECT * FROM entities'));
  const lnk1 = JSON.stringify(rows(db, 'SELECT * FROM links'));
  ac('AC-8 铁律（无删/不直连/双链零变化）', ent0 === ent1 && lnk0 === lnk1,
    JSON.stringify({ entities: ent0 === ent1, links: lnk0 === lnk1 }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
