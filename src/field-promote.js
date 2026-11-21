'use strict';
// aing-v2 field-promote.js —— M2 任务 2.13 实现（SPEC-2.13 场域提升动作）
// 提升两跨步：4→6、6→7。门槛：≥2 类独立证据（I2）+ 前过守恒闸（I5）。
// 动作入 field_actions（沿用 2.12 账），可经 revertFieldAction 撤回。
// 铁律：唔碰 last_access；无物理删；账本只增。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');
const { getKnob, DEFAULTS } = require('./config-runtime.js');
const ACCESS_DAYS = 30;
// KESPI 提升门槛单源喺 config-runtime（SPEC-3.4 扩展）；呢度只留静态缺省供导出与文档引用
const KESPI_MIN = DEFAULTS.kespi.promoteMin;

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
  // SPEC-1.14 修订 J：确定性幂等键——同轮同动作同目标只能留一行，重跑不重复记账
  const id = _actionId(cycleId, action, target);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO field_actions (id, action, target, before_json, after_json, cycle_id, reversible, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
  );
  stmt.run([id, action, target, JSON.stringify(before == null ? null : before), JSON.stringify(after == null ? null : after), cycleId || null]);
  stmt.free();
  return id;
}

/** 动作账确定性键：`fa-<cycleId>-<action>-<target 摘要>`；缺 cycleId 时退化为时间键（无法幂等，但不与新键撞）。 */
function _actionId(cycleId, action, target) {
  if (!cycleId) return _id('fa');
  const h = require('crypto').createHash('sha1')
    .update(String(cycleId) + '\u0000' + String(action) + '\u0000' + String(target == null ? '' : target), 'utf8')
    .digest('hex').slice(0, 12);
  return `fa-${cycleId}-${action}-${h}`;
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
    if (!kinds.includes('access')) {
      const hit = _scalar(db, 'SELECT MAX(hit_at) AS at FROM access_hits WHERE entity_id = ?', [entityId]);
      if (hit && hit.at) {
        const freshHit = _scalar(db, `SELECT (julianday('now') - julianday(?)) * 86400 AS age`, [String(hit.at)]);
        if (freshHit && Number(freshHit.age) >= 0 && Number(freshHit.age) <= ACCESS_DAYS * 86400) kinds.push('access');
      }
    }
  }

  const k = _scalar(db, 'SELECT overall FROM kespi_scores WHERE entity_id = ?', [entityId]);
  const min = getKnob(store, 'kespi.promoteMin');
  if (k && k.overall != null && Number(k.overall) >= min) kinds.push('kespi');

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
  // 闸读口径必须用 gate.verdict（边层单一量纲）；旧 m.verdict 是「边产/实体退」混口径，
  // 实体退场为 0 时恒判 growth-only —— 之前提升边全被这条假读数挡住。
  const verdict = (m && m.gate && m.gate.verdict) || (m && m.verdict);
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
  // 闸读口径必须用 gate.verdict（边层单一量纲）；旧 m.verdict 是「边产/实体退」混口径，
  // 实体退场为 0 时恒判 growth-only —— 之前提升边全被这条假读数挡住。
  const verdict = (m && m.gate && m.gate.verdict) || (m && m.verdict);
  const cands = _rows(db,
    `SELECT * FROM links WHERE invalid_at IS NULL AND relation IN (?, ?)`,
    CANDIDATE_RELATIONS);

  if (verdict === 'growth-only') {
    return { promoted: [], refused: cands.map(c => ({ src: c.source_id, dst: c.target_id, reason: 'conservation-band' })) };
  }

  const upd = db.prepare('UPDATE links SET relation = ?, strength = ? WHERE source_id = ? AND target_id = ?');
  for (const c of cands) {
    // 证据两种形状：老的是字符串数组，sprout/pollinate 写的是 [{kind,detail}]
    let kinds = [];
    try { kinds = JSON.parse(c.evidence || '[]'); } catch (_) { kinds = []; }
    if (!Array.isArray(kinds)) kinds = [];
    const distinct = [...new Set(kinds
      .map((x) => (x && typeof x === 'object' ? String(x.kind || '') : String(x)))
      .filter(Boolean))];
    if (distinct.length < 2) { stats.refused.push({ src: c.source_id, dst: c.target_id, reason: 'insufficient-evidence' }); continue; }
    const beforeStrength = Number(c.strength == null ? 4 : c.strength);
    // SPEC-7.1 §4.2：提升后必须仍落在发芽面内（三类候选关系 且 strength≥7），
    // 旧口径升成 'gen'@6 —— 既不在白名单也不够强，等于把候选边踢出发芽面。
    upd.run(['hydrogen-bond', 7, c.source_id, c.target_id]);
    _record(db, { action: 'promote-edge', target: c.source_id + '->' + c.target_id,
      before: { relation: c.relation, strength: beforeStrength, evidence: distinct },
      after: { relation: 'hydrogen-bond', strength: 7 }, cycleId: opts.cycleId });
    stats.promoted.push({ src: c.source_id, dst: c.target_id, evidence: distinct });
  }
  upd.free();
  if (stats.promoted.length) store._persist();
  return stats;
}

module.exports = { evidenceFor, promoteEntity, promoteEdges, CANDIDATE_RELATIONS, ACCESS_DAYS, KESPI_MIN };
