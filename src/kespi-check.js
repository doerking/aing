#!/usr/bin/env node
/**
 * kespi-check.js — KESPI 八维质量评估引擎
 * 
 * 八维全部遵循"越高越好"原则：
 *   1.0 = 完美, 0.0 = 最差
 * 
 * 维度说明：
 *   KQ 质量：confidence、逻辑一致性
 *   KG 生长：周环比增长率（时效性）
 *   KA 资产化：移植就绪度（标签、来源、元数据）
 *   KM 代谢：最近检查时间（活跃度）
 *   KD 密度：链接完整度（非孤儿率）—— 修复：已反转
 *   KC 检索：向量索引命中率
 *   KR 回答：内容完整度
 *   KB 阻断：安全事件（无事件=高）—— 修复：已反转
 * 
 * 修复记录：
 *   v2: 修复 KD/KB 反转问题。原实现 KD/KB 越高=越差，
 *       与其他6维方向相反，导致综合分被拖低。
 *       现统一为"越高越好"。
 */

const KnowledgeStore = require('./knowledge-store');
const config = require('./growth.config');

class KespiChecker {
  constructor() {
    this.store = new KnowledgeStore();
  }

  async init() {
    await this.store.init();
  }

  /**
   * 计算单个实体的八维分数
   * 所有维度统一为: 1.0 = 最好, 0.0 = 最差
   */
  calculateEntity(entity) {
    const dimensions = [
      { id: 'KQ', score: this._calcKQ(entity) },
      { id: 'KG', score: this._calcKG(entity) },
      { id: 'KA', score: this._calcKA(entity) },
      { id: 'KM', score: this._calcKM(entity) },
      { id: 'KD', score: this._calcKD(entity) },
      { id: 'KC', score: this._calcKC(entity) },
      { id: 'KR', score: this._calcKR(entity) },
      { id: 'KB', score: this._calcKB(entity) }
    ];

    // 加权综合分
    const overall = dimensions.reduce((sum, d) => {
      return sum + d.score * config.kespi.weights[d.id];
    }, 0);

    return {
      entity_id: entity.id,
      name: entity.name,
      overall: Math.round(overall * 100) / 100,
      dimensions: dimensions.reduce((obj, d) => {
        obj[d.id] = Math.round(d.score * 100) / 100;
        return obj;
      }, {})
    };
  }

  /**
   * KQ — 质量 (Quality)
   * 基于 confidence 和逻辑一致性
   */
  _calcKQ(entity) {
    const confidence = entity.confidence || 0;
    const consistency = entity.consistency || 0;
    return Math.min(1.0, (confidence * 0.6 + consistency * 0.4));
  }

  /**
   * KG — 生长 (Growth)
   * 基于时效性：越近越高
   */
  _calcKG(entity) {
    const now = Date.now();
    const updated = entity.updated_at ? new Date(entity.updated_at).getTime() : now;
    const ageDays = (now - updated) / (1000 * 60 * 60 * 24);
    
    if (ageDays <= 7) return 1.0;
    if (ageDays <= 30) return 0.8;
    if (ageDays <= 90) return 0.6;
    if (ageDays <= 180) return 0.4;
    return 0.2;
  }

  /**
   * KA — 资产化 (Asset Readiness)
   * 基于标签、来源、元数据完整度
   */
  _calcKA(entity) {
    let score = 0.0;
    
    // 有标签 +0.3
    try {
      const tags = JSON.parse(entity.tags || '[]');
      if (tags.length > 0) score += 0.3;
    } catch (e) {}
    
    // 有来源 +0.3
    if (entity.source_file) score += 0.3;
    
    // 有元数据 +0.2
    if (entity.originality > 0 || entity.relevance > 0) score += 0.2;
    
    // 有内容 +0.2
    if (entity.content && entity.content.length > 50) score += 0.2;
    
    return Math.min(1.0, score);
  }

  /**
   * KM — 代谢 (Metabolism)
   * 基于最近检查时间
   */
  _calcKM(entity) {
    const now = Date.now();
    const lastChecked = entity.last_checked_at 
      ? new Date(entity.last_checked_at).getTime() 
      : now;
    const ageHours = (now - lastChecked) / (1000 * 60 * 60);
    
    if (ageHours <= 24) return 1.0;
    if (ageHours <= 72) return 0.8;
    if (ageHours <= 168) return 0.6;
    if (ageHours <= 336) return 0.4;
    return 0.2;
  }

  /**
   * KD — 密度 (Density)
   * 基于链接完整度
   * 
   * 【修复】原实现反转：孤儿=1.0, 健康=0.0
   * 现修正为：孤儿=0.0, 健康=1.0
   */
  _calcKD(entity) {
    const linkCount = this.store.all(
      'SELECT COUNT(*) as cnt FROM links WHERE source_id = ? OR target_id = ?',
      [entity.id, entity.id]
    )[0]?.cnt || 0;
    
    // 越高越好：无链接=0.0, 1-2=0.4, 3-4=0.7, >=5=1.0
    if (linkCount >= 5) return 1.0;
    if (linkCount >= 3) return 0.7;
    if (linkCount >= 1) return 0.4;
    return 0.0;
  }

  /**
   * KC — 检索 (Cache Hit)
   * 基于向量索引存在性
   */
  _calcKC(entity) {
    const embedding = this.store.get(
      'SELECT embedding FROM entity_embeddings WHERE entity_id = ?',
      [entity.id]
    );
    return embedding ? 1.0 : 0.0;
  }

  /**
   * KR — 回答 (Response Accuracy)
   * 基于内容完整度
   */
  _calcKR(entity) {
    const content = entity.content || '';
    const len = content.length;
    
    if (len >= 1000) return 1.0;
    if (len >= 500) return 0.8;
    if (len >= 200) return 0.6;
    if (len >= 50) return 0.4;
    return 0.2;
  }

  /**
   * KB — 阻断 (Blocker)
   * 基于安全事件数
   * 
   * 【修复】原实现反转：多错误=1.0, 无错误=0.0
   * 现修正为：无错误=1.0, 多错误=0.0
   */
  _calcKB(entity) {
    const errorCount = this.store.all(
      'SELECT COUNT(*) as cnt FROM error_log WHERE entity_id = ? AND status = ?',
      [entity.id, 'pending']
    )[0]?.cnt || 0;
    
    // 越高越好：无错误=1.0, 1=0.7, 2=0.4, >=3=0.0
    if (errorCount === 0) return 1.0;
    if (errorCount === 1) return 0.7;
    if (errorCount === 2) return 0.4;
    return 0.0;
  }

  /**
   * 检查维度阈值（统一逻辑：低于红灯=严重，低于黄灯=警告）
   * 
   * 所有维度统一为"越高越好"：
   *   score >= yellow → 🟢 正常
   *   red <= score < yellow → 🟡 警告
   *   score < red → 🔴 严重
   */
  checkDimensionThresholds(result) {
    const alerts = [];
    
    for (const dim of Object.keys(result.dimensions)) {
      const score = result.dimensions[dim];
      const threshold = config.kespi.dimensions[dim];
      
      if (!threshold) continue;
      
      // 统一逻辑：分数低于红灯阈值 = 严重
      if (score < threshold.red) {
        alerts.push({
          dimension: dim,
          level: 'red',
          score,
          threshold: threshold.red,
          action: threshold.action,
          message: `${dim} 分数 ${score.toFixed(2)} 低于红灯阈值 ${threshold.red}`
        });
      }
      // 分数低于黄灯阈值 = 警告
      else if (score < threshold.yellow) {
        alerts.push({
          dimension: dim,
          level: 'yellow',
          score,
          threshold: threshold.yellow,
          action: threshold.action,
          message: `${dim} 分数 ${score.toFixed(2)} 低于黄灯阈值 ${threshold.yellow}`
        });
      }
    }
    
    return alerts;
  }

  /**
   * 评估所有实体
   */
  async evaluateAll() {
    const entities = this.store.getEntities({ status: 'active' });
    const results = [];
    
    console.log(`\n🔍 KESPI 八维质量评估 (${entities.length} 个实体)\n`);
    
    for (const entity of entities) {
      const result = this.calculateEntity(entity);
      results.push(result);
      
      // 保存到数据库
      this.store.run(
        'INSERT INTO kespi_history (entity_id, overall_score, dimension_scores) VALUES (?, ?, ?)',
        [result.entity_id, result.overall, JSON.stringify(result.dimensions)]
      );
      
      // 更新 entity_metadata 的 kespi_score
      this.store.run(
        'UPDATE entity_metadata SET kespi_score = ?, last_checked_at = datetime(\'now\') WHERE entity_id = ?',
        [result.overall, result.entity_id]
      );
    }
    
    return results;
  }

  /**
   * 打印评估报告
   */
  printReport(results) {
    console.log('='.repeat(80));
    console.log('📊 KESPI 八维评估报告');
    console.log('='.repeat(80));
    console.log();
    
    // 表头
    console.log('实体名称        综合   KQ    KG    KA    KM    KD    KC    KR    KB  ');
    console.log('-'.repeat(80));
    
    for (const r of results) {
      const name = (r.name || r.entity_id).substring(15).padEnd(15);
      const overall = r.overall.toFixed(2);
      const dims = ['KQ', 'KG', 'KA', 'KM', 'KD', 'KC', 'KR', 'KB']
        .map(d => {
          const score = r.dimensions[d];
          // 信号灯
          if (score >= 0.80) return `\x1b[32m${score.toFixed(2)}\x1b[0m`;  // 绿
          if (score >= 0.65) return `\x1b[33m${score.toFixed(2)}\x1b[0m`;  // 黄
          return `\x1b[31m${score.toFixed(2)}\x1b[0m`;  // 红
        })
        .join(' ');
      
      const light = r.overall >= 0.80 ? '🟢' : r.overall >= 0.65 ? '🟡' : '🔴';
      console.log(`${name} ${overall}  ${dims} ${light}`);
    }
    
    console.log('-'.repeat(80));
    
    // 统计
    const totalOverall = results.reduce((sum, r) => sum + r.overall, 0);
    const avgOverall = results.length > 0 ? totalOverall / results.length : 0;
    const passed = results.filter(r => r.overall >= 0.65).length;
    
    // 各维度通过率
    console.log('\n📈 各维度通过率 (≥0.65):');
    for (const d of ['KQ', 'KG', 'KA', 'KM', 'KD', 'KC', 'KR', 'KB']) {
      const passCount = results.filter(r => r.dimensions[d] >= 0.65).length;
      const rate = results.length > 0 ? Math.round(passCount / results.length * 100) : 0;
      const bar = '█'.repeat(Math.round(rate / 5)) + '░'.repeat(20 - Math.round(rate / 5));
      console.log(`  ${d}: ${bar} ${passCount}/${results.length} (${rate}%)`);
    }
    
    console.log(`\n📊 综合平均: ${avgOverall.toFixed(2)}`);
    console.log(`✅ 通过: ${passed}/${results.length} (${Math.round(passed / results.length * 100)}%)`);
    console.log(`阈值: 🟢 ≥0.80  🟡 ≥0.65  🔴 <0.65`);
  }

  /**
   * 主函数
   */
  async run() {
    await this.init();
    const results = await this.evaluateAll();
    this.printReport(results);
    
    // 检查告警
    let allAlerts = [];
    for (const r of results) {
      const alerts = this.checkDimensionThresholds(r);
      allAlerts = allAlerts.concat(alerts);
    }
    
    if (allAlerts.length > 0) {
      console.log('\n⚠️ 告警:');
      allAlerts.forEach(a => {
        console.log(`  [${a.level.toUpperCase()}] ${a.message} → ${a.action}`);
      });
    }
    
    return results;
  }
}

// CLI 入口
if (require.main === module) {
  const checker = new KespiChecker();
  checker.run().catch(err => {
    console.error('❌ KESPI 评估失败:', err.message);
    process.exit(1);
  });
}

module.exports = KespiChecker;
