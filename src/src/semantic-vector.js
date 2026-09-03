#!/usr/bin/env node
/**
 * semantic-vector.js — 本地语义向量引擎（可选升级件）
 *
 * 把 aing 的向量能力从 64-dim 哈希升级为 384-dim 语义向量
 * （Xenova/all-MiniLM-L6-v2，量化 onnx 约 22MB，纯本地离线推理）。
 *
 * 前置条件（二选一）：
 *   - 运行包根目录的 setup-vectors.ps1（自动装依赖 + 从 hf-mirror 下载模型）
 *   - 手动：npm install @xenova/transformers --ignore-scripts，
 *           并将模型文件放入 models/Xenova/all-MiniLM-L6-v2/
 *
 * 未就绪时 isAvailable() 返回 false，vector-search.js 自动回退 64-dim 哈希模式，
 * 因此本模块是纯增量：不装它，aing 一切照旧。
 */

const path = require('path');
const fs = require('fs');

const PKG_DIR = path.resolve(__dirname, '..');
const MODEL_DIR = path.join(PKG_DIR, 'models');
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DIMENSIONS = 384;

/** 依赖与模型文件是否就绪（不加载模型，只查文件，零成本） */
function isAvailable() {
  try {
    require.resolve('@xenova/transformers');
  } catch (e) {
    return false;
  }
  return fs.existsSync(path.join(MODEL_DIR, MODEL_NAME, 'onnx', 'model_quantized.onnx'));
}

/** 创建 embedder：{ dimensions, model, embed(text) -> number[384] } */
async function createEmbedder() {
  if (!isAvailable()) {
    throw new Error(
      '语义向量组件未就绪：请先运行 setup-vectors.ps1，' +
      '或参照 README「本地语义向量（可选）」小节手动安装'
    );
  }
  const { pipeline, env } = require('@xenova/transformers');
  env.localModelPath = MODEL_DIR;
  env.allowRemoteModels = false; // 纯本地模式：模型已就位，零外呼

  console.log('🔄 加载语义向量模型（首次约数秒）...');
  const extractor = await pipeline('feature-extraction', MODEL_NAME);
  console.log('✅ 语义向量模型就绪（384 维，本地离线）');

  return {
    dimensions: DIMENSIONS,
    model: MODEL_NAME,
    async embed(text) {
      const trimmed = String(text || '').slice(0, 2000); // 与上游一致的长度约束
      const out = await extractor(trimmed, { pooling: 'mean', normalize: true });
      return Array.from(out.data);
    },
  };
}

module.exports = { isAvailable, createEmbedder, MODEL_NAME, DIMENSIONS, MODEL_DIR };
