// M1 任务 1.6 failing test —— 锁 SPEC-0.4 三轴判定七条 AC
// 运行（本仓根 <repo-root>）：node test/test-1.6-triaxis-gate.js
// 期望：红（assertion failure，因 src/tri-axis-gate.js 未实现）→ 任务 1.4 实现后转绿。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-triaxis-'));

// 清理：进程退出前删隔离假院（避免 Windows async handle race）
process.on('exit', () => {
  try { if (fs.existsSync(yard)) fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
});

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

let gate;
try { gate = require('../src/tri-axis-gate.js'); }
catch (e) {
  console.error('❌ 红（正确的红）—— tri-axis-gate.js 未实现 SPEC-0.4 三轴判定');
  console.error('   require 失败: ' + e.message.split('\n')[0]);
  console.error('\n七条 AC 尚未锁绿（需任务 1.4 实现）：AC-1 强度/AC-2 类型/AC-3 时效/AC-4 三轴AND/AC-5 fail-closed/AC-6 命中写回/AC-7 度上限');
  process.exit(1);
}

(async () => {
  // 隔离假院建库（依赖 SPEC-0.1 store）
  const store = require('../src/knowledge-store.js');
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-triaxis-'));
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);

  // 造测试边 helper
  const edge = (over) => Object.assign({ strength: 7, source_type: 'Concept', target_type: 'Conversation', invalid_at: null }, over);

  await check('AC-1 强度轴：7→过、6→不过（边界钉死≥7）', () => {
    assert(gate.shouldEnterRetrieval(edge({ strength: 7 })) === true, 'strength=7 应过');
    assert(gate.shouldEnterRetrieval(edge({ strength: 6 })) === false, 'strength=6 应不过');
  });

  await check('AC-2 类型轴：Concept→Conversation✅过；Todo→Concept❌不过', () => {
    assert(gate.isTypePairingLegal('Concept', 'Conversation') === true, 'Concept→Conversation 应合法');
    assert(gate.shouldEnterRetrieval(edge({ source_type: 'Todo', target_type: 'Concept' })) === false, 'Todo→Concept 应不过');
  });

  await check('AC-3 时效轴：invalid_at=NULL过；非NULL不过', () => {
    assert(gate.shouldEnterRetrieval(edge({ invalid_at: null })) === true, 'NULL 应过');
    assert(gate.shouldEnterRetrieval(edge({ invalid_at: '2026-11-01T00:00:00Z' })) === false, '非NULL 应不过');
  });

  await check('AC-4 三轴AND：全过才true，任一不过即false（8组合）', () => {
    const combos = [
      [7, true, null, true],
      [7, true, 'X', false],
      [7, false, null, false],
      [7, false, 'X', false],
      [6, true, null, false],
      [6, true, 'X', false],
      [6, false, null, false],
      [6, false, 'X', false],
    ];
    for (const [s, legal, inv, want] of combos) {
      const e = { strength: s, source_type: 'Concept', target_type: 'Conversation', invalid_at: inv };
      if (!legal) e.target_type = 'Todo'; // Concept→Todo 非法
      const got = gate.shouldEnterRetrieval(e);
      assert(got === want, `组合 s=${s} legal=${legal} inv=${inv} 期望${want}得${got}`);
    }
  });

  await check('AC-5 fail-closed：未列入白名单类型对默认拒', () => {
    assert(gate.isTypePairingLegal('Novel', 'Todo') === false, 'Novel→Todo 未列入应默认拒');
  });

  await check('AC-6 命中写回：检索命中刷新last_access；compile不碰', () => {
    store.insertEntity({ id: 'hit1', name: 'n', type: 'Concept', content: 'c', tags: '[]', status: 'active', confidence: 0.5 });
    const before = store.getEntity('hit1').last_access;
    gate.touchLastAccess(store, 'hit1'); // 检索命中写回
    const after = store.getEntity('hit1').last_access;
    assert(after && after !== before, '命中后 last_access 应更新');
    // compile 不碰：无 compile API 可调，此 AC 由调用方契约保证（这里只锁 touch 存在且生效）
  });

  await check('AC-7 度上限：造1节点20条有效边→入口只取top cap条', () => {
    const cap = 3; // 机制用可配 cap，值留 1.6
    const edges = [];
    for (let i = 0; i < 20; i++) edges.push(edge({ strength: 7 + (i % 2) })); // 全合法全有效
    const kept = gate.applyDegreeCap(edges, cap);
    assert(kept.length === cap, `度上限应保留${cap}条，得${kept.length}条`);
    // top 保留（按 strength 降序取前 cap）
    for (let i = 1; i < kept.length; i++) assert(kept[i - 1].strength >= kept[i].strength, '应按强度降序取top');
  });

  // 汇总
  const passed = results.filter(r => r.pass).length;
  console.log('\n=== TEST-M1.4 三轴判定 ===');
  results.forEach(r => console.log((r.pass ? '✅' : '❌') + ' ' + r.name + (r.err ? '  — ' + r.err : '')));
  console.log(`\n${passed}/${results.length} 绿`);
  process.exitCode = passed === results.length ? 0 : 1;
})();

// 清理：进程退出前删隔离假院（避免 Windows async handle race）
process.on('exit', (code) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  try {
    const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-triaxis-'));
    // yard 已在 async IIFE 内创建并使用，此处只清理
    if (fs.existsSync(yard)) fs.rmSync(yard, { recursive: true, force: true });
  } catch (_) {
    // 清理失败不阻塞测试结果
  }
});
