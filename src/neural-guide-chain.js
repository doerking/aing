#!/usr/bin/env node
/**
 * neural-guide-chain.js — 神经导链路由层
 * 
 * 功能：接收末梢信号，路由注意力，推荐探索路径
 * 
 * 模块：
 * - 🧭 热点追踪：生成知识热力图
 * - 🗺️ 发现路径：自动推荐探索路线
 * - 🔗 意外连接：发现隐藏关联
 * - ⚡ 注意力分配：根据优先级决定处理顺序
 * - 🚦 信号路由：分发信号到处理模块
 * 
 * 注意力分数公式：
 * attention = vitality × 0.3 + recency × 0.25 
 *           + connection_density × 0.2 + anomaly × 0.15 
 *           + user_interest × 0.1
 */

const fs = require('fs');
const path = require('path');

class NeuralGuideChain {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.wikiDir = path.join(this.baseDir, 'wiki');
    this.logsDir = path.join(this.baseDir, 'logs', 'guide-chain');
    
    // 权重配置
    this.weights = {
      vitality: 0.3,
      recency: 0.25,
      connectionDensity: 0.2,
      anomaly: 0.15,
      userInterest: 0.1,
    };
    
    // 用户兴趣映射
    this.userInterests = options.userInterests || {
      'dual-brain': 0.9,
      'architecture': 0.8,
      'cache': 0.7,
      'agent': 0.6,
    };
    
    // 确保目录存在
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }
  
  /**
   * 处理信号并分配注意力
   * @param {Array} signals - 末梢信号列表
   */
  routeSignals(signals) {
    console.log(`🔗 神经导链处理 ${signals.length} 个信号...`);
    
    const attentionMap = new Map();
    
    signals.forEach(signal => {
      const target = this._extractTarget(signal);
      if (!target) return;
      
      // 计算注意力分数
      const score = this._calculateAttention(target, signal);
      
      // 累加到目标
      if (!attentionMap.has(target)) {
        attentionMap.set(target, {
          total: 0,
          count: 0,
          signals: [],
          latestTimestamp: 0,
        });
      }
      
      const entry = attentionMap.get(target);
      entry.total += score;
      entry.count += 1;
      entry.signals.push(signal);
      entry.latestTimestamp = Math.max(entry.latestTimestamp, signal.timestamp);
      
      attentionMap.set(target, entry);
    });
    
    // 排序并返回路由建议
    const routes = Array.from(attentionMap.entries())
      .map(([target, data]) => ({
        target,
        attentionScore: data.total / data.count,
        signalCount: data.count,
        latestAt: new Date(data.latestTimestamp).toISOString(),
        recommendation: this._generateRecommendation(target, data),
      }))
      .sort((a, b) => b.attentionScore - a.attentionScore);
    
    this._logRoutes(routes);
    
    return routes;
  }
  
  /**
   * 计算实体注意力分数
   * 公式：attention = vitality × 0.3 + recency × 0.25 
   *            + connection_density × 0.2 + anomaly × 0.15 
   *            + user_interest × 0.1
   */
  _calculateAttention(entityName, signal) {
    // 1. 活力值 (vitality) - 从实体文件获取
    const vitality = this._getVitality(entityName);
    
    // 2. 时效性 (recency) - 基于时间衰减
    const recency = this._calculateRecency(signal.timestamp);
    
    // 3. 连接密度 (connection_density)
    const connectionDensity = this._getConnectionDensity(entityName);
    
    // 4. 异常度 (anomaly) - 检测异常模式
    const anomaly = this._detectAnomaly(entityName, signal);
    
    // 5. 用户兴趣 (user_interest)
    const userInterest = this.userInterests[entityName] || 0.5;
    
    // 加权计算
    const score = 
      vitality * this.weights.vitality +
      recency * this.weights.recency +
      connectionDensity * this.weights.connectionDensity +
      anomaly * this.weights.anomaly +
      userInterest * this.weights.userInterest;
    
    return Math.min(1.0, Math.max(0.0, score));
  }
  
  /**
   * 获取实体活力值
   */
  _getVitality(entityName) {
    const entityFile = path.join(this.wikiDir, 'entities', `${entityName}.md`);
    
    if (!fs.existsSync(entityFile)) {
      return 0.5; // 默认中等活力
    }
    
    const content = fs.readFileSync(entityFile, 'utf8');
    
    // 从 KESPI 分数提取活力
    const kespiMatch = content.match(/overall:\s*([\d.]+)/);
    if (kespiMatch) {
      return parseFloat(kespiMatch[1]);
    }
    
    // 从修改时间计算
    const stat = fs.statSync(entityFile);
    const hoursSinceModified = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
    
    // 时间衰减：越新活力越高
    return Math.max(0.1, 1.0 - (hoursSinceModified / 168)); // 7天半衰期
  }
  
  /**
   * 计算时效性分数
   */
  _calculateRecency(timestamp) {
    const hoursSince = (Date.now() - timestamp) / (1000 * 60 * 60);
    // 指数衰减
    return Math.exp(-hoursSince / 24); // 24小时半衰期
  }
  
  /**
   * 获取连接密度
   */
  _getConnectionDensity(entityName) {
    const linksFile = path.join(this.wikiDir, 'links', 'index.md');
    
    if (!fs.existsSync(linksFile)) {
      return 0.3;
    }
    
    const content = fs.readFileSync(linksFile, 'utf8');
    const matches = content.match(new RegExp(`\\[\\[${entityName}\\]\\]`, 'g'));
    
    return matches ? Math.min(1.0, matches.length / 5) : 0.3;
  }
  
  /**
   * 检测异常
   */
  _detectAnomaly(entityName, signal) {
    // 检测快速连续变化（可能是批量导入或异常编辑）
    // 这里简化处理，实际可以结合历史记录
    if (signal.type === 'delete') {
      return 0.8; // 删除是高风险事件
    }
    
    if (signal.type === 'add') {
      return 0.4; // 新增是中风险
    }
    
    return 0.2;
  }
  
  /**
   * 生成路由建议
   */
  _generateRecommendation(entityName, data) {
    const score = data.attentionScore;
    
    if (score >= 0.8) {
      return { action: 'immediate', priority: 'high', message: `立即处理 ${entityName}（高注意力）` };
    } else if (score >= 0.5) {
      return { action: 'schedule', priority: 'medium', message: `计划处理 ${entityName}（中等注意力）` };
    } else {
      return { action: 'defer', priority: 'low', message: `暂缓 ${entityName}（低注意力）` };
    }
  }
  
  /**
   * 生成热点追踪报告
   */
  generateHeatmap() {
    const entities = this._getAllEntities();
    const heatmap = [];
    
    entities.forEach(entity => {
      const vitality = this._getVitality(entity);
      const connections = this._getConnectionDensity(entity);
      const score = vitality * 0.6 + connections * 0.4;
      
      heatmap.push({
        entity,
        vitality,
        connections,
        score,
      });
    });
    
    return heatmap.sort((a, b) => b.score - a.score);
  }
  
  /**
   * 发现探索路径
   */
  findPaths(startEntity, maxDepth = 3) {
    const paths = [];
    const visited = new Set();
    
    const dfs = (current, depth, path) => {
      if (depth >= maxDepth) return;
      
      visited.add(current);
      path.push(current);
      
      const neighbors = this._getNeighbors(current);
      
      if (neighbors.length > 0) {
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) {
            dfs(neighbor, depth + 1, [...path]);
          }
        });
      } else if (path.length > 1) {
        paths.push(path);
      }
      
      visited.delete(current);
    };
    
    dfs(startEntity, 0, []);
    
    return paths;
  }
  
  /**
   * 发现意外连接
   */
  findUnexpectedConnections() {
    const entities = this._getAllEntities();
    const connections = [];
    
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const conn = this._checkConnection(entities[i], entities[j]);
        if (conn && conn.isUnexpected) {
          connections.push(conn);
        }
      }
    }
    
    return connections;
  }
  
  /**
   * 检查两个实体是否有连接
   */
  _checkConnection(entity1, entity2) {
    const linksFile = path.join(this.wikiDir, 'links', 'index.md');
    
    if (!fs.existsSync(linksFile)) {
      return null;
    }
    
    const content = fs.readFileSync(linksFile, 'utf8');
    const hasDirect = content.includes(`[[${entity1}]]`) && content.includes(`[[${entity2}]]`);
    
    // 检查是否有共同邻居
    const neighbors1 = this._getNeighbors(entity1);
    const neighbors2 = this._getNeighbors(entity2);
    const commonNeighbors = neighbors1.filter(n => neighbors2.includes(n));
    
    return {
      entity1,
      entity2,
      direct: hasDirect,
      commonNeighbors,
      isUnexpected: commonNeighbors.length > 0 && !hasDirect,
      strength: commonNeighbors.length,
    };
  }
  
  /**
   * 获取实体邻居
   */
  _getNeighbors(entityName) {
    const linksFile = path.join(this.wikiDir, 'links', 'index.md');
    
    if (!fs.existsSync(linksFile)) {
      return [];
    }
    
    const content = fs.readFileSync(linksFile, 'utf8');
    // 逐行提取 wiki 链接：一行内含多个链接且其中之一是目标实体 → 其余即邻居
    // 兼容任意分隔格式（→ ↔ ← / relates 等）
    const neighbors = new Set();
    for (const line of content.split('\n')) {
      if (!line.includes(entityName)) continue;
      const links = [...line.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim());
      if (links.length < 2) continue;
      if (links.includes(entityName)) {
        for (const other of links) {
          if (other !== entityName) neighbors.add(other);
        }
      }
    }
    return [...neighbors];
  }
  
  /**
   * 获取所有实体名称
   */
  _getAllEntities() {
    const entitiesDir = path.join(this.wikiDir, 'entities');
    
    if (!fs.existsSync(entitiesDir)) {
      return [];
    }
    
    return fs.readdirSync(entitiesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  }
  
  /**
   * 提取信号目标
   */
  _extractTarget(signal) {
    const match = signal.relativePath?.match(/([\w-]+)\.md$/);
    return match ? match[1] : null;
  }
  
  /**
   * 记录路由日志
   */
  _logRoutes(routes) {
    const logFile = path.join(this.logsDir, `routes-${new Date().toISOString().slice(0, 10)}.jsonl`);
    routes.forEach(route => {
      fs.appendFileSync(logFile, JSON.stringify(route) + '\n');
    });
  }
}

module.exports = NeuralGuideChain;
