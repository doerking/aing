'use strict';
// aing-v2 migrate.js —— M4 数据迁移（SPEC-4.0）
// 旧库冻结只读：只读字节流，唔开写句柄、唔改 mtime。
// 迁移前冷备份 → 实体/边原样搬（id/内容/强度/失效期全保）→ 计数与指纹复核。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function _sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function coldBackup(sourcePath, backupDir) {
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('source-missing: ' + sourcePath);
  fs.mkdirSync(backupDir, { recursive: true });
  const bytes = fs.readFileSync(sourcePath);
  const name = `knowledge-${new Date().toISOString().replace(/[:.]/g, '-')}-${_sha256(bytes).slice(0, 8)}.db`;
  const out = path.join(backupDir, name);
  fs.writeFileSync(out, bytes);
  return out;
}

function _rows(db, sql) {
  const stmt = db.prepare(sql);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function _count(db, table) {
  const stmt = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`);
  stmt.step();
  const n = Number(stmt.getAsObject().n || 0);
  stmt.free();
  return n;
}

function _fingerprint(rows) {
  return crypto.createHash('sha1').update(rows.map(r => r.join('|')).join('\n')).digest('hex');
}

async function migrateFrom(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('migrate 需要 store 注入（SPEC-4.0 契约）');
  const sourcePath = opts.sourcePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('source-missing: ' + sourcePath);

  const db = store._getDb();
  if (!opts.force && _count(db, 'entities') > 0) throw new Error('target-not-empty');

  const adapter = require('./db-adapter.js');
  const old = (await adapter.openBytes(fs.readFileSync(sourcePath))).raw;

  const oldCols = new Set(_rows(old, 'PRAGMA table_info(entities)').map(c => c.name));
  const entCols = ['id', 'name', 'type', 'content', 'tags', 'status', 'confidence', 'tolaria_strength',
    'last_access', 'created_at', 'updated_at', 'invalid_at', 'invalid_reason', 'title'];
  const allEntities = _rows(old, `SELECT ${entCols.map(c => oldCols.has(c) ? c : 'NULL AS ' + c).join(', ')} FROM entities ORDER BY id`);
  // AC-20：past 必须有原始时间——没有原始时间的旧行不准进 past（收进报告，不静默丢）
  const rejected = allEntities
    .filter((e) => e.created_at == null || String(e.created_at).trim() === '')
    .map((e) => ({ id: String(e.id), reason: 'no-created-at' }));
  const entities = allEntities.filter((e) => e.created_at != null && String(e.created_at).trim() !== '');
  const allLinks = _rows(old, `SELECT source_id, target_id, relation, confidence, created_at, strength, invalid_at
    FROM links ORDER BY source_id, target_id`);

  const ids = new Set(entities.map(e => e.id));
  const links = allLinks.filter(l => ids.has(l.source_id) && ids.has(l.target_id));
  const dropped = allLinks.filter(l => !ids.has(l.source_id) || !ids.has(l.target_id));

  // AC-1：旧库 name 是题头 → 迁入 title（展示面，永不入键）；旧 title 优先，缺了才用旧 name 兜底
  const titleOfRow = (e) => {
    const t = e.title == null ? '' : String(e.title).trim();
    if (t) return t;
    const n = e.name == null ? '' : String(e.name).trim();
    return n || null;
  };

  db.run('BEGIN TRANSACTION');
  try {
    const ent = db.prepare(`INSERT INTO entities
      (id, name, type, content, tags, status, confidence, tolaria_strength, last_access, created_at, updated_at, invalid_at, invalid_reason, title)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const e of entities) {
      ent.run([e.id, e.name, e.type, e.content, e.tags, e.status,
        e.confidence == null ? null : Number(e.confidence),
        e.tolaria_strength == null ? 5 : Number(e.tolaria_strength),
        e.last_access, e.created_at, e.updated_at, e.invalid_at, e.invalid_reason == null ? null : e.invalid_reason,
        titleOfRow(e)]);
    }
    ent.free();

    const lnk = db.prepare(`INSERT INTO links (source_id, target_id, relation, confidence, created_at, strength, invalid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const l of links) {
      lnk.run([l.source_id, l.target_id, l.relation,
        l.confidence == null ? null : Number(l.confidence), l.created_at,
        l.strength == null ? 5 : Number(l.strength), l.invalid_at]);
    }
    lnk.free();
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  store._persist();

  // 复核：计数 + 指纹（排序后逐行拼）
  const newEnt = _rows(db, 'SELECT id, content FROM entities ORDER BY id').map(r => [r.id, r.content]);
  const oldEnt = entities.map(e => [e.id, e.content]);
  const newLnk = _rows(db, 'SELECT source_id, target_id, strength, invalid_at FROM links ORDER BY source_id, target_id')
    .map(r => [r.source_id, r.target_id, r.strength, r.invalid_at]);
  const oldLnk = links.map(l => [l.source_id, l.target_id, l.strength, l.invalid_at]);

  const verified = {
    entities: newEnt.length === oldEnt.length && _fingerprint(newEnt) === _fingerprint(oldEnt),
    links: newLnk.length === oldLnk.length && _fingerprint(newLnk) === _fingerprint(oldLnk)
  };
  if (!verified.entities || !verified.links) throw new Error('migration-mismatch: ' + JSON.stringify(verified));

  // AC-20：迁完逐行复核——past 档不许有缺原始时间的行
  const pastMissingTime = Number(_rows(db,
    "SELECT COUNT(*) AS n FROM entities WHERE strand = 'past' AND (created_at IS NULL OR created_at = '')")[0].n || 0);
  if (pastMissingTime > 0) throw new Error('past-needs-original-time: ' + pastMissingTime + ' 行缺 created_at');

  return {
    source: { path: sourcePath, sha256: _sha256(fs.readFileSync(sourcePath)) },
    entities: newEnt.length,
    links: newLnk.length,
    droppedLinks: dropped.length,
    droppedSamples: dropped.slice(0, 5),
    rejected,
    pastMissingTime,
    verified
  };
}

module.exports = { coldBackup, migrateFrom };
