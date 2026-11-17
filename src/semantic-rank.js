'use strict';
// aing-v2 semantic-rank.js —— M5 任务 5.4 实现（SPEC-5.4）
// 旁路评测：嵌入器由调用方注入（测试用假嵌入器，生产用 tools/onnx-embed.js），
// 本文件不联网、不 require 任何原生依赖、不碰 src/vector.js 的同步契约。
const { metricsFor, aggregate } = require('./eval-metrics.js');

const DEFAULT_K = 10;

/** 余弦相似度；任一为零向量返回 0（不自造 NaN） */
function cosine(a, b) {
  const n = Math.min(a ? a.length : 0, b ? b.length : 0);
  if (!n) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!(na > 0) || !(nb > 0)) return 0;
  return dot / Math.sqrt(na * nb);
}

/** 排序：分数降序；同分按 id 升序（确定性，SPEC-5.4 R5） */
function rankBy(ids, vectors, q) {
  return ids
    .map((id) => ({ id, score: cosine(vectors.get(id), q) }))
    .sort((x, y) => (y.score - x.score) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/**
 * 旁路评测主入口。
 * @param {object} opts
 * @param {Array<{id:string,name?:string,content?:string}>} opts.corpus
 * @param {Array<{q:string,pos?:string[],neg?:string[],lang?:string,kind?:string}>} opts.pairs
 * @param {number} [opts.k=10]
 * @param {(texts:string[]) => Promise<ArrayLike<number>[]>} opts.embedBatch 注入的嵌入器
 * @param {string} [opts.queryPrefix=''] 题目前缀（E5 系列为 'query: '），每个题恰好加一次
 * @param {string} [opts.docPrefix='']   语料前缀（E5 系列为 'passage: '），每个文档恰好加一次
 */
async function evaluate(opts = {}) {
  const corpus = Array.isArray(opts.corpus) ? opts.corpus : [];
  const pairs = Array.isArray(opts.pairs) ? opts.pairs : [];
  const k = Number.isInteger(opts.k) ? opts.k : DEFAULT_K;
  const embedBatch = opts.embedBatch;
  if (typeof embedBatch !== 'function') throw new Error('evaluate 需要注入 embedBatch（SPEC-5.4）');
  const queryPrefix = String(opts.queryPrefix == null ? '' : opts.queryPrefix);
  const docPrefix = String(opts.docPrefix == null ? '' : opts.docPrefix);

  const t0 = process.hrtime.bigint();
  const docTexts = corpus.map((e) => docPrefix + `${e.name == null ? '' : e.name}\n${e.content == null ? '' : e.content}`);
  const queryTexts = pairs.map((p) => queryPrefix + String(p.q == null ? '' : p.q));

  const docVecs = docTexts.length ? await embedBatch(docTexts) : [];
  const queryVecs = queryTexts.length ? await embedBatch(queryTexts) : [];

  const byId = new Map();
  corpus.forEach((e, i) => byId.set(e.id, docVecs[i]));
  const ids = corpus.map((e) => e.id);

  const rows = pairs.map((p, i) => {
    const ranked = rankBy(ids, byId, queryVecs[i]).map((r) => r.id);
    const m = metricsFor(ranked, p, k);
    return { q: p.q, lang: p.lang, kind: p.kind, ranked, ...m };
  });

  return {
    k,
    corpus: corpus.length,
    pairs: pairs.length,
    elapsed_ms: Number(process.hrtime.bigint() - t0) / 1e6,
    ...aggregate(rows),
    rows
  };
}

module.exports = { cosine, rankBy, evaluate, DEFAULT_K };
