// M1 任务 1.6 failing test —— 锁 SPEC-1.2 link 同步步五条 AC
// 运行（本仓根 <repo-root>）：node test/test-1.6-link.js
// 期望：红（require failure）→ tri-axis-link.js 实现后转绿。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-link-'));

process.on('exit', () => {
  try { if (fs.existsSync(yard)) fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
});

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

let link;
try { link = require('../src/tri-axis-link.js'); }
catch (e) {
  console.error('❌ 红（正确的红）—— tri-axis-link.js 未实现 SPEC-1.2 link 同步步');
  console.error('   require 失败: ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  const store = require('../src/knowledge-store.js');
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);

  await check('AC-1 confidence→strength 映射：0.85→8/0.7→7/0.5→5/0.35→3', () => {
    assert(link.confidenceToStrength(0.85) === 8, '0.85→8');
    assert(link.confidenceToStrength(0.7) === 7, '0.7→7');
    assert(link.confidenceToStrength(0.5) === 5, '0.5→5');
    assert(link.confidenceToStrength(0.35) === 3, '0.35→3');
  });

  await check('AC-2 三轴夹出建边：合法入表、Todo→Concept 不入表', async () => {
    store.insertEntity({ id: 'a1', name: 'a', type: 'Concept', content: '', tags: '[]', status: 'active', confidence: 0.5 });
    store.insertEntity({ id: 'b1', name: 'b', type: 'Conversation', content: '', tags: '[]', status: 'active', confidence: 0.5 });
    store.insertEntity({ id: 't1', name: 't', type: 'Todo', content: '', tags: '[]', status: 'active', confidence: 0.5 });
    // Concept→Conversation 合法 + confidence 0.85→strength 8≥7 → 入表
    const okEdge = await link.buildEdge(store, { source_id: 'a1', target_id: 'b1', relation: 'r', confidence: 0.85 });
    assert(okEdge.entered === true, '合法边应入表');
    const row = store.getEntity; // 占位
    // Todo→Concept 配对非法 → 不入表
    const badEdge = await link.buildEdge(store, { source_id: 't1', target_id: 'a1', relation: 'r', confidence: 0.85 });
    assert(badEdge.entered === false, 'Todo→Concept 应不入表');
  });

  await check('AC-3 退役可逆：打戳→查有效边不含它→清戳复现', async () => {
    link.retireEdge(store, 'a1', 'b1');
    let active = link.listActiveEdges(store);
    assert(!active.some(e => e.source_id === 'a1' && e.target_id === 'b1'), '退役后有效边不含 a1→b1');
    link.reviveEdge(store, 'a1', 'b1');
    active = link.listActiveEdges(store);
    assert(active.some(e => e.source_id === 'a1' && e.target_id === 'b1'), '清戳后复现');
  });

  await check('AC-4 compile/link 不碰 last_access', async () => {
    store.insertEntity({ id: 'c1', name: 'c', type: 'Concept', content: '', tags: '[]', status: 'active', confidence: 0.5, });
    store.insertEntity({ id: 'd1', name: 'd', type: 'Conversation', content: '', tags: '[]', status: 'active', confidence: 0.5 });
    const before = store.getEntity('c1').last_access;
    await link.buildEdge(store, { source_id: 'c1', target_id: 'd1', relation: 'r', confidence: 0.9 });
    const after = store.getEntity('c1').last_access;
    assert(before === after, 'link 步跑后 last_access 应不变');
  });

  await check('AC-5 幂等：同候选边连跑 2 趟不炸', async () => {
    let threw = false;
    try {
      await link.buildEdge(store, { source_id: 'c1', target_id: 'd1', relation: 'r', confidence: 0.9 });
      await link.buildEdge(store, { source_id: 'c1', target_id: 'd1', relation: 'r', confidence: 0.9 });
    } catch (_) { threw = true; }
    assert(!threw, '重复建边应幂等跳过不抛');
  });

  const passed = results.filter(r => r.pass).length;
  console.log('\n=== TEST-M1.2 link 同步步 ===');
  results.forEach(r => console.log((r.pass ? '✅' : '❌') + ' ' + r.name + (r.err ? '  — ' + r.err : '')));
  console.log(`\n${passed}/${results.length} 绿`);
  process.exitCode = passed === results.length ? 0 : 1;
})();
