'use strict';
// M2 任务 2.10c failing test —— 守恒主读数统一到「边」层（SPEC-2.10 修订 B）
// 旧口径分子数边、分母数实体，量纲不同；体系实际的新陈代谢发生在边层（产边/退边）。
// 本件：edge 为主读数、entity 退场单列、gate 取更差者报警；旧字段原样保留一版。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-edge-cons-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const C = require('../src/conservation.js');

// 每个场景一个独立库：measureConservation 数的是 30 天窗，场景之间不互相污染
async function fresh(tag, growN, retireN, entityRetireN = 0) {
  await store.init(path.join(yard, tag + '.db'));
  const db = store._getDb();
  for (let i = 0; i < growN; i++) {
    db.run(`INSERT INTO links (source_id, target_id, relation, created_at) VALUES (?, ?, 'sprout-candidate', CURRENT_TIMESTAMP)`, ['g' + i, 'h' + i]);
  }
  for (let i = 0; i < retireN; i++) {
    db.run(`INSERT INTO links (source_id, target_id, relation, created_at, invalid_at) VALUES (?, ?, 'related', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, ['r' + i, 's' + i]);
  }
  for (let i = 0; i < entityRetireN; i++) {
    store.insertEntity({ id: 'e' + i, name: 'e' + i, type: 'Conversation', content: 'x' });
    db.run(`UPDATE entities SET invalid_at = CURRENT_TIMESTAMP WHERE id = ?`, ['e' + i]);
  }
  return C.measureConservation(store, {});
}

(async () => {
  // AC-1 边层读数：产 3 退 3 → edge.ratio=1，带内，gate balanced
  const m1 = await fresh('a', 3, 3);
  ac('AC-1 边层均衡', m1.edge && m1.edge.growth === 3 && m1.edge.pruned === 3 &&
    m1.edge.ratio === 1 && m1.edge.inBand === true && m1.edge.verdict === 'balanced' &&
    m1.gate.verdict === 'balanced' && m1.gate.alerts.length === 0,
    JSON.stringify({ edge: m1.edge, gate: m1.gate }));

  // AC-2 只长不剪（真库现状）：产 5 退 0 → 边层 Infinity / growth-only，报警面点名边层
  const m2 = await fresh('b', 5, 0);
  const e2 = m2.edge || {}; const g2 = m2.gate || {};
  ac('AC-2 边层只长不剪', e2.ratio === Infinity && e2.verdict === 'growth-only' &&
    g2.verdict === 'growth-only' && Array.isArray(g2.alerts) && g2.alerts.includes('edge:growth-only'),
    JSON.stringify({ edge: m2.edge, gate: m2.gate }));

  // AC-3 只剪不长：产 0 退 5 → edge.ratio=0 / prune-only
  const m3 = await fresh('c', 0, 5);
  const e3 = m3.edge || {}; const g3 = m3.gate || {};
  ac('AC-3 边层只剪不长', e3.growth === 0 && e3.pruned === 5 && e3.ratio === 0 &&
    e3.verdict === 'prune-only' && g3.verdict === 'prune-only',
    JSON.stringify({ edge: m3.edge, gate: m3.gate }));

  // AC-4 实体退场单列：不混进边层比值，也不把 gate 带偏
  const m4 = await fresh('d', 3, 3, 2);
  const e4 = m4.edge || {}; const g4 = m4.gate || {};
  ac('AC-4 实体单列', e4.ratio === 1 && (m4.entity || {}).pruned === 2 && g4.verdict === 'balanced',
    JSON.stringify({ edge: m4.edge, entity: m4.entity, gate: m4.gate }));

  // AC-5 旧字段原样保留一版：growth=边、pruned=实体、ratio=旧混口径（3/2=1.5 带内）
  const m5 = m4;
  ac('AC-5 旧字段兼容', m5.growth === 3 && m5.pruned === 2 && m5.ratio === 1.5 && m5.inBand === true,
    JSON.stringify({ growth: m5.growth, pruned: m5.pruned, ratio: m5.ratio, inBand: m5.inBand }));

  // AC-6 铁律：只读、源码无物理删
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'conservation.js'), 'utf8');
  const before = JSON.stringify(m5);
  C.measureConservation(store, {});
  ac('AC-6 铁律', before === JSON.stringify(m5) && !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src) && !/INSERT\s+INTO/i.test(src),
    '源码含写语句或读数不可重复');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
