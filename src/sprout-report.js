'use strict';
// aing-v2 sprout-report.js —— SPEC-7.1 §4.2：发芽度报告（每关键词可复算）
// 口径：
//   sprout(kw)   = 经 strength≥7 的三类候选关系边可触达的实体数（泛 related 一律不算）
//   variants(kw) = 该词派生出的其它写法数（繁简双形 / 粤语拆解 / 粤普对照）
//   「知识链长度」看 sprout 的分布，不看实体总数。
// 纯读：不写库、不写 last_access。store 由调用方注入（arch-lint C5 守）。

const derive = require('./derive.js');

const STRONG = 7;
const QUALIFIED = new Set(['sprout-candidate', 'pollinate-candidate', 'hydrogen-bond']);

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function stripStrength(tag) { return String(tag).replace(/:\d+$/, ''); }

function tagsOf(entity) {
  try {
    const a = JSON.parse((entity && entity.tags) || '[]');
    return Array.isArray(a) ? a.map((x) => stripStrength(x)) : [];
  } catch (_) { return []; }
}

/** 默认关键词表：由标签词面去强度后缀去重得到（标签＝加载单位） */
function keywordsFromTags(store) {
  const db = store._getDb();
  const out = new Set();
  for (const r of _rows(db, 'SELECT tags FROM entities WHERE invalid_at IS NULL')) {
    for (const t of tagsOf(r)) if (t.length >= 2) out.add(t);
  }
  return [...out].sort();
}

/** 一个词的派生写法（不含自身） */
function formsOf(kw) {
  const forms = new Set();
  for (const f of derive.variants(kw).all) forms.add(f);
  const seg = derive.segment(kw);
  for (const g of seg.mandarin) forms.add(g);
  for (const tk of seg.tokens) if (tk.length >= 2) forms.add(tk);
  forms.delete(kw);
  return [...forms];
}

function _median(xs) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * 发芽度报告。
 * @param store 注入的知识库
 * @param {{keywords?: string[]}} opts 不传则用标签词面
 * @returns {{keywords: Array, distribution: {n, dead, median, p90, max}}}
 */
function report(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('sprout-report 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const ents = _rows(db, 'SELECT id, content, tags FROM entities WHERE invalid_at IS NULL');
  const byId = new Map(ents.map((e) => [e.id, e]));
  const kwList = Array.isArray(opts.keywords) && opts.keywords.length ? opts.keywords.map(String) : keywordsFromTags(store);

  // 合格边：三类候选关系 且 strength≥7 且有效
  const edges = _rows(db,
    'SELECT source_id, target_id, relation, strength FROM links WHERE invalid_at IS NULL')
    .filter((l) => Number(l.strength) >= STRONG && QUALIFIED.has(String(l.relation || '')));
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const e of edges) { add(e.source_id, e.target_id); add(e.target_id, e.source_id); }

  const keywords = kwList.map((kw) => {
    const seeds = ents.filter((e) => tagsOf(e).includes(kw) || String(e.content || '').includes(kw)).map((e) => e.id);
    const reached = new Set();
    for (const s of seeds) for (const nb of (adj.get(s) || [])) if (!seeds.includes(nb) && byId.has(nb)) reached.add(nb);
    const forms = formsOf(kw);
    return { kw, seeds: seeds.length, sprout: reached.size, reached: [...reached].sort(), variants: forms.length, forms };
  }).sort((a, b) => b.sprout - a.sprout || a.kw.localeCompare(b.kw));

  const sp = keywords.map((k) => k.sprout);
  const sorted = [...sp].sort((a, b) => a - b);
  const p90 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0;
  return {
    keywords,
    distribution: {
      n: keywords.length,
      dead: sp.filter((x) => x === 0).length,
      median: _median(sp),
      p90,
      max: sorted.length ? sorted[sorted.length - 1] : 0
    }
  };
}

module.exports = { report, keywordsFromTags, formsOf, STRONG, QUALIFIED };
