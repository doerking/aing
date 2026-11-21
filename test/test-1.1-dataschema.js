// M1 任务 1.1 failing test —— 锁 SPEC-0.1 数据模型六条 AC
// 运行（本仓根 <repo-root>）：node test/test-1.1-dataschema.js
// 隔离假院真跑（临时库，不污染真库）。期望：红（assertion failure，因 src/knowledge-store.js 未按 SPEC-0.1 实现三表建表）。
// 实现落地（任务 1.1）后转绿。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

// 隔离假院：临时目录建库
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-ds-'));
const dbPath = path.join(yard, 'knowledge.db');

// 被测实现（任务 1.1 落地前 require 必失败 → 正确嘅红）
let store;
try { store = require('../src/knowledge-store.js'); }
catch (e) {
  console.error('❌ 红（正确的红）—— knowledge-store.js 未实现 SPEC-0.1 三表建表');
  console.error('   require 失败: ' + e.message.split('\n')[0]);
  console.error('\n六条 AC 尚未锁绿（需任务 1.1 实现）：AC-1 三表/AC-2 幂等/AC-3 三轴列/AC-4 默认值/AC-5 主键/AC-6 FK');
  process.exit(1);
}

// AC-1~6（async 包裹：init() 是 async，sql.js 需 await 加载 WASM）
(async () => {
  // 先完成初始化（async），后续各 AC 在同一 db 实例上同步跑
  await store.init(dbPath);

  // AC-1 三表建成
  await check('AC-1 三表建成 entities/links/meko_cycles', () => {
    const tables = store.listTables();
    assert(tables.includes('entities'), '缺 entities 表');
    assert(tables.includes('links'), '缺 links 表');
    assert(tables.includes('meko_cycles'), '缺 meko_cycles 表');
  });

  // AC-2 幂等复跑不炸
  await check('AC-2 幂等复跑（连跑 2 趟 exit 0 结构一致）', async () => {
    await store.init(dbPath); await store.init(dbPath); // 不抛即过
  });

  // AC-3 三轴列在位
  await check('AC-3 三轴列在位', () => {
    const e = store.columns('entities'), l = store.columns('links');
    assert(e.includes('tolaria_strength') && e.includes('last_access') && e.includes('invalid_at'), 'entities 缺三轴列');
    assert(l.includes('strength') && l.includes('invalid_at'), 'links 缺 strength/invalid_at');
  });

  // AC-4 默认值 strength=5
  await check('AC-4 默认值 tolaria_strength/strength=5', () => {
    store.insertEntity({ id: 'e1', name: 'n', type: 'Concept', content: 'c', tags: '[]', status: 'active', confidence: 0.5 });
    const row = store.getEntity('e1');
    assert(row && row.tolaria_strength === 5, 'entities.tolaria_strength 默认≠5');
  });

  // AC-5 主键约束 links(A,B) 重复插抛冲突
  await check('AC-5 links 主键约束生效', () => {
    store.insertLink({ source_id: 'a', target_id: 'b', relation: 'r', confidence: 0.5 });
    let threw = false;
    try { store.insertLink({ source_id: 'a', target_id: 'b', relation: 'r', confidence: 0.5 }); } catch (_) { threw = true; }
    assert(threw, 'links (A,B) 重复插未抛冲突，主键失效');
  });

  // AC-6 FK 完整性 foreign_keys ON
  await check('AC-6 foreign_keys 落盘后仍 ON', () => {
    const on = store.foreignKeysOn();
    assert(on === true, 'foreign_keys 未 ON');
  });

  // 汇总
  const passed = results.filter(r => r.pass).length;
  console.log('\n=== TEST-M1.2 数据模型 ===');
  results.forEach(r => console.log((r.pass ? '✅' : '❌') + ' ' + r.name + (r.err ? '  — ' + r.err : '')));
  console.log(`\n${passed}/${results.length} 绿`);
  store._close();   // nodesqlite 文件库持句柄，先关再 rm（Windows EPERM）
  fs.rmSync(yard, { recursive: true, force: true });
  process.exit(passed === results.length ? 0 : 1);
})();
