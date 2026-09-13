#!/usr/bin/env node
/**
 * metacognition-layer.js — 元认知三层模型
 * 
 * 功能：
 * 1. 自我认知层：监控自身状态
 * 2. 批判认知层：评估输出质量
 * 3. 元认知层：调整策略和参数
 * 
 * 借鉴：conductor 模型 + 意识神经层架构
 * 
 * 使用：
 *   node metacognition-layer.js self-check
 *   node metacognition-layer.js evaluate <output>
 *   node metacognition-layer.js adjust
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  stateDir: path.join(__dirname, '..', 'data', 'metacognition'),
  selfStateFile: path.join(__dirname, '..', 'data', 'metacognition', 'self-state.json'),
  evaluationLog: path.join(__dirname, '..', 'logs', 'metacognition', 'evaluation.log'),
  adjustmentsLog: path.join(__dirname, '..', 'logs', 'metacognition', 'adjustments.log'),
  dbPath: path.join(__dirname, '..', 'knowledge.db'),
  decisionLineageFile: path.join(__dirname, '..', 'logs', 'metabolism-decision-lineage.jsonl'),
};

// M4 自我建模：从真实系统指标计算自我认知参数（替代硬编码默认值）
// sql.js init 是异步的，此处用异步测量
async function measureSelfAwarenessAsync() {
  try {
    const KnowledgeStore = require('./knowledge-store');
    const store = new KnowledgeStore(CONFIG.dbPath);
    await store.init();

    // confidence = 全库平均 KESPI（真实质量感知）
    let avgKespi = 0.7;
    try {
      const row = store.get('SELECT AVG(kespi_score) AS avg FROM entity_metadata');
      if (row && row.avg != null) avgKespi = Number(row.avg);
    } catch (e) { /* 保持默认 */ }

    // knowledgeCoverage = 活跃实体占比（真实覆盖感知）
    let knowledgeCoverage = 0.6;
    try {
      const total = store.get('SELECT COUNT(*) AS n FROM entities');
      const active = store.get("SELECT COUNT(*) AS n FROM entities WHERE status = 'active'");
      if (total && total.n > 0 && active) {
        knowledgeCoverage = Math.min(1, active.n / total.n);
      }
    } catch (e) { /* 保持默认 */ }

    // errorRate = 代谢失败率（从 metabolism_log 读真实失败率）
    let errorRate = 0.05;
    try {
      const total = store.get('SELECT COUNT(*) AS n FROM metabolism_log');
      const failed = store.get("SELECT COUNT(*) AS n FROM metabolism_log WHERE status = 'failed'");
      if (total && total.n > 0 && failed) {
        errorRate = Math.min(1, failed.n / total.n);
      }
    } catch (e) { /* metabolism_log 表不存在时用默认值 */ }

    // responseTime = 最近 7 天代谢平均耗时（真实响应感知）
    let responseTime = 1.2;
    try {
      const row = store.get("SELECT AVG(duration_ms) AS avg FROM metabolism_log WHERE created_at >= datetime('now', '-7 days')");
      if (row && row.avg != null && row.avg > 0) {
        responseTime = Number(row.avg) / 1000; // ms → s
      }
    } catch (e) { /* 表不存在时用默认值 */ }

    // 真实任务统计：代谢日志步数
    try {
      const totalSteps = store.get('SELECT COUNT(*) AS n FROM metabolism_log');
      if (totalSteps && totalSteps.n > 0) {
        // 更新运行统计（真实值）
        const successSteps = store.get("SELECT COUNT(*) AS n FROM metabolism_log WHERE status = 'success'");
        return {
          selfAwareness: { confidence: avgKespi, knowledgeCoverage, errorRate, responseTime },
          stats: { totalTasks: totalSteps.n, successTasks: successSteps ? successSteps.n : 0 },
        };
      }
    } catch (e) { /* 保持默认 */ }

    try { store.close(); } catch (e) {}
    return {
      selfAwareness: { confidence: avgKespi, knowledgeCoverage, errorRate, responseTime },
      stats: null,
    };
  } catch (e) {
    // 知识库不可用时降级到默认值
    return { selfAwareness: null, stats: null };
  }
}

/**
 * 元认知三层模型
 */
class MetacognitionLayer {
  constructor() {
    this.selfState = this.loadSelfState();
    this.evaluationHistory = [];
    this.adjustmentHistory = [];
  }

  /**
   * 加载自身状态
   */
  loadSelfState() {
    if (fs.existsSync(CONFIG.selfStateFile)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG.selfStateFile, 'utf8'));
      } catch (e) {
        return this.defaultSelfState();
      }
    }
    return this.defaultSelfState();
  }

  /**
   * 默认自身状态
   */
  defaultSelfState() {
    return {
      // 自我认知
      selfAwareness: {
        confidence: 0.7,
        knowledgeCoverage: 0.6,
        errorRate: 0.05,
        responseTime: 1.2 // 秒
      },
      
      // 运行参数
      parameters: {
        kespiThreshold: 0.80,
        maxRetries: 3,
        timeoutMs: 30000,
        temperature: 0.7
      },
      
      // 状态追踪
      stats: {
        totalTasks: 0,
        successTasks: 0,
        avgResponseTime: 0,
        lastUpdate: new Date().toISOString()
      }
    };
  }

  /**
   * 保存自身状态
   */
  saveSelfState() {
    fs.mkdirSync(path.dirname(CONFIG.selfStateFile), { recursive: true });
    fs.writeFileSync(CONFIG.selfStateFile, JSON.stringify(this.selfState, null, 2), 'utf8');
  }

  /**
   * 第一层：自我认知
   * M4 自我建模：从真实系统指标更新自我评估（替代硬编码默认值）
   */
  async selfCheck() {
    console.log('\n🧠 第一层：自我认知（M4: 真实指标驱动）\n');
    
    // M4: 从真实系统指标测量自我认知（异步读 DB）
    const measured = await measureSelfAwarenessAsync();
    if (measured.selfAwareness) {
      this.selfState.selfAwareness = {
        ...measured.selfAwareness,
        measured: true, // 标记：这是真实测量值，不是硬编码
        measuredAt: new Date().toISOString(),
      };
      if (measured.stats) {
        this.selfState.stats = {
          ...this.selfState.stats,
          totalTasks: measured.stats.totalTasks,
          successTasks: measured.stats.successTasks,
        };
      }
      this.saveSelfState();
    } else {
      this.selfState.selfAwareness.measured = false;
    }
    
    const awareness = this.selfState.selfAwareness;
    const params = this.selfState.parameters;
    const stats = this.selfState.stats;
    
    console.log('  📊 状态评估:');
    console.log(`     自信度: ${(awareness.confidence * 100).toFixed(0)}%`);
    console.log(`     知识覆盖: ${(awareness.knowledgeCoverage * 100).toFixed(0)}%`);
    console.log(`     错误率: ${(awareness.errorRate * 100).toFixed(1)}%`);
    console.log(`     响应时间: ${awareness.responseTime.toFixed(2)}s`);
    
    console.log('\n  ⚙️  当前参数:');
    console.log(`     KESPI 阈值: ${params.kespiThreshold}`);
    console.log(`     最大重试: ${params.maxRetries}`);
    console.log(`     超时: ${params.timeoutMs}ms`);
    console.log(`     温度: ${params.temperature}`);
    
    console.log('\n  📈 运行统计:');
    console.log(`     总任务: ${stats.totalTasks}`);
    console.log(`     成功: ${stats.successTasks}`);
    console.log(`     成功率: ${stats.totalTasks > 0 ? (stats.successTasks / stats.totalTasks * 100).toFixed(1) : 0}%`);
    
    // 健康检查
    const issues = [];
    if (awareness.confidence < 0.5) issues.push('自信度过低');
    if (awareness.errorRate > 0.1) issues.push('错误率过高');
    if (awareness.responseTime > 3) issues.push('响应时间过长');
    
    if (issues.length > 0) {
      console.log('\n  ⚠️  异常检测:');
      issues.forEach(i => console.log(`     - ${i}`));
    } else {
      console.log('\n  ✅ 状态正常');
    }
    
    return {
      awareness,
      params,
      issues
    };
  }

  /**
   * 第二层：批判认知
   * 评估输出质量，识别问题
   */
  evaluate(output, criteria = {}) {
    console.log('\n🔍 第二层：批判认知\n');
    
    const evaluation = {
      timestamp: new Date().toISOString(),
      criteria: {
        accuracy: criteria.accuracy ?? this.assessAccuracy(output),
        completeness: criteria.completeness ?? this.assessCompleteness(output),
        coherence: criteria.coherence ?? this.assessCoherence(output),
        novelty: criteria.novelty ?? this.assessNovelty(output),
        practicality: criteria.practicality ?? this.assessPracticality(output)
      }
    };
    
    // 计算综合评分
    const scores = Object.values(evaluation.criteria);
    evaluation.overall = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    // 识别问题
    evaluation.issues = [];
    if (evaluation.criteria.accuracy < 0.7) evaluation.issues.push('准确性不足');
    if (evaluation.criteria.completeness < 0.6) evaluation.issues.push('完整性不足');
    if (evaluation.criteria.coherence < 0.65) evaluation.issues.push('连贯性不足');
    if (evaluation.criteria.novelty < 0.5) evaluation.issues.push('创新性不足');
    
    console.log('  📊 质量评估:');
    Object.entries(evaluation.criteria).forEach(([key, score]) => {
      console.log(`     ${key}: ${(score * 100).toFixed(0)}%`);
    });
    console.log(`\n  综合评分: ${(evaluation.overall * 100).toFixed(0)}%`);
    
    if (evaluation.issues.length > 0) {
      console.log('\n  ⚠️  问题:');
      evaluation.issues.forEach(i => console.log(`     - ${i}`));
    }
    
    // 保存评估记录
    this.evaluationHistory.push(evaluation);
    this.saveEvaluationLog(evaluation);
    
    return evaluation;
  }

  /**
   * 评估准确性
   */
  assessAccuracy(output) {
    // 简化：检查是否有明显错误标志
    const errorPatterns = ['错误', '不对', '不正确', '事实错误'];
    const hasError = errorPatterns.some(p => output.includes(p));
    return hasError ? 0.5 : 0.8;
  }

  /**
   * 评估完整性
   */
  assessCompleteness(output) {
    const length = output.length;
    if (length < 100) return 0.3;
    if (length < 500) return 0.6;
    return 0.8;
  }

  /**
   * 评估连贯性
   */
  assessCoherence(output) {
    const sentences = output.split(/[。！？]/).filter(s => s.trim());
    if (sentences.length < 3) return 0.5;
    return 0.8;
  }

  /**
   * 评估创新性
   */
  assessNovelty(output) {
    // 简化：检查是否有重复模式
    const words = output.split(/\s+/);
    const uniqueWords = new Set(words);
    const uniqueness = uniqueWords.size / words.length;
    return Math.min(1.0, uniqueness + 0.3);
  }

  /**
   * 评估实用性
   */
  assessPracticality(output) {
    const practicalPatterns = ['步骤', '方法', '示例', '代码', '实现', '配置'];
    const hasPractical = practicalPatterns.some(p => output.includes(p));
    return hasPractical ? 0.8 : 0.5;
  }

  /**
   * 第三层：元认知
   * 根据评估结果调整策略和参数
   */
  adjust(evaluation) {
    console.log('\n🎯 第三层：元认知\n');
    
    const adjustments = [];
    const params = this.selfState.parameters;
    
    // 基于评估结果调整
    if (evaluation.criteria.accuracy < 0.7) {
      params.temperature = Math.max(0.1, params.temperature - 0.1);
      adjustments.push('降低温度以提高准确性');
    }
    
    if (evaluation.criteria.completeness < 0.6) {
      params.maxRetries = Math.min(5, params.maxRetries + 1);
      adjustments.push('增加重试次数以提高完整性');
    }
    
    if (evaluation.criteria.novelty < 0.5) {
      params.temperature = Math.min(1.0, params.temperature + 0.1);
      adjustments.push('提高温度以增强创新性');
    }
    
    if (evaluation.overall < 0.6) {
      params.kespiThreshold = Math.max(0.6, params.kespiThreshold - 0.05);
      adjustments.push('降低 KESPI 门槛以允许更多输出');
    }
    
    // 保存调整
    this.adjustmentHistory.push({
      timestamp: new Date().toISOString(),
      evaluation: evaluation.overall,
      adjustments
    });
    this.saveAdjustmentLog();
    
    if (adjustments.length > 0) {
      console.log('  🔧 策略调整:');
      adjustments.forEach(a => console.log(`     - ${a}`));
    } else {
      console.log('  ✅ 无需调整');
    }
    
    this.saveSelfState();
    
    return {
      adjustments,
      currentParams: params
    };
  }

  /**
   * 保存评估日志
   */
  saveEvaluationLog(evaluation) {
    const logDir = path.dirname(CONFIG.evaluationLog);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(CONFIG.evaluationLog, JSON.stringify(evaluation) + '\n', 'utf8');
  }

  /**
   * 保存调整日志
   */
  saveAdjustmentLog() {
    const logDir = path.dirname(CONFIG.adjustmentsLog);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(CONFIG.adjustmentsLog, JSON.stringify(this.adjustmentHistory.slice(-1)[0]) + '\n', 'utf8');
  }

  /**
   * 意识反应审查：由 consciousness-kernel.processReactions() 调用
   *
   * 审查 kernel 产出的 reactions，返回通道健康度、调整建议和告警。
   * kernel 消费 channelHealth 更新 state.channelWeights 并递增 attentionRevision。
   * briefing 消费 alerts 向 agent 仪表台展示意识层告警。
   *
   * @param {Array} reactions - kernel.integrate() 产出的反应数组
   * @param {Object} context - 上下文（accepted/suppressed/stagnationCount 等）
   * @returns {{ channelHealth: Object, adjustments: Array, alerts: Array, reviewed: boolean, reactionCount: number }}
   */
  reviewConsciousness(reactions, context = {}) {
    const alerts = [];
    const channelHealth = {};
    const adjustments = [];

    if (!Array.isArray(reactions) || reactions.length === 0) {
      return { channelHealth, adjustments, alerts, reviewed: true, reactionCount: 0 };
    }

    // 1. 通道健康度：按通道聚合注意力均值，高注意力通道加权、低注意力通道降权
    const channelScores = {};
    const channelCounts = {};
    for (const r of reactions) {
      for (const ch of (r.channels || [])) {
        if (!channelScores[ch]) { channelScores[ch] = 0; channelCounts[ch] = 0; }
        channelScores[ch] += r.attention || 0;
        channelCounts[ch] += 1;
      }
    }
    for (const ch of Object.keys(channelScores)) {
      const avg = channelScores[ch] / channelCounts[ch];
      channelHealth[ch] = Math.max(0.1, Math.min(1.0, avg));
    }

    // 2. 告警检测
    const aroused = reactions.filter(r => r.arousal === 'aroused');
    if (aroused.length >= 3) {
      alerts.push({
        type: 'consciousness-aroused',
        severity: 0.8,
        message: `${aroused.length} 个高唤醒意识事件同时活跃`,
        targets: aroused.map(r => r.target).slice(0, 5),
      });
    }

    const lowConfidence = reactions.filter(r => (r.confidence || 1) < 0.5);
    if (lowConfidence.length > 0) {
      alerts.push({
        type: 'consciousness-low-confidence',
        severity: 0.6,
        message: `${lowConfidence.length} 个反应置信度过低（<0.5），可能需要补充证据`,
        targets: lowConfidence.map(r => r.target).slice(0, 5),
      });
    }

    // 3. 调整建议
    const stagnationCount = Number(context.stagnationCount || 0);
    if (stagnationCount > 0) {
      adjustments.push({
        type: 'stagnation-detected',
        suggestion: `连续 ${stagnationCount} 次空产出，建议降低 KESPI 阈值或扩大检索范围`,
      });
    }

    const highAttention = reactions.filter(r => (r.attention || 0) >= 0.8);
    if (highAttention.length > 0) {
      adjustments.push({
        type: 'high-attention',
        suggestion: `${highAttention.length} 个高注意力目标需要优先处理`,
        targets: highAttention.map(r => r.target).slice(0, 3),
      });
    }

    // 4. 更新时间戳（不递增 totalTasks——M4 自我建模后 stats 来自真实代谢日志，
    //    此处只更新 lastUpdate，避免覆盖异步 selfCheck 写入的真实统计）
    this.selfState.stats.lastUpdate = new Date().toISOString();
    this.saveSelfState();

    return {
      channelHealth,
      adjustments,
      alerts,
      reviewed: true,
      reactionCount: reactions.length,
    };
  }

  /**
   * 运行完整元认知循环
   */
  async run(output) {
    console.log('🧠 元认知三层模型启动\n');
    
    // 第一层：自我认知（M4: 异步测量真实指标）
    const selfCheck = await this.selfCheck();
    
    // 第二层：批判认知
    const evaluation = this.evaluate(output);
    
    // 第三层：元认知
    const adjustments = this.adjust(evaluation);
    
    // 更新时间戳（M4: stats 来自真实代谢日志，此处不递增 totalTasks/successTasks）
    this.selfState.stats.lastUpdate = new Date().toISOString();
    this.saveSelfState();
    
    return {
      selfCheck,
      evaluation,
      adjustments
    };
  }
}

// CLI（仅直接运行时执行，require 本模块不触发）
if (require.main !== module) {
  module.exports = MetacognitionLayer;
} else {
const args = process.argv.slice(2);
const action = args[0];
const layer = new MetacognitionLayer();

switch (action) {
  case 'self-check':
    layer.selfCheck().then(() => {}).catch(() => {});
    break;
  case 'evaluate':
    const output = args.slice(1).join(' ');
    layer.evaluate(output);
    break;
  case 'adjust':
    const evalFile = args[1];
    if (evalFile) {
      let evaluation;
      try {
        evaluation = JSON.parse(fs.readFileSync(evalFile, 'utf8'));
      } catch (err) {
        console.error(`❌ 评估文件读取/解析失败: ${err.message}`);
        process.exit(1);
      }
      layer.adjust(evaluation);
    } else {
      console.log('请提供评估文件路径');
    }
    break;
  case 'run':
    const fullOutput = args.slice(1).join(' ') || '这是一段测试输出内容，用于演示元认知三层模型的完整循环。';
    layer.run(fullOutput).then(result => {
      console.log('\n完整元认知循环结果:', JSON.stringify(result, null, 2));
    }).catch(err => {
      console.error('❌ 元认知循环失败:', err.message);
      process.exit(1);
    });
    break;
  default:
    console.log('用法:');
    console.log('  node metacognition-layer.js self-check   # 自我认知检查');
    console.log('  node metacognition-layer.js evaluate <output>  # 批判认知评估');
    console.log('  node metacognition-layer.js adjust <file>    # 元认知调整');
    console.log('  node metacognition-layer.js run <text>       # 完整循环');
}
}