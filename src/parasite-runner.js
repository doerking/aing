'use strict';
// aing-v2 parasite-runner.js —— M6 任务 6.45 实现（SPEC-6.45 P1 自动领单循环）
// 一轮时间线：评分 → 领单（只认 P1/full）→ 交外部件回单 → 系统写回 → 重算 → 验收。
// 外部承接方仍是 tools/parasite-round.js 的 P1 件（只读单与原料、交回单）；
// 本件只做编排，不替外部件判断，也不直接改库（写回走 applyReturnNarrative）。
const K = require('./kespi.js');
const S = require('./self-optimize.js');
const P = require('./parasite-slot.js');

function _part() { return require('../tools/parasite-round.js'); }

/**
 * 跑一轮 P1 自动领单。
 * @param {object} store 沙盘/副本 store（注入）
 * @param {{round?:number, max?:number, score?:boolean, verify?:boolean}} opts
 * @returns {Promise<{round:number, scored:boolean, claimed:Array, rewritten:Array, verify:object|null}>}
 */
async function runP1Once(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('runP1Once 需要 store 注入');
  const round = (Number.isFinite(Number(opts.round)) ? Number(opts.round) : K.resolveRound(store, opts).round);
  const max = Number.isFinite(Number(opts.max)) ? Math.max(1, Math.floor(Number(opts.max))) : 50;
  const scored = opts.score !== false;

  if (scored) await K.kespiStep(store, { round });

  const part = _part();
  const reg = part.NARRATIVE_REG;
  const db = store._getDb();
  const list = P.claimable(store, reg, { limit: max });
  const claimed = [];
  const rewritten = [];
  for (const t of list) {
    claimed.push({ id: t.id, entity_id: t.entity_id, slot: (t.demand && t.demand.slot) || null });
    try {
      const ret = part.externalPartNarrative(db, t, { round });
      if (!ret) { rewritten.push({ id: t.id, entity_id: t.entity_id, error: 'no-return' }); continue; }
      part.applyReturnNarrative(store, t, ret);
      rewritten.push({ id: t.id, entity_id: t.entity_id, ok: true });
    } catch (e) {
      rewritten.push({ id: t.id, entity_id: t.entity_id, error: e.message });
    }
  }

  let verify = null;
  if (opts.verify !== false) {
    // 写回后重算再验收（读数与验收同源）
    if (rewritten.some(r => r.ok) && scored) await K.kespiStep(store, { round });
    verify = S.verifyTickets(store, { round });
  }
  return { round, scored, claimed, rewritten, verify };
}

/**
 * SPEC-6.61：跑一轮 P3 自动领单（关联建边）。
 * 与 runP1Once 同形：领单（只认 P3/full）→ 交外部件回单 → 系统写回（applyProposalResult）
 * → 提升候选边 → 重算 → 验收。
 * 外部承接方仍是 tools/parasite-round.js 的 P3 件（只读单与库、交回单）；
 * 本件只做编排，不替外部件判断，也不直接写库。
 * P7（回单校验）不可外包：验收系主权动作，本件唔接。
 * @param {object} store
 * @param {{round?:number, max?:number, score?:boolean, verify?:boolean}} opts
 * @returns {Promise<{round:number, claimed:Array, returned:Array, promoted:object, verify:object|null}>}
 */
async function runP3Once(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('runP3Once 需要 store 注入');
  const round = (Number.isFinite(Number(opts.round)) ? Number(opts.round) : K.resolveRound(store, opts).round);
  const max = Number.isFinite(Number(opts.max)) ? Math.max(1, Math.floor(Number(opts.max))) : 50;
  const scored = opts.score !== false;

  if (scored) await K.kespiStep(store, { round });

  const part = _part();
  const db = store._getDb();
  const list = P.claimable(store, part.EDGES_REG, { limit: max });
  const claimed = [];
  const returned = [];
  for (const t of list) {
    claimed.push({ id: t.id, entity_id: t.entity_id, slot: (t.demand && t.demand.slot) || null });
    try {
      const ret = part.externalPartEdges(db, t);
      if (!ret) { returned.push({ id: t.id, entity_id: t.entity_id, error: 'no-return' }); continue; }
      const r = require('./proposal-result.js').applyProposalResult(store, t.id, { result: ret.result, membrane: 'semi' });
      returned.push(r.ok
        ? { id: t.id, entity_id: t.entity_id, ok: true, applied: r.applied }
        : { id: t.id, entity_id: t.entity_id, error: r.reason });
    } catch (e) {
      returned.push({ id: t.id, entity_id: t.entity_id, error: e.message });
    }
  }

  const promoted = { promoted: [], refused: [] };
  if (returned.some(r => r.ok)) {
    const p = await require('./field-promote.js').promoteEdges(store, { round });
    promoted.promoted = (p && Array.isArray(p.promoted)) ? p.promoted : [];
    promoted.refused = (p && Array.isArray(p.refused)) ? p.refused : [];
    if (scored) await K.kespiStep(store, { round });
  }

  let verify = null;
  if (opts.verify !== false && returned.some(r => r.ok)) verify = S.verifyTickets(store, { round });
  return { round, claimed, returned, promoted, verify };
}

module.exports = { runP1Once, runP3Once };
