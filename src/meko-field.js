'use strict';
// aing-v2 meko-field.js —— M2 任务 2.12 实现（SPEC-2.12 场域维护动作）
// 四类维护：rebond 补键 / unwind 断噪 / reconcile 双链对返 / demote 降级。
// 带界（I1）：只在 6/5/4 段动手；demote 是显式跨步（7→6、6→4）。
// 全可逆（I3）：每动作留前像后像入 field_actions，revertFieldAction 原样撤回。
// 铁律：唔碰 last_access；无物理删；账本只增。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');
const IN_FIELD_BAND = [4, 5, 6];
const REL_BOND = 'hydrogen-bond';

function _now() { return new Date().toISOString(); }
function _id(prefix) { return prefix + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'); }
function _base(id) { return id.startsWith('raw-') ? id.slice(4) : id; }

function _entities(db) {
  const out = new Map();
  const s = db.prepare('SELECT * FROM entities');
  while (s.step()) { const r = s.getAsObject(); out.set(r.id, r); }
  s.free();
  return out;
}

function _activeLinks(db) {
  const out = [];
  const s = db.prepare('SELECT * FROM links WHERE invalid_at IS NULL');
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

function _inBand(e) { return !!e && IN_FIELD_BAND.includes(Number(e.tolaria_strength)); }

/** strength 映射（与 SPEC-1.4 一致） */
function _mapStrength(confidence) {
  if (confidence == null) return 5;
  const c = Number(confidence);
  if (c >= 0.8) return 8;
  if (c >= 0.6) return 7;
  if (c >= 0.4) return 5;
  if (c >= 0.3) return 3;
  return 1;
}

async function rebond(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('meko-field 需要 store 注入（SPEC-2.12 契约）');
  const db = store._getDb();
  const ents = _entities(db);
  const links = _activeLinks(db);
  const bonded = new Set(links.filter(l => l.relation === REL_BOND).map(l => l.source_id + '\u0000' + l.target_id));
  const stats = { scanned: 0, bonded: 0, skippedOutOfBand: 0 };

  const insert = db.prepare(
    `INSERT INTO links (source_id, target_id, relation, confidence, strength, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  const revive = db.prepare(
    `UPDATE links SET invalid_at = NULL, invalid_reason = NULL WHERE source_id = ? AND target_id = ?`
  );

  let dirty = false;
  for (const [id, e] of ents) {
    if (!id.startsWith('raw-')) continue;
    if (e.invalid_at) continue;
    if (opts.entityId && id !== opts.entityId) continue;
    stats.scanned++;
    if (!_inBand(e)) { stats.skippedOutOfBand++; continue; }
    const wiki = ents.get('wiki-' + _base(id));
    if (!wiki || wiki.invalid_at) continue;
    if (bonded.has(id + '\u0000' + wiki.id)) continue;
    const strength = _mapStrength(e.confidence);
    try {
      insert.run([id, wiki.id, REL_BOND, e.confidence == null ? null : e.confidence, strength]);
    } catch (_) {
      // PK 已存在（曾断过）→ 复键
      revive.run([id, wiki.id]);
    }
    _record(db, { action: 'rebond', target: id + '->' + wiki.id, before: null, after: { relation: REL_BOND, strength }, cycleId: opts.cycleId });
    bonded.add(id + '\u0000' + wiki.id);
    stats.bonded++;
    dirty = true;
  }
  insert.free(); revive.free();
  if (dirty) store._persist();
  return stats;
}

async function unwind(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('meko-field 需要 store 注入（SPEC-2.12 契约）');
  const db = store._getDb();
  const ents = _entities(db);
  const links = _activeLinks(db);
  const stats = { scanned: 0, unwound: 0 };
  const stmt = db.prepare(
    `UPDATE links SET invalid_at = CURRENT_TIMESTAMP, invalid_reason = 'unwind'
     WHERE source_id = ? AND target_id = ? AND invalid_at IS NULL`
  );
  let dirty = false;
  for (const l of links) {
    if (l.relation !== REL_BOND) continue;
    stats.scanned++;
    const a = ents.get(l.source_id);
    const b = ents.get(l.target_id);
    if (!a || !b) continue;
    if (String(a.content == null ? '' : a.content) === String(b.content == null ? '' : b.content)) continue;
    stmt.run([l.source_id, l.target_id]);
    _record(db, { action: 'unwind', target: l.source_id + '->' + l.target_id,
      before: { relation: REL_BOND, strength: l.strength }, after: { invalid_reason: 'unwind' }, cycleId: opts.cycleId });
    stats.unwound++;
    dirty = true;
  }
  stmt.free();
  if (dirty) store._persist();
  return stats;
}

async function reconcile(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('meko-field 需要 store 注入（SPEC-2.12 契约）');
  const db = store._getDb();
  const ents = _entities(db);
  const stats = { gaps: 0, reconciled: 0, skippedOutOfBand: 0 };
  const insert = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  let dirty = false;

  const pairs = [];
  for (const [id, e] of ents) {
    if (e.invalid_at) continue;
    // SPEC-7.1 §0.2：产物不产生产物——future 档不建镜像、不算缺口
    if (e.strand === 'future') continue;
    if (id.startsWith('raw-')) {
      const twin = 'wiki-' + _base(id);
      if (!ents.has(twin)) pairs.push({ from: e, to: twin });
    } else if (id.startsWith('wiki-')) {
      const twin = 'raw-' + id.slice(5);
      if (!ents.has(twin)) pairs.push({ from: e, to: twin });
    } else {
      // 无前缀视为 raw 链（SPEC-1.4 兼容）
      const twin = 'wiki-' + _base(id);
      if (!ents.has(twin)) pairs.push({ from: e, to: twin });
    }
  }

  for (const p of pairs) {
    stats.gaps++;
    if (opts.entityId && p.from.id !== opts.entityId) continue;
    if (!_inBand(p.from)) { stats.skippedOutOfBand++; continue; }
    insert.run([p.to, p.from.name || null, p.from.type || null, p.from.content || null, p.from.tags || null,
      p.from.status || null, p.from.confidence == null ? null : p.from.confidence,
      p.from.tolaria_strength == null ? null : p.from.tolaria_strength,
      // SPEC-7.1 AC-1：产物带 title——镜像继承源题头，缺了回落 name，不裸露 slug
      (p.from.title != null && String(p.from.title).trim() !== '') ? String(p.from.title) : (p.from.name || null)]);
    _record(db, { action: 'reconcile', target: p.to, before: null,
      after: { id: p.to, from: p.from.id, content: p.from.content }, cycleId: opts.cycleId });
    stats.reconciled++;
    dirty = true;
  }
  insert.free();
  if (dirty) store._persist();
  return stats;
}

async function demote(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('meko-field 需要 store 注入（SPEC-2.12 契约）');
  const db = store._getDb();
  const ents = _entities(db);
  const links = _activeLinks(db);
  const deg = new Map();
  for (const l of links) {
    deg.set(l.source_id, (deg.get(l.source_id) || 0) + 1);
    deg.set(l.target_id, (deg.get(l.target_id) || 0) + 1);
  }
  const stats = { demoted: [], refused: [] };
  const stmt = db.prepare('UPDATE entities SET tolaria_strength = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  let dirty = false;

  const targets = opts.entityId ? [opts.entityId] : [...ents.keys()];
  for (const id of targets) {
    const e = ents.get(id);
    if (!e) { stats.refused.push({ id, reason: 'not-found' }); continue; }
    const s = Number(e.tolaria_strength);
    if (s !== 7 && s !== 6) { stats.refused.push({ id, reason: 'out-of-step' }); continue; }
    if ((deg.get(id) || 0) > 0) { stats.refused.push({ id, reason: 'has-evidence' }); continue; }
    const to = s === 7 ? 6 : 4;
    stmt.run([to, id]);
    _record(db, { action: 'demote', target: id, before: { strength: s }, after: { strength: to }, cycleId: opts.cycleId });
    stats.demoted.push({ id, from: s, to });
    dirty = true;
  }
  stmt.free();
  if (dirty) store._persist();
  return stats;
}

async function revertFieldAction(store, id) {
  if (!store || typeof store._getDb !== 'function') throw new Error('meko-field 需要 store 注入（SPEC-2.12 契约）');
  const db = store._getDb();
  const get = db.prepare('SELECT * FROM field_actions WHERE id = ?');
  get.bind([id]);
  const row = get.step() ? get.getAsObject() : null;
  get.free();
  if (!row) return { error: 'not-found' };
  if (row.reversed_at) return { alreadyReversed: true };

  const mark = db.prepare('UPDATE field_actions SET reversed_at = CURRENT_TIMESTAMP WHERE id = ?');
  try {
    if (row.action === 'rebond') {
      const [src, dst] = String(row.target).split('->');
      const u = db.prepare(`UPDATE links SET invalid_at = CURRENT_TIMESTAMP, invalid_reason = 'revert' WHERE source_id = ? AND target_id = ?`);
      u.run([src, dst]); u.free();
    } else if (row.action === 'unwind') {
      const [src, dst] = String(row.target).split('->');
      const u = db.prepare(`UPDATE links SET invalid_at = NULL, invalid_reason = NULL WHERE source_id = ? AND target_id = ?`);
      u.run([src, dst]); u.free();
    } else if (row.action === 'reconcile') {
      const u = db.prepare(`UPDATE entities SET invalid_at = CURRENT_TIMESTAMP, invalid_reason = 'revert' WHERE id = ?`);
      u.run([row.target]); u.free();
    } else if (row.action === 'demote' || row.action === 'promote') {
      const before = JSON.parse(row.before_json || '{}');
      const u = db.prepare('UPDATE entities SET tolaria_strength = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      u.run([before.strength, row.target]); u.free();
    } else if (row.action === 'promote-edge') {
      const before = JSON.parse(row.before_json || '{}');
      const [src, dst] = String(row.target).split('->');
      const u = db.prepare('UPDATE links SET relation = ?, strength = ? WHERE source_id = ? AND target_id = ?');
      u.run([before.relation, before.strength, src, dst]); u.free();
    } else {
      return { error: 'unknown-action' };
    }
    mark.run([id]); mark.free();
    store._persist();
    return { reverted: true, action: row.action, target: row.target };
  } catch (e) {
    mark.free();
    throw e;
  }
}

// 链上维护步：补键 → 断噪 → 对返（demote 是显式跨步，唔随轮自动降级）
async function maintainStep(store, opts = {}) {
  const reb = await rebond(store, opts);
  const unw = await unwind(store, opts);
  const rec = await reconcile(store, opts);
  // SPEC-7.1 §4.2：候选边够证据就提升进发芽面（hydrogen-bond@7）。
  // 之前 promoteEdges 是孤儿函数，从未进链 —— 候选边永远卡在 strength 6，发芽面恒空。
  let promoted = 0;
  let refused = 0;
  try {
    const { promoteEdges } = require('./field-promote.js');
    const pr = await promoteEdges(store, opts);
    promoted = (pr.promoted || []).length;
    refused = (pr.refused || []).length;
  } catch (_) { /* 提升失败不阻断维护步 */ }
  return { ok: true, actions: { bonded: reb.bonded, unwound: unw.unwound, reconciled: rec.reconciled, promoted, refused },
    skippedOutOfBand: reb.skippedOutOfBand + rec.skippedOutOfBand };
}

module.exports = { IN_FIELD_BAND, REL_BOND, rebond, unwind, reconcile, demote, revertFieldAction, maintainStep };
