'use strict';
// aing-v2 access.js —— 任务 6.7 访问事件接口（只追加事实）
// 契约见 spec/SPEC-6.7-访问事件接口.md：内容被真正消费时追加一条事件，
// prune/compress/field-promote/KESPI 四处消费同一时钟；检索与 memo 仍纯读。
// 铁律：不改 entities.last_access、无物理删除、无直连 knowledge-store。

const ACCESS_DAYS = 30;   // 晋级证据 / KESPI 的「近期」窗口
const DAY_MS = 86400000;

function parseTs(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const withZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  const t = Date.parse(withZone);
  return Number.isFinite(t) ? t : null;
}

function rowsOf(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

async function recordAccess(store, ids, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('access 需要 store 注入（SPEC-1.15 契约）');
  const list = Array.isArray(ids) ? ids : [ids];
  const source = opts.source == null || opts.source === '' ? 'unknown' : String(opts.source);
  const at = opts.at == null ? new Date().toISOString() : String(opts.at);
  const db = store._getDb();

  const exists = db.prepare('SELECT 1 AS one FROM entities WHERE id = ?');
  const insert = db.prepare('INSERT INTO access_hits (entity_id, hit_at, source) VALUES (?, ?, ?)');
  let recorded = 0;
  const skipped = [];
  for (const raw of list) {
    const id = String(raw);
    exists.bind([id]);
    const found = exists.step();
    exists.reset();
    if (!found) { skipped.push(id); continue; }
    insert.run([id, at, source]);
    recorded++;
  }
  exists.free();
  insert.free();
  if (recorded) store._persist();
  return { recorded, skipped };
}

function latestHitMap(db) {
  const map = new Map();
  for (const r of rowsOf(db, 'SELECT entity_id, MAX(hit_at) AS hit_at FROM access_hits GROUP BY entity_id')) {
    map.set(String(r.entity_id), r.hit_at == null ? null : String(r.hit_at));
  }
  return map;
}

function lastActivityDays(db, entityId, now = Date.now()) {
  const row = rowsOf(db, 'SELECT last_access FROM entities WHERE id = ?', [String(entityId)])[0];
  const hit = rowsOf(db, 'SELECT MAX(hit_at) AS at FROM access_hits WHERE entity_id = ?', [String(entityId)])[0];
  const times = [];
  const la = row ? parseTs(row.last_access) : null;
  const ht = hit ? parseTs(hit.at) : null;
  if (la != null) times.push(la);
  if (ht != null) times.push(ht);
  if (!times.length) return null;
  const latest = Math.max(...times);
  return Math.floor((now - latest) / DAY_MS);
}

function recentActivity(db, entityId, days = ACCESS_DAYS, now = Date.now()) {
  const d = lastActivityDays(db, entityId, now);
  return d != null && d <= days;
}

module.exports = { ACCESS_DAYS, recordAccess, latestHitMap, lastActivityDays, recentActivity, parseTs };
