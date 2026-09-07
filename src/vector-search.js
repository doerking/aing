#!/usr/bin/env node
/**
 * vector-search.js — 向量检索模块
 * 
 * 功能：
 * 1. 生成文本 embedding（使用简化哈希方案）
 * 2. 存储向量到 SQLite
 * 3. 语义搜索（余弦相似度）
 * 
 * 使用：
 *   const VectorSearch = require('./vector-search');
 *   const search = new VectorSearch(store);
 *   await search.init();
 *   const results = await search.semantic('自成长');
 */

const path = require('path');
const semanticVector = require('./semantic-vector');

class VectorSearch {
  constructor(store) {
    this.store = store;
    this.embedder = null;
    this.isReady = false;
    this.dimension = 64; // 简化向量维度
    this.mode = 'hash';  // 'hash'（默认零依赖）| 'semantic'（384 维本地模型）
    this.modelName = 'char-ngram-hash-64';
    this.semantic = null; // 语义 embedder（enableSemantic() 后可用）
  }

  /**
   * 启用语义向量模式（384 维，需先运行 setup-vectors.ps1）。
   * 未就绪时抛出带指引的错误，调用方可回退哈希模式。
   */
  async enableSemantic() {
    this.semantic = await semanticVector.createEmbedder();
    this.mode = 'semantic';
    this.dimension = semanticVector.DIMENSIONS;
    this.modelName = semanticVector.MODEL_NAME;
    this.isReady = true;
    return this;
  }

  /** 统一入口：按当前模式生成 embedding（语义模式为异步） */
  async embed(text) {
    if (this.mode === 'semantic') return this.semantic.embed(text);
    return this.generateEmbedding(text);
  }

  /**
   * 初始化 embedding 模型
   * 使用简化的 character n-gram 哈希方案
   */
  async init() {
    try {
      console.log('🔧 初始化向量检索...');
      console.log('   使用简化哈希方案 (64维)');
      this.isReady = true;
      console.log('✅ 向量检索已就绪');
    } catch (err) {
      console.error('❌ 向量检索初始化失败:', err.message);
      this.isReady = false;
    }
  }

  /**
   * 生成 embedding（简化哈希方案）
   * 将文本转换为固定长度的向量
   */
  generateEmbedding(text) {
    if (!this.isReady) return null;

    // 使用 character n-gram 哈希生成向量
    const vector = new Array(this.dimension).fill(0);
    const chars = text.toLowerCase();
    
    for (let i = 0; i < chars.length - 2; i++) {
      // 3-gram 哈希
      const ngram = chars.substring(i, i + 3);
      let hash = this._hash(ngram);
      const idx = hash % this.dimension;
      vector[idx] += 1;
    }
    
    // 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    
    return vector;
  }

  /**
   * 简单哈希函数
   */
  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为 32位整数
    }
    return Math.abs(hash);
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }

  /**
   * 保存向量
   */
  async saveEmbedding(entityId, text) {
    if (!this.isReady) return;

    const embedding = this.generateEmbedding(text);
    if (!embedding) return;

    this.store.saveEmbedding(entityId, embedding);
  }

  /**
   * 语义搜索
   */
  async semanticSearch(query, limit = 10) {
    if (!this.isReady) {
      // Fallback: 关键词搜索
      return this.keywordSearch(query, limit);
    }

    const queryVector = await this.embed(query);
    const entities = this.store.getEntities();
    
    const scored = entities.map(entity => {
      const embedding = this.store.getEmbedding(entity.id);
      if (!embedding || !embedding.embedding) {
        // 没有向量的实体，使用关键词评分
        return { ...entity, score: 0 };
      }
      
      // 解析 BLOB 向量
      const embeddingBuffer = Buffer.isBuffer(embedding.embedding) 
        ? embedding.embedding 
        : Buffer.from(embedding.embedding);

      // 维度不匹配的旧向量（换模式后未重建索引）跳过
      if (embedding.dimension && embedding.dimension !== queryVector.length) {
        return { ...entity, score: 0 };
      }
      const entityVector = [];
      for (let i = 0; i < embeddingBuffer.length; i += 4) {
        entityVector.push(embeddingBuffer.readFloatLE(i));
      }
      
      const similarity = this.cosineSimilarity(queryVector, entityVector);
      return { ...entity, score: similarity };
    });

    return scored
      .filter(e => e.score > 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 关键词搜索 fallback
   */
  keywordSearch(query, limit = 10) {
    const entities = this.store.getEntities();
    const keywords = query.split(/\s+/).filter(k => k.length > 1);

    const scored = entities.map(entity => {
      let score = 0;
      const content = (entity.content || '').toLowerCase();
      const name = (entity.name || '').toLowerCase();

      for (const keyword of keywords) {
        if (content.includes(keyword.toLowerCase())) {
          score += 0.5;
        }
        if (name.includes(keyword.toLowerCase())) {
          score += 1.0;
        }
      }

      return { ...entity, score };
    });

    return scored
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 索引所有实体生成向量
   */
  async indexAllEntities() {
    if (!this.isReady) return 0;

    const entities = this.store.getEntities();
    let indexed = 0;

    for (const entity of entities) {
      const content = entity.content || '';
      const name = entity.name || '';
      const text = `${name} ${content}`.substring(0, 500); // 限制长度

      await this.saveEmbedding(entity.id, text);
      indexed++;
    }

    return indexed;
  }

  /**
   * 获取向量状态
   */
  getStatus() {
    return {
      ready: this.isReady,
      dimension: this.dimension,
      mode: this.mode,
      model: this.modelName
    };
  }
}

module.exports = VectorSearch;
