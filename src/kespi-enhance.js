#!/usr/bin/env node
/**
 * kespi-enhance.js — KESPI 质量增强
 * 
 * 功能：
 * 1. 提升 originality（原创性）- 增加跨域关联
 * 2. 提升 relevance（相关性）- 强制标签体系
 * 3. 提升 consistency（一致性）- 矛盾检测
 * 4. 提升 provability（可验证性）- 引用来源
 * 5. 提升 utility（实用性）- 使用场景标注
 * 
 * 使用：
 *   node kespi-enhance.js --base-dir .
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

class KESPIEnhancer {
  constructor(store) {
    this.store = store;
  }

  /**
   * 提升原创性评分
   * 策略：增加与不同领域实体的关联
   */
  enhanceOriginality(entityId) {
    const entity = this.store.getEntity(entityId);
    if (!entity) return 0;

    // 查找同类型实体
    const sameType = this.store.getEntities({ type: entity.type }).filter(e => e.id !== entityId);
    
    // 查找不同类型实体（跨域）
    const crossDomain = this.store.getEntities().filter(e => 
      e.id !== entityId && e.type !== entity.type
    );

    // 原创性 = 跨域关联数 / 总实体数（归一化）
    const crossDomainCount = crossDomain.length;
    const totalEntities = this.store.getStats().entities;
    const originality = Math.min(crossDomainCount / Math.max(totalEntities, 1), 1.0);

    return Math.round(originality * 100) / 100;
  }

  /**
   * 提升相关性评分
   * 策略：检查标签覆盖率和主题一致性
   */
  enhanceRelevance(entityId, query = null) {
    const entity = this.store.getEntity(entityId);
    if (!entity) return 0;

    const tags = JSON.parse(entity.tags || '[]');
    
    // 标签覆盖率
    const tagScore = Math.min(tags.length / 5, 1.0); // 5个标签满分

    // 主题一致性（如果有查询）
    let queryScore = 1.0;
    if (query && entity.content) {
      const keywords = query.split(/\s+/).filter(k => k.length > 2);
      const matches = keywords.filter(k => entity.content.includes(k)).length;
      queryScore = matches / keywords.length;
    }

    const relevance = (tagScore * 0.6 + queryScore * 0.4);
    return Math.round(relevance * 100) / 100;
  }

  /**
   * 提升一致性评分
   * 策略：检测逻辑矛盾
   */
  enhanceConsistency(entityId) {
    const entity = this.store.getEntity(entityId);
    if (!entity) return 0;

    const sameType = this.store.getEntities({ type: entity.type })
      .filter(e => e.id !== entityId);

    let contradictionCount = 0;

    // 简单矛盾检测：检查否定词
    const negations = ['不', '无', '未', '非', '反', '没有', '不存在'];
    for (const other of sameType) {
      const contentA = entity.content.toLowerCase();
      const contentB = other.content.toLowerCase();
      
      for (const neg of negations) {
        if (contentA.includes(neg + other.name) && contentB.includes(neg + entity.name)) {
          contradictionCount++;
          break;
        }
      }
    }

    // 一致性 = 1 - (矛盾数 / 同类实体数)
    const consistency = Math.max(0, 1 - contradictionCount / Math.max(sameType.length, 1));
    return Math.round(consistency * 100) / 100;
  }

  /**
   * 提升可验证性评分
   * 策略：检查是否有来源引用
   */
  enhanceProvability(entityId) {
    const entity = this.store.getEntity(entityId);
    if (!entity) return 0;

    // 检查 source_file
    const hasSource = !!entity.source_file;

    // 检查 content 中的引用标记
    const hasReferences = /(\[\[.*?\]\]|\(来源:.*?\)|\[来源:.*?\])/.test(entity.content);

    const provability = (hasSource ? 0.5 : 0) + (hasReferences ? 0.5 : 0);
    return Math.round(provability * 100) / 100;
  }

  /**
   * 提升实用性评分
   * 策略：检查使用场景标注
   */
  enhanceUtility(entityId) {
    const entity = this.store.getEntity(entityId);
    if (!entity) return 0;

    // 检查是否有使用场景标注
    const hasUseCases = /## 使用|## 场景|## 应用|## Example|## Usage/.test(entity.content);

    // 检查代码示例
    const hasCodeExample = /```[\s\S]*?```/.test(entity.content);

    const utility = (hasUseCases ? 0.5 : 0) + (hasCodeExample ? 0.5 : 0);
    return Math.round(utility * 100) / 100;
  }

  /**
   * 执行完整 KESPI 增强
   */
  async enhance(entityId, query = null) {
    const scores = {
      originality: this.enhanceOriginality(entityId),
      relevance: this.enhanceRelevance(entityId, query),
      consistency: this.enhanceConsistency(entityId),
      provability: this.enhanceProvability(entityId),
      utility: this.enhanceUtility(entityId)
    };

    const kespiScore = (scores.originality + scores.relevance + scores.consistency + scores.provability + scores.utility) / 5;
    scores.kespi = Math.round(kespiScore * 100) / 100;

    // 保存评分
    this.store.saveKespiScore(entityId, scores);

    return scores;
  }

  /**
   * 批量增强所有实体
   */
  async enhanceAll() {
    const entities = this.store.getEntities();
    const results = [];

    for (const entity of entities) {
      const scores = await this.enhance(entity.id);
      results.push({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        scores,
        kespi: scores.kespi
      });
    }

    return results;
  }

  /**
   * 生成增强报告
   */
  generateReport(results) {
    const report = {
      total: results.length,
      passed: results.filter(r => r.kespi >= 0.75).length,
      failed: results.filter(r => r.kespi < 0.75).length,
      averageKespi: results.reduce((sum, r) => sum + r.kespi, 0) / results.length,
      breakdown: {
        originality: results.reduce((sum, r) => sum + r.scores.originality, 0) / results.length,
        relevance: results.reduce((sum, r) => sum + r.scores.relevance, 0) / results.length,
        consistency: results.reduce((sum, r) => sum + r.scores.consistency, 0) / results.length,
        provability: results.reduce((sum, r) => sum + r.scores.provability, 0) / results.length,
        utility: results.reduce((sum, r) => sum + r.scores.utility, 0) / results.length
      }
    };

    return report;
  }
}

// 主逻辑
async function main() {
  const args = process.argv.slice(2);
  const baseDir = args.includes('--base-dir') ? args[args.indexOf('--base-dir') + 1] : '.';
  const all = args.includes('--all');

  const store = new KnowledgeStore(path.join(baseDir, 'knowledge.db'));
  await store.init();
  const enhancer = new KESPIEnhancer(store);

  if (all) {
    console.log('🌸 执行批量 KESPI 增强...\n');
    const results = await enhancer.enhanceAll();
    const report = enhancer.generateReport(results);

    console.log('📊 增强报告:');
    console.log(`   总实体数: ${report.total}`);
    console.log(`   通过数: ${report.passed}`);
    console.log(`   失败数: ${report.failed}`);
    console.log(`   平均 KESPI: ${report.averageKespi.toFixed(2)}`);
    console.log(`\n维度平均: `);
    console.log(`   originality: ${report.breakdown.originality.toFixed(2)}`);
    console.log(`   relevance: ${report.breakdown.relevance.toFixed(2)}`);
    console.log(`   consistency: ${report.breakdown.consistency.toFixed(2)}`);
    console.log(`   provability: ${report.breakdown.provability.toFixed(2)}`);
    console.log(`   utility: ${report.breakdown.utility.toFixed(2)}`);

    store.close();
  } else {
    console.log('用法:');
    console.log('  node kespi-enhance.js --base-dir . --all  # 批量增强');
    console.log('  node kespi-enhance.js <entity-id>         # 增强单个实体');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = KESPIEnhancer;
