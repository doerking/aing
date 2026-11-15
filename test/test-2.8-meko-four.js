// M2 任务 2.1/2.2/2.4/2.8 failing test —— 锁 SPEC-0.2 meko 四顶接口五条 AC
// 运行（本仓根 <repo-root>）：node test/test-2.8-meko-four.js
// 期望：红（require failure）→ 四顶实现落地后转绿。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-meko-'));

process.on('exit', () => {
  try { if (fs.existsSync(yard)) fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
});

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

let mods;
try {
  mods = {
    HydrogenBond: require('../src/meko-hydrogen-bond.js').HydrogenBond,
    HistoneLayer: require('../src/meko-histone-layer.js').HistoneLayer,
    TimeboundOrchestrator: require('../src/meko-timebound-orchestrator.js').TimeboundOrchestrator,
    HelixCrosscheck: require('../src/meko-helix-crosscheck.js').HelixCrosscheck
  };
} catch (e) {
  console.error('❌ 红（正确的红）—— meko 四顶未实现 SPEC-0.2');
  console.error('   require 失败: ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  const store = require('../src/knowledge-store.js');
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);

  await check('AC-1 四类可 mock：四个类 new 出实例、方法签名齐', () => {
    const hb = new mods.HydrogenBond(store);
    const hl = new mods.HistoneLayer();
    const so = new mods.TimeboundOrchestrator(store);
    const hx = new mods.HelixCrosscheck(store);
    assert(typeof hb.bond === 'function' && typeof hb.unwind === 'function', 'HydrogenBond 缺 bond/unwind');
    assert(typeof hl.getEntryThreshold === 'function' && typeof hl.routeByStrength === 'function', 'HistoneLayer 缺方法');
    assert(typeof so.scheduleCycle === 'function' && typeof so.computeDeterministicDeadline === 'function' && typeof so.probeTopologyHealth === 'function', 'TimeboundOrchestrator 缺方法');
    assert(typeof hx.crosscheck === 'function', 'HelixCrosscheck 缺 crosscheck');
  });

  await check('AC-2 HydrogenBond 可逆：bond→unwind raw/wiki原样返 wired翻false', async () => {
    const hb = new mods.HydrogenBond(store);
    const raw = { id: 'raw-1', name: 'r', type: 'Conversation', content: 'c', tags: '[]', status: 'active', confidence: 0.5 };
    const wiki = { id: 'wiki-1', name: 'w', type: 'Concept', content: 'c', tags: '[]', status: 'active', confidence: 0.5 };
    store.insertEntity(raw); store.insertEntity(wiki);
    const bond = await hb.bond(raw, wiki);
    assert(bond.bondId, 'bond 应返回 bondId');
    assert(bond.wired === true, 'bond 后 wired 应 true');
    const un = await hb.unwind(bond.bondId);
    assert(un.unwound === true, 'unwind 应 true');
    assert(un.rawEntity && un.rawEntity.id === 'raw-1', 'rawEntity 原样返');
    assert(un.wikiEntity && un.wikiEntity.id === 'wiki-1', 'wikiEntity 原样返');
  });

  await check('AC-3 HistoneLayer 门槛：getEntryThreshold===7；9段路由', () => {
    const hl = new mods.HistoneLayer();
    assert(hl.getEntryThreshold() === 7, '入口门槛应=7');
    assert(hl.routeByStrength(9) === 'SLB' && hl.routeByStrength(8) === 'SLB' && hl.routeByStrength(7) === 'SLB', '9/8/7→SLB快车道');
    assert(hl.routeByStrength(6) === 'switch' && hl.routeByStrength(5) === 'switch' && hl.routeByStrength(4) === 'switch', '6/5/4→switch');
    assert(hl.routeByStrength(3) === 'SLE' && hl.routeByStrength(2) === 'SLE' && hl.routeByStrength(1) === 'SLE', '3/2/1→SLE慢车道');
  });

  await check('AC-4 TimeboundOrchestrator 时延有界：deadline>scheduledAt 且 ≤T_bound', async () => {
    const so = new mods.TimeboundOrchestrator(store);
    const r = await so.scheduleCycle('解旋', 'both');
    assert(r.scheduledAt instanceof Date || typeof r.scheduledAt === 'object', 'scheduledAt 应是日期');
    assert(r.deadline > r.scheduledAt, 'deadline 应 > scheduledAt');
    const bound = so.computeDeterministicDeadline('解旋') - r.scheduledAt;
    assert((r.deadline - r.scheduledAt) <= bound, 'deadline-scheduledAt 应 ≤ T_bound');
  });

  await check('AC-5 HelixCrosscheck 互补对返：wiki有raw无→rawGaps含该id', async () => {
    const hx = new mods.HelixCrosscheck(store);
    store.insertEntity({ id: 'wiki-only-1', name: 'x', type: 'Concept', content: 'c', tags: '[]', status: 'active', confidence: 0.5 });
    const r = await hx.crosscheck();
    assert(Array.isArray(r.rawGaps) && Array.isArray(r.wikiGaps), 'rawGaps/wikiGaps 应是数组');
    assert(typeof r.reconciled === 'number' && r.reconciled >= 0, 'reconciled 应是非负数字');
    assert(r.rawGaps.includes('wiki-only-1'), 'wiki有raw无 → rawGaps 应含 wiki-only-1（发现能力）');
    // 注：reconciled(已对返数) 由完整代谢 M2 真跑才增；此处锁发现能力 + 返回形状，不逼伪造对返
  });

  const passed = results.filter(r => r.pass).length;
  console.log('\n=== TEST-M1.14 meko 四顶接口 ===');
  results.forEach(r => console.log((r.pass ? '✅' : '❌') + ' ' + r.name + (r.err ? '  — ' + r.err : '')));
  console.log(`\n${passed}/${results.length} 绿`);
  process.exitCode = passed === results.length ? 0 : 1;
})();
