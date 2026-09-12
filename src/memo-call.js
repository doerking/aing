#!/usr/bin/env node
/**
 * memo-call.js — 备忘录呼叫系统
 * 
 * 功能：
 * 1. 监听"备忘录"关键词，自动触发识态加载
 * 2. 快速返回当前系统状态摘要
 * 3. 提供决策支持（当前任务、风险、建议）
 * 
 * 用法：
 *   node src/memo-call.js              # 快速状态摘要
 *   node src/memo-call.js --full       # 完整识态报告
 *   node src/memo-call.js --briefing   # 意识神经简报
 *   node src/memo-call.js --growth     # 生长决策
 */

const path = require('path');
const fs = require('fs');

// ========== 配置 ==========
const CONFIG = {
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  dataDir: path.join(__dirname, '..', 'data'),
  rawDir: path.join(__dirname, '..', 'raw'),
  wikiDir: path.join(__dirname, '..', 'wiki'),
};

// ========== 核心模块加载 ==========
function loadModules() {
  const modules = {};
  
  try {
    modules.store = require('./knowledge-store');
    modules.vectorSearch = require('./vector-search');
    modules.consciousnessKernel = require('./consciousness-kernel').ConsciousnessKernel;
    modules.growthDirector = require('./growth-director').GrowthDirector;
    modules.metacognition = require('./metacognition-layer');
    modules.autoIngest = require('./auto-ingest');
  } catch (err) {
    console.error('❌ 模块加载失败:', err.message);
  }
  
  return modules;
}

// ========== 状态采集 ==========
async function collectStatus(modules) {
  const status = {
    timestamp: new Date().toISOString(),
    knowledge: {},
    consciousness: {},
    growth: {},
    metacognition: {},
    tasks: [],
    risks: []
  };
  
  // 知识库状态
  if (modules.store) {
    try {
      const store = new modules.store.default(
        path.join(CONFIG.kbRoot, 'knowledge.db')
      );
      await store.init();
      const stats = store.getStats();
      status.knowledge = {
        entities: stats.totalEntities || stats.entities || 0,
        links: stats.totalLinks || 0,
        kespi: stats.avgKespi || 0,
        vectors: stats.vectorCount || 0,
        lastMetabolism: stats.lastMetabolism || null
      };
    } catch (err) {
      status.risks.push({ type: 'knowledge', message: `知识库状态获取失败: ${err.message}` });
    }
  }
  
  // 意识神经状态
  if (modules.consciousnessKernel) {
    try {
      const kernel = new modules.consciousnessKernel({ baseDir: CONFIG.kbRoot });
      const kernelStatus = kernel.status();
      status.consciousness = {
        state: kernelStatus.state,
        activeEvents: kernelStatus.activeEventCount || 0,
        arousal: kernelStatus.arousal,
        channelHealth: kernelStatus.channelHealth || {}
      };
    } catch (err) {
      status.risks.push({ type: 'consciousness', message: `意识神经状态获取失败: ${err.message}` });
    }
  }
  
  // 生长决策
  if (modules.growthDirector) {
    try {
      const director = new modules.growthDirector.default(
        path.join(CONFIG.kbRoot, 'knowledge.db')
      );
      await director.perceive();
      const decision = director.decide();
      status.growth = {
        action: decision.action,
        urgency: decision.urgencyLevel,
        reasons: decision.reasons
      };
    } catch (err) {
      status.risks.push({ type: 'growth', message: `生长决策获取失败: ${err.message}` });
    }
  }
  
  // 元认知状态
  if (modules.metacognition) {
    try {
      const meta = new modules.metacognition.default({
        stateDir: path.join(CONFIG.dataDir, 'metacognition')
      });
      const metaState = meta.selfState;
      status.metacognition = {
        confidence: metaState?.selfAwareness?.confidence || 0,
        knowledgeCoverage: metaState?.selfAwareness?.knowledgeCoverage || 0,
        adjustment: metaState?.evaluation?.adjustment || null
      };
    } catch (err) {
      status.risks.push({ type: 'metacognition', message: `元认知状态获取失败: ${err.message}` });
    }
  }
  
  // 当前任务（从会话记录推断）
  status.tasks = inferCurrentTasks();
  
  return status;
}

// ========== 推断当前任务 ==========
function inferCurrentTasks() {
  const tasks = [];
  const rawDir = CONFIG.rawDir;
  
  try {
    // 检查最新的会话文件
    const files = fs.readdirSync(rawDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 3);
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(rawDir, file), 'utf8');
      const lines = content.split('\n').slice(0, 20);
      const title = lines.find(l => l.startsWith('# '))?.replace('# ', '') || file;
      tasks.push({
        file,
        title,
        time: file.match(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/)?.[0] || 'unknown'
      });
    }
  } catch (err) {
    // 忽略错误
  }
  
  return tasks;
}

// ========== 快速状态摘要 ==========
function printQuickStatus(status) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    🧠 备忘录 — 快速识态                      ║
╠══════════════════════════════════════════════════════════════╣
║  时间：${status.timestamp.slice(0, 19).replace('T', ' ')}                              
║  知识实体：${String(status.knowledge.entities || 0).padEnd(40)} ║
║  KESPI 均分：${String((status.knowledge.kespi || 0).toFixed(2)).padEnd(40)} ║
║  意识状态：${String(status.consciousness.state || 'unknown').padEnd(40)} ║
║  生长决策：${String(status.growth.action || 'observe').padEnd(40)} ║
║  元认知置信：${String((status.metacognition.confidence || 0).toFixed(2)).padEnd(40)} ║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  风险：${status.risks.length > 0 ? status.risks.length + ' 项' : '无'}                                    
║  📋  任务：${status.tasks.length > 0 ? status.tasks.length + ' 个活跃' : '无'}                                  
╚══════════════════════════════════════════════════════════════╝
  `);
}

// ========== 完整识态报告 ==========
function printFullStatus(status) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   🧠 备忘录 — 完整识态                       ║
╠══════════════════════════════════════════════════════════════╣
`);
  
  // 知识库状态
  console.log('📊 知识库状态：');
  console.log(`   实体数：${status.knowledge.entities || 0}`);
  console.log(`   链接数：${status.knowledge.links || 0}`);
  console.log(`   KESPI 均分：${(status.knowledge.kespi || 0).toFixed(2)}`);
  console.log(`   向量数：${status.knowledge.vectors || 0}`);
  console.log('');
  
  // 意识神经状态
  console.log('🧠 意识神经状态：');
  console.log(`   状态：${status.consciousness.state || 'unknown'}`);
  console.log(`   活跃事件：${status.consciousness.activeEvents || 0}`);
  console.log(`   唤醒度：${status.consciousness.arousal || 'idle'}`);
  console.log('');
  
  // 生长决策
  console.log('🌱 生长决策：');
  console.log(`   动作：${status.growth.action || 'observe'}`);
  console.log(`   紧急度：${status.growth.urgency || 'low'}`);
  if (status.growth.reasons?.length > 0) {
    console.log('   原因：');
    for (const reason of status.growth.reasons.slice(0, 3)) {
      console.log(`     • ${reason}`);
    }
  }
  console.log('');
  
  // 元认知状态
  console.log('🔍 元认知状态：');
  console.log(`   置信度：${(status.metacognition.confidence || 0).toFixed(2)}`);
  console.log(`   知识覆盖：${(status.metacognition.knowledgeCoverage || 0).toFixed(2)}`);
  console.log('');
  
  // 当前任务
  console.log('📋 当前任务：');
  if (status.tasks.length > 0) {
    for (const task of status.tasks.slice(0, 3)) {
      console.log(`   • ${task.title} (${task.time})`);
    }
  } else {
    console.log('   无活跃任务');
  }
  console.log('');
  
  // 风险
  console.log('⚠️  风险：');
  if (status.risks.length > 0) {
    for (const risk of status.risks.slice(0, 3)) {
      console.log(`   • [${risk.type}] ${risk.message}`);
    }
  } else {
    console.log('   无风险');
  }
  
  console.log(`
╠══════════════════════════════════════════════════════════════╣
║  生成时间：${status.timestamp}                            
║  知识库路径：${CONFIG.kbRoot}                      
╚══════════════════════════════════════════════════════════════╝
  `);
}

// ========== 主函数 ==========
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'quick';
  
  console.log('🧠 备忘录系统启动...');
  
  const modules = loadModules();
  const status = await collectStatus(modules);
  
  switch (mode) {
    case '--full':
    case '--verbose':
      printFullStatus(status);
      break;
    case '--briefing':
      // 意识神经简报模式
      console.log('🧠 意识神经简报：');
      console.log(JSON.stringify(status.consciousness, null, 2));
      break;
    case '--growth':
      // 生长决策模式
      console.log('🌱 生长决策：');
      console.log(JSON.stringify(status.growth, null, 2));
      break;
    case '--quick':
    default:
      printQuickStatus(status);
  }
}

main().catch(err => {
  console.error('❌ 备忘录系统失败:', err.message);
  process.exit(1);
});

module.exports = { collectStatus, loadModules };
