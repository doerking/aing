'use strict';
// aing-v2 onnx-backend.js —— M5 任务 5.5 实现（SPEC-5.5）
// 把 SPEC-5.4 旁路量过的语义后端接成**可选后端**：懒加载、失败回退、不抛。
// 纪律：transformers.js 只在真正要注册时才 import；默认后端仍是 hash-64w2（R4）。

const NAME = 'onnx-e5-small';
const DEFAULT_MODEL = 'Xenova/multilingual-e5-small';
const DIM = 384;
const QUERY_PREFIX = 'query: ';   // E5 口径，题侧
const DOC_PREFIX = 'passage: ';   // E5 口径，文档侧

let registered = null;

/** 缺省加载器：动态 import，避免默认路径付加载成本 */
async function defaultLoadPipeline(opts = {}) {
  const { pipeline, env } = await import('@xenova/transformers');
  const host = opts.host || process.env.AING_HF_HOST || '';
  if (host) env.remoteHost = host;
  return pipeline('feature-extraction', opts.model);
}

/** 从 pipeline 造后端：文档侧 embed / 题侧 embedQuery，均值池化 + L2 归一 */
function buildBackend(extract, model, dim) {
  const encode = async (text) => {
    const res = await extract([text], { pooling: 'mean', normalize: true });
    const shape = res.dims || [];
    const width = shape[shape.length - 1];
    if (width !== dim) throw new Error(`模型维度 ${width} ≠ 注册维度 ${dim}（换模型要换 name/dim，SPEC-5.5 R4）`);
    const v = new Array(width);
    for (let i = 0; i < width; i++) v[i] = res.data[i];
    return v;
  };
  return {
    name: NAME,
    dim,
    model: NAME,
    embed: (text) => encode(DOC_PREFIX + String(text == null ? '' : text)),
    embedQuery: (text) => encode(QUERY_PREFIX + String(text == null ? '' : text))
  };
}

/**
 * 注册语义后端（幂等）。
 * @returns {Promise<{ok:true,name,dim,model}|{ok:false,reason}>} 失败不抛
 */
async function ensureRegistered(opts = {}) {
  if (registered) return registered;
  const model = opts.model || process.env.AING_ONNX_MODEL || DEFAULT_MODEL;
  const dim = Number(opts.dim || DIM);
  try {
    const loadPipeline = opts.loadPipeline || defaultLoadPipeline;
    const extract = await loadPipeline({ model, host: opts.host, dim });
    const backend = buildBackend(extract, model, dim);
    require('./vector.js').registerBackend(backend);
    registered = { ok: true, name: backend.name, dim, model };
    return registered;
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

/** 仅测试用：清掉注册缓存 */
function _reset() { registered = null; }

module.exports = { ensureRegistered, buildBackend, _reset, NAME, DIM, DEFAULT_MODEL, QUERY_PREFIX, DOC_PREFIX };
