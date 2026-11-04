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
// W7 (2026-11-03)：用户兴趣因子单源走 config（growth.config 的 guideChain 段，config-runtime 读取口；代码不再硬编码示例词）
const { guideChainTuning } = require('./config-runtime');
// B1（2026-11-05 修单）：导链的感觉输入改吃 DB 活读（links 表），wiki/links/index.md 降级为纯人读投影
// （可落后、可重建）；老 Node（无 node:sqlite）上活读不可用时，行为与旧「index.md 缺失」分支逐值等价（不更糟）。
const { readLive } = require('./db-live-reader');

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
    this.userInterests = options.userInterests || guideChainTuning().userInterests; // W7 (2026-11-03)：改读 config.guideChain.userInterests（单源，纪律 5；原硬编码 4 词已迁入 config 作缺省，行为不变）
this.userInterestDefault = guideChainTuning().userInterestDefault; // W7：缺省兴趣分也单源 config（原 || 0.5 硬编码；实体未命中兴趣词时不再退化成代码常数）
    
    // 确保目录存在
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // B1：DB 活读缓存（一次读全量，进程内复用）
    this._liveCache = null;
  }

  /** B1：懒加载 DB 活读快照（links + entities），老 Node 无 node:sqlite 时 available=false。 */
  _live() {
    if (this._liveCache) return this._liveCache;
    this._liveCache = readLive(path.join(this.baseDir, 'knowledge.db'));
    return this._liveCache;
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
      .map(([target, data]) => {
        const attentionScore = data.total / data.count;
        return {
          target,
          attentionScore,
          signalCount: data.count,
          latestAt: new Date(data.latestTimestamp).toISOString(),
          // 修复：必须传入含 attentionScore 的对象；曾传原始 data（无该字段）致优先级永远 low，
          // 高优先级唤醒机制（含 _handleSignal 的简报触发）从未真正生效
          recommendation: this._generateRecommendation(target, { attentionScore }),
        };
      })
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
    const userInterest = this.userInterests[entityName] != null ? this.userInterests[entityName] : this.userInterestDefault; // W7 (2026-11-03)：缺省分走 config 单源（原 || 0.5 常数）；!= null 判空防 0 分被当缺省
    
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
    
    // 从 KESPI 分数提取活力（KESPI block 是 ```json 格式 "overall": 0.87，旧 YAML 正则全库命中 0 →
    // 永远落到时间衰减分支。修正 2026-11-03：兼容 JSON 写法。）
    const kespiMatch = content.match(/"?overall"?\s*:\s*([\d.]+)/);
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
   * B1（2026-11-05 修单）：改读 DB links 表活值；index.md 不再是机器判据（纯投影，可落后）。
   * 不可用时返回 0.3 —— 与旧「index.md 缺失」分支逐值等价，删除/改旧 index.md 不影响导链输出。
   */
  _getConnectionDensity(entityName) {
    const live = this._live();
    if (!live.available) return 0.3; // 等价旧 index.md 缺失
    const n = live.links.filter(l => l.source_id === entityName || l.target_id === entityName).length;
    // 旧公式 matches.length/5：一次匹配=一条边；DB 侧按边数计数（同实体出现在 A 或 B 端即一条）
    return Math.min(1.0, n / 5);
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
    // B1（2026-11-05 修单）：直连判定改读 DB links 表（双向任一即直连）；index.md 不再是机器判据。
    // 不可用时 direct=false，commonNeighbors 由 _getNeighbors 的 DB 侧决定（缺则空），与旧缺失分支等价。
    const live = this._live();
    let hasDirect = false;
    if (live.available) {
      hasDirect = live.links.some(l =>
        (l.source_id === entity1 && l.target_id === entity2) ||
        (l.source_id === entity2 && l.target_id === entity1));
    }

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
   * B1（2026-11-05 修单）：改读 DB links 表活值（双向邻居）；index.md 不再是机器判据。
   * 不可用时返回 [] —— 与旧「index.md 缺失」分支逐值等价。
   */
  _getNeighbors(entityName) {
    const live = this._live();
    if (!live.available) return []; // 等价旧 index.md 缺失
    const set = live.neighbors[entityName];
    return set ? [...set] : [];
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
