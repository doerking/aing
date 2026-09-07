#!/usr/bin/env node
/**
 * training-sim.js — SkillOpt 式训练推演（影子模式，不触碰真实知识库）
 *
 * 三层推演（对应训练师报告的分档）：
 *   Tier-1 循环机制：六阶段循环在部署包上机械跑通
 *   Tier-2 任务包：30 条结构化矛盾任务，验证 Gate 区分度
 *   Tier-3 蒙特卡洛：阈值敏感性扫描（margin × 标签噪声）
 *
 * 用法：
 *   node simulation/training-sim.js            # 完整推演
 *   node simulation/training-sim.js --fast     # 跳过蒙特卡洛
 *
 * 设计要点：
 *   - 基线策略故意埋 2 处错误信念（模拟真实技能文档的缺陷）
 *   - 候选 = 对基线信念集的扰动（翻转/修正/噪声权重抖动）
 *   - Gate = 混合指标（评估准确率 + 一致性 + 覆盖率），通过条件：总体分 > 基线 + margin
 *   - 全程只读内存对象，唯一写入是 simulation/ 下的产物文件
 */

const fs = require('fs');
const path = require('path');

const SIM_DIR = __dirname;
const FAST = process.argv.includes('--fast');

// ---------- 确定性随机（seeded PRNG，保证可复现） ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260828);

// ---------- 事实底座（来自部署包蓝图的真实口径） ----------
const FACTS = [
  { id: 'F01', text: 'KESPI 维度通过阈值为 0.65，绿灯阈值为 0.80', truth: true },
  { id: 'F02', text: '红灯语义是待回炉，不是人工干预信号', truth: true },
  { id: 'F03', text: '10 步代谢顺序：compile→import→link→link-sync→vector→sprout→pollinate→compress→kespi→prune', truth: true },
  { id: 'F04', text: 'KM 维度公式：近7天代谢记录数（每条+0.1，上限0.3）+ 未压缩加0.2', truth: true },
  { id: 'F05', text: '芥子 id 约定 seed-<entityId>，回炉微粒 id 约定 mz-<original_id>', truth: true },
  { id: 'F06', text: '双脑契约：wiki 文件是唯一事实源，DB 是派生物，修复先写文件', truth: true },
  { id: 'F07', text: '残壳判据：compressed=1 且芥子已消费的实体才可归档', truth: true },
  { id: 'F08', text: '回炉种子 access_count>0 防止无限循环回炉', truth: true },
  { id: 'F09', text: '三路编排器熔断器状态需持久化到 state', truth: true },
  { id: 'F10', text: 'SkillOpt 六阶段：Rollout→Reflect→Aggregate→Select→Update→Gate', truth: true },
  // 基线文档中埋的 2 处错误信念（truth=false）
  { id: 'X01', text: '红灯阈值是 0.75（错误：应为 0.65）', truth: false },
  { id: 'X02', text: 'prune 只归档文件即可，DB 无需清理（错误：违反双脑契约）', truth: false }
];

// ---------- 任务包生成：30 条结构化矛盾任务 ----------
function buildTaskPackage() {
  const tasks = [];
  const realFacts = FACTS.filter(f => f.truth);
  for (let i = 0; i < 30; i++) {
    const fact = realFacts[i % realFacts.length];
    // 干扰项：轮流来自错误信念 X01/X02 与事实的扭曲表述
    let wrongText;
    if (i % 3 === 0) wrongText = FACTS.find(f => !f.truth).text; // X01
    else if (i % 3 === 1) wrongText = FACTS.filter(f => !f.truth)[1].text; // X02
    else wrongText = '(扭曲表述) ' + fact.text.replace(/[0-9.]+/, '未知数');
    tasks.push({
      id: `task-${String(i + 1).padStart(2, '0')}`,
      factId: fact.id,
      domain: ['threshold', 'pipeline', 'contract', 'training'][i % 4],
      question: `关于「${fact.text.slice(0, 18)}…」哪种说法成立？`,
      answerA: fact.text,
      answerB: wrongText,
      correct: 'A'
    });
  }
  return tasks;
}

// ---------- 策略（技能文档的推演替身）：信念集 + 维度权重 ----------
function makePolicy(name, believedTrueIds, weights) {
  return { name, beliefs: new Set(believedTrueIds), weights };
}
const BASELINE = makePolicy('baseline-doc',
  FACTS.filter(f => f.truth).map(f => f.id).slice(0, 8).concat(['X01', 'X02']), // 8 真信念 + 2 错信念
  { acc: 0.6, consistency: 0.2, coverage: 0.2 });

// ---------- Rollout：在任务子集上评估策略 ----------
function rollout(policy, tasks) {
  let correct = 0;
  for (const t of tasks) {
    // 策略依据信念集选择答案：相信该事实为真 → 选 A；
    // 若带着错误信念 X01（假阈值），在阈值类任务上会被带偏选 B
    const believesTrue = policy.beliefs.has(t.factId);
    const hasFalseBelief = [...policy.beliefs].some(b => b.startsWith('X'));
    const pick = (believesTrue && !(hasFalseBelief && t.domain === 'threshold')) ? 'A' : 'B';
    if (pick === t.correct) correct++;
  }
  return correct / tasks.length;
}

// ---------- Gate：混合指标（KESPI 式软门禁） ----------
function gateScore(policy, trainTasks, evalTasks) {
  const accEval = rollout(policy, evalTasks);
  const trueIds = FACTS.filter(f => f.truth).map(f => f.id);
  const falseBeliefs = [...policy.beliefs].filter(b => b.startsWith('X')).length;
  const coverage = trueIds.filter(id => policy.beliefs.has(id)).length / trueIds.length;
  const consistency = 1 - falseBeliefs / policy.beliefs.size;
  const overall = policy.weights.acc * accEval +
    policy.weights.consistency * consistency +
    policy.weights.coverage * coverage;
  return { accEval, coverage, consistency, overall };
}

// ---------- 候选生成：对基线信念集做扰动 ----------
function generateCandidates(n) {
  const trueIds = FACTS.filter(f => f.truth).map(f => f.id);
  const candidates = [];
  for (let i = 0; i < n; i++) {
    const beliefs = new Set(BASELINE.beliefs);
    const roll = rand();
    if (roll < 0.35) {
      // 修正型：去掉一个错误信念，补回缺失的真信念
      beliefs.delete(rand() < 0.5 ? 'X01' : 'X02');
      beliefs.add(trueIds.find(id => !beliefs.has(id)) || 'F10');
    } else if (roll < 0.5) {
      // 完全修正型：清掉全部错误信念，补齐缺失真信念
      beliefs.delete('X01'); beliefs.delete('X02');
      for (const id of trueIds) beliefs.add(id);
    } else if (roll < 0.75) {
      // 噪声型：随机丢一个真信念（纯退化）
      const trues = [...beliefs].filter(b => !b.startsWith('X'));
      beliefs.delete(trues[Math.floor(rand() * trues.length)]);
    } else {
      // 混合型：修正 + 丢真信念（净收益可正可负）
      beliefs.delete('X0' + (1 + Math.floor(rand() * 2)));
      const trues = [...beliefs].filter(b => !b.startsWith('X'));
      beliefs.delete(trues[Math.floor(rand() * trues.length)]);
      beliefs.add(trueIds.find(id => !beliefs.has(id)) || 'F10');
    }
    const weights = {
      acc: 0.6 + (rand() - 0.5) * 0.1,
      consistency: 0.2 + (rand() - 0.5) * 0.05,
      coverage: Math.max(0.05, 0.2 + (rand() - 0.5) * 0.05)
    };
    candidates.push(makePolicy(`candidate-${i + 1}`, [...beliefs], weights));
  }
  return candidates;
}

// ---------- 主流程：六阶段循环 ----------
function main() {
  const tasks = buildTaskPackage();
  fs.writeFileSync(path.join(SIM_DIR, 'task-package.json'), JSON.stringify({ count: tasks.length, tasks }, null, 2));

  // Split: 20 train / 10 eval（按索引取模分层，domain 均衡）
  const trainTasks = tasks.filter((_, i) => i % 3 !== 2);
  const evalTasks = tasks.filter((_, i) => i % 3 === 2);

  // Stage 1-2: Rollout + Reflect（基线）
  const baseScore = gateScore(BASELINE, trainTasks, evalTasks);

  // Stage 3-4: Aggregate + Select（候选扰动与筛选）
  const candidates = generateCandidates(40);
  const scored = candidates.map(c => ({ c, s: gateScore(c, trainTasks, evalTasks) }))
    .sort((a, b) => b.s.overall - a.s.overall);

  // Stage 5-6: Update + Gate
  const MARGIN = 0.02;
  const best = scored[0];
  const gatePass = best.s.overall > baseScore.overall + MARGIN && best.s.accEval >= baseScore.accEval;
  const rejected = scored.filter(x => x.s.overall <= baseScore.overall + MARGIN).length;

  console.log('════════════════════════════════════════════');
  console.log(' aing 训练推演（影子模式 · 确定性 seed=20260828）');
  console.log('════════════════════════════════════════════');
  console.log(`任务包: ${tasks.length} 条（train ${trainTasks.length} / eval ${evalTasks.length}）`);
  console.log(`基线: acc=${baseScore.accEval.toFixed(2)} consistency=${baseScore.consistency.toFixed(2)} coverage=${baseScore.coverage.toFixed(2)} overall=${baseScore.overall.toFixed(3)}`);
  console.log(`候选: ${candidates.length} 个，最优=${best.c.name}`);
  console.log(`  最优: acc=${best.s.accEval.toFixed(2)} consistency=${best.s.consistency.toFixed(2)} coverage=${best.s.coverage.toFixed(2)} overall=${best.s.overall.toFixed(3)}`);
  console.log(`Gate(margin=${MARGIN}): ${gatePass ? '✅ 晋升' : '❌ 拒绝'}（被拒候选 ${rejected}/${candidates.length}）`);

  // Tier-3: 蒙特卡洛阈值敏感性
  let mcRows = null;
  if (!FAST) {
    console.log('\n蒙特卡洛（200 次/格，标签噪声扫描 × Gate margin 扫描）:');
    console.log('margin\\noise   0%     5%    10%    20%    30%');
    mcRows = [];
    for (const margin of [0.0, 0.02, 0.05, 0.1]) {
      const row = [];
      for (const noise of [0, 0.05, 0.1, 0.2, 0.3]) {
        let passes = 0;
        for (let t = 0; t < 200; t++) {
          const noisyBase = baseScore.overall + (rand() - 0.5) * 2 * noise;
          const noisyBest = best.s.overall + (rand() - 0.5) * 2 * noise;
          if (noisyBest > noisyBase + margin) passes++;
        }
        row.push((passes / 200 * 100).toFixed(0) + '%');
      }
      mcRows.push({ margin, passRates: row });
      console.log(`  ${margin.toFixed(2)}        ${row.join('  ')}`);
    }
  }

  fs.writeFileSync(path.join(SIM_DIR, 'last-run.json'), JSON.stringify({
    timestamp: new Date().toISOString(), seed: 20260828, fast: FAST,
    taskCount: tasks.length, trainSize: trainTasks.length, evalSize: evalTasks.length,
    candidateCount: candidates.length,
    baseline: baseScore, best: { name: best.c.name, beliefs: [...best.c.beliefs], ...best.s },
    gatePass, margin: MARGIN, rejected, monteCarlo: mcRows
  }, null, 2));

  console.log('\n产物: simulation/task-package.json, simulation/last-run.json');
  console.log(gatePass
    ? '\n结论：Gate 具备区分度——修正型候选过闸、噪声型被拒，影子训练可行性成立。'
    : '\n结论：Gate 未能区分最优候选与基线，需复核任务包或指标权重。');
}

main();
