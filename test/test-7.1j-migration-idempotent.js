'use strict';
// M7 任务 7.1j 护栏测试 —— 锁 SPEC-7.1 AC-8（迁移幂等）
// 口径：schema 迁移/重开库连跑两趟，档数、links 端点数、别名映射都不变；
//       旧库迁移对非空目标第二趟必须拒，且目标快照不动。
// 说明：这是护栏（AC-16 同待遇）——既有 init/migrate 已按幂等写，预期首跑即绿；
//       一旦有人把迁移改成「每次重算/重写」，这里立刻红。
const fs = require('fs'); const os = require('os'); const path = require('path');
const crypto = require('crypto');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-migidem-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const M = require('../src/migrate.js');
const derive = require('../src/derive.js');

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
function rows(db, sql) { const s = db.prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }
function snapshot(db) {
  const ents = rows(db, 'SELECT id, name, type, content, tags, status, confidence, strand, fingerprint, created_at FROM entities ORDER BY id');
  const ends = rows(db, 'SELECT source_id, target_id, relation, strength, invalid_at FROM links ORDER BY source_id, target_id');
  return { entities: ents.length, links: ends.length, entHash: sha(JSON.stringify(ents)), linkHash: sha(JSON.stringify(ends)) };
}

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  const put = (id, strand, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '["a:6"]', status: 'active', confidence: 0.5, strand, created_at: '2026-01-01 00:00:00' });
  put('raw-p1', 'past', '原文甲');
  put('raw-p2', 'past', '原文乙');
  put('wiki-p1', 'future', '原文甲');
  store.insertLink({ source_id: 'raw-p1', target_id: 'wiki-p1', relation: 'derived', confidence: 0.6 });

  const s1 = snapshot(store._getDb());
  // 连开两趟（schema 迁移/守卫全部再跑一遍）
  await store.init(dbPath);
  await store.init(dbPath);
  const s2 = snapshot(store._getDb());
  ac('AC-8a schema 迁移幂等（两趟快照一致）',
    JSON.stringify(s1) === JSON.stringify(s2),
    JSON.stringify({ s1, s2 }));

  // 别名映射（派生器）确定性
  const a1 = JSON.stringify(derive.variants('意識神經'));
  const a2 = JSON.stringify(derive.variants('意識神經'));
  ac('AC-8b 别名映射不变', a1 === a2 && a1.length > 2, a1);

  // 旧库迁移：第二趟拒，且目标快照不动
  const SQL = await require('sql.js')();
  const legacy = new SQL.Database();
  legacy.run('CREATE TABLE entities (id TEXT PRIMARY KEY, name TEXT, type TEXT, content TEXT, tags TEXT, status TEXT, confidence REAL, created_at DATETIME)');
  legacy.run('CREATE TABLE links (source_id TEXT, target_id TEXT, relation TEXT, confidence REAL, created_at DATETIME, strength INTEGER, invalid_at DATETIME)');
  legacy.run("INSERT INTO entities VALUES ('old-1','n1','Concept','旧文','[]','active',0.5,'2020-01-01 00:00:00')");
  const legacyPath = path.join(yard, 'legacy.db');
  fs.writeFileSync(legacyPath, Buffer.from(legacy.export()));

  const target = path.join(yard, 'target.db');
  await store.init(target);
  await M.migrateFrom(store, { sourcePath: legacyPath });
  const t1 = snapshot(store._getDb());
  let second = null;
  try { await M.migrateFrom(store, { sourcePath: legacyPath }); } catch (e) { second = e.message; }
  const t2 = snapshot(store._getDb());
  ac('AC-8c 迁移第二趟拒且目标不动',
    /target-not-empty/.test(String(second)) && JSON.stringify(t1) === JSON.stringify(t2),
    JSON.stringify({ second, t1, t2 }));

  console.log(`\n----- 7.1j pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
