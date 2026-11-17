'use strict';
// aing-v2 tools/onnx-embed.js —— 本地 ONNX 嵌入适配器（SPEC-5.4）
// 纪律：transformers.js 是 devDependency，只在本文件里延迟 import；
// src/ 面不出现该依赖（C18），生产管线不经过这里（R1/R2）。
// 首跑联网取模型（约 118MB 量化版），之后走本地缓存离线可复跑（R6）。

const DEFAULT_MODEL = 'Xenova/multilingual-e5-small';

/**
 * @param {object} opts
 * @param {string} [opts.model] HuggingFace 模型名（默认 Xenova/multilingual-e5-small）
 * @param {string} [opts.host]  模型主机（默认取 AING_HF_HOST，缺省用库默认）
 * @returns {Promise<{model:string, dim:number, embedBatch:(texts:string[],batch?:number)=>Promise<Float32Array[]>}>}
 */
async function createOnnxEmbedder(opts = {}) {
  const model = opts.model || process.env.AING_ONNX_MODEL || DEFAULT_MODEL;
  const host = opts.host || process.env.AING_HF_HOST || '';
  const { pipeline, env } = await import('@xenova/transformers');
  if (host) env.remoteHost = host;
  const extract = await pipeline('feature-extraction', model);

  let dim = 0;
  async function runBatch(texts) {
    if (!texts.length) return [];
    const res = await extract(texts, { pooling: 'mean', normalize: true });
    const shape = res.dims || [];
    const width = shape[shape.length - 1];
    if (!width) throw new Error('嵌入器未返回维度');
    dim = dim || width;
    const data = res.data;
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      const v = new Float32Array(width);
      for (let j = 0; j < width; j++) v[j] = data[i * width + j];
      out.push(v);
    }
    return out;
  }

  /** 分批嵌入（默认 16 条一批，避免一次喂满内存） */
  async function embedBatch(texts, batch = 16) {
    const out = [];
    for (let i = 0; i < texts.length; i += batch) {
      const slice = texts.slice(i, i + batch);
      out.push(...(await runBatch(slice)));
    }
    return out;
  }

  return { model, get dim() { return dim; }, embedBatch };
}

/** E5 系列必须带前缀，其它模型不加（SPEC-5.4 §七） */
function prefixesFor(model) {
  return /(^|\/)[^/]*e5/i.test(String(model || '')) ? { queryPrefix: 'query: ', docPrefix: 'passage: ' } : { queryPrefix: '', docPrefix: '' };
}

module.exports = { createOnnxEmbedder, prefixesFor, DEFAULT_MODEL };
