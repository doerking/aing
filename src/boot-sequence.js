#!/usr/bin/env node
/**
 * boot-sequence.js — 开机自检模块
 * 
 * 功能：
 * 1. 每次对话开始时自动运行
 * 2. 加载完整识态（知识、意识、任务、风险）
 * 3. 基于识态生成"第一印象"
 * 4. 为后续对话提供上下文
 * 
 * 用法：
 *   const boot = require('./src/boot-sequence');
 *   const state = await boot.run();
 *   // state 包含当前识态，用于对话初始化
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

// ========== 识态采集 ==========
async function collectState(modules) {
  const state = {
    timestamp: new Date().toISOString(),
    knowledge: {},
    consciousness: {},
    growth: {},
    metacognition: {},
    tasks: [],
    risks: [],
    userProfile: {},
    firstImpression: ''
  };
  
  // 1. 知识库状态
  if (modules.store) {
    try {
      const store = new modules.store.default(
        path.join(CONFIG.kbRoot, 'knowledge.db')
      );
      await store.init();
      const stats = store.getStats();
      state.knowledge = {
        entities: stats.totalEntities || stats.entities || 0,
        links: stats.totalLinks || 0,
        kespi: stats.avgKespi || 0,
        vectors: stats.vectorCount || 0,
        lastMetabolism: stats.lastMetabolism || null,
        health: stats.avgKespi > 0.8 ? 'healthy' : stats.avgKespi > 0.6 ? 'warning' : 'critical'
      };
    } catch (err) {
      state.risks.push({ type: 'knowledge', message: `知识库状态获取失败: ${err.message}` });
    }
  }
  
  // 2. 意识神经状态
  if (modules.consciousnessKernel) {
    try {
      const kernel = new modules.consciousnessKernel({ baseDir: CONFIG.kbRoot });
      const kernelStatus = kernel.status();
      state.consciousness = {
        state: kernelStatus.state,
        activeEvents: kernelStatus.activeEventCount || 0,
        arousal: kernelStatus.arousal,
        channelHealth: kernelStatus.channelHealth || {},
        lastArousal: kernelStatus.lastArousalAt || null
      };
    } catch (err) {
      state.risks.push({ type: 'consciousness', message: `意识神经状态获取失败: ${err.message}` });
    }
  }
  
  // 3. 生长决策
  if (modules.growthDirector) {
    try {
      const director = new modules.growthDirector.default(
        path.join(CONFIG.kbRoot, 'knowledge.db')
      );
      await director.perceive();
      const decision = director.decide();
      state.growth = {
        action: decision.action,
        urgency: decision.urgencyLevel,
        reasons: decision.reasons,
        consecutiveStagnant: director.consecutiveStagnant,
        consecutiveHealthy: director.consecutiveHealthy
      };
    } catch (err) {
      state.risks.push({ type: 'growth', message: `生长决策获取失败: ${err.message}` });
    }
  }
  
  // 4. 元认知状态
  if (modules.metacognition) {
    try {
      const meta = new modules.metacognition.default({
        stateDir: path.join(CONFIG.dataDir, 'metacognition')
      });
      const metaState = meta.selfState;
      state.metacognition = {
        confidence: metaState?.selfAwareness?.confidence || 0,
        knowledgeCoverage: metaState?.selfAwareness?.knowledgeCoverage || 0,
        evaluation: metaState?.evaluation || null,
        adjustment: metaState?.adjustment || null
      };
    } catch (err) {
      state.risks.push({ type: 'metacognition', message: `元认知状态获取失败: ${err.message}` });
    }
  }
  
  // 5. 当前任务（从会话记录推断）
  state.tasks = inferCurrentTasks();
  
  // 6. 用户画像（从历史交互推断）
  state.userProfile = inferUserProfile();
  
  // 7. 生成第一印象
  state.firstImpression = generateFirstImpression(state);
  
  return state;
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
      .slice(0, 5);
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(rawDir, file), 'utf8');
      const lines = content.split('\n').slice(0, 20);
      const title = lines.find(l => l.startsWith('# '))?.replace('# ', '') || file;
      const time = file.match(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/)?.[0] || 'unknown';
      tasks.push({
        file,
        title,
        time,
        type: inferTaskType(content)
      });
    }
  } catch (err) {
    // 忽略错误
  }
  
  return tasks;
}

// ========== 推断任务类型 ==========
function inferTaskType(content) {
  if (content.includes('部署') || content.includes('deploy')) return 'deployment';
  if (content.includes('风险') || content.includes('ticket')) return 'risk-fix';
  if (content.includes('对话') || content.includes('session')) return 'conversation';
  if (content.includes('代谢') || content.includes('metabolism')) return 'metabolism';
  return 'general';
}

// ========== 推断用户画像 ==========
function inferUserProfile() {
  const profile = {
    communicationStyle: 'direct',
    focusAreas: [],
    decisionPattern: 'analyze-first',
    riskTolerance: 'medium'
  };
  
  // 从历史会话推断
  const rawDir = CONFIG.rawDir;
  try {
    const files = fs.readdirSync(rawDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.md'))
      .slice(-10); // 最近 10 个会话
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(rawDir, file), 'utf8');
      
      // 推断关注领域
      if (content.includes('意识神经') || content.includes('consciousness')) {
        if (!profile.focusAreas.includes('consciousness')) profile.focusAreas.push('consciousness');
      }
      if (content.includes('KESPI') || content.includes('代谢')) {
        if (!profile.focusAreas.includes('knowledge')) profile.focusAreas.push('knowledge');
      }
      if (content.includes('风险') || content.includes('ticket')) {
        if (!profile.focusAreas.includes('risk')) profile.focusAreas.push('risk');
      }
    }
    
    // 推断沟通风格
    const recentContent = files.map(f => fs.readFileSync(path.join(rawDir, f), 'utf8')).join('\n');
    if (recentContent.length > 10000) {
      profile.communicationStyle = 'detailed';
    } else if (recentContent.includes('快速') || recentContent.includes('quick')) {
      profile.communicationStyle = 'concise';
    }
    
  } catch (err) {
    // 忽略错误
  }
  
  return profile;
}

// ========== 生成第一印象 ==========
function generateFirstImpression(state) {
  const parts = [];
  
  // 知识库健康
  if (state.knowledge.health === 'healthy') {
    parts.push('知识库健康（KESPI ' + state.knowledge.kespi.toFixed(2) + '）');
  } else if (state.knowledge.health === 'warning') {
    parts.push('知识库需要关注（KESPI ' + state.knowledge.kespi.toFixed(2) + '）');
  } else {
    parts.push('知识库有风险（KESPI ' + state.knowledge.kespi.toFixed(2) + '）');
  }
  
  // 意识状态
  if (state.consciousness.state === 'aroused') {
    parts.push('意识神经唤醒中（' + state.consciousness.activeEvents + ' 活跃事件）');
  } else {
    parts.push('意识神经空闲');
  }
  
  // 生长决策
  if (state.growth.action !== 'observe') {
    parts.push('生长决策器建议：' + state.growth.action);
  }
  
  // 元认知置信
  parts.push('元认知置信：' + state.metacognition.confidence.toFixed(2));
  
  // 风险
  if (state.risks.length > 0) {
    parts.push('检测到 ' + state.risks.length + ' 项风险');
  }
  
  return parts.join('；') + '。';
}

// ========== 主函数 ==========
async function run() {
  console.log('🧠 开机自检启动...');
  
  const modules = loadModules();
  const state = await collectState(modules);
  
  console.log('\n' + '='.repeat(60));
  console.log('🧠 开机自检完成');
  console.log('='.repeat(60));
  console.log('\n' + state.firstImpression);
  console.log('\n📊 知识库：' + state.knowledge.entities + ' 实体 | KESPI ' + state.knowledge.kespi.toFixed(2));
  console.log('🧠 意识：' + state.consciousness.state + ' | ' + state.consciousness.activeEvents + ' 活跃事件');
  console.log('🌱 生长：' + state.growth.action + ' | 紧急度 ' + state.growth.urgency);
  console.log('🔍 元认知：置信 ' + state.metacognition.confidence.toFixed(2));
  
  if (state.risks.length > 0) {
    console.log('\n⚠️  风险：');
    for (const risk of state.risks.slice(0, 3)) {
      console.log('   • [' + risk.type + '] ' + risk.message);
    }
  }
  
  if (state.tasks.length > 0) {
    console.log('\n📋 当前任务：');
    for (const task of state.tasks.slice(0, 3)) {
      console.log('   • ' + task.title + ' (' + task.time + ')');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('自检完成，已加载完整识态。');
  console.log('='.repeat(60) + '\n');
  
  return state;
}

// CLI 入口
if (require.main === module) {
  run().catch(err => {
    console.error('❌ 开机自检失败:', err.message);
    process.exit(1);
  });
}

module.exports = { run, collectState, loadModules };
