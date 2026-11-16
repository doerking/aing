'use strict';
// aing-v2 capability-dispatch.js —— 任务 6.9 原版脚手架移植之三（能力叙事派单）
// 契约见 spec/SPEC-6.9-原版脚手架三件移植-能力入原生表.md §2.3：
// 有原文、却没进 distill_points 的能力叙事 → 开 dim='cap' 工单；消费后由 6.8 复核口验证。
// 铁律：只开单不吞内容、不改实体；store 注入，不直连 knowledge-store。

const crypto = require('crypto');
const { extractRawMessages } = require('./distill-points.js');
const { SECTIONS } = require('./capability-narrative.js');

const DEFAULTS = { maxTickets: 10 };
const OPEN_STATES = ['open', 'proposed'];

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

function _requireStore(store, who) {
  if (!store || typeof store._getDb !== 'function') throw new Error(who + ' 需要 store 注入（SPEC-1.15 契约）');
}

function _id(prefix) { return prefix + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'); }

function _textOf(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  try { return JSON.stringify(content); } catch (_) { return String(content); }
}

/** 命中了哪几段能力叙事（只作证据，不参与判定）。 */
function sectionsOf(content) {
  const body = _textOf(content);
  return SECTIONS.filter(s => body.includes(s));
}

/** 已有蒸馏点 = 已被 6.2 消费。 */
function hasDistillPoints(db, entityId) {
  const r = _scalar(db, 'SELECT base_id FROM distill_points WHERE base_id = ?', [entityId]);
  return !!(r && r.base_id);
}

function hasOpenTicket(db, entityId) {
  const marks = OPEN_STATES.map(() => '?').join(',');
  const r = _scalar(db,
    `SELECT id FROM opt_tickets WHERE entity_id = ? AND dim = 'cap' AND status IN (${marks}) LIMIT 1`,
    [entityId, ...OPEN_STATES]);
  return !!(r && r.id);
}

/**
 * 扫能力叙事，给未消费的实体开 cap 工单。
 * @returns {{scanned:number, narratives:number, consumed:number, opened:number, skipped:number, tickets:Array}}
 */
function dispatchCapabilities(store, opts = {}) {
  _requireStore(store, 'capability-dispatch.dispatchCapabilities');
  const db = store._getDb();
  const max = Number.isInteger(opts.maxTickets) && opts.maxTickets > 0 ? opts.maxTickets : DEFAULTS.maxTickets;
  const cycleId = opts.cycleId || null;
  const persist = opts.persist !== false;

  const entities = _rows(db,
    `SELECT id, content FROM entities
     WHERE status = 'active' AND invalid_at IS NULL
     ORDER BY id`);
  const out = { scanned: entities.length, narratives: 0, consumed: 0, opened: 0, skipped: 0, tickets: [] };

  const ins = persist ? db.prepare(
    `INSERT INTO opt_tickets (id, entity_id, dim, kind, action, score, zone, status, attempts, evidence_json, cycle_id, created_at, updated_at)
     VALUES (?, ?, 'cap', 'capability-unconsumed', 'memo-card', NULL, 'yellow', 'open', 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ) : null;

  for (const e of entities) {
    const entityId = String(e.id);
    const items = extractRawMessages(e.content);
    if (!items.length) continue;
    out.narratives++;
    if (hasDistillPoints(db, entityId)) { out.consumed++; continue; }
    if (hasOpenTicket(db, entityId)) { out.skipped++; continue; }
    if (out.opened >= max) break;

    const evidence = JSON.stringify({
      source: 'capability-narrative',
      rawLines: items.length,
      sections: sectionsOf(e.content)
    });
    const id = _id('ticket');
    if (ins) ins.run([id, entityId, evidence, cycleId]);
    out.tickets.push({ id: persist ? id : null, entity_id: entityId, dim: 'cap', kind: 'capability-unconsumed', action: 'memo-card', status: 'open' });
    out.opened++;
  }

  if (ins) ins.free();
  if (persist && out.opened) store._persist();
  return out;
}

module.exports = { DEFAULTS, sectionsOf, dispatchCapabilities };
