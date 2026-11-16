'use strict';
// aing-v2 meko-orchestrator.js —— M1 任务 1.14 实现（SPEC-1.14 螺旋编排）
// 单进程内螺旋推进：raw 拍 → cross 拍 → wiki 拍，逐轮重入，后一轮见到前一轮写入。
// 每轮结算落 meko_cycles；全程有界（T_bound 来自 SPEC-0.3）；步骤错误可见、唔静默吞。
// 本文件是唯一允许持 store 句柄的编排入口（arch-lint 白名单）。

const STRANDS = ['raw', 'cross', 'wiki'];
const BANDS = ['entry', 'field', 'background', 'cross'];

function _nowMs() { return Date.now(); }

class MekoOrchestrator {
  constructor({ store, timebound } = {}) {
    if (!store) throw new Error('MekoOrchestrator 需要 store（由外层注入）');
    this.store = store;
    this.steps = [];
    this.timebound = timebound || new (require('./meko-timebound-orchestrator.js').TimeboundOrchestrator)(store);
  }

  registerStep(contract) {
    const errs = [];
    if (!contract || typeof contract !== 'object') errs.push('contract 必须是对象');
    else {
      if (!contract.id || typeof contract.id !== 'string') errs.push('id 必填字符串');
      if (!STRANDS.includes(contract.strand)) errs.push(`strand 必须是 ${STRANDS.join('/')}`);
      if (!BANDS.includes(contract.band)) errs.push(`band 必须是 ${BANDS.join('/')}`);
      if (!Array.isArray(contract.reads)) errs.push('reads 必须是数组');
      if (!Array.isArray(contract.writes)) errs.push('writes 必须是数组');
      if (!Number.isInteger(contract.budgetTick) || contract.budgetTick <= 0) errs.push('budgetTick 必须是正整数');
      if (typeof contract.reversible !== 'boolean') errs.push('reversible 必须是 boolean');
      if (typeof contract.onCycle !== 'function') errs.push('onCycle 必须是函数');
      if (!errs.length && this.steps.some(s => s.id === contract.id)) errs.push(`id 重复: ${contract.id}`);
    }
    if (errs.length) throw new Error('registerStep 契约违规: ' + errs.join('；'));
    this.steps.push(contract);
    return contract.id;
  }

  _deadlineMs(cycleType, pendingEdges, declaredTicks = 0) {
    const at = this.timebound.computeDeterministicDeadline(cycleType, pendingEdges, declaredTicks);
    return Math.max(1, at.getTime() - _nowMs());
  }

  _writeCycle(cycleType, round, status, kespi, kespiSource) {
    const db = this.store._getDb();
    const id = `cyc-${Date.now()}-${round}-${Math.floor(Math.random() * 1e6)}`;
    // 守恒闸（SPEC-2.10 §2.3 / I9）：每轮必带 growth/pruned/ratio 三列快照
    let cons = { growth: 0, pruned: 0, ratio: 1, inBand: true, verdict: 'balanced', idle: true };
    try { cons = require('./conservation.js').measureConservation(this.store, {}); } catch (_) { /* 读数失败不阻断本轮 */ }
    const stmt = db.prepare(
      `INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot, kespi_source, growth, pruned, conservation_ratio)
       VALUES (?, ?, 'both', ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    stmt.run([id, `${cycleType}:round${round}`, now, now, status, kespi, kespiSource || null, cons.growth, cons.pruned, cons.ratio]);
    stmt.free();
    this.store._persist();
    return cons;
  }

  async runCycle(cycleType = '代谢', opts = {}) {
    const rounds = Math.max(1, opts.rounds || 2);
    const pendingEdges = opts.pendingEdges || 0;
    // 契约 budgetTick 求和参与 T_bound（SPEC-6.9b §2.3）
    const declaredTicks = this.steps.reduce((a, s) => a + (Number(s.budgetTick) || 0), 0);
    const loadFactor = Math.max(1, Math.ceil((pendingEdges || 0) / 10));
    // 迁移首跑等批处理场景可显式给预算；缺省仍走 T_bound（SPEC-0.3）
    const budgetMs = opts.budgetMs ? Math.max(1, Number(opts.budgetMs)) : this._deadlineMs(cycleType, pendingEdges, declaredTicks);
    const startedAt = _nowMs();
    const endsAt = startedAt + budgetMs;
    const cycleId = `cyc-${startedAt}-${Math.floor(Math.random() * 1e6)}`;
    const bus = {};
    const results = [];

    for (let round = 1; round <= rounds; round++) {
      let failed = null;
      for (const strand of STRANDS) {
        const steps = this.steps.filter(s => s.strand === strand);
        for (const step of steps) {
          const stepStart = _nowMs();
          const quotaMs = (Number(step.budgetTick) || 1) * loadFactor * 1000;
          let entry;
          try {
            const r = await step.onCycle({
              store: this.store, round, strand, bus, cycleId,
              cycleType, opts, selfOptimize: opts.selfOptimize
            });
            entry = { round, id: step.id, ok: r ? r.ok !== false : true, actions: r && r.actions };
          } catch (e) {
            entry = { round, id: step.id, ok: false, error: e.message };
            failed = failed || step.id;
          }
          // 分步软配额（SPEC-6.9b §2.4）：只记账，不抢占；硬停仍由整轮 deadline 负责
          entry.quotaMs = quotaMs;
          entry.elapsedMs = _nowMs() - stepStart;
          entry.overBudget = entry.elapsedMs > quotaMs;
          results.push(entry);
          if (!failed && _nowMs() > endsAt) failed = `timeout:${step.id}`;
          if (failed) break;
        }
        if (failed) break;
      }

      // 通感快照（SPEC-6.9b）：优先真 KESPI 均值；无读数才写占位并标记来源
      let kespi = null;
      let kespiSource = 'none';
      try {
        const health = await this.timebound.probeTopologyHealth();
        kespi = health && health.kespiSnapshot != null ? health.kespiSnapshot : null;
        kespiSource = health && health.source === 'kespi_scores' ? 'kespi_scores' : 'none';
      } catch (_) { kespi = null; kespiSource = 'none'; }
      if (kespi == null) {
        kespi = this.timebound.fallbackKespi();
        kespiSource = 'placeholder';
      }
      this._writeCycle(cycleType, round, failed ? 'failed' : 'executed', kespi, kespiSource);

      if (failed) {
        try {
          await require('./trajectory.js').logCycle(this.store, {
            cycleId, ok: false, rounds: round, results, failedStep: failed, elapsedMs: _nowMs() - startedAt
          });
        } catch (_) { /* 轨迹写失败不阻断编排 */ }
        return {
          ok: false, cycleId, rounds: round, failedRound: round, failedStep: failed,
          results, deadline: new Date(endsAt).toISOString(), elapsedMs: _nowMs() - startedAt
        };
      }
    }

    try {
      await require('./trajectory.js').logCycle(this.store, {
        cycleId, ok: true, rounds, results, failedStep: null, elapsedMs: _nowMs() - startedAt
      });
    } catch (_) { /* 轨迹写失败不阻断编排 */ }
    return {
      ok: true, cycleId, rounds, results,
      deadline: new Date(endsAt).toISOString(), elapsedMs: _nowMs() - startedAt
    };
  }
}

module.exports = { MekoOrchestrator };
