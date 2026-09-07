#!/usr/bin/env node
/**
 * consciousness-layer.js — 意识层输出层
 * 
 * 功能：综合感知，输出可消费的洞察
 * 
 * 模块：
 * - 📋 知识简报：本周生长/死亡/热点
 * - 🔔 主动推送：raw/ 缺什么
 * - 🎯 高亮连接：值得深挖的连接
 * - 📈 趋势报告：活力变化趋势
 * - ⚠️ 异常告警：活力骤降、链接断裂、代谢异常
 */

const fs = require('fs');
const path = require('path');

class ConsciousnessLayer {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.wikiDir = path.join(this.baseDir, 'wiki');
    this.rawDir = path.join(this.baseDir, 'raw');
    this.logsDir = path.join(this.baseDir, 'logs', 'consciousness');
    
    // 确保目录存在
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }
  
  /**
   * 生成知识简报
   */
  generateBriefing() {
    console.log('🧠 意识层生成简报...');
    
    const briefing = {
      timestamp: new Date().toISOString(),
      summary: this._generateSummary(),
      hotspots: this._detectHotspots(),
      newConnections: this._findNewConnections(),
      alerts: this._detectAlerts(),
      recommendations: this._generateRecommendations(),
    };
    
    this._saveBriefing(briefing);
    
    return briefing;
  }
  
  /**
   * 生成摘要
   */
  _generateSummary() {
    const entities = this._getAllEntities();
    const rawFiles = this._getAllRawFiles();
    const links = this._countLinks();
    
    return {
      totalEntities: entities.length,
      totalRaw: rawFiles.length,
      totalLinks: links,
      lastUpdated: new Date().toISOString(),
    };
  }
  
  /**
   * 检测热点
   */
  _detectHotspots() {
    const entities = this._getAllEntities();
    const hotspots = [];
    
    entities.forEach(entity => {
      const vitality = this._getVitality(entity);
      const connections = this._getConnectionCount(entity);
      
      // 热度 = 活力 × 0.5 + 连接数归一化 × 0.5
      const heat = vitality * 0.5 + Math.min(1.0, connections / 5) * 0.5;
      
      if (heat >= 0.6) {
        hotspots.push({
          entity,
          vitality,
          connections,
          heat,
        });
      }
    });
    
    return hotspots.sort((a, b) => b.heat - a.heat).slice(0, 5);
  }
  
  /**
   * 发现新连接
   */
  _findNewConnections() {
    const entities = this._getAllEntities();
    const newConnections = [];
    
    // 检查最近修改的实体之间的连接
    const recentEntities = entities
      .map(e => ({
        name: e,
        mtime: this._getEntityMtime(e),
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5)
      .map(e => e.name);
    
    for (let i = 0; i < recentEntities.length; i++) {
      for (let j = i + 1; j < recentEntities.length; j++) {
        if (this._hasConnection(recentEntities[i], recentEntities[j])) {
          newConnections.push({
            from: recentEntities[i],
            to: recentEntities[j],
            discoveredAt: new Date().toISOString(),
          });
        }
      }
    }
    
    return newConnections;
  }
  
  /**
   * 检测异常
   */
  _detectAlerts() {
    const alerts = [];
    
    // 1. 检查 raw/ 是否有长期未更新的文件
    const rawFiles = this._getAllRawFiles();
    rawFiles.forEach(file => {
      const stat = fs.statSync(file.path);
      const daysSinceModified = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      
      if (daysSinceModified > 30) {
        alerts.push({
          type: 'stale',
          entity: file.name,
          message: `原始资料 ${file.name} 已 ${Math.floor(daysSinceModified)} 天未更新`,
          severity: 0.6,
        });
      }
    });
    
    // 2. 检查链接完整性
    const entities = this._getAllEntities();
    entities.forEach(entity => {
      const brokenLinks = this._checkBrokenLinks(entity);
      if (brokenLinks.length > 0) {
        alerts.push({
          type: 'broken-links',
          entity,
          message: `实体 ${entity} 有 ${brokenLinks.length} 条断链`,
          severity: 0.8,
          details: brokenLinks,
        });
      }
    });
    
    // 3. 检查 wiki/ 是否有未编译的 raw/
    rawFiles.forEach(rawFile => {
      const entityFile = path.join(this.wikiDir, 'entities', `${rawFile.name}.md`);
      if (!fs.existsSync(entityFile)) {
        alerts.push({
          type: 'uncompiled',
          entity: rawFile.name,
          message: `原始资料 ${rawFile.name} 尚未编译到 wiki/`,
          severity: 0.5,
        });
      }
    });
    
    return alerts.sort((a, b) => b.severity - a.severity);
  }
  
  /**
   * 生成建议
   */
  _generateRecommendations() {
    const recommendations = [];
    
    // 1. 基于热点推荐深入方向
    const hotspots = this._detectHotspots();
    if (hotspots.length > 0) {
      recommendations.push({
        type: 'deep-dive',
        target: hotspots[0].entity,
        message: `建议深入探索「${hotspots[0].entity}」，热度最高`,
        priority: 'high',
      });
    }
    
    // 2. 基于缺失推荐补充
    const alerts = this._detectAlerts();
    const uncompiled = alerts.filter(a => a.type === 'uncompiled');
    if (uncompiled.length > 0) {
      recommendations.push({
        type: 'compile',
        target: uncompiled[0].entity,
        message: `建议编译 ${uncompiled[0].entity} 以完善知识库`,
        priority: 'medium',
      });
    }
    
    // 3. 基于断链推荐修复
    const brokenLinks = alerts.filter(a => a.type === 'broken-links');
    if (brokenLinks.length > 0) {
      recommendations.push({
        type: 'fix-links',
        target: brokenLinks[0].entity,
        message: `建议修复 ${brokenLinks[0].entity} 的断链问题`,
        priority: 'high',
      });
    }
    
    return recommendations;
  }
  
  /**
   * 保存简报
   */
  _saveBriefing(briefing) {
    const filename = `briefing-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`;
    const filepath = path.join(this.logsDir, filename);
    
    let content = `# 🧠 意识简报\n\n`;
    content += `**时间**: ${briefing.timestamp}\n\n`;
    content += `---\n\n`;
    
    content += `## 📊 摘要\n\n`;
    content += `- 实体总数: **${briefing.summary.totalEntities}**\n`;
    content += `- 原始资料: **${briefing.summary.totalRaw}**\n`;
    content += `- 连接总数: **${briefing.summary.totalLinks}**\n\n`;
    
    if (briefing.hotspots.length > 0) {
      content += `## 🔥 热点\n\n`;
      briefing.hotspots.forEach((h, i) => {
        content += `${i + 1}. **${h.entity}** — 热度 ${h.heat.toFixed(2)} (活力 ${h.vitality.toFixed(2)}, 连接 ${h.connections})\n`;
      });
      content += `\n`;
    }
    
    if (briefing.newConnections.length > 0) {
      content += `## 🔗 新发现连接\n\n`;
      briefing.newConnections.forEach(c => {
        content += `- [[${c.from}]] ↔ [[${c.to}]]\n`;
      });
      content += `\n`;
    }
    
    if (briefing.alerts.length > 0) {
      content += `## ⚠️ 告警\n\n`;
      briefing.alerts.forEach(a => {
        content += `- **[${a.type}]** ${a.message}\n`;
      });
      content += `\n`;
    }
    
    if (briefing.recommendations.length > 0) {
      content += `## 💡 建议\n\n`;
      briefing.recommendations.forEach(r => {
        content += `- **${r.priority}**: ${r.message}\n`;
      });
      content += `\n`;
    }
    
    fs.writeFileSync(filepath, content);
    
    console.log(`📋 简报已保存: ${filepath}`);
  }
  
  // ========== 辅助方法 ==========
  
  _getAllEntities() {
    const entitiesDir = path.join(this.wikiDir, 'entities');
    if (!fs.existsSync(entitiesDir)) return [];
    
    return fs.readdirSync(entitiesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  }
  
  _getAllRawFiles() {
    if (!fs.existsSync(this.rawDir)) return [];
    
    return fs.readdirSync(this.rawDir)
      .filter(f => f.endsWith('.md'))
      .map(name => ({ name, path: path.join(this.rawDir, name) }));
  }
  
  _countLinks() {
    const linksFile = path.join(this.wikiDir, 'links', 'index.md');
    if (!fs.existsSync(linksFile)) return 0;
    
    const content = fs.readFileSync(linksFile, 'utf8');
    const matches = content.match(/\[\[([^\]]+)\]\]/g);
    return matches ? matches.length : 0;
  }
  
  _getVitality(entityName) {
    const entityFile = path.join(this.wikiDir, 'entities', `${entityName}.md`);
    if (!fs.existsSync(entityFile)) return 0.5;
    
    const content = fs.readFileSync(entityFile, 'utf8');
    const match = content.match(/overall:\s*([\d.]+)/);
    return match ? parseFloat(match[1]) : 0.5;
  }
  
  _getConnectionCount(entityName) {
    const linksFile = path.join(this.wikiDir, 'links', 'index.md');
    if (!fs.existsSync(linksFile)) return 0;
    
    const content = fs.readFileSync(linksFile, 'utf8');
    const matches = content.match(new RegExp(`\\[\\[${entityName}\\]\\]`, 'g'));
    return matches ? matches.length : 0;
  }
  
  _getEntityMtime(entityName) {
    const entityFile = path.join(this.wikiDir, 'entities', `${entityName}.md`);
    if (!fs.existsSync(entityFile)) return 0;
    
    return fs.statSync(entityFile).mtimeMs;
  }
  
  _hasConnection(entity1, entity2) {
    const linksFile = path.join(this.wikiDir, 'links', 'index.md');
    if (!fs.existsSync(linksFile)) return false;
    
    const content = fs.readFileSync(linksFile, 'utf8');
    return content.includes(`[[${entity1}]]`) && content.includes(`[[${entity2}]]`);
  }
  
  _checkBrokenLinks(entityName) {
    const entityFile = path.join(this.wikiDir, 'entities', `${entityName}.md`);
    if (!fs.existsSync(entityFile)) return [];
    
    const content = fs.readFileSync(entityFile, 'utf8');
    const linkMatches = content.match(/\[\[([^\]|]+)(?:\|[^]]+)?\]\]/g) || [];
    
    return linkMatches
      .map(match => {
        const name = match.slice(2, -2).split('|')[0].trim();
        return { link: name, exists: this._entityExists(name) };
      })
      .filter(l => !l.exists);
  }
  
  _entityExists(name) {
    return fs.existsSync(path.join(this.wikiDir, 'entities', `${name}.md`));
  }
}

module.exports = ConsciousnessLayer;
