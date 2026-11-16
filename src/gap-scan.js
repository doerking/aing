'use strict';
// aing-v2 gap-scan.js —— 任务 6.5 缺口扫描（只读镜头）
// 契约见 spec/SPEC-6.5-成长观察四件.md §2.1：五维缺口只出数与 id，零写。
// 铁律：不修边、不改实体、不碰 last_access；store 注入，不直连 knowledge-store。

const GAP_MIN_LEN = 50;      // 稀薄阈值（字符数）
const STAGNANT_DAYS = 90;    // 停滞阈值（天）
const IDS_MAX = 50;          // 每维最多返回 id 数
const DAY_MS = 86400000;

const DIMENSIONS = ['orphan', 'thin', 'stagnant', 'unindexed', 'empty'];

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

function gapScan(store) {
  if (!store || typeof store._getDb !== 'function') throw new Error('gap-scan 需要 store 注入（SPEC-1.15 契约）');
  const backend = require('./vector.js').resolveBackend();
  const db = store._getDb();

  const entities = rowsOf(db,
    `SELECT id, name, content, updated_at FROM entities
     WHERE status = 'active' AND invalid_at IS NULL`);

  const linked = new Set();
  for (const e of rowsOf(db, `SELECT source_id, target_id FROM links WHERE invalid_at IS NULL`)) {
    if (e.source_id) linked.add(String(e.source_id));
    if (e.target_id) linked.add(String(e.target_id));
  }

  const indexed = new Set();
  for (const v of rowsOf(db,
    `SELECT entity_id FROM entity_vectors WHERE model = ? AND dim = ?`, [backend.model, backend.dim])) {
    indexed.add(String(v.entity_id));
  }

  const cutoff = Date.now() - STAGNANT_DAYS * DAY_MS;
  const ids = {}; const counts = {};
  for (const d of DIMENSIONS) { ids[d] = []; counts[d] = 0; }

  for (const e of entities) {
    const id = String(e.id);
    const content = e.content == null ? '' : String(e.content);
    const ts = parseTs(e.updated_at);
    const hit = {
      orphan: !linked.has(id),
      thin: content.length < GAP_MIN_LEN,
      stagnant: ts != null && ts <= cutoff,
      unindexed: !indexed.has(id),
      empty: content.trim().length === 0
    };
    for (const d of DIMENSIONS) {
      if (!hit[d]) continue;
      counts[d]++;
      if (ids[d].length < IDS_MAX) ids[d].push(id);
    }
  }

  const total = DIMENSIONS.reduce((n, d) => n + counts[d], 0);
  return { counts, ids, total };
}

module.exports = { DIMENSIONS, GAP_MIN_LEN, STAGNANT_DAYS, gapScan, parseTs };
