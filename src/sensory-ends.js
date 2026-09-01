#!/usr/bin/env node
/**
 * sensory-ends.js — 神经末梢感知层
 * 
 * 功能：监听外部信号，上报状态变化
 * 
 * 末梢类型：
 * - 📁 文件监听：定时轮询 raw/ 目录快照对比（非 fs.watch，Windows 上 fs.watch 事件不可靠）
 * - ⏰ 定时器：定时轮询知识状态
 * - 📊 活力探针：内部状态检测
 * - 💬 对话接口：消息接收
 * 
 * 原则：每个末梢独立运行，只负责感知上报，不负责决策。
 */

const fs = require('fs');
const path = require('path');

class SensoryEndings {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.rawDir = path.join(this.baseDir, 'raw');
    this.wikiDir = path.join(this.baseDir, 'wiki');
    this.logsDir = path.join(this.baseDir, 'logs', 'sensory');
    
    // 信号队列
    this.signalQueue = [];
    this.listeners = new Map();
    
    // 监控配置
    this.config = {
      watchInterval: options.watchInterval || 5000,  // 5秒轮询
      maxQueueSize: options.maxQueueSize || 100,
      sensitivity: options.sensitivity || 0.7,  // 触发敏感度
    };
    
    // 上一状态快照
    this.lastSnapshot = null;
    
    // 创建目录
    this._ensureDirs();
  }
  
  _ensureDirs() {
    [this.rawDir, this.wikiDir, this.logsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * 创建文件系统信号
   * @param {string} eventType - 'add' | 'change' | 'delete'
   * @param {string} filePath - 文件路径
   * @param {*} data - 额外数据
   */
  createSignal(eventType, filePath, data = null) {
    const signal = {
      id: this._generateId(),
      type: eventType,
      source: 'filesystem',
      timestamp: Date.now(),
      filePath: filePath,
      relativePath: path.relative(this.baseDir, filePath),
      data: data,
      severity: this._calculateSeverity(eventType, filePath),
    };
    
    this._enqueue(signal);
    this._emit('signal', signal);
    
    console.log(`📡 [末梢] ${eventType}: ${signal.relativePath}`);
    
    return signal;
  }
  
  /**
   * 扫描目录变化并生成信号
   */
  scanDirectory() {
    const files = this._getFiles(this.rawDir);
    const wikiFiles = this._getFiles(this.wikiDir);
    
    const snapshot = {
      timestamp: Date.now(),
      rawCount: files.length,
      wikiCount: wikiFiles.length,
      files: files.map(f => f.name),
      wikiEntities: wikiFiles.filter(f => f.path.includes('entities')).map(f => f.name),
    };
    
    // 对比上次快照
    const changes = this.lastSnapshot ? this._detectChanges(this.lastSnapshot, snapshot) : [];
    
    if (this.lastSnapshot) {
      changes.forEach(change => {
        this.createSignal(change.type, path.join(this.rawDir, change.filename));
      });
    }
    
    this.lastSnapshot = snapshot;
    
    // 记录日志
    this._logSignal({
      type: 'scan',
      snapshot: snapshot,
      changes: changes || [],
    });
    
    return snapshot;
  }
  
  /**
   * 检测文件变化
   */
  _detectChanges(prev, curr) {
    const prevFiles = new Set(prev.files || []);
    const currFiles = new Set(curr.files || []);
    
    const changes = [];
    
    // 新增文件
    currFiles.forEach(f => {
      if (!prevFiles.has(f)) {
        changes.push({ type: 'add', filename: f });
      }
    });
    
    // 删除文件
    prevFiles.forEach(f => {
      if (!currFiles.has(f)) {
        changes.push({ type: 'delete', filename: f });
      }
    });
    
    return changes;
  }
  
  /**
   * 获取目录下的所有 md 文件
   */
  _getFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(name => ({ name, path: path.join(dir, name) }));
  }
  
  /**
   * 计算信号严重程度
   */
  _calculateSeverity(eventType, filePath) {
    const severityMap = {
      'add': 0.7,
      'change': 0.5,
      'delete': 0.9,
    };
    
    // 高优先级文件
    const highPriority = ['dual-brain.md', 'design-patterns.md', 'architecture.md'];
    const isHighPriority = highPriority.some(p => filePath.includes(p));
    
    return isHighPriority ? 0.9 : (severityMap[eventType] || 0.5);
  }
  
  /**
   * 入队信号
   */
  _enqueue(signal) {
    this.signalQueue.push(signal);
    
    // 限制队列大小
    if (this.signalQueue.length > this.config.maxQueueSize) {
      this.signalQueue.shift();
    }
  }
  
  /**
   * 发送事件
   */
  _emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        console.error(`❌ [末梢] 事件处理错误: ${e.message}`);
      }
    });
  }
  
  /**
   * 注册监听器
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }
  
  /**
   * 日志记录
   */
  _logSignal(data) {
    const logFile = path.join(this.logsDir, `sensory-${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(data) + '\n');
  }
  
  /**
   * 生成唯一 ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 启动监控
   */
  start() {
    console.log('🌿 神经末梢启动...');
    
    // 立即扫描一次
    this.scanDirectory();
    
    // 定时扫描
    this.interval = setInterval(() => {
      this.scanDirectory();
    }, this.config.watchInterval);
    
    return this;
  }
  
  /**
   * 停止监控
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    console.log('🌿 神经末梢停止');
  }
  
  /**
   * 获取待处理信号
   */
  getSignals() {
    const signals = this.signalQueue.filter(s => s.severity >= this.config.sensitivity);
    this.signalQueue = this.signalQueue.filter(s => s.severity < this.config.sensitivity);
    return signals;
  }
  
  /**
   * 获取状态摘要
   */
  getStatus() {
    return {
      rawCount: this.lastSnapshot?.rawCount || 0,
      wikiCount: this.lastSnapshot?.wikiCount || 0,
      queueSize: this.signalQueue.length,
      lastScan: this.lastSnapshot?.timestamp,
    };
  }
}

module.exports = SensoryEndings;
