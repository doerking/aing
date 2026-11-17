'use strict';
// aing-v2 eval-metrics.js —— 冻结集指标口径单一真源（SPEC-5.3 / SPEC-5.4）
// 为什么单列：字面后端（tools/bench-retrieval.js）与语义后端旁路（src/semantic-rank.js）
// 必须用同一套 metricsFor / aggregate，否则两张表不可比。

/** 单题指标：ranked = 前 k 条 id（已按名次排好） */
function metricsFor(ranked, pair, k) {
  const list = Array.isArray(ranked) ? ranked : [];
  const top = list.slice(0, k);
  const pos = new Set((pair && pair.pos) || []);
  const neg = new Set((pair && pair.neg) || []);
  let hit = 0, negHit = 0;
  for (const id of top) {
    if (pos.has(id)) hit++;
    if (neg.has(id)) negHit++;
  }
  // nDCG@k：二值相关，理想排序按 pos 全命中算
  let dcg = 0;
  top.forEach((id, i) => { if (pos.has(id)) dcg += 1 / Math.log2(i + 2); });
  const ideal = Math.min(pos.size, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  const ndcg10 = idcg > 0 ? dcg / idcg : 0;
  // 正负名次差：正例是否排在最近的负例之前（只对有负例且有正例的题算）
  let posRank = null, negRank = null;
  list.forEach((id, i) => {
    if (posRank == null && pos.has(id)) posRank = i + 1;
    if (negRank == null && neg.has(id)) negRank = i + 1;
  });
  const negMargin = (!pos.size || !neg.size) ? null
    : (posRank != null && (negRank == null || posRank < negRank) ? 1 : 0);
  return {
    p10: hit / k,
    r10: pos.size ? hit / pos.size : 0,
    negHit: negHit > 0 ? 1 : 0,
    hit,
    ndcg10,
    negMargin,
    posRank,
    negRank
  };
}

function _avg(rows, key) {
  return rows.length ? rows.reduce((s, r) => s + r[key], 0) / rows.length : 0;
}

function aggregate(rows) {
  const shape = (list) => {
    const withNeg = list.filter((r) => r.negMargin != null);
    return {
      n: list.length,
      p10: _avg(list, 'p10'),
      r10: _avg(list, 'r10'),
      negHitRate: _avg(list, 'negHit'),
      ndcg10: _avg(list, 'ndcg10'),
      // 只对有负例的题取平均；没有可算的题就报 null（不拿 0 冒充）
      negMargin: withNeg.length ? _avg(withNeg, 'negMargin') : null
    };
  };
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
