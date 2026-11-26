'use strict';
// 旧库 fixture 生成器 —— A0 发布阻断修
// 目的：test-4.1-migrate 唔再依赖 repo 外嘅 aing-retired-2026-11-22/knowledge.db（陌生人 clone 拿唔到 ⇒ 红）。
// 造一个「真旧 schema」小库：
//   - links 只有 5 栏（source_id/target_id/relation/confidence/created_at），无 strength / invalid_at
//     ⇒ 走 migrate.js 嘅 links 列探测降级路径（缺列补 strength=5 / invalid_at=NULL）
//   - entities 无 strand / metabolized_at / fingerprint 等新列
//     ⇒ 走 entities 列探测（缺列补 NULL AS c）
// 纯本地生成，唔联网、唔读 repo 外文件；每次造出字节一致（同种子、无时间戳随机）。
const path = require('path');

// 旧 entities schema（刻意 omit 新列：strand/metabolized_at/fingerprint/last_access/title/invalid_*)
const OLD_ENT_COLS = 'id TEXT PRIMARY KEY, name TEXT, type TEXT, content TEXT, tags TEXT, status TEXT, '
  + 'confidence REAL, tolaria_strength INTEGER, created_at TEXT, updated_at TEXT';
// 旧 links schema（5 栏，无 strength / invalid_at）
const OLD_LINK_COLS = 'source_id TEXT, target_id TEXT, relation TEXT, confidence REAL, created_at TEXT';

/**
 * 造旧库文件（覆盖写）。
 * @param {string} filePath 目标 .db 路径
 * @param {object} [opts] { entities: n, links: m }（缺省 4 实体 / 3 边，够跑代谢首跑）
 * @returns {{path:string, entities:number, links:number}}
 */
async function makeLegacyDb(filePath, opts = {}) {
  const nEnt = Number.isInteger(opts.entities) && opts.entities > 0 ? opts.entities : 4;
  const nLink = Number.isInteger(opts.links) && opts.links >= 0 ? opts.links : 3;
  const SQL = await require('sql.js')();
  const db = new SQL.Database();
  db.run(`CREATE TABLE entities (${OLD_ENT_COLS})`);
  db.run(`CREATE TABLE links (${OLD_LINK_COLS})`);
  // sqlite_master 会自动有；补一个 metadata 表模拟旧库常见结构（非必需，但更像真旧库）
  db.run('CREATE TABLE entity_metadata (entity_id TEXT, key TEXT, value TEXT)');

  // 实体：id 取 e1..eN，created_at 必填（migrate AC-20：past 档要有原始时间）
  // 刻意留一个 type=NULL（对应 view 面 type-null 场景，虽然 migrate 唔管 type）
  for (let i = 1; i <= nEnt; i++) {
    const id = 'legacy-e' + i;
    const type = i === 1 ? null : 'Concept';
    const content = '旧库实体 ' + i + ' 正文';
    const tags = i % 2 === 0 ? '["legacy-tag"]' : null;
    db.run(
      'INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) '
      + 'VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, '旧' + i, type, content, tags, 'active', i % 3 === 0 ? null : 0.5, 5,
        '2024-01-0' + ((i % 9) + 1) + ' 00:00:00', '2024-01-0' + ((i % 9) + 1) + ' 00:00:00']
    );
  }
  // 边：链式 e1->e2->e3...（5 栏，无 strength/invalid_at）
  for (let i = 1; i <= nLink && i < nEnt; i++) {
    db.run(
      'INSERT INTO links (source_id,target_id,relation,confidence,created_at) VALUES (?,?,?,?,?)',
      ['legacy-e' + i, 'legacy-e' + (i + 1), 'related', 0.8, '2024-01-05 00:00:00']
    );
  }

  const bytes = Buffer.from(db.export());
  const fs = require('fs');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return { path: filePath, entities: nEnt, links: Math.min(nLink, Math.max(0, nEnt - 1)) };
}

module.exports = { makeLegacyDb, OLD_ENT_COLS, OLD_LINK_COLS };

if (require.main === module) {
  // 直接跑：node test/fixtures/make-legacy-db.js [outPath]
  const out = process.argv[2] || path.join(__dirname, 'legacy-2024.db');
  makeLegacyDb(out).then(r => console.log('造旧库: ' + r.path + ' 实体=' + r.entities + ' 边=' + r.links))
    .catch(e => { console.error('ERR ' + e.message); process.exit(1); });
}
