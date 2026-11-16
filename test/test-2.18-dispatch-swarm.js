'use strict';
// M2 任务 2.18 failing test —— 锁 SPEC-2.18 外派采集面 AC-1~20
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dispatch-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let D, store;
try {
  D = require('../src/dispatch-swarm.js');
  store = require('../src/knowledge-store.js');
  if (typeof D.DispatchDesk !== 'function') throw new Error('DispatchDesk 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/dispatch-swarm.js 未实现 SPEC-2.18'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

// 缺件时返回 __missing，让红落在断言上而不是异常上
const call = (name, ...args) => (typeof D[name] === 'function' ? D[name](...args) : { __missing: true });
const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const BASELINE = {
  language: { thinking: '务实优先', output: '普通话简体' },
  behavior: { rules: ['留面', '阈值收线'] },
  workflow: ['六步：立项→展开→校验→收口']
};
const THICK = { required: 5, achieved: 6, met: true };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const desk = new D.DispatchDesk();

  // AC-1 缺底版拒派
  let thrown = null;
  try { desk.dispatch({ ticket: 'T-1', baseline: { language: BASELINE.language, behavior: BASELINE.behavior } }); }
  catch (e) { thrown = e.message; }
  ac('AC-1 缺底版拒派', /baseline-missing/.test(String(thrown)) && desk.units().length === 0, String(thrown));

  // AC-2 单间不互斥
  const d1 = desk.dispatch({ ticket: 'T-1', baseline: BASELINE, thickness: { required: 5 } });
  const d2 = desk.dispatch({ ticket: 'T-2', baseline: BASELINE, thickness: { required: 5 } });
  ac('AC-2 单间不互斥', d1.state === 'running' && d2.state === 'running' && desk.units().length === 2,
    JSON.stringify(desk.units()));

  // AC-4 3 员职责不重叠
  const roles = d1.members.map(m => m.role);
  const resps = d1.members.map(m => m.responsibility);
  ac('AC-4 3 员职责不重叠', roles.length === 3 && new Set(roles).size === 3 && new Set(resps).size === 3,
    JSON.stringify(d1.members));

  // AC-3 收口校验
  const bad = await desk.close(d1.id, { traces: [], tags: ['unit', 'ticket', 'outcome'] });
  const bad2 = await desk.close(d1.id, { traces: [{ step: 1 }], tags: ['unit'] });
  const stillRunning = desk.units().some(u => u.id === d1.id);
  ac('AC-3a 缺轨迹/标签拒收', !bad.closed && !bad2.closed && stillRunning && desk.units().length === 2,
    JSON.stringify({ bad, bad2, running: stillRunning }));

  const ok = await desk.close(d1.id, { traces: [{ step: 1 }, { step: 2 }], tags: ['unit', 'ticket', 'outcome'], thickness: THICK });
  const d3 = desk.dispatch({ ticket: 'T-3', baseline: BASELINE, thickness: { required: 5 } });
  ac('AC-3b 收口解散 + 交接不继承',
    ok.closed && ok.residue && ok.residue.traces.length === 2 && d3.inherited.length === 0 &&
    !desk.units().some(u => u.id === d1.id) && desk.units().length === 2,
    JSON.stringify({ ok, d3: { inherited: d3.inherited }, units: desk.units() }));

  // AC-5 零写权
  let writeThrew = null;
  try { desk.write(d2.id, 'entities', { id: 'x' }); } catch (e) { writeThrew = e.message; }
  let unitWrite = null;
  try { d2.write(); } catch (e) { unitWrite = e.message; }
  const nEnt = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  ac('AC-5 零写权', /swarm-no-write/.test(String(writeThrew)) && /swarm-no-write/.test(String(unitWrite)) && Number(nEnt) === 0,
    JSON.stringify({ writeThrew, unitWrite, nEnt }));

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'dispatch-swarm.js'), 'utf8');
  ac('AC-5b 无物理删', !/DELETE\s+FROM/i.test(src));

  // ── AC-6 缺厚度拒派 ────────────────────────────────────
  const desk6 = new D.DispatchDesk();
  let noThick = null;
  try { desk6.dispatch({ ticket: 'T-6', baseline: BASELINE }); } catch (e) { noThick = e.message; }
  ac('AC-6 缺厚度拒派', /thickness-missing/.test(String(noThick)) && desk6.units().length === 0, String(noThick));

  // ── AC-7 交付自报厚度达标 ──────────────────────────────
  const u7 = desk6.dispatch({ ticket: 'T-7', baseline: BASELINE, thickness: { required: 5 } });
  const c7a = await desk6.close(u7.id, { traces: [{ step: 1 }], tags: ['unit', 'ticket', 'outcome'] });
  const c7b = await desk6.close(u7.id, { traces: [{ step: 1 }], tags: ['unit', 'ticket', 'outcome'], thickness: { required: 5, achieved: 3, met: true } });
  const c7c = await desk6.close(u7.id, { traces: [{ step: 1 }], tags: ['unit', 'ticket', 'outcome'], thickness: { required: 5, achieved: 6, met: true } });
  ac('AC-7 厚度自报三态', !c7a.closed && c7a.reason === 'thickness-incomplete' &&
    !c7b.closed && c7b.reason === 'thickness-inconsistent' && c7c.closed === true,
    JSON.stringify({ c7a, c7b, c7c: c7c.closed }));

  // ── AC-8 批间只认用户闸 ────────────────────────────────
  const desk8 = new D.DispatchDesk();
  desk8.dispatch({ ticket: 'B1-a', baseline: BASELINE, thickness: { required: 5 }, batch: 'b1' });
  let locked = null;
  try { desk8.dispatch({ ticket: 'B2-a', baseline: BASELINE, thickness: { required: 5 }, batch: 'b2' }); }
  catch (e) { locked = e.message; }
  const nextOk = (() => { try { desk8.dispatch({ ticket: 'B2-b', baseline: BASELINE, thickness: { required: 5 }, batch: 'b2', continued: true }); return true; } catch (_) { return false; } })();
  ac('AC-8 批间用户闸', /batch-locked/.test(String(locked)) && nextOk === true, JSON.stringify({ locked, nextOk }));

  // ── AC-9 无熔断 ────────────────────────────────────────
  const desk9 = new D.DispatchDesk();
  for (let i = 0; i < 6; i++) {
    const u = desk9.dispatch({ ticket: 'F-' + i, baseline: BASELINE, thickness: { required: 5 } });
    await desk9.close(u.id, { traces: [], tags: [] });
  }
  let stillCan = false;
  try { desk9.dispatch({ ticket: 'F-after', baseline: BASELINE, thickness: { required: 5 } }); stillCan = true; } catch (_) {}
  ac('AC-9 无熔断', stillCan && !/failureThreshold|halfOpen|resetTimeout|circuitBreak/i.test(src), JSON.stringify({ stillCan }));

  // ── AC-10 轨迹口径 ─────────────────────────────────────
  const many = Array.from({ length: 13 }, (_, i) => ({ fact: 'f' + i, source: 's' + i }));
  const noSrc = [{ fact: '市占 23%' }];
  const concl = [{ fact: 'x', source: 's', conclusion: '所以很强' }];
  const good = Array.from({ length: 12 }, (_, i) => ({ fact: 'f' + i, source: 's' + i }));
  ac('AC-10 轨迹口径', call('checkTraces', many).reason === 'over-limit' &&
    call('checkTraces', noSrc).reason === 'no-source' &&
    call('checkTraces', concl).reason === 'conclusion' &&
    call('checkTraces', good).ok === true,
    JSON.stringify({ many: call('checkTraces', many), noSrc: call('checkTraces', noSrc), concl: call('checkTraces', concl) }));

  // ── AC-11 来源分级与交叉验证 ───────────────────────────
  const unclassified = call('evaluateClaim', { sources: [{ id: 'a', level: 'unclassified' }], confidence: 'high' });
  const single = call('evaluateClaim', { sources: [{ id: 'a', level: 'high' }], confidence: 'high' });
  const sameAuthor = call('evaluateClaim', { sources: [{ id: 'a', level: 'high', author: 'X' }, { id: 'b', level: 'high', author: 'X' }], confidence: 'high' });
  const two = call('evaluateClaim', { sources: [{ id: 'a', level: 'high', author: 'X' }, { id: 'b', level: 'high', author: 'Y' }], confidence: 'high' });
  ac('AC-11 来源分级/交叉', unclassified.verdict === 'residue' && single.verdict === 'lead' &&
    sameAuthor.verdict === 'lead' && two.verdict === 'attack',
    JSON.stringify({ unclassified, single, sameAuthor, two }));

  // ── AC-12 攻果四件门 ───────────────────────────────────
  const g12ok = call('gateResult', { facts: ['f'], evidence: ['e'], grading: 'high', selfReview: { confidence: 'high' } });
  const g12bad = call('gateResult', { facts: ['f'], evidence: ['e'], selfReview: { confidence: 'high' } });
  ac('AC-12 攻果四件门', g12ok.ok === true && g12bad.ok === false && g12bad.missing.includes('grading'),
    JSON.stringify({ g12ok, g12bad }));

  // ── AC-13 基线门 ───────────────────────────────────────
  const b13none = call('baselineGate', { baseline: null, score: 0.9 });
  const b13cut = call('baselineGate', { baseline: { from: '对照' }, score: 0.4, baselineScore: 0.6 });
  const b13pass = call('baselineGate', { baseline: { from: '对照' }, score: 0.7, baselineScore: 0.6 });
  ac('AC-13 基线门', b13none.ok === false && b13none.reason === 'no-baseline' &&
    b13cut.ok === false && b13cut.reason === 'below-baseline' && b13pass.ok === true,
    JSON.stringify({ b13none, b13cut, b13pass }));

  // ── AC-14 禁虚报 ───────────────────────────────────────
  const m14a = call('dispatchMode', { swarmInstalled: true, inRuntimeSurface: false, bundledInPackage: true });
  const m14b = call('dispatchMode', { swarmInstalled: true, inRuntimeSurface: true, bundledInPackage: true });
  ac('AC-14 禁虚报三布尔', m14a.mode === 'inline-degraded' && m14b.mode === 'swarm-skill' &&
    m14a.swarmInstalled === true && m14a.bundledInPackage === true, JSON.stringify({ m14a, m14b }));

  // ── AC-15 两权分离 ─────────────────────────────────────
  ac('AC-15 两权分离', call('checkAuthority', 'particle', 'decide').allowed === false &&
    call('checkAuthority', 'squad-lead', 'move').allowed === false &&
    call('checkAuthority', 'unit-lead', 'schedule').allowed === false &&
    call('checkAuthority', 'owner', 'decide').allowed === true,
    JSON.stringify({ p: call('checkAuthority', 'particle', 'decide'), o: call('checkAuthority', 'owner', 'decide') }));

  // ── AC-16 三类粒子模板齐 ───────────────────────────────
  const f16 = call('checkFramework', { background: 'b', statement: 's' });
  const l16ok = call('checkLanes', ['normal', 'cover']);
  const l16bad = call('checkLanes', ['normal']);
  ac('AC-16 三类粒子', Array.isArray(f16.missing) && f16.missing.includes('trace_policy') &&
    f16.missing.includes('output_schema') && l16ok.ok === true &&
    l16bad.ok === false && l16bad.reason === 'cover-missing',
    JSON.stringify({ f16, l16ok, l16bad }));

  // ── AC-17 掩护位铁律 ───────────────────────────────────
  const covOk = call('checkCoverReport', {
    conflicts: [{ a: { fact: '23%', source: 'A' }, b: { fact: '26%', source: 'B' } }],
    singleSource: [], unclassified: []
  });
  const covOneSide = call('checkCoverReport', { conflicts: [{ a: { fact: '23%', source: 'A' } }], singleSource: [], unclassified: [] });
  const covFix = call('checkCoverReport', { conflicts: [], singleSource: [], unclassified: [], fix: '改成 26%' });
  ac('AC-17 掩护位铁律', covOk.ok === true && covOneSide.reason === 'both-sides-required' &&
    covFix.reason === 'no-fix-allowed', JSON.stringify({ covOk, covOneSide, covFix }));

  // ── AC-18 回报 schema 与验收 ───────────────────────────
  const rep18ok = call('checkReport', {
    statement: '命题', materials: [{ fact: 'f', source: 's', level: 'high' }],
    conflicts: [], selfReview: { confidence: 'high', gap: '无' }, verdict: 'PASS', gateOk: true
  });
  const rep18bad = call('checkReport', {
    statement: '命题', materials: [{ fact: 'f', source: 's', level: 'high' }],
    conflicts: [], selfReview: { confidence: 'high', gap: '无' }, verdict: 'PASS', gateOk: false
  });
  ac('AC-18 回报验收', rep18ok.ok === true && rep18bad.ok === false && rep18bad.reason === 'pass-without-gate',
    JSON.stringify({ rep18ok, rep18bad }));

  // ── AC-19 降级不跳门 ───────────────────────────────────
  const dg19 = call('degrade', { inRuntimeSurface: false });
  const dg19role = call('degrade', { missingRole: true });
  ac('AC-19 降级不跳门', dg19.mode === 'inline-degraded' && dg19.stillGated === true &&
    dg19role.stillGated === true, JSON.stringify({ dg19, dg19role }));

  // ── AC-20 成本纪律 ─────────────────────────────────────
  const w20 = call('planWave', { units: 3 });
  const w20one = call('planWave', { units: 1 });
  ac('AC-20 波次/成本', JSON.stringify(w20.waves) === JSON.stringify([[1], [2, 3]]) &&
    JSON.stringify(w20one.waves) === JSON.stringify([[1]]), JSON.stringify({ w20, w20one }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
