#!/usr/bin/env node
/**
 * run-metabolism.js — 代谢流水线（集成决策层 + 反馈层）
 * 
 * 功能：串联所有代谢引擎，执行完整的双脑代谢流程
 * 
 * 三种模式：
 * 1. 完整模式（默认）: 按固定顺序执行全部 9 步
 * 2. 智能模式 (--smart): 生长决策器判断该做什么，按需执行
 * 3. 单步模式 (--step xxx): 只执行指定步骤
 * 
 * 执行顺序（完整模式）：
 * 1. 秩序脑编译（raw → wiki）
 * 2. 导入数据库（wiki → SQLite）
 * 3. 自动链接发现（实体关联）
 * 4. 向量索引（64-dim embedding）
 * 5. 发芽引擎（新关联发现）
 * 6. 授粉引擎（跨域融合）
 * 7. 芥子压缩（低频归档）
 * 8. KESPI 八维自检
 * 9. 剪枝清理（过期归档）
 * 
 * 使用：
 *   node run-metabolism.js              # 执行完整流程
 *   node run-metabolism.js --smart      # 智能决策模式
 *   node run-metabolism.js --step compile    # 只执行编译
 *   node run-metabolism.js --force            # 强制模式
 *   node run-metabolism.js --resume           # 断点续传
 *   node run-metabolism.js --feedback         # 执行后反馈分析
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  scriptsDir: path.join(__dirname),
  logsDir: path.join(__dirname, '..', 'logs', 'metabolism'),
  resumeFile: path.join(__dirname, '..', 'logs', 'metabolism-resume.json')
};

// 代谢阶段（完整闭环：文件→数据库→链接→向量→KESPI）
const STEPS = [
  { name: 'compile', desc: '秩序脑编译 (raw/*.md → wiki/entities/*.md)', script: 'compile.js', args: [] },
  { name: 'import', desc: '导入数据库 (wiki/ → SQLite)', script: 'import-from-wiki.js', args: [] },
  { name: 'link', desc: '自动链接发现 (实体关联)', script: 'auto-link.js', args: [] },
  { name: 'vector', desc: '向量索引 (64-dim embedding)', script: 'index-vectors.js', args: [] },
  { name: 'sprout', desc: '发芽引擎 (新关联发现)', script: 'sprout.js', args: [] },
  { name: 'pollinate', desc: '授粉引擎 (跨域融合)', script: 'pollinate.js', args: [] },
  { name: 'compress', desc: '芥子压缩 (低频归档)', script: 'compress.js', args: [] },
  { name: 'kespi', desc: 'KESPI 八维自检', script: 'kespi-check.js', args: [] },
  { name: 'prune', desc: '剪枝清理 (过期归档)', script: 'prune.js', args: [] }
];

// 状态
const state = {
  currentStep: 0,
  startTime: Date.now(),
  steps: {},
  errors: []
};

/**
 * 保存恢复点
 */
function saveResumePoint() {
  fs.writeFileSync(
    CONFIG.resumeFile,
    JSON.stringify({ currentStep: state.currentStep, startTime: state.startTime, steps: state.steps }, null, 2),
    'utf8'
  );
}

/**
 * 恢复上次执行
 */
function resumeExecution() {
  if (!fs.existsSync(CONFIG.resumeFile)) return 0;
  const resume = JSON.parse(fs.readFileSync(CONFIG.resumeFile, 'utf8'));
  state.currentStep = resume.currentStep || 0;
  state.startTime = resume.startTime || Date.now();
  state.steps = resume.steps || {};
  return state.currentStep;
}

/**
 * 执行单步
 */
function executeStep(index, force = false, resume = false) {
  const step = STEPS[index];
  if (!step) return true;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📍 步骤 ${index + 1}/${STEPS.length}: ${step.desc}`);
  console.log(`${'='.repeat(60)}`);
  
  const stepStart = Date.now();
  const logFile = path.join(CONFIG.logsDir, `${step.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  
  try {
    // 确保日志目录存在
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 执行脚本
    const scriptPath = path.join(CONFIG.scriptsDir, step.script);
    console.log(`\n💻 执行: node ${step.script} ${step.args.join(' ')}`);
    
    const output = execSync(`node "${scriptPath}" ${step.args.join(' ')}`, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    // 记录日志
    fs.appendFileSync(logFile, output, 'utf8');
    
    const duration = Date.now() - stepStart;
    state.steps[step.name] = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration
    };
    
    console.log(`\n✅ 完成: ${step.desc} (${duration}ms)`);
    
    // 保存恢复点
    if (!resume) {
      saveResumePoint();
    }
    
    return true;
    
  } catch (error) {
    const duration = Date.now() - stepStart;
    state.steps[step.name] = {
      status: 'failed',
      timestamp: new Date().toISOString(),
      duration,
      error: error.message
    };
    state.errors.push({ step: step.name, error: error.message });
    
    console.error(`\n❌ 失败: ${step.desc} (${duration}ms)`);
    console.error(`   错误: ${error.message}`);
    
    // 记录错误日志
    fs.appendFileSync(logFile, `ERROR: ${error.message}\n`, 'utf8');
    
    return false;
  }
}

/**
 * 生成最终报告
 */
function generateReport() {
  const logPath = path.join(CONFIG.logsDir, `metabolism-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  
  const logContent = `
# 代谢流水线执行报告

## 执行概览
- 开始: ${new Date(state.startTime).toISOString()}
- 结束: ${new Date().toISOString()}
- 总耗时: ${((Date.now() - state.startTime) / 1000).toFixed(2)}s

## 步骤执行
${Object.entries(state.steps).map(([name, data]) => `### ${name}
- 状态: ${data.status}
- 时间: ${data.timestamp}
${data.duration ? `- 耗时: ${data.duration}ms` : ''}
${data.error ? `- 错误: ${data.error}` : ''}

`).join('\n')}

## 错误汇总
${state.errors.length > 0 ? state.errors.map(e => `- ${e.step}: ${e.error}`).join('\n') : '无错误'}

---

*由 aing 代谢流水线自动生成*
`;
  
  fs.writeFileSync(logPath, logContent, 'utf8');
}

/**
 * 打印最终统计
 */
function printFinalStats() {
  const totalDuration = ((Date.now() - state.startTime) / 1000).toFixed(2);
  const successSteps = Object.values(state.steps).filter(s => s.status === 'success').length;
  const errorSteps = state.errors.length;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('🏁 代谢流水线完成');
  console.log(`${'='.repeat(60)}`);
  console.log(`\n📊 执行统计:`);
  console.log(`   总步骤: ${STEPS.length}`);
  console.log(`   成功: ${successSteps}`);
  console.log(`   失败: ${errorSteps}`);
  console.log(`   总耗时: ${totalDuration}s`);
  
  if (errorSteps > 0) {
    console.log(`\n❌ 失败步骤:`);
    state.errors.forEach(e => console.log(`   - ${e.step}: ${e.error}`));
  }
}

/**
 * 智能决策模式：让生长决策器决定执行哪些步骤
 */
async function smartMode(enableFeedback = false) {
  console.log('🧬 aing 知识代谢流水线 — 智能决策模式\n');
  
  const { GrowthDirector } = require('./growth-director.js');
  const { GuideChainSwarm } = require('./guide-chain-swarm.js');
  const { FeedbackLoop } = require('./feedback-loop.js');
  
  const director = new GrowthDirector(path.join(__dirname, '..', 'knowledge.db'));
  const swarm = new GuideChainSwarm(path.join(__dirname, '..', 'knowledge.db'));
  const feedback = new FeedbackLoop(path.join(__dirname, '..', 'knowledge.db'));
  
  try {
    // 1. 感知
    console.log('🔍 感知阶段：收集信号...');
    await director.perceive();
    
    // 2. 决策
    console.log('🧠 决策阶段：分析判断...');
    const decision = director.decide();
    director.printDecision(decision);
    
    // 3. 蜂群验证（中高紧急度时）
    if (decision.urgencyLevel === 'critical' || decision.urgencyLevel === 'high') {
      console.log('\n🐝 蜂群验证阶段...');
      await swarm.init();
      const deliberation = await swarm.deliberate({ decision, signals: director.signals });
      swarm.printSwarmReport(deliberation);
      
      // 如果蜂群共识与决策不同，采用蜂群结果
      if (deliberation.consensus && deliberation.consensus.action !== decision.action) {
        console.log(`\n⚠️  蜂群共识覆盖原始决策: ${decision.action} → ${deliberation.consensus.action}`);
        decision.action = deliberation.consensus.action;
      }
    }
    
    // 4. 执行
    if (decision.action === 'observe') {
      console.log('\n👁️  系统判断无需操作，继续观察');
      return;
    }
    
    // 拍摄执行前快照
    let beforeSnap = null;
    if (enableFeedback) {
      console.log('\n📸 拍摄执行前快照...');
      beforeSnap = await feedback.takeSnapshot();
    }
    
    const commands = director._getCommandSequence(decision.action);
    console.log(`\n⚡ 执行序列: ${commands.join(' → ')}\n`);
    
    for (const cmd of commands) {
      const stepIndex = STEPS.findIndex(s => s.name === cmd);
      if (stepIndex !== -1) {
        executeStep(stepIndex, false);
      }
    }
    
    // 5. 反馈分析
    if (enableFeedback && beforeSnap) {
      console.log('\n📊 反馈分析阶段...');
      const afterSnap = await feedback.takeSnapshot();
      const delta = feedback.calculateDelta(beforeSnap, afterSnap);
      const actions = feedback.autoTune(delta);
      feedback.printFeedbackReport(delta, actions);
      await feedback.logFeedback(delta, actions);
    }
    
  } catch (err) {
    console.error(`❌ 智能模式错误: ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const resume = args.includes('--resume');
  const smart = args.includes('--smart');
  const feedback = args.includes('--feedback');
  const stepArg = args.find(a => a.startsWith('--step='));
  
  // 智能决策模式
  if (smart) {
    await smartMode(feedback);
    return;
  }
  
  // 如果指定了特定步骤
  if (stepArg) {
    const stepName = stepArg.slice(7);
    const stepIndex = STEPS.findIndex(s => s.name === stepName);
    
    if (stepIndex === -1) {
      console.error(`❌ 未知步骤: ${stepName}`);
      console.error(`   可用步骤: ${STEPS.map(s => s.name).join(', ')}`);
      process.exit(1);
    }
    
    executeStep(stepIndex, force);
    return;
  }
  
  // 完整模式（默认）
  console.log('🧬 aing 知识代谢流水线启动\n');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  console.log('📋 执行计划:');
  STEPS.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.desc}`);
  });
  
  // 拍摄执行前快照
  let beforeSnap = null;
  if (feedback) {
    const { FeedbackLoop } = require('./feedback-loop.js');
    const fb = new FeedbackLoop(path.join(__dirname, '..', 'knowledge.db'));
    console.log('\n📸 拍摄执行前快照...');
    beforeSnap = await fb.takeSnapshot();
  }
  
  // 恢复执行
  let startStep = 0;
  if (resume) {
    startStep = resumeExecution();
  }
  
  // 执行所有步骤
  for (let i = startStep; i < STEPS.length; i++) {
    const success = executeStep(i, force, resume);
    
    if (success) {
      // 成功后推进游标再存档，保证 --resume 从下一步开始
      state.currentStep = i + 1;
      saveResumePoint();
    } else {
      process.exitCode = 1; // 失败必须让调度方感知（原实现退出码恒 0）
      if (!force) {
        console.log('\n⚠️  遇到错误，停止执行');
        break;
      }
    }
  }
  
  // 反馈分析
  if (feedback && beforeSnap) {
    const { FeedbackLoop } = require('./feedback-loop.js');
    const fb = new FeedbackLoop(path.join(__dirname, '..', 'knowledge.db'));
    console.log('\n📊 反馈分析阶段...');
    const afterSnap = await fb.takeSnapshot();
    const delta = fb.calculateDelta(beforeSnap, afterSnap);
    const actions = fb.autoTune(delta);
    fb.printFeedbackReport(delta, actions);
    await fb.logFeedback(delta, actions);
  }
  
  // 生成报告
  generateReport();

  // 训练反馈信号：代谢日志落库（metabolism_log，含 kespi_before/after）
  try {
    const { logMetabolismRun } = require('./metabolism-log');
    const r = await logMetabolismRun({ runId, steps: state.steps });
    console.log(`\n📝 代谢日志已落库: ${r.logged} 步 (kespi ${r.kespiBefore} → ${r.kespiAfter})`);
  } catch (e) {
    console.log(`\n⚠️  代谢日志落库失败（不影响代谢本身）: ${e.message}`);
  }
  
  // 打印统计
  printFinalStats();
}

main();
