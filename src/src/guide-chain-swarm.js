#!/usr/bin/env node
/**
 * guide-chain-swarm.js — 导链蜂群（多Agent决策）
 * 
 * 职责：关键决策点 spawn 多个子Agent，竞争/协作择优
 * 
 * 3 种子Agent：
 *   - 分析型Agent (deep_analysis): 深入分析信号根因，输出诊断+建议
 *   - 行动型Agent (fast_action): 快速响应，输出即时动作+风险评估
 *   - 策略型Agent (long_term): 基于历史趋势，输出策略调整建议
 * 
 * 调度逻辑：
 *   - 紧急度 critical → 3 个 Agent 全上，投票决定
 *   - 紧急度 high     → 分析型 + 行动型
 *   - 紧急度 medium   → 仅行动型
 *   - 紧急度 low      → 仅策略型（后台慢速思考）
 * 
 * 用法：
 *   node guide-chain-swarm.js                  # 运行蜂群决策
 *   node guide-chain-swarm.js --urgency high   # 指定紧急度
 *   node guide-chain-swarm.js --dry-run        # 只看不执行
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

// ==================== 子Agent定义 ====================

/**
 * 分析型Agent — 深入分析根因
 */
class AnalysisAgent {
  constructor(store) {
    this.name = '分析型Agent';
    this.label = '🔬 分析型';
    this.store = store;
  }

  async think(context) {
    const { signals, decision } = context;
    const analysis = {
      agent: this.name,
      confidence: 0,
      recommendation: null,
      reasoning: [],
      risks: []
    };

    // 分析 KESPI 趋势
    if (signals.kespiTrend && signals.kespiTrend.decline > 0.1) {
      analysis.reasoning.push(`KESPI 持续下降，可能存在知识质量退化`);
      analysis.risks.push('知识库整体质量下滑');
      
      // 深入分析哪个维度拖了后腿
      const dimensions = await this._analyzeDimensions();
      const weakest = dimensions.sort((a, b) => a.score - b.score)[0];
      if (weakest) {
        analysis.reasoning.push(`最弱维度: ${weakest.name} (${weakest.score.toFixed(2)})`);
      }
    }

    // 分析知识缺口
    if (signals.knowledgeGaps && signals.knowledgeGaps.highPriority > 0) {
      analysis.reasoning.push(`存在 ${signals.knowledgeGaps.highPriority} 个高优先级缺口`);
      analysis.risks.push('知识覆盖不完整');
    }

    // 分析停滞原因
    if (signals.stagnantDays > 7) {
      analysis.reasoning.push(`系统已停滞 ${signals.stagnantDays} 天`);
      analysis.risks.push('长期停滞可能导致知识过时');
    }

    // 生成建议
    if (analysis.reasoning.length >= 3) {
      analysis.recommendation = 'full_metabolism';
      analysis.confidence = 0.85;
    } else if (analysis.reasoning.length >= 2) {
      analysis.recommendation = 'targeted_pollinate';
      analysis.confidence = 0.75;
    } else if (analysis.reasoning.length >= 1) {
      analysis.recommendation = 'compile';
      analysis.confidence = 0.6;
    } else {
      analysis.recommendation = 'observe';
      analysis.confidence = 0.9;
    }

    return analysis;
  }

  async _analyzeDimensions() {
    try {
      const dims = this.store.exec(
        `SELECT 
          AVG(originality) as KQ,
          AVG(relevance) as KG,
          AVG(consistency) as KA,
          AVG(provability) as KM,
          AVG(utility) as KD
        FROM entity_metadata`
      );
      
      if (!dims || !dims[0]) return [];
      
      const d = dims[0];
      return [
        { name: 'KQ原创', score: d.KQ || 0 },
        { name: 'KG关联', score: d.KG || 0 },
        { name: 'KA准确', score: d.KA || 0 },
        { name: 'KM时效', score: d.KM || 0 },
        { name: 'KD实用', score: d.KD || 0 }
      ];
    } catch (e) {
      return [];
    }
  }
}

/**
 * 行动型Agent — 快速响应
 */
class ActionAgent {
  constructor(store) {
    this.name = '行动型Agent';
    this.label = '⚡ 行动型';
    this.store = store;
  }

  async think(context) {
    const { signals, decision } = context;
    const analysis = {
      agent: this.name,
      confidence: 0,
      recommendation: null,
      reasoning: [],
      risks: []
    };

    // 快速判断：什么能最快见效
    if (signals.kespiTrend && signals.kespiTrend.decline > 0.2) {
      analysis.recommendation = 'emergency_fix';
      analysis.confidence = 0.9;
      analysis.reasoning.push('KESPI 骤降，需要立即修复');
    } else if (signals.fileChanges > 0) {
      analysis.recommendation = 'compile';
      analysis.confidence = 0.85;
      analysis.reasoning.push(`检测到 ${signals.fileChanges} 个文件变化`);
    } else if (signals.knowledgeGaps && signals.knowledgeGaps.highPriority > 0) {
      analysis.recommendation = 'targeted_pollinate';
      analysis.confidence = 0.8;
      analysis.reasoning.push('高优缺口需要快速补充');
    } else if (signals.metabolismStatus === 'stagnant') {
      analysis.recommendation = 'boost_growth';
      analysis.confidence = 0.75;
      analysis.reasoning.push('停滞状态需要刺激生长');
    } else if (signals.timeTrigger) {
      analysis.recommendation = 'scheduled_metabolism';
      analysis.confidence = 0.7;
      analysis.reasoning.push('时间节律触发');
    } else {
      analysis.recommendation = 'observe';
      analysis.confidence = 0.8;
      analysis.reasoning.push('无紧急事项，继续观察');
    }

    // 风险评估
    if (analysis.recommendation === 'emergency_fix') {
      analysis.risks.push('修复过程可能影响正常服务');
    }
    if (analysis.recommendation === 'full_metabolism') {
      analysis.risks.push('全量代谢耗时较长');
    }

    return analysis;
  }
}

/**
 * 策略型Agent — 长期规划
 */
class StrategyAgent {
  constructor(store) {
    this.name = '策略型Agent';
    this.label = '📊 策略型';
    this.store = store;
  }

  async think(context) {
    const { signals, decision } = context;
    const analysis = {
      agent: this.name,
      confidence: 0,
      recommendation: null,
      reasoning: [],
      risks: [],
      strategy: null
    };

    // 基于历史趋势做长期判断
    const history = this._getDecisionHistory();
    
    if (history.length >= 5) {
      const recentActions = history.slice(-5);
      const stagnantCount = recentActions.filter(a => a.action === 'observe').length;
      
      if (stagnantCount >= 3) {
        analysis.reasoning.push('近期多次观察无动作，可能需要调整策略');
        analysis.recommendation = 'boost_growth';
        analysis.confidence = 0.65;
        analysis.strategy = '主动刺激：增加授粉频率';
      }
    }

    // 基于实体数量趋势
    const entityTrend = this._getEntityTrend();
    if (entityTrend === 'declining') {
      analysis.reasoning.push('实体数量呈下降趋势');
      analysis.risks.push('知识库可能萎缩');
      analysis.recommendation = 'full_metabolism';
      analysis.confidence = 0.7;
      analysis.strategy = '全面恢复：全流程代谢';
    } else if (entityTrend === 'growing') {
      analysis.reasoning.push('实体数量健康增长');
      analysis.recommendation = 'maintain';
      analysis.confidence = 0.8;
      analysis.strategy = '保持节奏：维持当前频率';
    }

    // 默认策略
    if (!analysis.recommendation) {
      analysis.recommendation = 'observe';
      analysis.confidence = 0.7;
      analysis.reasoning.push('趋势正常，无需调整策略');
      analysis.strategy = '持续监控';
    }

    return analysis;
  }

  _getDecisionHistory() {
    try {
      const logs = this.store.exec(
        `SELECT action, created_at FROM system_log 
         WHERE type = 'decision' 
         ORDER BY created_at DESC LIMIT 10`
      );
      return logs || [];
    } catch (e) {
      return [];
    }
  }

  _getEntityTrend() {
    try {
      const recent = this.store.exec(
        `SELECT COUNT(*) as count FROM entities WHERE created_at > datetime('now', '-7 days')`
      );
      const previous = this.store.exec(
        `SELECT COUNT(*) as count FROM entities WHERE created_at BETWEEN datetime('now', '-14 days') AND datetime('now', '-7 days')`
      );
      
      const r = recent[0]?.count || 0;
      const p = previous[0]?.count || 0;
      
      if (r > p * 1.1) return 'growing';
      if (r < p * 0.9) return 'declining';
      return 'stable';
    } catch (e) {
      return 'stable';
    }
  }
}

// ==================== 蜂群调度器 ====================

class GuideChainSwarm {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.agents = [];
    this.consensus = null;
  }

  async init() {
    const store = await this._getStore();
    this.agents = [
      new AnalysisAgent(store),
      new ActionAgent(store),
      new StrategyAgent(store)
    ];
  }

  /**
   * 根据紧急度决定启动哪些Agent
   */
  async deliberate(context) {
    const { urgencyLevel } = context.decision;
    const activeAgents = [];

    switch (urgencyLevel) {
      case 'critical':
        // 全上
        activeAgents.push(...this.agents);
        break;
      case 'high':
        // 分析 + 行动
        activeAgents.push(this.agents[0], this.agents[1]);
        break;
      case 'medium':
        // 仅行动
        activeAgents.push(this.agents[1]);
        break;
      case 'low':
      default:
        // 仅策略
        activeAgents.push(this.agents[2]);
        break;
    }

    // 并行执行
    const results = await Promise.all(
      activeAgents.map(agent => agent.think(context))
    );

    // 投票/综合
    this.consensus = this._vote(results);
    
    return {
      results,
      consensus: this.consensus,
      agentCount: activeAgents.length
    };
  }

  /**
   * 投票机制：加权平均
   */
  _vote(results) {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];

    // 按置信度加权
    const votes = {};
    let totalWeight = 0;

    for (const r of results) {
      const weight = r.confidence || 0.5;
      if (!votes[r.recommendation]) {
        votes[r.recommendation] = { weight: 0, count: 0 };
      }
      votes[r.recommendation].weight += weight;
      votes[r.recommendation].count += 1;
      totalWeight += weight;
    }

    // 选出权重最高的
    let bestAction = null;
    let bestWeight = 0;

    for (const [action, data] of Object.entries(votes)) {
      if (data.weight > bestWeight) {
        bestWeight = data.weight;
        bestAction = action;
      }
    }

    return {
      action: bestAction,
      confidence: totalWeight > 0 ? bestWeight / totalWeight : 0,
      votes,
      totalAgents: results.length
    };
  }

  /**
   * 打印蜂群决策报告
   */
  printSwarmReport(deliberation) {
    const { results, consensus, agentCount } = deliberation;

    console.log(`
╔══════════════════════════════════════════════════════════╗
║              🐝 导链蜂群 — 决策报告                        ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  参与Agent: ${agentCount} 个${' '.repeat(35)}  ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣`);

    for (const r of results) {
      console.log(`║  🤖 ${String(r.agent || r.label || 'unknown').padEnd(40)}  ║`);
      console.log(`║    建议: ${String(r.recommendation).padEnd(40)}  ║`);
      console.log(`║    置信度: ${((r.confidence * 100).toFixed(0) + '%').padEnd(38)}  ║`);
      if (r.reasoning && r.reasoning.length > 0) {
        console.log(`║    理由: ${r.reasoning[0].substring(0, 36).padEnd(40)}  ║`);
      }
      console.log(`║                                                          ║`);
    }

    console.log(`╠══════════════════════════════════════════════════════════╣`);
    console.log(`║  🎯 共识决策: ${(consensus.action || 'unknown').padEnd(35)}  ║`);
    console.log(`║     共识强度: ${(((consensus.confidence || 0) * 100).toFixed(0) + '%').padEnd(38)}  ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);
  }

  async _getStore() {
    const KnowledgeStore = require('./knowledge-store.js');
    const store = new KnowledgeStore(this.dbPath);
    await store.init();
    return store;
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forcedUrgency = args.includes('--urgency') ? args[args.indexOf('--urgency') + 1] : null;

  const swarm = new GuideChainSwarm(DB_PATH);

  try {
    await swarm.init();

    // 构建上下文
    const context = {
      decision: {
        urgencyLevel: forcedUrgency || 'medium',
        action: 'pending'
      },
      signals: {
        kespiTrend: { decline: 0.05 },
        fileChanges: 0,
        knowledgeGaps: { highPriority: 0, normal: 2 },
        stagnantDays: 3,
        metabolismStatus: 'stable',
        timeTrigger: false
      }
    };

    console.log('🐝 导链蜂群启动...');
    console.log(`   紧急度: ${context.decision.urgencyLevel}`);
    console.log(`   参与Agent: ${context.decision.urgencyLevel === 'critical' ? 3 : context.decision.urgencyLevel === 'high' ? 2 : 1} 个\n`);

    const deliberation = await swarm.deliberate(context);
    swarm.printSwarmReport(deliberation);

    if (dryRun) {
      console.log('🔍 Dry-run 模式，不实际执行');
    }
  } catch (err) {
    console.error(`❌ 蜂群错误: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { GuideChainSwarm, AnalysisAgent, ActionAgent, StrategyAgent };
