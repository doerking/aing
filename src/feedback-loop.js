#!/usr/bin/env node
/**
 * feedback-loop.js — 闭环反馈（效果感知 + 参数调优）
 * 
 * 职责：
 *   1. 效果感知：执行前后快照对比，计算 Delta
 *   2. 参数调优：根据效果自动调整决策参数（权重、阈值、频率）
 *   3. 学习记录：将反馈写入系统日志，供未来决策参考
 * 
 * 反馈维度：
 *   - KESPI 变化（执行前后对比）
 *   - 实体数量变化
 *   - 链接数量变化
 *   - 向量覆盖率变化
 *   - 缺口数量变化
 * 
 * 调优策略：
 *   - 效果好（KESPI↑）→ 保持当前策略
 *   - 效果差（KESPI↓）→ 调整参数或切换策略
 *   - 无变化 → 增加刺激强度
 * 
 * 用法：
 *   node feedback-loop.js                    # 执行反馈分析
 *   node feedback-loop.js --before <快照文件> # 对比指定快照
 *   node feedback-loop.js --auto-tune         # 自动调优参数
 */

const fs = require('fs');
const path = require('path');

function resolvePath(segment) {
  const args = process.argv;
  const baseDirIndex = args.indexOf('--base-dir');
  if (baseDirIndex !== -1 && baseDirIndex + 1 < args.length) {
    return path.join(args[baseDirIndex + 1], ...segment.split('/'));
  }
  return path.join(__dirname, '..', ...segment.split('/'));
}

const DB_PATH = resolvePath('knowledge.db');
const SNAPSHOTS_DIR = resolvePath('snapshots');

class FeedbackLoop {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.beforeSnapshot = null;
    this.afterSnapshot = null;
    this.delta = null;
    this.tuningActions = [];
  }

  /**
   * 拍摄快照
   */
  async takeSnapshot() {
    const store = await this._getStore();
    
    const entities = store.exec(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM entities
    `)[0];

    const kespi = store.exec(`
      SELECT AVG(kespi_score) as avg_kespi FROM entity_metadata
    `)[0];

    const links = store.exec(`
      SELECT COUNT(*) as total FROM links
    `)[0];

    const vectors = store.exec(`
      SELECT COUNT(*) as total FROM entity_embeddings
    `)[0];

    const gaps = store.exec(`
      SELECT 
        SUM(CASE WHEN em.originality < 0.5 THEN 1 ELSE 0 END) as originality_gaps,
        SUM(CASE WHEN em.consistency < 0.6 THEN 1 ELSE 0 END) as consistency_gaps
      FROM entity_metadata em
      JOIN entities e ON em.entity_id = e.id
      WHERE e.status = 'active'
    `)[0];

    return {
      timestamp: new Date().toISOString(),
      entities: { total: entities.total || 0, active: entities.active || 0 },
      kespi: { avg: kespi.avg_kespi || 0 },
      links: { total: links.total || 0 },
      vectors: { total: vectors.total || 0 },
      gaps: { originality: gaps.originality_gaps || 0, consistency: gaps.consistency_gaps || 0 }
    };
  }

  /**
   * 保存快照到文件
   */
  async saveSnapshot(snapshot, label = 'auto') {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    
    const filename = `snapshot-${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(SNAPSHOTS_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
    
    return filepath;
  }

  /**
   * 加载快照
   */
  loadSnapshot(filepath) {
    if (!fs.existsSync(filepath)) {
      throw new Error(`快照文件不存在: ${filepath}`);
    }
    let snap;
    try {
      snap = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (err) {
      throw new Error(`快照文件损坏（JSON 解析失败）: ${filepath} — ${err.message}`);
    }
    // 结构校验：缺关键维度时给出明确错误，避免下游 calculateDelta 抛 TypeError/NaN
    const required = ['timestamp', 'entities', 'kespi', 'links', 'vectors', 'gaps'];
    const missing = required.filter(k => !snap || typeof snap[k] !== 'object' || snap[k] === null);
    if (missing.length > 0) {
      throw new Error(`快照结构无效，缺少字段: ${missing.join(', ')} — ${filepath}`);
    }
    return snap;
  }

  /**
   * 计算 Delta
   */
  calculateDelta(before, after) {
    const delta = {
      timestamp: new Date().toISOString(),
      period: {
        from: before.timestamp,
        to: after.timestamp
      },
      changes: {
        entities: {
          total: after.entities.total - before.entities.total,
          active: after.entities.active - before.entities.active,
          rate: before.entities.total > 0 
            ? ((after.entities.total - before.entities.total) / before.entities.total * 100).toFixed(2) + '%'
            : 'N/A'
        },
        kespi: {
          avg: (after.kespi.avg - before.kespi.avg).toFixed(4),
          direction: after.kespi.avg > before.kespi.avg ? 'up' : after.kespi.avg < before.kespi.avg ? 'down' : 'stable'
        },
        links: {
          total: after.links.total - before.links.total
        },
        vectors: {
          total: after.vectors.total - before.vectors.total
        },
        gaps: {
          originality: after.gaps.originality - before.gaps.originality,
          consistency: after.gaps.consistency - before.gaps.consistency
        }
      },
      effectiveness: 'pending'
    };

    // 评估效果
    const kespiDelta = after.kespi.avg - before.kespi.avg;
    const entityDelta = after.entities.total - before.entities.total;
    const gapDelta = (after.gaps.originality + after.gaps.consistency) - (before.gaps.originality + before.gaps.consistency);

    if (kespiDelta > 0.05 && entityDelta >= 0) {
      delta.effectiveness = 'good';
    } else if (kespiDelta < -0.05) {
      delta.effectiveness = 'poor';
    } else if (kespiDelta > 0 && gapDelta <= 0) {
      delta.effectiveness = 'neutral';
    } else {
      delta.effectiveness = 'inconclusive';
    }

    this.beforeSnapshot = before;
    this.afterSnapshot = after;
    this.delta = delta;
    
    return delta;
  }

  /**
   * 自动调优参数
   */
  autoTune(delta) {
    const actions = [];
    const changes = delta.changes;

    // KESPI 下降 → 需要调整
    if (changes.kespi.direction === 'down') {
      actions.push({
        parameter: 'metabolism_frequency',
        action: 'increase',
        reason: 'KESPI 下降，增加代谢频率',
        value: 'daily'
      });
      actions.push({
        parameter: 'pollinate_aggressiveness',
        action: 'increase',
        reason: 'KESPI 下降，更积极授粉',
        value: 'high'
      });
    }

    // KESPI 上升 → 保持
    if (changes.kespi.direction === 'up' && delta.effectiveness === 'good') {
      actions.push({
        parameter: 'strategy',
        action: 'maintain',
        reason: '效果良好，保持当前策略',
        value: 'current'
      });
    }

    // 实体减少 → 检查剪枝策略
    if (changes.entities.total < 0) {
      actions.push({
        parameter: 'prune_threshold',
        action: 'relax',
        reason: '实体减少，放宽剪枝条件',
        value: '0.3'
      });
    }

    // 缺口增加 → 加强授粉
    if (changes.gaps.originality > 0 || changes.gaps.consistency > 0) {
      actions.push({
        parameter: 'pollinate_frequency',
        action: 'increase',
        reason: '缺口增加，加强授粉',
        value: 'twice_daily'
      });
    }

    // 无变化 → 增加刺激
    if (changes.kespi.direction === 'stable' && changes.entities.total === 0) {
      actions.push({
        parameter: 'growth_stimulus',
        action: 'boost',
        reason: '系统停滞，增加生长刺激',
        value: 'sprout_priority'
      });
    }

    this.tuningActions = actions;
    return actions;
  }

  /**
   * 记录反馈到系统日志
   */
  async logFeedback(delta, actions) {
    const store = await this._getStore();
    
    store.run(
      `INSERT INTO system_log (type, action, kespi_avg, details) VALUES (?, ?, ?, ?)`,
      [
        'feedback',
        delta.effectiveness,
        delta.changes.kespi.avg,
        JSON.stringify({
          delta: delta.changes,
          actions: actions,
          period: delta.period
        })
      ]
    );
  }

  /**
   * 打印反馈报告
   */
  printFeedbackReport(delta, actions) {
    const effIcons = {
      good: '✅',
      neutral: '⚪',
      poor: '❌',
      inconclusive: '❓'
    };

    console.log(`
╔══════════════════════════════════════════════════════════╗
║              🔄 闭环反馈 — 效果报告                       ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  效果评估: ${effIcons[delta.effectiveness] || '❓'} ${delta.effectiveness.padEnd(35)}  ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║  变化详情:                                                ║`);
    
    const k = delta.changes.kespi;
    console.log(`║    KESPI: ${k.direction === 'up' ? '↑' : k.direction === 'down' ? '↓' : '→'} ${k.avg.padEnd(35)}  ║`);
    
    const e = delta.changes.entities;
    console.log(`║    实体: ${e.total >= 0 ? '+' : ''}${e.total} (${e.rate})${' '.repeat(25)}  ║`);
    
    const l = delta.changes.links;
    console.log(`║    链接: ${l.total >= 0 ? '+' : ''}${l.total}${' '.repeat(35)}  ║`);
    
    const v = delta.changes.vectors;
    console.log(`║    向量: ${v.total >= 0 ? '+' : ''}${v.total}${' '.repeat(35)}  ║`);
    
    const g = delta.changes.gaps;
    console.log(`║    缺口(原创): ${g.originality >= 0 ? '+' : ''}${g.originality}${' '.repeat(30)}  ║`);
    console.log(`║    缺口(一致): ${g.consistency >= 0 ? '+' : ''}${g.consistency}${' '.repeat(30)}  ║`);
    
    console.log(`╠══════════════════════════════════════════════════════════╣`);
    
    if (actions.length > 0) {
      console.log(`║  调优建议:                                                ║`);
      for (const a of actions) {
        console.log(`║    → ${a.parameter}: ${a.action} → ${a.value.padEnd(25)}  ║`);
      }
    } else {
      console.log(`║  调优建议: 无需调整，当前策略有效                          ║`);
    }
    
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
  const autoTune = args.includes('--auto-tune');
  const beforeFile = args.includes('--before') ? args[args.indexOf('--before') + 1] : null;

  const loop = new FeedbackLoop(DB_PATH);

  try {
    if (beforeFile) {
      // 对比模式：加载之前的快照，拍摄当前快照，计算 delta
      const before = loop.loadSnapshot(beforeFile);
      console.log('📸 拍摄当前快照...');
      const after = await loop.takeSnapshot();
      
      console.log('📊 计算变化...');
      const delta = loop.calculateDelta(before, after);
      
      let actions = [];
      if (autoTune) {
        actions = loop.autoTune(delta);
        await loop.logFeedback(delta, actions);
      }
      
      loop.printFeedbackReport(delta, actions);
      if (autoTune && actions.length > 0) {
        console.log(`\nℹ️  调优建议已记录至反馈日志（logFeedback），但未自动执行——参数生效需经配置中枢（growth.config.js）裁定，避免调优绕过门禁。`);
      }
      
      // 保存新快照
      const snapPath = await loop.saveSnapshot(after, 'after');
      console.log(`\n📸 快照已保存: ${snapPath}`);
    } else {
      // 仅拍摄快照
      console.log('📸 拍摄系统快照...');
      const snapshot = await loop.takeSnapshot();
      const snapPath = await loop.saveSnapshot(snapshot, 'manual');
      
      console.log('\n📊 当前系统状态:');
      console.log(`  实体: ${snapshot.entities.active}/${snapshot.entities.total} (活跃/总数)`);
      console.log(`  KESPI: ${snapshot.kespi.avg.toFixed(4)}`);
      console.log(`  链接: ${snapshot.links.total}`);
      console.log(`  向量: ${snapshot.vectors.total}`);
      console.log(`  缺口: 原创${snapshot.gaps.originality} / 一致${snapshot.gaps.consistency}`);
      console.log(`\n📸 快照已保存: ${snapPath}`);
      console.log('\n提示: 运行代谢后使用 --before 对比效果');
    }
  } catch (err) {
    console.error(`❌ 反馈错误: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { FeedbackLoop };
