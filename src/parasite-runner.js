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

module.exports = { runP1Once };
