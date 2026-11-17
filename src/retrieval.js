'use strict';
// aing-v2 retrieval.js —— M6 任务 6.3 实现（SPEC-6.3 检索融合消费）
// 口径来自旧院 aing/src/query.js searchCandidates()：三路融合 → 慢回忆 → 伪精排。
// 差异：不写 last_access（v2 铁律）；慢回忆直接走 links 有效边 + 三轴判定；权重在模块默认值。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const V = require('./vector.js');
const derive = require('./derive.js');
const { shouldEnterRetrieval } = require('./tri-axis-gate.js');

const DEFAULTS = {
  weights: { vector: 0.6, lexical: 0.25, name: 0.15 },
  slowRecallThreshold: 0.35,
  expandTop: 6,
  rerank: { kespi: 0.15, recency: 0.1 },
  limit: 8
};

// ── helpers ────────────────────────────────────────────────
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
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function _foldLower(s) {
  return V.fold(String(s == null ? '' : s)).toLowerCase();
}

function tagsOf(entity) {
  try {
    const a = JSON.parse((entity && entity.tags) || '[]');
    return Array.isArray(a) ? a.map(String) : [];
  } catch (_) { return []; }
}

/** 查询切词（与 keywordScore 同口径） */
function queryTokens(query) {
  return _foldLower(query).split(/[\s,，、;；]+/).filter((t) => t.length > 0);
}

// ── 词面（SPEC-7.1 §4.1：content + keywords + variants；表头 title/name 不入键）──
const FACE_CACHE_MAX = 2000;
const _faceCache = new Map();

function _faceOf(entity) {
  const content = String((entity && entity.content) || '');
  const tags = tagsOf(entity).join(' ');
  const key = String((entity && entity.id) || '') + '\u0000' + content + '\u0000' + tags;
  const cached = _faceCache.get(key);
  if (cached !== undefined) return cached;
  const forms = derive.variants(content).all;              // 繁简双形都进面（等价命中）
  const base = [content, ...forms, tags].join(' ');
  const kw = [...derive.keywordsOf(base)];                  // CJK 双字 + 拉丁词 + 派生形 + 粤普对照
  const face = _foldLower([base, ...kw].join(' '));
  if (_faceCache.size >= FACE_CACHE_MAX) _faceCache.clear();
  _faceCache.set(key, face);
  return face;
}

/** 查询侧归一：每个原词带别名组（繁简双形 + 粤普对照）；组内任一形命中即算命中 */
function _isCjk(s) { return /[一-鿿]/.test(s); }

function _aliasGroup(t) {
  const forms = new Set([t]);
  for (const f of derive.variants(t).all) forms.add(f);
  for (const g of derive.segment(t).mandarin) forms.add(g);
  return [...forms].map(_foldLower).filter(Boolean);   // [0] 恒为原词，作 df/idf 键
}

function queryTokenGroups(query) {
  // 一句表达按空白/标点切词，每词一组别名（原词/繁简/粤普）；
  // 组内任一形命中即算命中，命中程度按二字覆盖比计。
  // 曾试「长词拆双字组」：冻结评测集 R@10 85.0→84.4、粤语 84→82，故不采用（实测为准）。
  return queryTokens(query).map(_aliasGroup).filter((g) => g.length > 0);
}

function _groupHit(hay, forms) {
  let best = 0;
  for (const f of forms) { const h = tokenHit(hay, f); if (h > best) best = h; if (best === 1) break; }
  return best;
}

/** 单词命中：整词 1；中文长词的 2 字滑窗 0.5；无 0 */
function tokenHit(hay, token) {
  if (!hay || !token) return 0;
  if (hay.includes(token)) return 1;
  if (token.length >= 2 && /[一-鿿]/.test(token)) {
    // 二字覆盖比：命中比例越高越相关（只中一个碎片不再拿满分一半）
    let hit = 0, total = 0;
    for (let i = 0; i + 2 <= token.length; i++) {
      total++;
      if (hay.includes(token.slice(i, i + 2))) hit++;
    }
    return total ? hit / total : 0;
  }
  return 0;
}

/** 平滑 IDF：df 越小权重越大，恒 ≥1（df=0 → ln(N+1)+1） */
function idfOf(df, N) {
  const d = Number.isFinite(df) && df > 0 ? df : 0;
  const n = Number.isFinite(N) && N > 0 ? N : 0;
  return Math.log((n + 1) / (d + 1)) + 1;
}

/** 长度正则（BM25 口径，二元命中 tf=1）：长文不再靠覆盖面通吃短卡 */
const LEN_K1 = 1.2;
const LEN_B = 0.75;
function lengthNorm(dl, avgdl) {
  if (!(dl > 0) || !(avgdl > 0)) return 1;
  const k = LEN_K1 * (1 - LEN_B + LEN_B * (dl / avgdl)) + 1;
  return Math.min(1, (LEN_K1 + 1) / k);
}

/** IDF 加权词面分：Σ idf(t)·hit(t) / Σ idf(t)，上限 1（SPEC-6.3 修订 A；别名组取最佳命中）
 *  可选 rect = {dl, avgdl} 做长度正则（SPEC-7.1 §4.1：正文入键后长文必须让位） */
function keywordScoreIdf(entity, query, df, N, rect) {
  const groups = queryTokenGroups(query);
  if (!groups.length) return 0;
  const hay = _faceOf(entity);
  let num = 0, den = 0;
  for (const forms of groups) {
    const w = idfOf(df && df[forms[0]], N);
    den += w;
    num += w * _groupHit(hay, forms);
  }
  if (!(den > 0)) return 0;
  const raw = Math.min(1, num / den);
  return rect ? raw * lengthNorm(rect.dl, rect.avgdl) : raw;
}

/** 正文字符长度（长度正则用；空正文按 1 计避免除零） */
function _docLen(entity) {
  const c = String((entity && entity.content) || '');
  return c.length || 1;
}

/** 词面覆盖分：content + keywords + variants 的整词/二字滑窗命中率（别名组同权） */
function keywordScore(entity, query) {
  const groups = queryTokenGroups(query);
  if (!groups.length) return 0;
  const hay = _faceOf(entity);
  if (!hay) return 0;
  let hit = 0;
  for (const forms of groups) hit += _groupHit(hay, forms);
  return Math.min(1, hit / groups.length);
}

/** 序列号路：只认 id（SPEC-7.1 §二：title 是派生标头，永不入键） */
function nameScore(entity, query) {
  const q = _foldLower(query);
  if (!q) return 0;
  const id = _foldLower((entity && entity.id) || '');
  if (id === q) return 1;
  if (id.includes(q)) return 0.8;
  return 0;
}

function parseTs(v) {
  if (v == null) return NaN;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return Date.parse(s.replace(' ', 'T') + 'Z');
  return Date.parse(s);
}

/** 新鲜度：30 天半衰 */
function recencyScore(entity) {
  const t = parseTs(entity && entity.updated_at);
  if (Number.isNaN(t)) return 0;
  const days = Math.max(0, (Date.now() - t) / 86400000);
  return 1 / (1 + days / 30);
}

// ── 主入口：只读检索 ───────────────────────────────────────
async function search(store, query, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('retrieval 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const limit = Number.isInteger(opts.k) && opts.k > 0 ? opts.k
    : (Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULTS.limit);
  const weights = { ...DEFAULTS.weights, ...(opts.weights || {}) };
  const rr = { ...DEFAULTS.rerank, ...(opts.rerank || {}) };
  const pool = new Map();

  const rowOf = (id) => _scalar(db, 'SELECT id,name,type,tags,content,updated_at,invalid_at FROM entities WHERE id = ?', [id]);
  const add = (row, extra) => {
    if (!row || row.invalid_at) return null;
    const e = pool.get(row.id) || { id: row.id, name: row.name, type: row.type, tags: row.tags, updated_at: row.updated_at, sim: 0, lexical: 0, nameHit: 0, slowRecall: false };
    Object.assign(e, extra || {});
    pool.set(row.id, e);
    return e;
  };

  // 1) 向量路（沿用 5.3：强度加权 + 简繁归一 + 双链去重）
  const hits = opts.namesOnly ? [] : await V.search(store, query, { k: limit * 3, backend: opts.backend });
  for (const h of hits) {
    const row = rowOf(h.id);
    if (!row || row.invalid_at) continue;
    add(row, { sim: Number(h.score) || 0 });
  }

  // 2) 词面/名称路（只收真命中，不全库倾倒；词面用 IDF 加权，SPEC-6.3 修订 A）
  //    词面口径 SPEC-7.1 §4.1：content + keywords + variants；name/title 不入键
  const all = _rows(db, 'SELECT id,name,type,tags,content,updated_at FROM entities WHERE invalid_at IS NULL');
  const groups = queryTokenGroups(query);
  const df = {};
  if (groups.length) {
    for (const row of all) {
      const hay = _faceOf(row);
      for (const forms of groups) if (_groupHit(hay, forms) > 0) df[forms[0]] = (df[forms[0]] || 0) + 1;
    }
  }
  const N = all.length;
  const avgdl = all.length ? all.reduce((s2, r) => s2 + _docLen(r), 0) / all.length : 0;
  for (const row of all) {
    const lx = keywordScoreIdf(row, query, df, N, { dl: _docLen(row), avgdl });
    const nm = nameScore(row, query);
    if (lx <= 0 && nm <= 0) continue;
    add(row, { lexical: lx, nameHit: nm });
  }

  // 3) 三路融合（会话原文是源头不是答案：同分时让位给加工件，SPEC-7.1 §〇）
  const SOURCE_PRIOR = 0.75;
  for (const e of pool.values()) {
    const lx = e.type === 'Conversation' ? (e.lexical || 0) * SOURCE_PRIOR : (e.lexical || 0);
    e.fused = weights.vector * (e.sim || 0) + weights.lexical * lx + weights.name * (e.nameHit || 0);
  }

  // 4) 慢回忆：整体向量置信低（或强制）时沿有效边扩一跳
  const withSim = [...pool.values()].filter((e) => (e.sim || 0) > 0.01).sort((a, b) => b.sim - a.sim);
  const avgSim = withSim.length ? withSim.reduce((s, e) => s + e.sim, 0) / withSim.length : 0;
  const threshold = typeof opts.slowRecallThreshold === 'number' ? opts.slowRecallThreshold : DEFAULTS.slowRecallThreshold;
  const needSlow = !!opts.forceSlow || (withSim.length > 0 && avgSim < threshold);
  const expandTop = Number.isInteger(opts.expandTop) && opts.expandTop > 0 ? opts.expandTop : DEFAULTS.expandTop;
  let slowExpanded = 0;
  if (needSlow) {
    const seeds = withSim.slice(0, 3);
    const topSim = seeds.length ? seeds[0].sim : 0;
    const seen = new Set();
    for (const seed of seeds) {
      const edges = _rows(
        db,
        `SELECT l.source_id, l.target_id, l.relation, l.confidence, l.strength, l.invalid_at,
                s.type AS source_type, t.type AS target_type
         FROM links l
         JOIN entities s ON s.id = l.source_id
         JOIN entities t ON t.id = l.target_id
         WHERE l.source_id = ? OR l.target_id = ?`,
        [seed.id, seed.id]
      );
      let taken = 0;
      for (const edge of edges) {
        if (taken >= expandTop) break;
        if (!shouldEnterRetrieval(edge)) continue;
        const nbId = edge.source_id === seed.id ? edge.target_id : edge.source_id;
        if (nbId === seed.id || seen.has(nbId)) continue;
        seen.add(nbId);
        if (pool.has(nbId)) continue;
        const row = rowOf(nbId);
        if (!row || row.invalid_at) continue;
        const lx = keywordScoreIdf(row, query, df, N, { dl: _docLen(row), avgdl });
        const nm = nameScore(row, query);
        const e = add(row, { sim: 0, lexical: lx, nameHit: nm, slowRecall: true });
        if (!e) continue;
        e.fused = weights.vector * 0.3 * topSim + weights.lexical * lx + weights.name * nm + 0.05;
        slowExpanded++;
        taken++;
      }
    }
  }

  // 5) 伪精排：KESPI + 新鲜度
  for (const e of pool.values()) {
    const k = _scalar(db, 'SELECT overall FROM kespi_scores WHERE entity_id = ?', [e.id]);
    const kRaw = k && k.overall != null ? Number(k.overall) : null;
    const kN = kRaw == null ? 0 : (kRaw <= 1 ? kRaw : kRaw / 100);
    const base = e.fused == null ? 0 : e.fused;
    e.final = base * (1 - rr.kespi - rr.recency) + kN * rr.kespi + recencyScore(e) * rr.recency;
  }

  // 6) 排序 + 双链去重 + 截断（同分优先 raw；三路全零不占位）
  const sorted = [...pool.values()]
    .filter((e) => (e.fused || 0) > 0)
    .sort((a, b) =>
    b.final - a.final ||
    (String(a.id).startsWith('wiki-') ? 1 : 0) - (String(b.id).startsWith('wiki-') ? 1 : 0));
  const out = [];
  const seenBase = new Set();
  for (const e of sorted) {
    const base = String(e.id).replace(/^wiki-/, '');
    if (seenBase.has(base)) continue;
    seenBase.add(base);
    out.push({
      id: e.id,
      base,
      name: e.name,
      type: e.type,
      score: e.sim || 0,
      final: e.final,
      channels: { vector: e.sim || 0, lexical: e.lexical || 0, name: e.nameHit || 0 },
      ...(e.slowRecall ? { slowRecall: true } : {})
    });
    if (out.length >= limit) break;
  }

  return { candidates: out, meta: { avgSim, slowExpanded, weights, rerank: rr } };
}

module.exports = { DEFAULTS, search, keywordScore, keywordScoreIdf, idfOf, queryTokens, nameScore, recencyScore, parseTs, tagsOf };
