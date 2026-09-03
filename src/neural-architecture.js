#!/usr/bin/env node
/**
 * neural-architecture.js — 意识神经架构主控制器
 * 
 * 整合三层架构：
 * 🌿 神经末梢（感知层）→ 信号采集
 * 🔗 神经导链（路由层）→ 注意力分配
 * 🧠 意识层（输出层）→ 洞察生成
 */

const SensoryEndings = require('./sensory-ends');
const NeuralGuideChain = require('./neural-guide-chain');
const ConsciousnessLayer = require('./consciousness-layer');
const fs = require('fs');
const path = require('path');

class NeuralArchitecture {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    
    // 初始化三层
    this.sensory = new SensoryEndings({
      baseDir: this.baseDir,
      watchInterval: options.watchInterval || 5000,
    });
    
    this.guideChain = new NeuralGuideChain({
      baseDir: this.baseDir,
      userInterests: options.userInterests || {},
    });
    
    this.consciousness = new ConsciousnessLayer({
      baseDir: this.baseDir,
    });
    
    // 运行状态
    this.isRunning = false;
    this.tickCount = 0;
  }
  
  /**
   * 启动神经架构
   */
  async start() {
    console.log('🧠 意识神经架构启动...');
    console.log(`📂 知识库: ${this.baseDir}\n`);
    
this.isRunning = true;

// 先注册信号监听再启动末梢：start() 可能同步触发首次扫描并发信号，
// 若先 start 后注册监听，第一批信号会全部丢失
this.sensory.on('signal', (signal) => {
  this._handleSignal(signal);
});

// 启动末梢监听
this.sensory.start();
    
    // 定时 tick
    this._startTicking();
    
    console.log('✅ 意识神经架构运行中\n');
    
    return this;
  }
  
  /**
   * 停止神经架构
   */
  stop() {
    console.log('\n🧠 意识神经架构停止...');
    this.isRunning = false;
    this.sensory.stop();
  }
  
  /**
   * 处理信号
   */
  _handleSignal(signal) {
    // 1. 路由层处理
    const routes = this.guideChain.routeSignals([signal]);
    
    // 2. 如果有高优先级路由，触发意识层
    const highPriority = routes.find(r => r.recommendation.priority === 'high');
    if (highPriority) {
      console.log(`⚡ 高优先级信号: ${highPriority.target}`);
      this._triggerConsciousness();
    }
  }
  
  /**
   * 触发意识层
   */
  _triggerConsciousness() {
    const briefing = this.consciousness.generateBriefing();
    this._logBriefing(briefing);
  }
  
  /**
   * 定时 tick
   */
  _startTicking() {
    const TICK_INTERVAL = 30000; // 30秒一次
    
    setInterval(() => {
      if (!this.isRunning) return;
      
      this.tickCount++;
      
      // 每10次 tick 生成一次简报
      if (this.tickCount % 10 === 0) {
        this._triggerConsciousness();
      }
      
      // 每5次 tick 扫描一次目录
      if (this.tickCount % 5 === 0) {
        this.sensory.scanDirectory();
      }
    }, TICK_INTERVAL);
  }
  
  /**
   * 手动触发完整代谢
   */
  async runFullMetabolism() {
    console.log('\n🔄 执行完整代谢流程...\n');
    
    // 1. 感知层扫描
    console.log('🌿 [感知层] 扫描信号...');
    const signals = this.sensory.scanDirectory();
    console.log(`   发现 ${signals.rawCount} 个 raw 文件, ${signals.wikiCount} 个 wiki 实体\n`);
    
    // 2. 路由层处理
    console.log('🔗 [路由层] 分配注意力...');
    const routes = this.guideChain.routeSignals(
      signals.files.map(f => ({
        type: 'add',
        source: 'filesystem',
        timestamp: Date.now(),
        relativePath: f,
      }))
    );
    console.log(`   分配 ${routes.length} 个注意力目标\n`);
    
    // 3. 意识层输出
    console.log('🧠 [意识层] 生成简报...');
    const briefing = this.consciousness.generateBriefing();
    
    // 4. 输出摘要
    this._printSummary(briefing);
    
    return briefing;
  }
  
  /**
   * 打印摘要
   */
  _printSummary(briefing) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 代谢结果摘要');
    console.log('='.repeat(60));
    console.log(`实体总数: ${briefing.summary.totalEntities}`);
    console.log(`原始资料: ${briefing.summary.totalRaw}`);
    console.log(`连接总数: ${briefing.summary.totalLinks}`);
    
    if (briefing.hotspots.length > 0) {
      console.log(`\n🔥 热点:`);
      briefing.hotspots.slice(0, 3).forEach(h => {
        console.log(`   - ${h.entity} (热度 ${h.heat.toFixed(2)})`);
      });
    }
    
    if (briefing.alerts.length > 0) {
      console.log(`\n⚠️ 告警 (${briefing.alerts.length}):`);
      briefing.alerts.slice(0, 3).forEach(a => {
        console.log(`   - [${a.type}] ${a.message}`);
      });
    }
    
    console.log('='.repeat(60) + '\n');
  }
  
  /**
   * 记录简报
   */
  _logBriefing(briefing) {
    const logFile = path.join(this.baseDir, 'logs', 'consciousness', 'briefings.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(briefing) + '\n');
  }
}

module.exports = NeuralArchitecture;

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseDir = args.find(a => a.startsWith('--base-dir='))?.split('=')[1] || process.cwd();
  const full = args.includes('--full');
  
  const arch = new NeuralArchitecture({ baseDir });
  
  if (full) {
    arch.runFullMetabolism()
      .then(() => process.exit(0))
      .catch(e => {
        console.error('❌ 代谢失败:', e.message);
        process.exit(1);
      });
  } else {
    arch.start();
    
    // 保持运行
    process.on('SIGINT', () => {
      arch.stop();
      process.exit(0);
    });
  }
}
