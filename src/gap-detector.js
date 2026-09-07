#!/usr/bin/env node
/**
 * gap-detector.js — 缺口检测器（5维缺口扫描）
 * 
 * 职责：扫描知识库中的 5 种缺口
 *   1. 孤立实体 (orphan)   : 无任何链接
 *   2. 稀薄实体 (thin)      : 内容过短或元数据不完整
 *   3. 停滞实体 (stagnant)  : 长期未更新
 *   4. 未索引实体 (unindexed): 缺少向量嵌入
 *   5. 空内容实体 (empty)    : body 为空或仅 frontmatter
 * 
 * 输出：缺口报告 + 修复建议
 * 
 * 用法：
 *   node gap-detector.js              # 扫描并输出报告
 *   node gap-detector.js --fix        # 自动修复可修复项
 *   node gap-detector.js --dimension orphan  # 只扫某个维度
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

const GAP_DIMENSIONS = {
  orphan: {
    label: '孤立实体', icon: '🏝️', desc: '无任何链接', severity: 'high',
    check: (e) => (!e.links || e.links === 0)
  },
  thin: {
    label: '稀薄实体', icon: '📄', desc: '内容过短或元数据不完整', severity: 'medium',
    check: (e) => (!e.content || e.content.length < 100)
  },
  stagnant: {
    label: '停滞实体', icon: '⏳', desc: '长期未更新（>30天）', severity: 'medium',
    check: (e) => {
      if (!e.updated_at) return false;
      const days = (Date.now() - new Date(e.updated_at).getTime()) / 86400000;
      return days > 30;
    }
  },
  unindexed: {
    label: '未索引实体', icon: '🔍', desc: '缺少向量嵌入', severity: 'low',
    check: (e) => e.hasEmbedding === false
  },
  empty: {
    label: '空内容实体', icon: '🗑️', desc: 'body为空或仅frontmatter', severity: 'high',
    check: (e) => {
      if (!e.content) return true;
      const clean = e.content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
      return clean.length < 20;
    }
  }
};

class GapDetector {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.gaps = {};
    this.stats = { totalEntities: 0, totalGaps: 0, bySeverity: { high: 0, medium: 0, low: 0 }, byDimension: {} };
  }

  async scan(dimensionFilter = null) {
    const store = await this._getStore();
    const entities = store.exec(`
      SELECT e.*, em.consistency, em.originality, em.relevance, em.provability, em.utility
      FROM entities e
      LEFT JOIN entity_metadata em ON e.id = em.entity_id
      WHERE e.status = 'active'
    `);

    this.stats.totalEntities = entities.length;
    this.gaps = {};
    
    const dimensions = dimensionFilter ? { [dimensionFilter]: GAP_DIMENSIONS[dimensionFilter] } : GAP_DIMENSIONS;

    for (const [dim, config] of Object.entries(dimensions)) {
      this.gaps[dim] = [];
      this.stats.byDimension[dim] = 0;

      for (const entity of entities) {
        if (dim === 'unindexed') {
          const emb = store.exec(`SELECT entity_id FROM entity_embeddings WHERE entity_id = ?`, [entity.id]);
          entity.hasEmbedding = emb.length > 0;
        }
        if (dim === 'orphan') {
          const links = store.exec(`SELECT COUNT(*) as count FROM links WHERE source_id = ? OR target_id = ?`, [entity.id, entity.id]);
          entity.links = links[0]?.count || 0;
        }

        if (config.check(entity)) {
          this.gaps[dim].push({ id: entity.id, name: entity.name, type: entity.type, severity: config.severity });
          this.stats.byDimension[dim]++;
          this.stats.bySeverity[config.severity]++;
          this.stats.totalGaps++;
        }
      }
    }

    return { gaps: this.gaps, stats: this.stats };
  }

  getFixSuggestions() {
    const suggestions = [];
    if (this.gaps.orphan?.length > 0) suggestions.push({ action: 'auto-link', target: `${this.gaps.orphan.length} 个孤立实体`, desc: '运行 auto-link.js 自动建立链接' });
    if (this.gaps.thin?.length > 0) suggestions.push({ action: 'pollinate', target: `${this.gaps.thin.length} 个稀薄实体`, desc: '运行 pollinate.js 补充内容' });
    if (this.gaps.stagnant?.length > 0) suggestions.push({ action: 'prune_or_refresh', target: `${this.gaps.stagnant.length} 个停滞实体`, desc: '确认后刷新或归档' });
    if (this.gaps.unindexed?.length > 0) suggestions.push({ action: 'index-vectors', target: `${this.gaps.unindexed.length} 个未索引实体`, desc: '运行 index-vectors.js 建立向量' });
    if (this.gaps.empty?.length > 0) suggestions.push({ action: 'prune', target: `${this.gaps.empty.length} 个空内容实体`, desc: '确认后删除或补充' });
    return suggestions;
  }

  printReport(result) {
    const { gaps, stats } = result;
    console.log(`
╔══════════════════════════════════════════════════════════╗
║              🔍 缺口检测报告                              ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  扫描实体: ${String(stats.totalEntities).padEnd(35)}  ║
║  发现缺口: ${String(stats.totalGaps).padEnd(35)}  ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║  各维度情况:                                              ║`);
    
    for (const [dim, entities] of Object.entries(gaps)) {
      const cfg = GAP_DIMENSIONS[dim];
      const count = entities.length;
      const indicator = count > 0 ? cfg.icon : '✅';
      console.log(`║  ${indicator} ${cfg.label}: ${count} 个${' '.repeat(30 - cfg.label.length)}  ║`);
    }
    
    console.log(`║                                                          ║
╠══════════════════════════════════════════════════════════╣
║  严重度分布:                                              ║`);
    console.log(`║  🔴 高: ${String(stats.bySeverity.high).padEnd(35)}  ║`);
    console.log(`║  🟡 中: ${String(stats.bySeverity.medium).padEnd(35)}  ║`);
    console.log(`║  🟢 低: ${String(stats.bySeverity.low).padEnd(35)}  ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);

    // 修复建议
    const suggestions = this.getFixSuggestions();
    if (suggestions.length > 0) {
      console.log('\n💡 修复建议:\n');
      for (const s of suggestions) {
        console.log(`  → ${s.desc}`);
        console.log(`    目标: ${s.target}`);
        console.log(`    命令: node ${s.action}.js`);
        console.log();
      }
    }
  }

  async _getStore() {
    const KnowledgeStore = require('./knowledge-store.js');
    const store = new KnowledgeStore(this.dbPath);
    await store.init();
    return store;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const dimensionFilter = args.includes('--dimension') ? args[args.indexOf('--dimension') + 1] : null;

  const detector = new GapDetector(DB_PATH);

  try {
    const result = await detector.scan(dimensionFilter);
    detector.printReport(result);

    if (shouldFix && result.stats.totalGaps > 0) {
      console.log('🔧 自动修复模式\n');
      const suggestions = detector.getFixSuggestions();
      const { execSync } = require('child_process');
      for (const s of suggestions) {
        if (['auto-link', 'pollinate', 'index-vectors'].includes(s.action)) {
          console.log(`▶ 执行: node ${s.action}.js`);
          try {
            execSync(`node ${s.action}.js`, { stdio: 'inherit', cwd: __dirname });
          } catch (e) {
            console.error(`  ❌ 失败: ${e.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`❌ 检测错误: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { GapDetector, GAP_DIMENSIONS };
