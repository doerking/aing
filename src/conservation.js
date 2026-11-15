'use strict';
// aing-v2 conservation.js —— M2 任务 2.10 实现（SPEC-2.10 守恒闸）
// 守恒 = 发芽产出 / 退场数量。每轮必算、必落盘；带外只报警，唔擅改（I10 输出面只出读数/评分/建议）。
// 本件纯读：唔写 entities/links，唔碰 last_access，无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const GROWTH_RELATIONS = ['sprout-candidate', 'pollinate-candidate'];
const BAND_LOW = 0.8;
const BAND_HIGH = 1.5;

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const row = s.getAsObject();
  s.free();
  return row;
}

function measureConservation(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('conservation 需要 store 注入（SPEC-2.10 契约）');
  const sinceDays = Number.isInteger(opts.sinceDays) && opts.sinceDays > 0 ? opts.sinceDays : 30;
  const db = store._getDb();
  const since = _scalar(db, `SELECT datetime('now', ?) AS s`, ['-' + sinceDays + ' days']).s;

  const growth = Number(_scalar(db,
    `SELECT COUNT(*) AS n FROM links
     WHERE relation IN (?, ?) AND created_at >= ?`,
    [...GROWTH_RELATIONS, since]).n || 0);

  const pruned = Number(_scalar(db,
    `SELECT COUNT(*) AS n FROM entities WHERE invalid_at IS NOT NULL AND invalid_at >= ?`,
    [since]).n || 0);

  const idle = growth === 0 && pruned === 0;
  const ratio = pruned > 0 ? growth / pruned : (growth > 0 ? Infinity : 1);
  const inBand = ratio >= BAND_LOW && ratio <= BAND_HIGH;
  let verdict;
  if (idle) verdict = 'balanced';
  else if (ratio > BAND_HIGH) verdict = 'growth-only';
  else if (ratio < BAND_LOW) verdict = 'prune-only';
  else verdict = 'balanced';

  return { growth, pruned, ratio, inBand, verdict, idle, since, band: [BAND_LOW, BAND_HIGH] };
}

async function conservationStep(store, opts = {}) {
  return measureConservation(store, opts);
}

module.exports = { measureConservation, conservationStep, BAND_LOW, BAND_HIGH, GROWTH_RELATIONS };
