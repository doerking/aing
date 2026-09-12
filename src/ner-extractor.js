#!/usr/bin/env node
/**
 * ner-extractor.js — 命名实体识别提取器（P2 #008）
 * 
 * 使用 @xenova/transformers.js 进行 NER
 * 支持中英文混合文本的实体提取
 */

const { pipeline } = require('@xenova/transformers');

class NERExtractor {
  constructor() {
    this.pipeline = null;
    this.modelName = 'Xenova/bert-base-multilingual-cased-ner-hrl';
  }

  /**
   * 初始化 NER 模型（异步，仅调用一次）
   */
  async init() {
    if (this.pipeline) return this.pipeline;
    
    console.log(`🧠 加载 NER 模型: ${this.modelName}...`);
    try {
      this.pipeline = await pipeline('token-classification', this.modelName, {
        // 使用 hf-mirror.com 国内镜像
        config: {
          _name_or_path: this.modelName,
          tokenizer_config_file: `https://hf-mirror.com/${this.modelName}/resolve/main/tokenizer_config.json`
        },
        // 禁用文件缓存提示
        use_gpu: false
      });
      console.log('✅ NER 模型加载完成');
    } catch (e) {
      console.error(`⚠️  NER 模型加载失败: ${e.message}`);
      console.log('   降级为正则提取模式');
      this.pipeline = null;
    }
    return this.pipeline;
  }

  /**
   * 从文本中提取实体
   * @param {string} content - 输入文本
   * @returns {Array<{text, type, confidence}>}
   */
  async extract(content) {
    if (!this.pipeline) {
      await this.init();
    }
    
    if (!this.pipeline) {
      // 降级：返回空数组，由正则提取器补充
      return [];
    }
    
    try {
      const results = await this.pipeline(content, {
        aggregation_strategy: 'simple'
      });
      
      const entities = results
        .filter(r => r.entity && !r.entity.startsWith('O'))
        .map(r => ({
          text: r.word,
          type: r.entity.replace(/^(B-|I-)/, ''), // B-PERSON -> PERSON
          confidence: parseFloat(r.score) || 0.5
        }));
      
      return entities;
    } catch (e) {
      console.error('⚠️ NER 提取失败:', e.message);
      return [];
    }
  }

  /**
   * 检查 NER 是否可用
   */
  isAvailable() {
    return !!this.pipeline;
  }
}

module.exports = { NERExtractor };
