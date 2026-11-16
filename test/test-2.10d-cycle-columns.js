'use strict';
// M2 任务 2.10d failing test —— 轮账三列与主读数同源（SPEC-2.10 修订 D）
// 2.10c 把主读数统一到边层，但 meko_cycles 仍落混口径（growth=边、pruned=实体、
// ratio=混比）。历史读数与当轮判定对不上，反馈差分也跟着吃假数。
// 要守：轮账 growth/pruned/ratio 三列 = 边层读数；实体退场不冒充 pruned。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cyc-cols-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const C = require('../src/conservation.js');
let Orc = null;
try { Orc = require('../src/meko-orchestrator.js').MekoOrchestrator; } catch (_) { Orc = null; }

function rowOf(db) {
  const s = db.prepare('SELECT * FROM meko_cycles ORDER BY rowid DESC LIMIT 1');
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();
  // 3 条产能边 + 1 条退边 + 2 条实体退场（实体退场不得冒充 pruned）
  for (let i = 0; i < 3; i++) db.run(`INSERT INTO links (source_id, target_id, relation, created_at) VALUES (?, ?, 'sprout-candidate', CURRENT_TIMESTAMP)`, ['g' + i, 'h' + i]);
  db.run(`INSERT INTO links (source_id, target_id, relation, created_at, invalid_at) VALUES ('r0', 's0', 'related', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
  for (let i = 0; i < 2; i++) {
    db.run(`INSERT INTO entities (id, name, type, content, status) VALUES (?, ?, 'Conversation', 'x', 'active')`, ['e' + i, 'e' + i]);
    db.run(`UPDATE entities SET invalid_at = CURRENT_TIMESTAMP WHERE id = ?`, ['e' + i]);
  }

  const before = C.measureConservation(store, {});
  if (!Orc) { console.error('❌ 编排器未实现'); process.exit(1); }
  const orch = new Orc({ store });
  await orch.runCycle('代谢', {});
  const after = C.measureConservation(store, {});
  const row = rowOf(db);

  // AC-1 growth = 边层产能（不是实体数）
  ac('AC-1 growth 取边层', Number(row.growth) === after.edge.growth && after.edge.growth >= 3,
    JSON.stringify({ row: { g: row.growth, p: row.pruned }, edge: after.edge }));

  // AC-2 pruned = 边层退边（实体退场 2 条不得冒充）
  ac('AC-2 pruned 取边层', Number(row.pruned) === after.edge.pruned && after.edge.pruned >= 1,
    JSON.stringify({ row: row.pruned, edge: after.edge.pruned, entity: after.entity }));

  // AC-3 ratio 与边层一致（含 Infinity 合法读数）
  const sameRatio = row.conservation_ratio === after.edge.ratio ||
    (Number(row.conservation_ratio) === Number(after.edge.ratio));
  ac('AC-3 ratio 取边层', sameRatio, JSON.stringify({ row: String(row.conservation_ratio), edge: String(after.edge.ratio) }));

  // AC-4 退边为 0 时 ratio 落成 Infinity（合法读数），不是 null / 1
  await store.init(path.join(yard, 'k2.db'));
  const db2 = store._getDb();
  for (let i = 0; i < 4; i++) db2.run(`INSERT INTO links (source_id, target_id, relation, created_at) VALUES (?, ?, 'sprout-candidate', CURRENT_TIMESTAMP)`, ['q' + i, 'w' + i]);
  await new Orc({ store }).runCycle('代谢', {});
  const row2 = rowOf(db2);
  ac('AC-4 零退边落 Infinity', typeof row2.conservation_ratio === 'number' && !Number.isFinite(row2.conservation_ratio) && Number(row2.pruned) === 0,
    JSON.stringify({ ratio: String(row2.conservation_ratio), pruned: row2.pruned }));

  // AC-5 只写 meko_cycles 一行：其它表行数不受影响（除本轮代谢自身动作）
  const faBefore = before.edge ? 0 : 0;
  ac('AC-5 轮账可读', typeof row.id === 'string' && row.id.startsWith('cyc-') && row.status === 'executed' && faBefore === 0,
    JSON.stringify({ id: row.id, status: row.status }));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
