'use strict';
// aing-v2 field-promote.js —— M2 任务 2.13 实现（SPEC-2.13 场域提升动作）
// 提升两跨步：4→6、6→7。门槛：≥2 类独立证据（I2）+ 前过守恒闸（I5）。
// 动作入 field_actions（沿用 2.12 账），可经 revertFieldAction 撤回。
// 铁律：唔碰 last_access；无物理删；账本只增。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');
const ACCESS_DAYS = 30;
const KESPI_MIN = 0.55;

function _id(prefix) { return prefix + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'); }
function _base(id) { return id.startsWith('raw-') ? id.slice(4) : id; }

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _record(db, { action, target, before, after, cycleId }) {
  const id = _id('fa');
  const stmt = db.prepare(
    `INSERT INTO field_actions (id, action, target, before_json, after_json, cycle_id, reversible, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
  );
  stmt.run([id, action, target, JSON.stringify(before == null ? null : before), JSON.stringify(after == null ? null : after), cycleId || null]);
  stmt.free();
  return id;
}

/** 独立证据四类：degree / mirror / access / kespi */
async function evidenceFor(store, entityId) {
  if (!store || typeof store._getDb !== 'function') throw new Error('field-promote 需要 store 注入（SPEC-2.13 契约）');
  const db = store._getDb();
  const kinds = [];

  const strongNeighbors = Number(_scalar(db,
    `SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND strength >= 5 AND (source_id = ? OR target_id = ?)`,
    [entityId, entityId]).n || 0);
  if (strongNeighbors >= 2) kinds.push('degree');

  const e = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [entityId]);
  if (e && e.id) {
    const twinId = String(entityId).startsWith('wiki-') ? 'raw-' + entityId.slice(5) : 'wiki-' + _base(entityId);
    const twin = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [twinId]);
    if (twin && twin.id && !twin.invalid_at &&
      String(twin.content == null ? '' : twin.content) === String(e.content == null ? '' : e.content)) {
      kinds.push('mirror');
    }
    if (e.last_access) {
      const fresh = _scalar(db, `SELECT (julianday('now') - julianday(?)) * 86400 AS age`, [String(e.last_access)]);
      if (fresh && Number(fresh.age) >= 0 && Number(fresh.age) <= ACCESS_DAYS * 86400) kinds.push('access');
    }
  }

  const k = _scalar(db, 'SELECT overall FROM kespi_scores WHERE entity_id = ?', [entityId]);
  if (k && k.overall != null && Number(k.overall) >= KESPI_MIN) kinds.push('kespi');

  return { kinds, count: kinds.length };
}

function _conservation(db, store) {
  try { return require('./conservation.js').measureConservation(store, {}); }
  catch (_) { return { verdict: 'balanced' }; }
}

async function promoteEntity(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('field-promote 需要 store 注入（SPEC-2.13 契约）');
  const db = store._getDb();
  const id = opts.entityId;
  const e = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [id]);
  if (!e || !e.id) return { refused: { id, reason: 'not-found' } };
  const from = Number(e.tolaria_strength);
  if (from !== 4 && from !== 6) return { refused: { id, reason: 'out-of-step' } };

  const ev = await evidenceFor(store, id);
  if (ev.kinds.length < 2) return { refused: { id, reason: 'insufficient-evidence', evidence: ev } };

  const targetStrength = from === 4 ? 6 : 7;
  // 闸东真接（I8）：promote 必过三闸并留痕，唔过即拒
  const gate = await require('./omni-gate.js').runGates(store, {
    subject: id, kind: 'promote', evidence: ev.kinds,
    baseline: opts.baseline || null, targetStrength, cycleId: opts.cycleId
  });
  if (!gate.passed) return { refused: { id, reason: 'gate-rejected', failed: gate.failed, evidence: ev } };

  const m = _conservation(db, store);
  if (m.verdict === 'growth-only') return { refused: { id, reason: 'conservation-band', evidence: ev } };

  const to = targetStrength;
  const stmt = db.prepare('UPDATE entities SET tolaria_strength = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run([to, id]);
  stmt.free();
  _record(db, { action: 'promote', target: id, before: { strength: from, evidence: ev.kinds }, after: { strength: to }, cycleId: opts.cycleId });
  store._persist();
  return { promoted: { id, from, to, evidence: ev.kinds } };
}

const CANDIDATE_RELATIONS = ['sprout-candidate', 'pollinate-candidate'];

async function promoteEdges(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('field-promote 需要 store 注入（SPEC-2.13 契约）');
  const db = store._getDb();
  const stats = { promoted: [], refused: [] };

  const m = _conservation(db, store);
  const cands = _rows(db,
    `SELECT * FROM links WHERE invalid_at IS NULL AND relation IN (?, ?)`,
    CANDIDATE_RELATIONS);

  if (m.verdict === 'growth-only') {
    return { promoted: [], refused: cands.map(c => ({ src: c.source_id, dst: c.target_id, reason: 'conservation-band' })) };
  }

  const upd = db.prepare('UPDATE links SET relation = ?, strength = ? WHERE source_id = ? AND target_id = ?');
  for (const c of cands) {
    let kinds = [];
    try { kinds = JSON.parse(c.evidence || '[]'); } catch (_) { kinds = []; }
    if (!Array.isArray(kinds)) kinds = [];
    const distinct = [...new Set(kinds.map(String))];
    if (distinct.length < 2) { stats.refused.push({ src: c.source_id, dst: c.target_id, reason: 'insufficient-evidence' }); continue; }
    const beforeStrength = Number(c.strength == null ? 4 : c.strength);
    upd.run(['gen', 6, c.source_id, c.target_id]);
    _record(db, { action: 'promote-edge', target: c.source_id + '->' + c.target_id,
      before: { relation: c.relation, strength: beforeStrength, evidence: distinct },
      after: { relation: 'gen', strength: 6 }, cycleId: opts.cycleId });
    stats.promoted.push({ src: c.source_id, dst: c.target_id, evidence: distinct });
  }
  upd.free();
  if (stats.promoted.length) store._persist();
  return stats;
}

module.exports = { evidenceFor, promoteEntity, promoteEdges, CANDIDATE_RELATIONS, ACCESS_DAYS, KESPI_MIN };
