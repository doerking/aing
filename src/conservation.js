'use strict';
// aing-v2 conservation.js —— M2 任务 2.10 实现（SPEC-2.10 守恒闸）
// 守恒 = 发芽产出 / 退场数量。每轮必算、必落盘；带外只报警，唔擅改（I10 输出面只出读数/评分/建议）。
// 本件纯读：唔写 entities/links，唔碰 last_access，无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const GROWTH_RELATIONS = ['sprout-candidate', 'pollinate-candidate'];
const { DEFAULTS } = require('./config-runtime.js');
const BAND_LOW = DEFAULTS.conservation.band[0];
const BAND_HIGH = DEFAULTS.conservation.band[1];

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const row = s.getAsObject();
  s.free();
  return row;
}

function _judge(growth, pruned) {
  const idle = growth === 0 && pruned === 0;
  const ratio = pruned > 0 ? growth / pruned : (growth > 0 ? Infinity : 1);
  const inBand = ratio >= BAND_LOW && ratio <= BAND_HIGH;
  let verdict;
  if (idle) verdict = 'balanced';
  else if (ratio > BAND_HIGH) verdict = 'growth-only';
  else if (ratio < BAND_LOW) verdict = 'prune-only';
  else verdict = 'balanced';
  return { ratio, inBand, verdict, idle };
}

function measureConservation(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('conservation 需要 store 注入（SPEC-2.10 契约）');
  const sinceDays = Number.isInteger(opts.sinceDays) && opts.sinceDays > 0 ? opts.sinceDays : 30;
  const db = store._getDb();
  const since = _scalar(db, `SELECT datetime('now', ?) AS s`, ['-' + sinceDays + ' days']).s;

  // 边层（主读数，SPEC-2.10 修订 B）：产边与退边同量纲
  const edgeGrowth = Number(_scalar(db,
    `SELECT COUNT(*) AS n FROM links WHERE relation IN (?, ?) AND created_at >= ?`,
    [...GROWTH_RELATIONS, since]).n || 0);
  const edgePruned = Number(_scalar(db,
    `SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NOT NULL AND invalid_at >= ?`,
    [since]).n || 0);

  // 实体退场单列（不混进边层比值：单位不同，混了就是假读数）
  const entityPruned = Number(_scalar(db,
    `SELECT COUNT(*) AS n FROM entities WHERE invalid_at IS NOT NULL AND invalid_at >= ?`,
    [since]).n || 0);

  const edge = _judge(edgeGrowth, edgePruned);
  // 旧混口径保留一版（growth=边、pruned=实体），供既有消费者过渡；它不进报警面（混量纲的读数不能当判据）
  const legacy = _judge(edgeGrowth, entityPruned);

  // 实体层用「到期未退」存量报警，不用混口径比值：口径单一来源 = retention 的候选清单
  let backlog = 0;
  try { backlog = require('./retention.js').planRetention(store, {}).candidates.length; } catch (_) { backlog = 0; }

  const alerts = [];
  if (edge.verdict === 'growth-only') alerts.push('edge:growth-only');
  if (edge.verdict === 'prune-only') alerts.push('edge:prune-only');
  if (backlog > 0) alerts.push('entity:backlog');
  const gateVerdict = alerts.some((a) => a.endsWith('growth-only'))
    ? 'growth-only'
    : alerts.some((a) => a.endsWith('prune-only'))
      ? 'prune-only'
      : (alerts.includes('entity:backlog') ? 'backlog' : 'balanced');

  return {
    growth: edgeGrowth, pruned: entityPruned,
    ratio: legacy.ratio, inBand: legacy.inBand, verdict: legacy.verdict, idle: legacy.idle,
    edge: { growth: edgeGrowth, pruned: edgePruned, ratio: edge.ratio, inBand: edge.inBand, verdict: edge.verdict },
    entity: { pruned: entityPruned, backlog },
    gate: { inBand: alerts.length === 0, verdict: gateVerdict, alerts },
    since, band: [BAND_LOW, BAND_HIGH]
  };
}

async function conservationStep(store, opts = {}) {
  return measureConservation(store, opts);
}

module.exports = { measureConservation, conservationStep, BAND_LOW, BAND_HIGH, GROWTH_RELATIONS };
