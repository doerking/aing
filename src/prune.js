'use strict';
// aing-v2 prune.js —— M1 任务 1.13 实现（SPEC-1.13 逻辑退役）
// 铁律：退役 = invalid_at 打戳，可逆；本文件唔准出现物理 DELETE。
// 候选只取背景带（tolaria_strength <= 3）且久未访问（last_access 早于 inactiveDays 或 NULL）。

const DEFAULT_INACTIVE_DAYS = 90;
const MAX_STRENGTH = 3; // 背景带上限（SPEC-0.6）

function _rows(store, sql, params = []) {
  const db = store._getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function listCandidates(store, { inactiveDays = DEFAULT_INACTIVE_DAYS, limit = Infinity } = {}) {
  const rows = _rows(
    store,
    `SELECT id, tolaria_strength, last_access FROM entities
     WHERE status = 'active'
       AND invalid_at IS NULL
       AND tolaria_strength <= ?
       AND (last_access IS NULL OR (julianday('now') - julianday(last_access)) >= ?)
     ORDER BY id`,
    [MAX_STRENGTH, inactiveDays]
  );
  return rows.slice(0, limit).map(r => r.id);
}

function listRetired(store) {
  return _rows(store, `SELECT id, invalid_at FROM entities WHERE invalid_at IS NOT NULL ORDER BY id`);
}

async function retireEntity(store, id) {
  const row = store.getEntity(id);
  if (!row) return { id, retired: false, reason: 'not-found' };
  if (row.invalid_at != null) return { id, retired: false, reason: 'already-retired' };
  const db = store._getDb();
  const stmt = db.prepare('UPDATE entities SET invalid_at = CURRENT_TIMESTAMP WHERE id = ? AND invalid_at IS NULL');
  stmt.run([id]);
  stmt.free();
  store._persist();
  return { id, retired: true, at: new Date().toISOString() };
}

async function reviveEntity(store, id) {
  const row = store.getEntity(id);
  if (!row) return { id, revived: false, reason: 'not-found' };
  if (row.invalid_at == null) return { id, revived: false, reason: 'not-retired' };
  const db = store._getDb();
  const stmt = db.prepare('UPDATE entities SET invalid_at = NULL WHERE id = ?');
  stmt.run([id]);
  stmt.free();
  store._persist();
  return { id, revived: true };
}

async function pruneCycle(store, { dryRun = true, inactiveDays = DEFAULT_INACTIVE_DAYS, limit = Infinity } = {}) {
  const candidates = listCandidates(store, { inactiveDays, limit });
  if (dryRun) return { dryRun: true, candidates, retired: null };
  const retired = [];
  const skipped = [];
  for (const id of candidates) {
    const r = await retireEntity(store, id);
    if (r.retired) retired.push(id);
    else skipped.push({ id, reason: r.reason });
  }
  return { dryRun: false, candidates, retired, skipped };
}

module.exports = { pruneCycle, listCandidates, listRetired, retireEntity, reviveEntity, DEFAULT_INACTIVE_DAYS };
