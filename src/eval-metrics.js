'use strict';
// aing-v2 eval-metrics.js —— 冻结集指标口径单一真源（SPEC-5.3 / SPEC-5.4）
// 为什么单列：字面后端（tools/bench-retrieval.js）与语义后端旁路（src/semantic-rank.js）
// 必须用同一套 metricsFor / aggregate，否则两张表不可比。

/** 单题指标：ranked = 前 k 条 id（已按名次排好） */
function metricsFor(ranked, pair, k) {
  const top = ranked.slice(0, k);
  const pos = new Set((pair && pair.pos) || []);
  const neg = new Set((pair && pair.neg) || []);
  let hit = 0, negHit = 0;
  for (const id of top) {
    if (pos.has(id)) hit++;
    if (neg.has(id)) negHit++;
  }
  return {
    p10: hit / k,
    r10: pos.size ? hit / pos.size : 0,
    negHit: negHit > 0 ? 1 : 0,
    hit
  };
}

function _avg(rows, key) {
  return rows.length ? rows.reduce((s, r) => s + r[key], 0) / rows.length : 0;
}

function aggregate(rows) {
  const shape = (list) => ({
    n: list.length,
    p10: _avg(list, 'p10'),
    r10: _avg(list, 'r10'),
    negHitRate: _avg(list, 'negHit')
  });
  const byLang = {};
  const byKind = {};
  for (const r of rows) {
    (byLang[r.lang] = byLang[r.lang] || []).push(r);
    (byKind[r.kind] = byKind[r.kind] || []).push(r);
  }
  return {
    overall: shape(rows),
    byLang: Object.fromEntries(Object.entries(byLang).map(([k, v]) => [k, shape(v)])),
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, shape(v)]))
  };
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

module.exports = { metricsFor, aggregate, pct };
