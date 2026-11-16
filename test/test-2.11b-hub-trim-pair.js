'use strict';
// M2 任务 2.11b failing test —— hub-trim 双超 cap 互斥死锁（SPEC-2.11 修订 A）
// 现状：「对端也超 cap → 交对端自己裁」，两端互相等对方，谁都裁唔到，退边供给断。
// 修法：双超 cap 时单向让位——超额大者先裁，等额按 id 稳定序；强边照旧零退。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-hubpair-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const H = require('../src/hub-trim.js');
const call = async (fn, ...args) => { try { return await fn(...args); } catch (e) { return { error: e.message }; } };
const rowsOf = (db, sql, ...binds) => { const s = db.prepare(sql); if (binds.length) s.bind(binds); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

// 造图：nodes 全互连（K_n），全部弱边
async function ladder(tag, n, strength = 1) {
  await store.init(path.join(yard, tag + '.db'));
  const db = store._getDb();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      db.run(`INSERT INTO links (source_id, target_id, relation, strength, created_at) VALUES (?, ?, 'related', ?, CURRENT_TIMESTAMP)`,
        ['n' + i, 'n' + j, strength]);
    }
  }
  return db;
}

function maxDegree(db) {
  const s = db.prepare(`SELECT MAX(d) AS m FROM (
      SELECT source_id AS id, COUNT(*) AS d FROM links WHERE invalid_at IS NULL GROUP BY source_id
      UNION ALL SELECT target_id AS id, COUNT(*) AS d FROM links WHERE invalid_at IS NULL GROUP BY target_id)`);
  s.step(); const m = Number(s.getAsObject().m || 0); s.free(); return m;
}
function degreeOf(db, id) {
  return Number(rowsOf(db, `SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND (source_id = ? OR target_id = ?)`, id, id)[0].n);
}

(async () => {
  // AC-1 双超 cap 不再死锁：K10（每点 9 度）cap=8 → 应裁 5 条，全网降到 8 度
  const db1 = await ladder('k10', 10, 1);
  const r1 = await call(H.trimHubs, store, { degreeCap: 8, weakBelow: 5 });
  const retired1 = rowsOf(db1, 'SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NOT NULL')[0].n;
  ac('AC-1 死锁解除', r1 && !r1.error && r1.trimmed === 5 && retired1 === 5 && maxDegree(db1) === 8,
    JSON.stringify({ r1, retired1, maxDeg: maxDegree(db1) }));

  // AC-2 强边零退：同样 K10 但 strength=6 → 一条不许裁
  const db2 = await ladder('k10s', 10, 6);
  const r2 = await call(H.trimHubs, store, { degreeCap: 8, weakBelow: 5 });
  const retired2 = rowsOf(db2, 'SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NOT NULL')[0].n;
  ac('AC-2 强边零退', r2 && !r2.error && r2.trimmed === 0 && retired2 === 0,
    JSON.stringify({ r2, retired2 }));

  // AC-3 确定性：同构图两库各跑一次，裁掉的边集合一致
  const db3 = await ladder('k10t', 10, 1);
  await call(H.trimHubs, store, { degreeCap: 8, weakBelow: 5 });
  const setOf = (db) => rowsOf(db, `SELECT source_id || '>' || target_id AS k FROM links WHERE invalid_at IS NOT NULL ORDER BY k`).map((r) => r.k).join(',');
  ac('AC-3 确定性', setOf(db1) === setOf(db3) && setOf(db1).length > 0, JSON.stringify({ a: setOf(db1), b: setOf(db3) }));

  // AC-4 可逆：裁完原样恢复
  const r4 = await call(H.restoreHubTrim, store, {});
  ac('AC-4 可逆', r4 && !r4.error && r4.restored === 5 &&
    rowsOf(db3, 'SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL')[0].n === 45,
    JSON.stringify({ r4, active: rowsOf(db3, 'SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL')[0].n }));

  // AC-5 既有行为不退化：单 hub + 叶子（叶子不超 cap）照旧裁到 cap
  await store.init(path.join(yard, 'star.db'));
  const db5 = store._getDb();
  for (let i = 0; i < 12; i++) {
    db5.run(`INSERT INTO links (source_id, target_id, relation, strength, created_at) VALUES ('hub', ?, 'related', 1, CURRENT_TIMESTAMP)`, ['leaf' + i]);
  }
  const r5 = await call(H.trimHubs, store, { degreeCap: 8, weakBelow: 5 });
  ac('AC-5 单 hub 照旧', r5 && !r5.error && r5.trimmed === 4 && degreeOf(db5, 'hub') === 8,
    JSON.stringify({ r5, deg: degreeOf(db5, 'hub') }));

  // AC-6 铁律：只退边（invalid_at），不物理删、不碰实体
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'hub-trim.js'), 'utf8');
  ac('AC-6 铁律', !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src),
    '源码含物理删或改实体');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
