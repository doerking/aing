'use strict';
// aing-v2 retrieval.js —— M6 任务 6.3 实现（SPEC-6.3 检索融合消费）
// 口径来自旧院 aing/src/query.js searchCandidates()：三路融合 → 慢回忆 → 伪精排。
// 差异：不写 last_access（v2 铁律）；慢回忆直接走 links 有效边 + 三轴判定；权重在模块默认值。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const crypto = require('crypto');
const V = require('./vector.js');
const derive = require('./derive.js');
const { shouldEnterRetrieval } = require('./tri-axis-gate.js');

const SOURCE_PRIOR = 0.75;   // 会话原文是源头不是答案（SPEC-7.1 §〇）：向量与词面同折，回忆意图不折
// SPEC-6.3 修订 F（2026-11-18）：向量路取全库、融合后再截断。
// 原先 k=limit*3——只从词面/名称路进来的候选拿不到向量分（sim=0），同一张卡在 K=6 与 K=12 下
// 融合分差 3.7 倍（真库实测 0.148 vs 0.554），名次跟着 K 翻转（23/24 题）。缺考不能记 0 分。
const POOL_ALL = 1000000;
const SLOW_STAT_TOP = 10;   // 慢回忆的置信统计只看最像的 10 条，与池大小无关

const DEFAULTS = {
  // SPEC-6.3 修订 B（2026-11-17）：缺省后端切语义后，向量通道主导；此处按冻结集 v2 扫描实测定
  // （0.8/0.05/0.15 的 nDCG@10 91.7%、正负名次差 98.75%、粤语 nDCG 87.3% 均优于旧 0.6/0.25/0.15）
  // SPEC-6.3 修订 E（2026-11-18）：冻结集每题仅 1 正例、正例名次不随权重动，对融合权重无分辨力
  // （§十三/§十四）；改以真库 24 题人工判读集为准：0.5/0.2/0.3 使 top1 9→12、top3 14→15、MRR .512→.591。
  // 旧口径可显式传 opts.weights 恢复。
  weights: { vector: 0.5, lexical: 0.2, name: 0.3 },
  slowRecallThreshold: 0.35,
  expandTop: 6,
  // SPEC-6.3 修订 D（2026-11-17）：KESPI 度量代谢活跃度、不是本题相关性，
  // 窄带下 0.15 的绝对加分压过向量差（0.0155 > 0.012）；撤出精排，只留少量新鲜度。
  // 旧口径可显式传 opts.rerank 恢复；是否以乘性/归一化方式回来等记账数据齐了再议。
  rerank: { kespi: 0, recency: 0.05 },
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
// 字段权重：正文命中满分，只在标签里命中降权（真库上泛标签在抢分）
const TAG_WEIGHT = 0.6;
const FACE_CACHE_MAX = 2000;
const _faceCache = new Map();
const _bodyCache = new Map();
const _tagCache = new Map();

function _cacheSet(cache, key, value) {
  if (cache.size >= FACE_CACHE_MAX) cache.clear();
  cache.set(key, value);
  return value;
}

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
  return _cacheSet(_faceCache, key, face);
}

/** 正文面（不含标签）：正文 + 派生形 + 关键词 */
function _bodyFaceOf(entity) {
  const content = String((entity && entity.content) || '');
  const key = String((entity && entity.id) || '') + '\u0000' + content;
  const cached = _bodyCache.get(key);
  if (cached !== undefined) return cached;
  const base = [content, ...derive.variants(content).all].join(' ');
  const face = _foldLower([base, ...derive.keywordsOf(base)].join(' '));
  return _cacheSet(_bodyCache, key, face);
}

/** 标签面：标签本身 + 繁简双形（标签常是短词，不进双字切分） */
function _tagFaceOf(entity) {
  const tags = tagsOf(entity).join(' ');
  const key = String((entity && entity.id) || '') + '\u0000' + tags;
  const cached = _tagCache.get(key);
  if (cached !== undefined) return cached;
  const face = tags ? _foldLower([tags, ...derive.variants(tags).all].join(' ')) : '';
  return _cacheSet(_tagCache, key, face);
}

/** 一条实体对一个别名组的命中：正文优先，标签降权 */
function _entityGroupHit(entity, forms) {
  const bodyHit = _groupHit(_bodyFaceOf(entity), forms);
  if (bodyHit >= 1) return 1;
  const tagHit = _groupHit(_tagFaceOf(entity), forms) * TAG_WEIGHT;
  return Math.max(bodyHit, tagHit);
}

/** 查询侧归一：每个原词带别名组（繁简双形 + 粤普对照）；组内任一形命中即算命中 */
function _isCjk(s) { return /[一-鿿]/.test(s); }

function _aliasGroup(t) {
  const forms = new Set([t]);
  for (const f of derive.variants(t).all) forms.add(f);
  // 粤语词：整句转普通话成一个别名（不把「谁/来」这类单字拆进别名，
  // 否则任意含该字的档都拿满分——假命中主要来源）
  // 粤语词：词表对照全部进别名（实测：砍掉单字对照会让冻结集粤语 R@10 掉 6 点，
  // 长句精度交给词面覆盖比 + 长度正则 + 源头让位去压，不在这里动刀）
  for (const g of derive.segment(t).mandarin) forms.add(g);
  // 同义/别名组排最后：只在扩展名额有剩时才补位，不挤掉繁简与粤普对照
  for (const s of derive.synonymsOf(t)) forms.add(s);
  const ordered = [...forms].map(_foldLower).filter(Boolean);
  const head = ordered[0];
  const rest = ordered.slice(1).filter((f) => f !== head);
  // AC-12a：原词 + 最多 3 条扩展（_groupHit 的权重表也只有 4 档）
  return [head, ...rest.slice(0, 3)];   // [0] 恒为原词，作 df/idf 键
}

function queryTokenGroups(query) {
  // 一句表达按空白/标点切词，每词一组别名（原词/繁简/粤普）；
  // 组内任一形命中即算命中，命中程度按二字覆盖比计。
  // 曾试「长词拆双字组」：冻结评测集 R@10 85.0→84.4、粤语 84→82，故不采用（实测为准）。
  return queryTokens(query).map(_aliasGroup).filter((g) => g.length > 0);
}

// SPEC-7.1 AC-12：保留原查询，扩展最多 3 条，权重按序递减（扩展不得压过原词）
const EXPANSION_WEIGHTS = [1, 0.7, 0.55, 0.4];

function _groupHit(hay, forms) {
  let best = 0;
  const n = Math.min(forms.length, EXPANSION_WEIGHTS.length);
  for (let i = 0; i < n; i++) {
    const h = tokenHit(hay, forms[i]) * EXPANSION_WEIGHTS[i];
    if (h > best) best = h;
  }
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
  let num = 0, den = 0;
  for (const forms of groups) {
    const w = idfOf(df && df[forms[0]], N);
    den += w;
    num += w * _entityGroupHit(entity, forms);
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
  let hit = 0;
  for (const forms of groups) hit += _entityGroupHit(entity, forms);
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

/** 新鲜度：30 天半衰（now 可注入，评测集用固定参考时刻保确定性） */
function recencyScore(entity, now) {
  const t = parseTs(entity && entity.updated_at);
  if (Number.isNaN(t)) return 0;
  const base = Number.isFinite(now) ? now : Date.now();
  const days = Math.max(0, (base - t) / 86400000);
  return 1 / (1 + days / 30);
}

// ── 主入口：只读检索 ───────────────────────────────────────
async function search(store, query, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('retrieval 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const limit = Number.isInteger(opts.k) && opts.k > 0 ? opts.k
    : (Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULTS.limit);
  // SPEC-6.13：意图路由——显式权重/rerank 以调用方为准；intentRouting:false 可整件关掉
  const routed = opts.intentRouting === false ? null : require('./intent.js').classifyIntent(query);
  const weights = { ...DEFAULTS.weights, ...(routed ? routed.weights : {}), ...(opts.weights || {}) };
  const rr = { ...DEFAULTS.rerank, ...(routed ? routed.rerank : {}), ...(opts.rerank || {}) };
  const pool = new Map();

  const rowOf = (id) => _scalar(db, 'SELECT id,name,type,tags,content,updated_at,invalid_at FROM entities WHERE id = ?', [id]);
  const add = (row, extra) => {
    if (!row || row.invalid_at) return null;
    const e = pool.get(row.id) || { id: row.id, name: row.name, type: row.type, tags: row.tags, updated_at: row.updated_at, sim: 0, lexical: 0, nameHit: 0, slowRecall: false };
    Object.assign(e, extra || {});
    pool.set(row.id, e);
    return e;
  };

  // 0) 全库行表（词面路本来就要全扫；这里复用，免掉逐条回表）
  const all = _rows(db, 'SELECT id,name,type,tags,content,updated_at FROM entities WHERE invalid_at IS NULL');
  const rowMap = new Map(all.map((r) => [String(r.id), r]));

  // 1) 向量路（沿用 5.3：强度加权 + 简繁归一 + 双链去重）
  //    SPEC-6.3 修订 F：取全库，不按 limit 缩池——否则被挤在池外的候选拿不到向量分
  const hits = opts.namesOnly ? [] : await V.search(store, query, { k: POOL_ALL, backend: opts.backend });
  for (const h of hits) {
    const row = rowMap.get(String(h.id));
    if (!row || row.invalid_at) continue;
    add(row, { sim: Number(h.score) || 0 });
  }

  // 2) 词面/名称路（只收真命中，不全库倾倒；词面用 IDF 加权，SPEC-6.3 修订 A）
  //    词面口径 SPEC-7.1 §4.1：content + keywords + variants；name/title 不入键
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

  // 3) 三路融合（会话原文是源头不是答案：让位给加工件，SPEC-7.1 §〇 / SPEC-6.3 修订 C）
  //    向量通道同样打折：语义相似度挤在窄带时，KESPI/新鲜度的绝对加分会把会话原文推上前排。
  //    回忆意图例外——那时要找的就是会话原文本身。
  const recallIntent = !!(routed && routed.intent === 'recall');
  for (const e of pool.values()) {
    const conv = e.type === 'Conversation' ? (recallIntent ? 1 : SOURCE_PRIOR) : 1;
    const lx = e.lexical || 0;
    e.fused = weights.vector * (e.sim || 0) * conv + weights.lexical * lx * conv + weights.name * (e.nameHit || 0);
  }

  // 4) 慢回忆：整体向量置信低（或强制）时沿有效边扩一跳
  const withSim = [...pool.values()].filter((e) => (e.sim || 0) > 0.01).sort((a, b) => b.sim - a.sim);
  // SPEC-6.3 修订 F：置信统计取最像的 SLOW_STAT_TOP 条，池子变大不会把均值拖低
  const statTop = withSim.slice(0, SLOW_STAT_TOP);
  const avgSim = statTop.length ? statTop.reduce((s, e) => s + e.sim, 0) / statTop.length : 0;
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
        const row = rowMap.get(String(nbId)) || rowOf(nbId);
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

  // 5) 伪精排：KESPI + 新鲜度（now 可注入：评测须可复现）
  const nowRef = Number.isFinite(opts.now) ? opts.now : Date.now();
  for (const e of pool.values()) {
    const k = _scalar(db, 'SELECT overall FROM kespi_scores WHERE entity_id = ?', [e.id]);
    const kRaw = k && k.overall != null ? Number(k.overall) : null;
    const kN = kRaw == null ? 0 : (kRaw <= 1 ? kRaw : kRaw / 100);
    const base = e.fused == null ? 0 : e.fused;
    e.final = base * (1 - rr.kespi - rr.recency) + kN * rr.kespi + recencyScore(e, nowRef) * rr.recency;
  }

  // 6) 排序 + 双链去重（同基名镜像折叠）+ 截断（同分优先 raw；三路全零不占位）
  const sorted = [...pool.values()]
    .filter((e) => (e.fused || 0) > 0)
    .sort((a, b) =>
    b.final - a.final ||
    (String(a.id).startsWith('wiki-') ? 1 : 0) - (String(b.id).startsWith('wiki-') ? 1 : 0));
  const out = [];
  const seenBase = new Map();
  // 双链去重：raw-x / x / wiki-x 是同一份知识的三个镜像（真库已核：正文逐字相同），
  // 只留名次最高的那份，折叠掉的 id 记在 mergedIds 上（可解释）。
  // 只按 id 基名折，不按正文指纹折——两条独立条目偶然同文时不该互相吞掉。
  const baseOf = (id) => String(id).replace(/^(?:wiki-|raw-)/, '');
  for (const e of sorted) {
    const base = baseOf(e.id);
    const keeper = seenBase.get(base);
    if (keeper) {
      (keeper.mergedIds || (keeper.mergedIds = [])).push(e.id);
      continue;
    }
    const cand = {
      id: e.id,
      base,
      name: e.name,
      type: e.type,
      score: e.sim || 0,
      final: e.final,
      channels: { vector: e.sim || 0, lexical: e.lexical || 0, name: e.nameHit || 0 },
      ...(e.slowRecall ? { slowRecall: true } : {})
    };
    seenBase.set(base, cand);
    out.push(cand);
    if (out.length >= limit) break;
  }

  return {
    candidates: out,
    meta: {
      avgSim, slowExpanded, weights, rerank: rr,
      intent: routed ? { intent: routed.intent, hits: routed.hits } : null
    }
  };
}

module.exports = { DEFAULTS, search, keywordScore, keywordScoreIdf, idfOf, queryTokens, queryTokenGroups, nameScore, recencyScore, parseTs, tagsOf, EXPANSION_WEIGHTS, TAG_WEIGHT, SOURCE_PRIOR };
