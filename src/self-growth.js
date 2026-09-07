#!/usr/bin/env node
/**
 * self-growth.js — 自成长核心实现
 * 
 * 整合所有自成长能力：
 * 1. SQL 事务安全
 * 2. KESPI 质量增强
 * 3. 错误处理行动表
 * 4. 向量检索
 * 
 * 使用：
 *   node self-growth.js --base-dir . --action init
 *   node self-growth.js --base-dir . --action enhance --all
 *   node self-growth.js --base-dir . --action search --query "自成长"
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');
const KESPIEnhancer = require('./kespi-enhance');
const { ErrorHandler } = require('./error-handler');
const VectorSearch = require('./vector-search');

class SelfGrowth {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.store = null;
    this.enhancer = null;
    this.errorHandler = null;
    this.vectorSearch = null;
  }

  /**
   * 初始化数据库
   */
  async init() {
    console.log('🚀 初始化自成长系统...\n');
    
    // 初始化存储
    this.store = new KnowledgeStore(path.join(this.baseDir, 'knowledge.db'));
    await this.store.init();

    // 初始化其他组件
    this.enhancer = new KESPIEnhancer(this.store);
    this.errorHandler = new ErrorHandler(this.store);
    this.vectorSearch = new VectorSearch(this.store);
    await this.vectorSearch.init();

    console.log('✅ 自成长系统初始化完成\n');
  }

  /**
   * 执行 KESPI 增强
   */
  async enhanceKespi(all = false, entityId = null) {
    console.log('🌸 执行 KESPI 质量增强...\n');

    let results;
    if (all) {
      results = await this.enhancer.enhanceAll();
    } else if (entityId) {
      // KESPIEnhancer 无 enhanceEntity 方法，用 enhance 并包装成数组以复用报告逻辑
      const ent = this.store.getEntities().find(e => e.id === entityId)
        || { id: entityId, name: entityId, type: 'Concept' };
      const scores = await this.enhancer.enhance(entityId);
      results = [{ id: ent.id, name: ent.name, type: ent.type, scores, kespi: scores.kespi }];
    } else {
      console.log('用法: node self-growth.js --action enhance --all');
      console.log('      node self-growth.js --action enhance --entity <id>');
      return;
    }

    const report = this.enhancer.generateReport(results);
    
    console.log('📊 增强报告:');
    console.log(`   总实体数: ${report.total}`);
    console.log(`   通过数: ${report.passed} (${(report.passed / report.total * 100).toFixed(1)}%)`);
    console.log(`   失败数: ${report.failed}`);
    console.log(`   平均 KESPI: ${report.averageKespi.toFixed(2)}`);
    console.log(`\n维度平均: `);
    console.log(`   originality: ${report.breakdown.originality.toFixed(2)}`);
    console.log(`   relevance: ${report.breakdown.relevance.toFixed(2)}`);
    console.log(`   consistency: ${report.breakdown.consistency.toFixed(2)}`);
    console.log(`   provability: ${report.breakdown.provability.toFixed(2)}`);
    console.log(`   utility: ${report.breakdown.utility.toFixed(2)}`);
  }

  /**
   * 执行向量搜索
   */
  async search(query, limit = 10) {
    console.log(`🔍 搜索: "${query}"\n`);
    
    const results = await this.vectorSearch.semanticSearch(query, limit);
    
    if (results.length === 0) {
      console.log('未找到匹配结果');
      return;
    }

    console.log(`找到 ${results.length} 个结果:\n`);
    for (const result of results) {
      const kespi = result.kespi_score || 0;
      const score = Math.min(1.0, result.score || 0);
      console.log(`[${result.type}] ${result.name}`);
      console.log(`   相关度: ${(score * 100).toFixed(1)}%`);
      console.log(`   KESPI: ${kespi.toFixed(2)}`);
      console.log(`   摘要: ${(result.content || '').substring(0, 100)}...`);
      console.log();
    }
  }

  /**
   * 索引所有实体
   */
  async indexAll() {
    console.log('📚 开始索引所有实体...\n');
    
    const entities = this.store.getEntities();
    let indexed = 0;
    
    for (const entity of entities) {
      await this.vectorSearch.saveEmbedding(entity.id, entity.content);
      indexed++;
    }
    
    console.log(`✅ 已索引 ${indexed} 个实体`);
  }

  /**
   * 查看知识库状态
   */
  async showStats() {
    console.log('📊 知识库统计:\n');
    
    const stats = this.store.getStats();
    console.log(`   实体总数: ${stats.entities}`);
    console.log(`   链接总数: ${stats.links}`);
    console.log(`   平均 KESPI: ${stats.avgKespi.toFixed(2)}`);
    console.log(`   待处理错误: ${stats.pendingErrors}`);
    
    const vectorStatus = this.vectorSearch.getStatus();
    console.log(`\n   向量检索: ${vectorStatus.ready ? '已启用' : '未启用'}`);
    console.log(`   向量维度: ${vectorStatus.dimension}`);
  }

  /**
   * 查看待处理错误
   */
  async showErrors() {
    console.log('⚠️  待处理错误:\n');
    
    const errors = this.store.getPendingErrors(20);
    
    if (errors.length === 0) {
      console.log('无待处理错误');
      return;
    }
    
    for (const error of errors) {
      console.log(`[${error.error_code}] ${error.error_type}: ${error.message}`);
      console.log(`   实体: ${error.entity_id || 'N/A'}`);
      console.log(`   重试: ${error.retries}/${error.max_retries}`);
      console.log();
    }
  }
}

// 主逻辑
const args = process.argv.slice(2);
const baseDir = args.includes('--base-dir') ? args[args.indexOf('--base-dir') + 1] : '.';
const action = args.includes('--action') ? args[args.indexOf('--action') + 1] : null;
const query = args.includes('--query') ? args[args.indexOf('--query') + 1] : null;
const all = args.includes('--all');
const entityId = args.includes('--entity') ? args[args.indexOf('--entity') + 1] : null;

async function main() {
  const growth = new SelfGrowth(baseDir);
  await growth.init();
  
  switch (action) {
    case 'init':
      await growth.showStats();
      break;
    case 'enhance':
      await growth.enhanceKespi(all, entityId);
      break;
    case 'search':
      if (!query) {
        console.log('用法: node self-growth.js --action search --query "关键词"');
        return;
      }
      await growth.search(query);
      break;
    case 'index':
      await growth.indexAll();
      break;
    case 'stats':
      await growth.showStats();
      break;
    case 'errors':
      await growth.showErrors();
      break;
    default:
      console.log('用法:');
      console.log('  node self-growth.js --action init        初始化系统');
      console.log('  node self-growth.js --action enhance --all 增强所有实体');
      console.log('  node self-growth.js --action search --query "关键词" 语义搜索');
      console.log('  node self-growth.js --action index        索引所有实体');
      console.log('  node self-growth.js --action stats        查看统计');
      console.log('  node self-growth.js --action errors       查看错误');
  }
  
  growth.store.close();
}

main().catch(console.error);
