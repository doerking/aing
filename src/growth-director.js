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
 * 
 * 用法：
 *   node growth-director.js              # 评估并输出决策
 *   node growth-director.js --execute     # 评估并执行决策
 *   node growth-director.js --dry-run     # 只看不执行
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
  pollinate:           { priority: 2, label: '🌸 授粉', desc: '普通缺口，常规授粉' },
  scheduled_metabolism: { priority: 2, label: '⏰ 定时代谢', desc: '时间节律触发' },
  maintain:            { priority: 3, label: '🔧 维护', desc: '持续健康，例行维护' },
  observe:             { priority: 5, label: '👁️ 观察', desc: '无显著信号，继续观察' }
};

// 紧急度级别
const URGENCY_LEVELS = {
  critical: { threshold: 5, label: '🔴 紧急' },
  high:     { threshold: 3, label: '🟠 高' },
  medium:   { threshold: 1, label: '🟡 中' },
  low:      { threshold: 0, label: '🟢 低' }
};

class GrowthDirector {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.signals = {};
    this.decisionHistory = [];
    this.consecutiveStagnant = 0;
    this.consecutiveHealthy = 0;
    this.lastDecision = null;
    this.lastDecisionTime = null;
  }

  /**
   * 感知阶段：收集所有信号
   */
  async perceive() {
    const store = await this._getStore();
    this.signals = {
      // KESPI 趋势
      kespiTrend: this._calcKespiTrend(store),
      
      // 文件变化
      fileChanges: this._countFileChanges(store),
      
      // 知识缺口
      knowledgeGaps: this._countKnowledgeGaps(store),
      
      // 停滞天数
      stagnantDays: this._getStagnantDays(store),
      
      // 时间触发
      timeTrigger: this._checkTimeTrigger(),
      
      // 代谢评估
      metabolismStatus: this._evaluateMetabolism(store),
      
      // 实体统计
      entityStats: this._getEntityStats(store)
    };
    
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
      reasons.push('时间节律触发');
    }

    // 确定紧急度级别
    let urgencyLevel = 'low';
    for (const [level, cfg] of Object.entries(URGENCY_LEVELS)) {
      if (urgency >= cfg.threshold) {
        urgencyLevel = level;
        break;
      }
    }

    // 选择动作
    const action = this._selectAction(urgency, urgencyLevel, signals);
    
    // 更新连续计数
    if (signals.metabolismStatus === 'stagnant') {
      this.consecutiveStagnant++;
      this.consecutiveHealthy = 0;
    } else if (signals.metabolismStatus === 'healthy') {
      this.consecutiveHealthy++;
      this.consecutiveStagnant = 0;
    } else {
      this.consecutiveStagnant = Math.max(0, this.consecutiveStagnant - 1);
      this.consecutiveHealthy = Math.max(0, this.consecutiveHealthy - 1);
    }

    const decision = {
      action,
      urgency,
      urgencyLevel,
      reasons,
      signals: {
        kespiTrend: signals.kespiTrend,
        stagnantDays: signals.stagnantDays,
        metabolismStatus: signals.metabolismStatus
      },
      timestamp: new Date().toISOString()
    };

    this.lastDecision = decision;
    this.lastDecisionTime = decision.timestamp;
    this.decisionHistory.push(decision);
    
    // 保留最近 20 条
    if (this.decisionHistory.length > 20) {
      this.decisionHistory = this.decisionHistory.slice(-20);
    }

    return decision;
  }

  /**
   * 执行决策
   */
  async execute(decision) {
    const action = decision.action;
    console.log(`\n⚡ 执行决策: ${ACTIONS[action].label}`);
    console.log(`   ${ACTIONS[action].desc}\n`);

    // 返回要执行的命令序列
    const commands = this._getCommandSequence(action);
    return commands;
  }

  // ==================== 私有方法 ====================

  _selectAction(urgency, urgencyLevel, signals) {
    // 最高优先级：紧急修复
    if (urgencyLevel === 'critical' && signals.kespiTrend && signals.kespiTrend.decline > 0.2) {
      return 'emergency_fix';
    }
    
    // 连续停滞 → 完整代谢
    if (this.consecutiveStagnant >= 3) {
      return 'full_metabolism';
    }
    
    // 高优缺口 → 定向授粉
    if (signals.knowledgeGaps && signals.knowledgeGaps.highPriority > 0) {
      return 'targeted_pollinate';
    }
    
    // 文件变化 → 编译
    if (signals.fileChanges > 0) {
      return 'compile';
    }
    
    // 停滞 → 促进生长
    if (signals.metabolismStatus === 'stagnant') {
      return 'boost_growth';
    }
    
    // 普通缺口 → 授粉
    if (signals.knowledgeGaps && signals.knowledgeGaps.normal > 0) {
      return 'pollinate';
    }
    
    // 时间节律 → 定时代谢
    if (signals.timeTrigger) {
      return 'scheduled_metabolism';
    }
    
    // 连续健康 → 维护
    if (this.consecutiveHealthy >= 3) {
      return 'maintain';
    }
    
    // 默认：观察
    return 'observe';
  }

  _getCommandSequence(action) {
    // 步名 → 实际脚本文件名（CLI --execute 直接拼 node <script>.js，
    // 步名与文件名不一致的在此映射，与 run-metabolism 的 STEPS 保持同源）
    const SCRIPT_MAP = {
      import: 'import-from-wiki',
      link: 'auto-link',
      vector: 'index-vectors',
      kespi: 'kespi-check'
    };
    const toScript = (step) => SCRIPT_MAP[step] || step;
    switch (action) {
      case 'emergency_fix':
        return ['kespi-check', 'fix-kespi', 'recalc-kespi', 'kespi-check'].map(toScript);
      case 'full_metabolism':
        return ['compile', 'import', 'link', 'vector', 'sprout', 'pollinate', 'compress', 'kespi', 'prune'].map(toScript);
      case 'targeted_pollinate':
        return ['kespi-check', 'pollinate', 'kespi-check'].map(toScript);
      case 'compile':
        return ['compile', 'import'].map(toScript);
      case 'boost_growth':
        return ['sprout', 'pollinate'];
      case 'pollinate':
        return ['pollinate', 'compress'];
      case 'scheduled_metabolism':
        return ['compile', 'import', 'link', 'vector', 'sprout', 'pollinate', 'compress', 'kespi', 'prune'].map(toScript);
      case 'maintain':
        return ['kespi-check', 'prune'];
      case 'observe':
      default:
        return [];
    }
  }

  async _getStore() {
    const KnowledgeStore = require('./knowledge-store.js');
    const store = new KnowledgeStore(this.dbPath);
    await store.init();
    return store;
  }

  _calcKespiTrend(store) {
    try {
      const entities = store.exec(
        `SELECT AVG(kespi_score) as avg_score FROM entity_metadata WHERE entity_id IN 
         (SELECT id FROM entities WHERE status = 'active')`
      );
      const current = entities[0]?.avg_score || 0;
      
      // 从历史获取上一次
      const prev = store.exec(
        `SELECT kespi_avg FROM system_log WHERE type = 'kespi_check' ORDER BY created_at DESC LIMIT 1 OFFSET 1`
      );
      const previous = prev[0]?.kespi_avg || current;
      
      return {
        current,
        previous,
        decline: previous > 0 ? Math.max(0, (previous - current) / previous) : 0
      };
    } catch (e) {
      return { current: 0, previous: 0, decline: 0 };
    }
  }

  _countFileChanges(store) {
    try {
      const result = store.exec(
        `SELECT COUNT(*) as count FROM entities WHERE created_at > datetime('now', '-1 day')`
      );
      return result[0]?.count || 0;
    } catch (e) {
      return 0;
    }
  }

  _countKnowledgeGaps(store) {
    try {
      const high = store.exec(
        `SELECT COUNT(*) as count FROM entity_metadata WHERE originality < 0.5 OR relevance < 0.5`
      );
      const normal = store.exec(
        `SELECT COUNT(*) as count FROM entity_metadata WHERE consistency < 0.6 OR provability < 0.5`
      );
      return {
        highPriority: high[0]?.count || 0,
        normal: normal[0]?.count || 0
      };
    } catch (e) {
      return { highPriority: 0, normal: 0 };
    }
  }

  _getStagnantDays(store) {
    try {
      const result = store.exec(
        `SELECT julianday('now') - julianday(MAX(updated_at)) as days FROM entities`
      );
      return Math.floor(result[0]?.days || 0);
    } catch (e) {
      return 0;
    }
  }

  _checkTimeTrigger() {
    const now = new Date();
    const hour = now.getHours();
    // 每天 9:00 和 21:00 触发
    return hour === 9 || hour === 21;
  }

  _evaluateMetabolism(store) {
    try {
      const stats = store.getStats();
      const total = stats && (stats.totalEntities ?? stats.entities);
      if (!stats || !total) return 'unknown';
      
      const avgScore = stats.avgKespi || 0;
      // 活跃实体比例（避免依赖不存在的字段产生 NaN）
      let activeCount = 0;
      try {
        const rows = store.exec(`SELECT COUNT(*) AS c FROM entities WHERE status = 'active'`);
        activeCount = rows[0] ? Number(rows[0].c) : 0;
      } catch (_) { activeCount = total; }
      const activeRatio = activeCount / total;
      
      if (avgScore > 0.85 && activeRatio > 0.9) return 'healthy';
      if (avgScore > 0.7) return 'expanding';
      if (avgScore > 0.5) return 'stable';
      return 'stagnant';
    } catch (e) {
      return 'unknown';
    }
  }

  _getEntityStats(store) {
    try {
      return store.getStats() || {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 打印决策报告
   */
  printDecision(decision) {
    const action = ACTIONS[decision.action];
    const urgency = URGENCY_LEVELS[decision.urgencyLevel];
    
    console.log(`
╔══════════════════════════════════════════════════════════╗
║              🧠 生长决策器 — 决策报告                     ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  决策动作: ${action.label.padEnd(40)}  ║
║  动作说明: ${action.desc.padEnd(40)}  ║
║  紧急度:   ${urgency.label} (${decision.urgency} 分)${' '.repeat(20)}  ║
║  优先级:   ${action.priority}${' '.repeat(35)}  ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║  触发原因:                                                ║`);
    
    for (const reason of decision.reasons) {
      console.log(`║    • ${reason.padEnd(50)}  ║`);
    }
    
    if (decision.reasons.length === 0) {
      console.log(`║    • 无显著信号${' '.repeat(38)}  ║`);
    }
    
    console.log(`║                                                          ║
╠══════════════════════════════════════════════════════════╣
║  信号摘要:                                                ║
║    KESPI 趋势: ${(decision.signals.kespiTrend?.decline > 0 ? '↓ ' + (decision.signals.kespiTrend.decline * 100).toFixed(1) + '%' : '—').padEnd(35)}  ║
║    停滞天数:   ${(String(decision.signals.stagnantDays) + ' 天').padEnd(35)}  ║
║    代谢状态:   ${(decision.signals.metabolismStatus || 'unknown').padEnd(35)}  ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝`);

    if (decision.action !== 'observe') {
      const commands = this._getCommandSequence(decision.action);
      console.log(`\n📋 执行序列: ${commands.join(' → ')}\n`);
    } else {
      console.log('\n👁️ 继续观察，暂不执行\n');
    }
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const shouldExecute = args.includes('--execute');
  const dryRun = args.includes('--dry-run');

  const director = new GrowthDirector(DB_PATH);

  try {
    console.log('🔍 感知阶段：收集信号...');
    await director.perceive();

    console.log('🧠 决策阶段：分析判断...');
    const decision = director.decide();

    director.printDecision(decision);

    if (shouldExecute && decision.action !== 'observe') {
      const commands = await director.execute(decision);
      if (dryRun) {
        console.log('🔍 Dry-run 模式，不实际执行');
        console.log(`   将执行: ${commands.join(' → ')}`);
      } else {
        // 实际执行命令
        const { execSync } = require('child_process');
        for (const cmd of commands) {
          console.log(`\n📍 执行: node ${cmd}.js`);
          try {
            execSync(`node ${cmd}.js`, { stdio: 'inherit', cwd: __dirname });
          } catch (e) {
            console.error(`   ❌ 执行失败: ${e.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`❌ 决策器错误: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { GrowthDirector, ACTIONS, URGENCY_LEVELS };
