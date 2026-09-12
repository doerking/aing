#!/usr/bin/env node
/**
 * growth-director.js — 生长决策器（前额叶决策）
 * 
 * 职责：综合感知信号 + 代谢评估，决定下一步动作
 * 
 * 输入：
 *   - 感知信号：文件变化、KESPI 下降、知识缺口、停滞天数、时间触发
 *   - 代谢评估：healthy / expanding / stable / stagnant / over_pruned / mass_decline
 * 
 * 输出：9 种动作之一
 *   - emergency_fix    : KESPI 骤降 + 紧急度 critical
 *   - full_metabolism  : 连续 3 次停滞
 *   - targeted_pollinate: 高优先级知识缺口
 *   - compile          : 检测到新文件变化
 *   - boost_growth     : 代谢评估为停滞
 *   - pollinate        : 普通知识缺口
 *   - maintain         : 连续 3 次健康
 *   - scheduled_metabolism: 时间节律触发
 *   - observe          : 无显著信号
 */

const fs = require('fs');
const path = require('path');

// 支持 --base-dir 参数覆盖默认路径
function resolvePath(segment) {
  const args = process.argv;
  const baseDirIndex = args.indexOf('--base-dir');
  if (baseDirIndex !== -1 && baseDirIndex + 1 < args.length) {
    return path.join(args[baseDirIndex + 1], ...segment.split('/'));
  }
  return path.join(__dirname, '..', ...segment.split('/'));
}

const DB_PATH = resolvePath('knowledge.db');

// 决策动作定义（数字越小优先级越高）
const ACTIONS = {
  emergency_fix:       { priority: 0, label: '🚨 紧急修复', desc: 'KESPI 骤降，立即修复' },
  full_metabolism:     { priority: 0, label: '🔄 完整代谢', desc: '连续停滞，全流程执行' },
  targeted_pollinate:  { priority: 1, label: '🎯 定向授粉', desc: '高优缺口，精准补充' },
  compile:             { priority: 1, label: '💻 编译', desc: '新文件变化，需要编译' },
  boost_growth:        { priority: 2, label: '🚀 促进生长', desc: '停滞状态，加速生长' },
  pollinate:           { priority: 2, label: '🌸 常规授粉', desc: '普通缺口，常规授粉' },
  maintain:            { priority: 3, label: '✅ 维持', desc: '系统健康，无需操作' },
  scheduled_metabolism:{ priority: 3, label: '⏰ 定时代谢', desc: '时间节律触发' },
  observe:             { priority: 4, label: '👁️ 观察', desc: '无显著信号' }
};

class GrowthDirector {
  /**
   * 构造函数
   */
  constructor(dbPath) {
    this.dbPath = dbPath || DB_PATH;
    this.signals = {};
    this.decisionHistory = [];
    this.consecutiveStagnant = 0;
    this.consecutiveHealthy = 0;
    this.lastDecision = null;
    this.lastDecisionTime = null;
    
    // P2 #006: 集成元认知层
    try {
      const MetacognitionLayer = require('./metacognition-layer');
      this.metacognition = new MetacognitionLayer({
        stateDir: path.join(path.dirname(this.dbPath), 'data', 'metacognition')
      });
    } catch (e) {
      console.log('⚠ 元认知层加载失败，跳过集成 / Metacognition layer failed:', e.message);
      this.metacognition = null;
    }
  }

  /**
   * 获取知识库连接
   */
  async _getStore() {
    const KnowledgeStore = require('./knowledge-store');
    const store = new KnowledgeStore(this.dbPath);
    await store.init();
    return store;
  }

  /**
   * 计算 KESPI 趋势
   */
  _calcKespiTrend(store) {
    try {
      const history = store.getAllLatestKespi();
      if (history.length < 2) return null;
      
      const sorted = history.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const recent = sorted.slice(-5);
      const prevAvg = recent[0] ? recent[0].overall_score : 0;
      const currAvg = recent[recent.length - 1].overall_score;
      
      return {
        decline: prevAvg - currAvg,
        trend: prevAvg > currAvg ? 'declining' : 'improving',
        recentScores: recent.map(r => r.overall_score)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 统计文件变化
   */
  _countFileChanges(store) {
    try {
      const rawDir = resolvePath('raw');
      if (!fs.existsSync(rawDir)) return 0;
      
      const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.md'));
      return rawFiles.length;
    } catch (e) {
      return 0;
    }
  }

  /**
   * 检测知识缺口
   */
  _countKnowledgeGaps(store) {
    try {
      const gaps = store.all(`
        SELECT COUNT(*) as cnt FROM entities e
        LEFT JOIN links l ON e.id = l.source_id OR e.id = l.target_id
        WHERE l.source_id IS NULL
      `)[0];
      
      return { highPriority: Math.max(0, (gaps?.cnt || 0) - 5), normal: gaps?.cnt || 0 };
    } catch (e) {
      return { highPriority: 0, normal: 0 };
    }
  }

  /**
   * 获取停滞天数
   */
  _getStagnantDays(store) {
    try {
      const lastRun = store.get('SELECT MAX(created_at) as last_run FROM metabolism_log')[0];
      if (!lastRun?.last_run) return 7; // 无记录则假设为 7 天
      
      const lastDate = new Date(lastRun.last_run);
      const now = new Date();
      const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      
      return diffDays;
    } catch (e) {
      return 0;
    }
  }

  /**
   * 检查时间触发
   */
  _checkTimeTrigger() {
    const hour = new Date().getHours();
    // 每天 6:00 和 18:00 触发代谢
    return hour === 6 || hour === 18;
  }

  /**
   * 评估代谢状态
   */
  _evaluateMetabolism(store) {
    try {
      const stats = store.getStats();
      const avgKespi = stats.avgKespi;
      
      if (avgKespi >= 0.80) return 'healthy';
      if (avgKespi >= 0.65) return 'stable';
      return 'stagnant';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * 获取实体统计
   */
  _getEntityStats(store) {
    try {
      const count = store.get('SELECT COUNT(*) as cnt FROM entities')[0];
      return { total: count?.cnt || 0 };
    } catch (e) {
      return { total: 0 };
    }
  }

  /**
   * 感知阶段：收集所有信号
   */
  async perceive() {
    const store = await this._getStore();
    this.signals = {
      kespiTrend: this._calcKespiTrend(store),
      fileChanges: this._countFileChanges(store),
      knowledgeGaps: this._countKnowledgeGaps(store),
      stagnantDays: this._getStagnantDays(store),
      timeTrigger: this._checkTimeTrigger(),
      metabolismStatus: this._evaluateMetabolism(store),
      entityStats: this._getEntityStats(store)
    };
    
    // P2 #006: 元认知反馈
    if (this.metacognition) {
      const feedback = this.metacognition.reviewConsciousness([]);
      console.log('🧠 元认知反馈:', JSON.stringify(feedback.adjustments));
    }
    
    return this.signals;
  }

  /**
   * 决策阶段：根据信号选择动作
   */
  decide() {
    const signals = this.signals;
    let urgency = 0;
    const reasons = [];

    // 计算紧急度
    if (signals.kespiTrend && signals.kespiTrend.decline > 0.1) {
      urgency += 3;
      reasons.push(`KESPI 下降 ${signals.kespiTrend.decline.toFixed(2)}`);
    }
    
    if (signals.knowledgeGaps && signals.knowledgeGaps.highPriority > 0) {
      urgency += 2;
      reasons.push(`高优缺口 ${signals.knowledgeGaps.highPriority} 个`);
    }
    
    if (signals.knowledgeGaps && signals.knowledgeGaps.normal > 0) {
      urgency += 1;
      reasons.push(`普通缺口 ${signals.knowledgeGaps.normal} 个`);
    }
    
    if (signals.fileChanges > 0) {
      urgency += 1;
      reasons.push(`文件变化 ${signals.fileChanges} 个`);
    }
    
    if (signals.stagnantDays > 7) {
      urgency += 2;
      reasons.push(`停滞 ${signals.stagnantDays} 天`);
    }
    
    if (signals.timeTrigger) {
      urgency += 1;
      reasons.push('时间触发');
    }

    // 根据紧急度和状态选择动作
    let action;
    if (urgency >= 4) {
      action = 'emergency_fix';
    } else if (urgency >= 3) {
      action = 'full_metabolism';
    } else if (signals.knowledgeGaps?.highPriority > 0) {
      action = 'targeted_pollinate';
    } else if (signals.fileChanges > 0) {
      action = 'compile';
    } else if (signals.metabolismStatus === 'stagnant') {
      action = 'boost_growth';
    } else if (signals.knowledgeGaps?.normal > 0) {
      action = 'pollinate';
    } else if (signals.metabolismStatus === 'healthy') {
      action = 'maintain';
    } else if (signals.timeTrigger) {
      action = 'scheduled_metabolism';
    } else {
      action = 'observe';
    }

    const decision = {
      action,
      urgency,
      urgencyLevel: urgency >= 4 ? 'critical' : urgency >= 3 ? 'high' : urgency >= 1 ? 'medium' : 'low',
      reasons,
      signals: JSON.parse(JSON.stringify(signals)),
      timestamp: new Date().toISOString()
    };

    this.decisionHistory.push(decision);
    this.lastDecision = decision;
    this.lastDecisionTime = Date.now();
    
    return decision;
  }

  /**
   * 打印决策结果
   */
  printDecision(decision) {
    const actionDef = ACTIONS[decision.action];
    console.log('\n🧠 决策结果 / Decision:');
    console.log(`   动作: ${actionDef.label} (${decision.action})`);
    console.log(`   描述: ${actionDef.desc}`);
    console.log(`   紧急度: ${decision.urgencyLevel} (${decision.urgency})`);
    console.log(`   原因:`);
    decision.reasons.forEach(r => console.log(`     - ${r}`));
    console.log(`   时间: ${decision.timestamp}`);
  }

  /**
   * 获取命令序列
   */
  _getCommandSequence(action) {
    const commandMap = {
      emergency_fix: ['compile', 'import', 'vector', 'kespi'],
      full_metabolism: ['compile', 'import', 'link', 'vector', 'sprout', 'pollinate', 'compress', 'kespi', 'prune'],
      targeted_pollinate: ['pollinate'],
      compile: ['compile'],
      boost_growth: ['sprout', 'pollinate'],
      pollinate: ['pollinate'],
      maintain: [],
      scheduled_metabolism: ['compile', 'import', 'vector', 'kespi', 'prune'],
      observe: []
    };
    
    return commandMap[action] || [];
  }

  /**
   * 运行完整流程
   */
  async run() {
    console.log('🧠 生长决策器启动... / Growth Director started');
    
    await this.perceive();
    const decision = this.decide();
    this.printDecision(decision);
    
    return decision;
  }
}

// CLI 入口
if (require.main === module) {
  const director = new GrowthDirector(DB_PATH);
  director.run().catch(err => {
    console.error('❌ 决策器错误:', err.message);
    process.exit(1);
  });
}

module.exports = { GrowthDirector, ACTIONS };
