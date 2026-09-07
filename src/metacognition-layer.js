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
  adjustmentsLog: path.join(__dirname, '..', 'logs', 'metacognition', 'adjustments.log')
};

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
   * 监控当前状态，生成自我评估报告
   */
  selfCheck() {
    console.log('\n🧠 第一层：自我认知\n');
    
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
   * 运行完整元认知循环
   */
  async run(output) {
    console.log('🧠 元认知三层模型启动\n');
    
    // 第一层：自我认知
    const selfCheck = this.selfCheck();
    
    // 第二层：批判认知
    const evaluation = this.evaluate(output);
    
    // 第三层：元认知
    const adjustments = this.adjust(evaluation);
    
    // 更新统计
    this.selfState.stats.totalTasks++;
    if (evaluation.overall >= 0.7) {
      this.selfState.stats.successTasks++;
    }
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
    layer.selfCheck();
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