'use strict';
// M8 任务 8.2 failing test —— 锁双铰链两条硬闸：AC-18（DB 级拒 future→past）+ AC-20（past 必须有原始时间）
// 口径：
//   AC-18 在库层就拒——绕过 store.insertLink 直接写 SQL 也得被拒，UPDATE 改方向同样拒；
//   AC-20 入库保留原始时间；迁移时没有原始时间的行不准进 past，迁完逐行复核。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-gates-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const M = require('../src/migrate.js');

function rows(db, sql, b = []) { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, strand, content = '正文 ' + id, extra = {}) =>
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active', confidence: 0.5, strand, ...extra });

  // ── AC-20a 入库保留原始时间 ──
  put('raw-old', 'past', '原文有时间', { created_at: '2020-05-01 10:00:00' });
  const e = store.getEntity('raw-old');
  ac('AC-20a 入库保留原始时间', String(e.created_at) === '2020-05-01 10:00:00', String(e.created_at));

  // ── AC-18 DB 级拒 future→past ──
  put('f1', 'future');
  put('p1', 'past');
  put('p2', 'past');

  const triggers = rows(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='links'").map(r => r.name);
  ac('AC-18a 库层闸已建（触发器）', triggers.length >= 1, JSON.stringify(triggers));

  let insErr = null;
  try { db.run("INSERT INTO links (source_id, target_id, relation) VALUES ('f1','p1','related')"); }
  catch (err) { insErr = err.message; }
  ac('AC-18b 直写 SQL 的 future→past 被拒', !!insErr && /future→past/.test(insErr), String(insErr));

  db.run("INSERT INTO links (source_id, target_id, relation) VALUES ('p1','p2','related')");
  let updErr = null;
  try { db.run("UPDATE links SET source_id='f1' WHERE source_id='p1' AND target_id='p2'"); }
  catch (err) { updErr = err.message; }
  const kept = rows(db, "SELECT * FROM links WHERE target_id='p2' AND invalid_at IS NULL");
  ac('AC-18c UPDATE 改方向同样被拒', !!updErr && /future→past/.test(updErr) && kept.length === 1 && kept[0].source_id === 'p1',
    JSON.stringify({ updErr, kept }));

  let okErr = null;
  try { db.run("INSERT INTO links (source_id, target_id, relation) VALUES ('p1','f1','derived')"); }
  catch (err) { okErr = err.message; }
  ac('AC-18d past→future 正常放行', !okErr, String(okErr));

  // ── AC-20b/c 迁移：无原始时间不准进 past；迁完逐行复核 ──
  const SQL = await require('sql.js')();
  const legacy = new SQL.Database();
  legacy.run('CREATE TABLE entities (id TEXT PRIMARY KEY, name TEXT, type TEXT, content TEXT, tags TEXT, status TEXT, confidence REAL, created_at DATETIME)');
  legacy.run('CREATE TABLE links (source_id TEXT, target_id TEXT, relation TEXT, confidence REAL, created_at DATETIME, strength INTEGER, invalid_at DATETIME)');
  legacy.run("INSERT INTO entities VALUES ('old-1','n1','Concept','有原始时间','[]','active',0.5,'2020-01-01 00:00:00')");
  legacy.run("INSERT INTO entities VALUES ('old-2','n2','Concept','没有原始时间','[]','active',0.5,NULL)");
  const legacyPath = path.join(yard, 'legacy.db');
  fs.writeFileSync(legacyPath, Buffer.from(legacy.export()));

  const targetPath = path.join(yard, 'target.db');
  await store.init(targetPath);
  const rep = await M.migrateFrom(store, { sourcePath: legacyPath });
  const tdb = store._getDb();
  const got = rows(tdb, 'SELECT id, strand, created_at FROM entities ORDER BY id');
  const pastMissing = Number(rows(tdb, "SELECT COUNT(*) AS n FROM entities WHERE strand='past' AND (created_at IS NULL OR created_at='')")[0].n);

  ac('AC-20b 无原始时间的行不准进 past',
    got.length === 1 && got[0].id === 'old-1' && pastMissing === 0 &&
    Array.isArray(rep.rejected) && rep.rejected.some(r => r.id === 'old-2' && r.reason === 'no-created-at'),
    JSON.stringify({ got, rejected: rep.rejected, pastMissing }));

  ac('AC-20c 迁完逐行复核', rep.pastMissingTime === 0 && !!got[0] && !!got[0].created_at,
    JSON.stringify({ pastMissingTime: rep.pastMissingTime, created_at: got[0] && got[0].created_at }));

  console.log(`\n----- 8.2 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
