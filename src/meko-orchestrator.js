'use strict';
// aing-v2 meko-orchestrator.js —— M1 任务 1.14 实现（SPEC-1.14 螺旋编排）
// 单进程内螺旋推进：raw 拍 → cross 拍 → wiki 拍，逐轮重入，后一轮见到前一轮写入。
// 每轮结算落 meko_cycles；全程有界（T_bound 来自 SPEC-0.3）；步骤错误可见、唔静默吞。
// 本文件是唯一允许持 store 句柄的编排入口（arch-lint 白名单）。

const STRANDS = ['raw', 'cross', 'wiki'];
const BANDS = ['entry', 'field', 'background', 'cross'];

function _nowMs() { return Date.now(); }

class MekoOrchestrator {
  constructor({ store, starlink } = {}) {
    if (!store) throw new Error('MekoOrchestrator 需要 store（由外层注入）');
    this.store = store;
    this.steps = [];
    this.starlink = starlink || new (require('./meko-starlink-orchestrator.js').StarlinkOrchestrator)(store);
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

  _deadlineMs(cycleType, pendingEdges) {
    const at = this.starlink.computeDeterministicDeadline(cycleType, pendingEdges);
    return Math.max(1, at.getTime() - _nowMs());
  }

  _writeCycle(cycleType, round, status, kespi) {
    const db = this.store._getDb();
    const id = `cyc-${Date.now()}-${round}-${Math.floor(Math.random() * 1e6)}`;
    const stmt = db.prepare(
      `INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot)
       VALUES (?, ?, 'both', ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    stmt.run([id, `${cycleType}:round${round}`, now, now, status, kespi]);
    stmt.free();
    this.store._persist();
  }

  async runCycle(cycleType = '代谢', opts = {}) {
    const rounds = Math.max(1, opts.rounds || 2);
    const pendingEdges = opts.pendingEdges || 0;
    const budgetMs = this._deadlineMs(cycleType, pendingEdges);
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
          try {
            const r = await step.onCycle({ store: this.store, round, strand, bus, cycleId });
            results.push({ round, id: step.id, ok: r ? r.ok !== false : true, actions: r && r.actions });
          } catch (e) {
            results.push({ round, id: step.id, ok: false, error: e.message });
            failed = failed || step.id;
          }
          if (!failed && _nowMs() > endsAt) failed = `timeout:${step.id}`;
          if (failed) break;
        }
        if (failed) break;
      }

      // 通感快照（占位：KESPI 真值属 M2；此处置保非空）
      let kespi = null;
      try { kespi = (await this.starlink.probeTopologyHealth()).kespiSnapshot; } catch (_) { kespi = 0.5; }
      this._writeCycle(cycleType, round, failed ? 'failed' : 'executed', kespi);

      if (failed) {
        return {
          ok: false, cycleId, rounds: round, failedRound: round, failedStep: failed,
          results, deadline: new Date(endsAt).toISOString(), elapsedMs: _nowMs() - startedAt
        };
      }
    }

    return {
      ok: true, cycleId, rounds, results,
      deadline: new Date(endsAt).toISOString(), elapsedMs: _nowMs() - startedAt
    };
  }
}

module.exports = { MekoOrchestrator };
