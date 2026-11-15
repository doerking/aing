// M2 任务 2.4 failing test —— 锁 SPEC-0.3 时界调度协议五条 AC
// 运行（本仓根 <repo-root>）：node test/test-2.4-timebound.js
// 期望：红（当前 orchestrator 是 M1 占位实现，未满足 0.3 的 T_bound/loadFactor/写回）→ 升级后转绿。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-timebound-'));

process.on('exit', () => {
  try { if (fs.existsSync(yard)) fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
});

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

let TimeboundOrchestrator, HistoneLayer;
try {
  TimeboundOrchestrator = require('../src/meko-timebound-orchestrator.js').TimeboundOrchestrator;
  HistoneLayer = require('../src/meko-histone-layer.js').HistoneLayer;
} catch (e) {
  console.error('❌ 红（require 失败）: ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  const store = require('../src/knowledge-store.js');
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  const so = new TimeboundOrchestrator(store);

  await check('AC-1 T_bound可计算：给定cycleType+pendingEdges→确定性deadline，纯函数可复现', () => {
    const d1 = so.computeDeterministicDeadline('解旋', 50);
    const d2 = so.computeDeterministicDeadline('解旋', 50);
    assert(d1 instanceof Date, '应返回 Date');
    // 纯函数：同入参→同 tick 差（允许毫秒时间基准抖动，但 loadFactor 逻辑须可复现）
    const tick1 = d1.getTime() - Date.now();
    const tick2 = d2.getTime() - Date.now();
    const loadFactor = Math.ceil(50 / 10); // batchSize=10
    const T_bound = 1 * loadFactor * 1000; // base(解旋)=1 tick=1s
    assert(Math.abs(tick1 - T_bound) < 2000 && Math.abs(tick2 - T_bound) < 2000, `解旋50边 T_bound应≈${T_bound}ms，得${tick1}/${tick2}`);
  });

  await check('AC-2 时延有界：造100待处理边跑scheduleCycle→deadline-scheduled_at ≤ T_bound', async () => {
    const r = await so.scheduleCycle('互校', 'both', 100); // base=3,batch=10→loadFactor=10→T_bound=30s
    const delta = r.deadline - r.scheduledAt;
    const T_bound = 3 * Math.ceil(100 / 10) * 1000;
    assert(r.deadline > r.scheduledAt, 'deadline>scheduledAt');
    assert(delta <= T_bound + 100, `delta=${delta} 应≤T_bound=${T_bound}`);
    assert(r.mode === 'SLB' || r.mode === 'SLE', 'mode 应 SLB/SLE');
  });

  await check('AC-3 双模分流：strength 9→SLB / 5→switch / 2→SLE', () => {
    const hl = new HistoneLayer();
    assert(hl.routeByStrength(9) === 'SLB', '9→SLB');
    assert(hl.routeByStrength(5) === 'switch', '5→switch');
    assert(hl.routeByStrength(2) === 'SLE', '2→SLE');
  });

  await check('AC-4 噪声拒入口：strength<3的边被scheduleCycle拒(返回reject/noise标记)', async () => {
    const r = await so.scheduleCycle('复制', 'raw', 20, { pendingEdgesMeta: [{ strength: 2 }, { strength: 9 }] });
    // 噪声边（strength<3）应被标记 reject/noise，不排入快车道
    assert(Array.isArray(r.noiseRejected) && r.noiseRejected.length >= 1, '噪声边应被拒（noiseRejected≥1）');
  });

  await check('AC-5 通感写回：跑一轮scheduleCycle→meko_cycles表新增行含非空kespi_snapshot', async () => {
    const before = _countMeko(store);
    await so.scheduleCycle('再螺旋', 'both', 30);
    const after = _countMeko(store);
    assert(after === before + 1, `meko_cycles 应+1行，before=${before} after=${after}`);
    const row = _lastMeko(store);
    assert(row && row.kespi_snapshot !== null && row.kespi_snapshot !== undefined, 'kespi_snapshot 应非空');
  });

  function _countMeko(st) {
    const db = st._getDb();
    const s = db.prepare('SELECT COUNT(*) AS c FROM meko_cycles');
    s.step(); const c = s.getAsObject().c; s.free(); return c;
  }
  function _lastMeko(st) {
    const db = st._getDb();
    const s = db.prepare('SELECT * FROM meko_cycles ORDER BY rowid DESC LIMIT 1');
    let row = null; if (s.step()) row = s.getAsObject(); s.free(); return row;
  }

  const passed = results.filter(r => r.pass).length;
  console.log('\n=== TEST-M1.3 时界调度协议 ===');
  results.forEach(r => console.log((r.pass ? '✅' : '❌') + ' ' + r.name + (r.err ? '  — ' + r.err : '')));
  console.log(`\n${passed}/${results.length} 绿`);
  process.exitCode = passed === results.length ? 0 : 1;
})();
