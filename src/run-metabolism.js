#!/usr/bin/env node
/**
 * run-metabolism.js — 代谢流水线（集成决策层 + 反馈层）
 * 
 * 功能：串联所有代谢引擎，执行完整的双脑代谢流程
 * 
 * 三种模式：
 * 1. 完整模式（默认）: 按固定顺序执行全部 11 步
 * 2. 智能模式 (--smart): 生长决策器判断该做什么，按需执行
 * 3. 单步模式 (--step xxx): 只执行指定步骤
 * 
 * 执行顺序（完整模式）：
 * 1. 秩序脑编译（raw → wiki）
 * 2. 导入数据库（wiki → SQLite）
 * 3. 自动链接发现（实体关联）
 * 4. 向量索引（默认 384 维本地语义向量；语义模型缺失才回退 64 维哈希）
 * 5. 发芽引擎（新关联发现）
 * 6. 授粉引擎（跨域融合）
 * 7. 芥子压缩（低频归档）
 * 8. KESPI 八维自检
 * 9. 剪枝清理（过期归档）
 * 
 * 使用：
 *   node run-metabolism.js              # 执行完整流程
 *   node run-metabolism.js --smart      # 智能决策模式
 *   node run-metabolism.js --step=compile    # 只执行编译（必须等号形；空格形会被当成整链跑，2026-09-14 实测）
 *   node run-metabolism.js --force            # 强制模式
 *   node run-metabolism.js --resume           # 断点续传
 *   node run-metabolism.js --feedback         # 执行后反馈分析
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── 铁律守卫：代谢不得替用户提交工作树 / metabolism must never commit on the user's behalf ──
// 实测事故（2026-09-14，OPT）：本文件第 1 步 compile 走到底会调 src/compile.js 的 gitCommit()，
// 那里面是 `git add -A` + `git commit --no-verify`（身份取该院 local git config），
// 一步代谢就把当时 38 个文件提成了 `1a3382b`——绕过用户「未经允许不得 commit」铁律，
// 而当时 24 项验收全绿（旧门只查入库链与自测链，没人查这个入口）。
// 因此默认注入 AING_NO_AUTOCOMMIT=1（下面 executeStep 用 execSync 继承 process.env → 子进程可见）；
// 确需自动提交时必须显式 opt-in：AING_AUTOCOMMIT=1。seed-demo / sync-opt / auto-ingest 本来就传
// NO_AUTOCOMMIT=1，同向不受影响。由 verify-deploy C13 钉住（在隔离假院里真跑：带守卫无提交、删守卫出提交）。
if (process.env.AING_AUTOCOMMIT !== '1') process.env.AING_NO_AUTOCOMMIT = '1';
// 2026-09-17 深度检查 F3：持锁后子进程豁免标记——import/kespi/vector/link 等子步自身也是写者，
// 若让它们也查 metabolism.lock 会「代谢自己把自己锁死」（原链路事故）；子步凭此标记通行。
// 共享判据见 src/metabolism-lock.js；execSync 继承 process.env → 子进程自动可见。
if (!process.env.AING_METABOLISM_CHILD) process.env.AING_METABOLISM_CHILD = '1';


// ── N1: 跨进程原子锁（范式同 distill.js D4：wx 原子创建 + finally 释放 + 陈旧锁按 age/pid 回收）──
const LOCK_PATH = path.join(__dirname, '..', 'data', 'metabolism.lock');
const LOCK_STALE_MS = 30 * 60 * 1000; // 30min：十一步全流程宽裕上限
let heldLock = null; // 持锁句柄，main 结束时保证释放

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function acquireLock() {
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
  try {
    fs.writeFileSync(LOCK_PATH, payload, { flag: 'wx' }); // 原子 create-or-fail
    return { ok: true, release: () => { try { fs.unlinkSync(LOCK_PATH); } catch (e) {} } };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try {
      const old = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
      const age = Date.now() - new Date(old.startedAt).getTime();
      const alive = old.pid ? pidAlive(old.pid) : false;
      if (age > LOCK_STALE_MS || !alive) {
        console.log(`[metabolism] 陈旧锁回收 / stale lock reclaimed (age=${Math.round(age / 1000)}s pidAlive=${alive})`);
        fs.unlinkSync(LOCK_PATH);
        return acquireLock();
      }
      return { ok: false, holder: old };
    } catch (e2) {
      return { ok: false, holder: null }; // 锁文件损坏：保守拒绝
    }
  }
}

// ── A1: 代谢→意识神经事件发射（kernel 锁定 coordination-only：只感知/路由/建议，不执行）──
const METABOLISM_CHANNEL = {
  compile: 'structure', import: 'structure', distill: 'structure', 'link-sync': 'structure',
  link: 'semantic', vector: 'semantic', sprout: 'semantic', pollinate: 'semantic',
  compress: 'temporal', prune: 'temporal', kespi: 'kespi'
};
let _kernel = null;
function emitMetabolismEvent({ step, ok, intensity, evidence, suggestedAction }) {
  try {
    if (!_kernel) {
      const { ConsciousnessKernel } = require('./consciousness-kernel');
      _kernel = new ConsciousnessKernel({ baseDir: path.join(__dirname, '..') });
    }
    return _kernel.ingest({
      source: 'metabolism',
      channel: METABOLISM_CHANNEL[step] || 'generic',
      signalType: 'observed',
      target: 'knowledge-base',
      intensity: Math.max(0, Math.min(1, intensity)),
      confidence: 0.9,
      evidence: evidence || {},
      suggestedAction: suggestedAction || 'observe',
      tags: ['metabolism', step, ok ? 'ok' : 'fail']
    });
  } catch (e) {
    console.log(`⚠ 意识事件发射失败（不影响代谢）/ consciousness event emit failed: ${e.message}`);
    return null;
  }
}

// ── M4 自我解释：代谢决策因果链日志 ──
// 每步记录：做了什么决策、基于什么证据、考虑了什么替代方案、结果如何
const DECISION_LINEAGE_FILE = path.join(__dirname, '..', 'logs', 'metabolism-decision-lineage.jsonl');

function logDecisionLineage(step, decision) {
  try {
    fs.mkdirSync(path.dirname(DECISION_LINEAGE_FILE), { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      step,
      action: decision.action || 'execute',
      target: decision.target || `step:${step}`,
      evidence: decision.evidence || {},
      reason: decision.reason || '',
      alternatives: decision.alternatives || [],
      outcome: decision.outcome || 'unknown',
      causalChain: decision.causalChain || [`${step} → ${decision.outcome || 'executed'}`],
    };
    fs.appendFileSync(DECISION_LINEAGE_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // 非关键：日志写入失败不影响代谢
  }
}

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
  { name: 'distill', desc: '蒸馏器 (pending-distillation → active)', script: 'distill.js', args: [] },
  { name: 'link', desc: '自动链接发现 (实体关联)', script: 'auto-link.js', args: [] },
{ name: 'link-sync', desc: '双脑同步 (DB链接 → wiki/links/ 落盘)', script: 'sync-links-to-fs.js', args: [] },
  { name: 'vector', desc: '向量索引 (语义 384 维；模型缺失回退 64 维哈希)', script: 'index-vectors.js', args: [] },
  { name: 'sprout', desc: '发芽引擎 (新关联发现)', script: 'sprout.js', args: [] },
  { name: 'pollinate', desc: '授粉引擎 (跨域融合)', script: 'pollinate.js', args: [] },
  { name: 'compress', desc: '芥子压缩 (低频归档)', script: 'compress.js', args: [] },
  { name: 'kespi', desc: 'KESPI 八维自检', script: 'kespi-check.js', args: [] },
{ name: 'prune', desc: '剪枝清理 (过期归档)', script: 'prune.js', args: [] },
];

// P0: 关键步骤 —— 失败必须中断流水线，不允许「成功 8 失败 1」冒充成功
const CRITICAL_STEPS = new Set(['compile', 'import', 'vector', 'kespi']);

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
  console.log(`📍 步骤 ${index + 1}/${STEPS.length}: ${step.desc} / Step`);
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
    console.log(`\n💻 执行: node ${step.script} ${step.args.join(' ')} / Exec:`);
    
    const output = execSync(`node "${scriptPath}" ${step.args.join(' ')}`, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    // 记录日志
    fs.appendFileSync(logFile, output, 'utf8');
    
    const duration = Date.now() - stepStart;
    emitMetabolismEvent({ step: step.name, ok: true, intensity: 0.45, evidence: { step: step.name } }); // A1（指纹只含 step，重复步骤 5min 内去重）
    state.steps[step.name] = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration
    };
    
    // M4 自我解释：记录决策因果链
    logDecisionLineage(step.name, {
      action: 'execute',
      target: `step:${step.name}`,
      evidence: { script: step.script, duration, output: output.slice(0, 200) },
      reason: `代谢步骤 ${step.desc} 正常执行完成`,
      alternatives: ['跳过（--step 模式）', '强制重试（--force）'],
      outcome: 'success',
      causalChain: [`run-metabolism.main → executeStep(${step.name}) → execSync(${step.script}) → success (${duration}ms)`],
    });
    
    console.log(`\n✅ 完成: ${step.desc} (${duration}ms) / Done:`);
    
    // 保存恢复点
    if (!resume) {
      saveResumePoint();
    }
    
    return true;
    
  } catch (error) {
    const duration = Date.now() - stepStart;
    emitMetabolismEvent({ step: step.name, ok: false, intensity: 0.8, evidence: { step: step.name, error: error.message }, suggestedAction: 'inspect' }); // A1（同错重试去重）
    state.steps[step.name] = {
      status: 'failed',
      timestamp: new Date().toISOString(),
      duration,
      error: error.message
    };
    state.errors.push({ step: step.name, error: error.message });
    
    // M4 自我解释：记录失败决策因果链
    const isCritical = CRITICAL_STEPS.has(step.name);
    logDecisionLineage(step.name, {
      action: 'execute',
      target: `step:${step.name}`,
      evidence: { script: step.script, error: error.message, duration },
      reason: `代谢步骤 ${step.desc} 执行失败: ${error.message}`,
      alternatives: isCritical ? ['中断管线（关键步骤失败）'] : ['跳过继续（非关键步骤失败）', '强制重试（--force）'],
      outcome: 'failed',
      causalChain: [`run-metabolism.main → executeStep(${step.name}) → execSync(${step.script}) → FAIL: ${error.message} → ${isCritical ? '管线中断' : '继续后续步骤'}`],
    });
    
    console.error(`\n❌ 失败: ${step.desc} (${duration}ms) / Failed:`);
    console.error(`   错误: ${error.message} / Error:`);
    
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
  console.log('🏁 代谢流水线完成 / Metabolism pipeline done');
  console.log(`${'='.repeat(60)}`);
  console.log(`\n📊 执行统计: / Execution stats:`);
  console.log(`   总步骤: ${STEPS.length} / Total steps:`);
  console.log(`   成功: ${successSteps} / Success:`);
  console.log(`   失败: ${errorSteps} / Failed:`);
  console.log(`   总耗时: ${totalDuration}s / Total elapsed:`);
  
  if (errorSteps > 0) {
    console.log(`\n❌ 失败步骤: / Failed steps:`);
    state.errors.forEach(e => console.log(`   - ${e.step}: ${e.error}`));
  }
}

/**
 * 智能决策模式：让生长决策器决定执行哪些步骤
 */
// ── 治理出口（L1, 2026-09-08）：sync-opt 副本对齐挂 main() 出口，smart/observe/step/full 殊途同归。──
// 背景：此前 sync-opt 是 full 链第 11 步，--smart 的 observe 分支提前 return 时永远到不了（T1 陷阱：
// OPT 永远是 aing 的副本，在智能模式下退化为运气）。摘出 STEPS 后由出口统一执行；
// marker 门在 sync-opt.js 内部（无 data/opt-root.json 时零操作，其他 clone 不受影响）。
async function runGovernanceExit() {
  if (process.argv.includes('--step=')) {
    // 单步模式（--step=compile）多为调试/CI 精确重放，不代跑副本对齐（避免调试动作触发换血副作用）
    console.log('⏭️  [治理出口] --step 单步模式跳过 sync-opt');
    return;
  }
  try {
    // 直接 execSync（executeStep 绑定 STEPS 索引与状态机；出口执行不伪装成链上步骤、不进代谢日志）
    execSync(`node "${path.join(__dirname, 'sync-opt.js')}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      timeout: 10 * 60 * 1000
    });
  } catch (e) {
    console.log('⚠️  [治理出口] sync-opt 失败（非关键，不改变代谢退出码）: ' + e.message);
  }
}

/**
 * 意识层尾步：生成注意力队列面板（卡 3）。非关键步骤，失败不影响代谢退出码。
 */
async function runPanelTail() {
  try {
    const panelMod = require('./metabolism-panel.js');
    await panelMod();
  } catch (e) {
    console.log(`\n⚠️  意识层面板生成失败（非关键，不影响代谢结果）: ${e.message}`);
  }
}

async function smartMode(enableFeedback = false) {
  console.log('🧬 aing 知识代谢流水线 — 智能决策模式\n / smart-decision mode');
  
  const { GrowthDirector } = require('./growth-director.js');
  const { GuideChainSwarm } = require('./guide-chain-swarm.js');
  const { FeedbackLoop } = require('./feedback-loop.js');
  
  const director = new GrowthDirector(path.join(__dirname, '..', 'knowledge.db'));
  const swarm = new GuideChainSwarm(path.join(__dirname, '..', 'knowledge.db'));
  const feedback = new FeedbackLoop(path.join(__dirname, '..', 'knowledge.db'));
  
  try {
    // 1. 感知
    console.log('🔍 感知阶段：收集信号... / Perception phase: collecting signals...');
    await director.perceive();
    
    // 2. 决策
    console.log('🧠 决策阶段：分析判断... / Decision phase: analyzing...');
    const decision = director.decide();
    director.printDecision(decision);
    
    // 3. 蜂群验证（中高紧急度时）
    if (decision.urgencyLevel === 'critical' || decision.urgencyLevel === 'high') {
      console.log('\n🐝 蜂群验证阶段... / Swarm verification phase...');
      await swarm.init();
      const deliberation = await swarm.deliberate({ decision, signals: director.signals });
      swarm.printSwarmReport(deliberation);
      
      // 如果蜂群共识与决策不同，采用蜂群结果
      if (deliberation.consensus && deliberation.consensus.action !== decision.action) {
        console.log(`\n⚠️  蜂群共识覆盖原始决策: ${decision.action} → ${deliberation.consensus.action} / Swarm consensus overrides original decision`);
        decision.action = deliberation.consensus.action;
      }
    }
    
    // 4. 执行
    if (decision.action === 'observe') {
      console.log('\n👁️  系统判断无需操作，继续观察 / System decides no action, keep observing');
      // L1c: observe 也是一次可学习的决策——照拍反馈快照，让 feedback 知道'判断为不动作'的系统当时长什么样
      if (enableFeedback) {
        try {
          const snap = await feedback.takeSnapshot();
          await feedback.logFeedback({ observe: true, decision: decision.action, snap }, []);
        } catch (e) {
          console.log('⚠️  observe 快照失败（不影响决策）: ' + e.message);
        }
      }
      return;
    }
    
    // 拍摄执行前快照
    let beforeSnap = null;
    if (enableFeedback) {
      console.log('\n📸 拍摄执行前快照... / Taking pre-execution snapshot...');
      beforeSnap = await feedback.takeSnapshot();
    }
    
    const commands = director._getCommandSequence(decision.action);
    console.log(`\n⚡ 执行序列: ${commands.join(' → ')} / Execution sequence:\n`);
    
    for (const cmd of commands) {
      const stepIndex = STEPS.findIndex(s => s.name === cmd);
      if (stepIndex !== -1) {
        executeStep(stepIndex, false);
      }
    }
    
    // 5. 反馈分析
    if (enableFeedback && beforeSnap) {
      console.log('\n📊 反馈分析阶段... / Feedback analysis phase...');
      const afterSnap = await feedback.takeSnapshot();
      const delta = feedback.calculateDelta(beforeSnap, afterSnap);
      const actions = feedback.autoTune(delta);
      feedback.printFeedbackReport(delta, actions);
      await feedback.logFeedback(delta, actions);
    }
    
  } catch (err) {
    console.error(`❌ 智能模式错误: ${err.message} / Smart mode error:`);
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

  // N1: 跨进程互斥——手动运行与 scheduler 定时/轮询触发不得同时跑（--smart/--step 同受锁保护）
  const lock = acquireLock();
  if (!lock.ok) {
    const holder = lock.holder || {};
    console.log(`⛔ 代谢已在运行中，本次跳过 / metabolism already running (pid=${holder.pid}, startedAt=${holder.startedAt})`);
    process.exitCode = 0;
    return;
  }
  heldLock = lock;
  
  // 智能决策模式
  if (smart) {
    await smartMode(feedback);
    await runGovernanceExit(); // L1: 治理出口（含 observe 路径）
    await runPanelTail();    // 意识层尾步：注意力队列面板
    return;
  }
  
  // 如果指定了特定步骤
  if (stepArg) {
    const stepName = stepArg.slice(7);
    const stepIndex = STEPS.findIndex(s => s.name === stepName);
    
    if (stepIndex === -1) {
      console.error(`❌ 未知步骤: ${stepName} / Unknown step:`);
      console.error(`   可用步骤: ${STEPS.map(s => s.name).join(', ')} / Available steps:`);
      process.exitCode = 1; return; // N1: 走 finally 释放代谢锁
    }
    
    executeStep(stepIndex, force);
    return;
  }
  
  // 完整模式（默认）
  console.log('🧬 aing 知识代谢流水线启动\n / aing metabolism pipeline started');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  console.log('📋 执行计划: / Execution plan:');
  STEPS.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.desc}`);
  });
  
  // 拍摄执行前快照
  let beforeSnap = null;
  if (feedback) {
    const { FeedbackLoop } = require('./feedback-loop.js');
    const fb = new FeedbackLoop(path.join(__dirname, '..', 'knowledge.db'));
    console.log('\n📸 拍摄执行前快照... / Taking pre-execution snapshot...');
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
      process.exitCode = 1; // 失败必须让调度方感知
      if (CRITICAL_STEPS.has(STEPS[i].name) && !force) {
        state.aborted = true;
        console.log('\n🛑 关键步骤 ' + STEPS[i].name + ' 失败，停止后续代谢 / Critical step failed, stopping rest of metabolism');
        break;
      }
      if (!force) {
        console.log('\n⚠️ 非关键步骤 ' + STEPS[i].name + ' 失败，继续执行后续步骤 / Non-critical step failed, continuing');
      }
    }
  }
  
  // 反馈分析
  if (feedback && beforeSnap) {
    const { FeedbackLoop } = require('./feedback-loop.js');
    const fb = new FeedbackLoop(path.join(__dirname, '..', 'knowledge.db'));
    console.log('\n📊 反馈分析阶段... / Feedback analysis phase...');
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
    console.log(`\n📝 代谢日志已落库: ${r.logged} 步 (kespi ${r.kespiBefore} → ${r.kespiAfter}) / Metabolism log persisted:`);
  } catch (e) {
    console.log(`\n⚠️  代谢日志落库失败（不影响代谢本身）: ${e.message} / Log persistence failed (metabolism unaffected):`);
  }
  
  // P0: 最终退出码反映关键步骤结果
  const failedSteps = Object.values(state.steps).filter(s => s.status === 'failed');
  if (failedSteps.length > 0 || state.aborted) {
    console.error('\n🔴 代谢失败：存在未完成的关键步骤。 / Metabolism failed: unfinished critical steps');
    process.exitCode = 1;
  } else {
    console.log('\n🟢 代谢成功：所有关键步骤均已完成。 / Metabolism success: all critical steps done');
    process.exitCode = 0;
  }

  // ── W3（2026-09-14）：意识层闭环的写端 / consciousness cycle bookkeeping ──
  // kernel.recordCycleResult() 此前**全仓零调用点** → stagnationCount 恒 0 →
  // growth-director.js:150/235 与 metacognition-layer.js:459 三个读者永远等不到值，
  // 「意识层连续空产出 ≥ 3 → 触发完整代谢」这条自主路径从未成立
  //（M4 表原先靠人手改 data/consciousness/state.json 才能演示，那是假闭环）。
  // 判据只用离散存在性，不新增数值阀值（纪律 5）：本轮无失败且未中止 + 库里有活跃实体
  // + 意识层当前持有活跃事件。任一不成立→记一次空产出；连续 3 次 kernel 自行转
  // stagnant 并往 raw/ 写 MetaKnowledge，下一次 growth-director 就会选 full_metabolism。
  // 由门禁 C14 在隔离假院里连跑 3 趟空代谢，证明这个计数会自己爬到 3（不靠改 state.json）。
  try {
    let liveEntities = 0;
    try {
      const KS = require('./knowledge-store');
      const KStore = KS.KnowledgeStore || KS;
      const cycStore = new KStore();
      await cycStore.init();
      const row = cycStore.all("SELECT COUNT(*) AS n FROM entities WHERE status='active'")[0];
      liveEntities = Number((row && row.n) || 0);
      if (typeof cycStore.close === 'function') cycStore.close();
    } catch (eStore) { liveEntities = 0; }
    if (!_kernel) {
      const { ConsciousnessKernel } = require('./consciousness-kernel');
      _kernel = new ConsciousnessKernel({ baseDir: path.join(__dirname, '..') });
    }
    const activeEvents = (_kernel.state && Array.isArray(_kernel.state.activeEvents)) ? _kernel.state.activeEvents.length : 0;
    const hasValidOutput = failedSteps.length === 0 && !state.aborted && liveEntities > 0 && activeEvents > 0;
    const cycle = _kernel.recordCycleResult(hasValidOutput, hasValidOutput ? '' : 'metabolism-cycle-empty-output', {
      liveEntities, activeEvents, attemptedPaths: Object.keys(state.steps || {})
    });
    console.log(`\n🧠 意识层本轮记账 / cycle bookkeeping: ${hasValidOutput ? '有效产出 / valid output' : '空产出 / empty'}（活跃实体 ${liveEntities} / 活跃事件 ${activeEvents}）→ stagnationCount=${cycle.stagnationCount}${cycle.broken ? ' ⚠️ 已连续 3 次空产出：转 stagnant 并写 MetaKnowledge' : ''}`);
  } catch (e) {
    console.log(`\n⚠️  意识层记账失败（不影响代谢结果）/ cycle bookkeeping failed: ${e.message}`);
  }

  // L1: 治理出口——full 链同样汇入（sync-opt 从 STEPS 摘出后的统一执行点）
  await runGovernanceExit();

  // 意识层尾步：注意力队列面板（卡 3，非关键）
  await runPanelTail();

  // 打印统计
  printFinalStats();

  // M4 自我解释：记录全局代谢决策因果链
  logDecisionLineage('pipeline-summary', {
    action: 'summarize',
    target: 'metabolism-pipeline',
    evidence: {
      totalSteps: STEPS.length,
      successSteps: Object.values(state.steps).filter(s => s.status === 'success').length,
      failedSteps: state.errors.length,
      totalDuration: Date.now() - state.startTime,
    },
    reason: `完整代谢${state.errors.length === 0 ? '全部成功' : '存在失败步骤'}`,
    alternatives: ['--smart 智能模式', '--step 单步模式'],
    outcome: state.errors.length === 0 ? 'success' : 'partial-failure',
    causalChain: [
      `run-metabolism.main → ${STEPS.length} steps → ${Object.values(state.steps).filter(s => s.status === 'success').length} success / ${state.errors.length} failed`,
      `→ sync-opt（治理出口）→ panel（意识层尾步）`,
      `→ 决策因果链已记录至 logs/metabolism-decision-lineage.jsonl`,
    ],
  });
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
  try { if (heldLock) heldLock.release(); } catch (e) {}
});
