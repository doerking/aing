'use strict';
// aing-v2 prune.js —— M1 任务 1.13 实现（SPEC-1.13 逻辑退役；修订 A 按 SPEC-6.11 换判据）
// 铁律：退役 = invalid_at 打戳，可逆；本文件唔准出现物理 DELETE。
// 判据：分层（短料层才按时间退，知识层不退）＋ 到窗 ＋ 无访问 ＋ 无证据 ＋ 可还原/可重建。
// 旧「强度 ≤3」作废：实测强度只有 5/8/9，背景带无对象，候选恒为 0。

const { planRetention } = require('./retention.js');

const DEFAULT_INACTIVE_DAYS = 30;

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
  // 只读规划归 retention；本函数只取 id，不改语义
  const plan = planRetention(store, { windowDays: Number(inactiveDays) > 0 ? Number(inactiveDays) : undefined });
  return plan.candidates.map(c => c.id).slice(0, limit);
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
