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

  // SPEC-7.1 §0.2：本轮开局时在场、尚未打标的产物 id 清单。
  // 本轮新生的产物不在清单里——它还没被任何步骤读取，不能算「过了一回代谢」。
  _openProducts() {
    try {
      const db = this.store._getDb();
      const stmt = db.prepare("SELECT id FROM entities WHERE strand = 'future' AND metabolized_at IS NULL");
      const ids = [];
      while (stmt.step()) ids.push(String(stmt.getAsObject().id));
      stmt.free();
      return ids;
    } catch (_) { return []; }
  }

  // 读物即标记：写 metabolized_at + meta 标签，不改正文/身份/原始时间（只加不减）
  _closeProducts(ids) {
    if (!Array.isArray(ids) || !ids.length) return [];
    const marked = [];
    for (const id of ids) {
      try {
        const r = this.store.markMetabolized(id);
        if (r && r.changed) marked.push(id);
      } catch (_) { /* 单条打标失败不阻断本轮 */ }
    }
    return marked;
  }

  // ── SPEC-1.14 修订 I：轮状态机（running → executed/failed/up_for_retry）──
  // 按 STRANDS 顺序拼出本轮会跑的步 id 序列（续跑守卫用：确认 last_step 仍是已知步）
  _stepIdsInOrder() {
    const ids = [];
    for (const strand of STRANDS) for (const s of this.steps.filter(x => x.strand === strand)) ids.push(s.id);
    return ids;
  }

  _reclaimExpired() {
    const db = this.store._getDb();
    const now = new Date().toISOString();
    const rows = [];
    try {
      const sel = db.prepare("SELECT id, last_step, attempt FROM meko_cycles WHERE status='running' AND deadline_at IS NOT NULL AND deadline_at < ? ORDER BY deadline_at DESC");
      sel.bind([now]);
      while (sel.step()) rows.push(sel.getAsObject());
      sel.free();
      if (rows.length) {
        const upd = db.prepare("UPDATE meko_cycles SET status='up_for_retry' WHERE id = ?");
        for (const r of rows) upd.run([r.id]);
        upd.free();
        this.store._persist();
      }
    } catch (_) { /* 回收失败不阻断开轮 */ }
    return rows.map(r => ({ cycleId: r.id, lastStep: r.last_step || null, attempt: Number(r.attempt || 0) }));
  }

  _beginRound(cycleType, round, deadlineAt, leaseToken, attempt) {
    const db = this.store._getDb();
    const id = `cyc-${Date.now()}-${round}-${Math.floor(Math.random() * 1e6)}`;
    db.run(`INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot, kespi_source, deadline_at, lease_token, last_step, attempt)
            VALUES (?, ?, 'both', ?, NULL, 'running', NULL, NULL, ?, ?, NULL, ?)`,
      [id, `${cycleType}:round${round}`, new Date().toISOString(),
        new Date(deadlineAt).toISOString(), leaseToken == null ? null : Number(leaseToken), attempt]);
    this.store._persist();
    return id;
  }

  _markStep(cycleId, stepId) {
    try {
      this.store._getDb().run('UPDATE meko_cycles SET last_step = ? WHERE id = ?', [stepId || null, cycleId]);
    } catch (_) { /* 定位更新失败不阻断本轮 */ }
  }

  _finishRound(cycleId, cycleType, round, status, kespi, kespiSource) {
    const db = this.store._getDb();
    // 守恒闸（SPEC-2.10 §2.3 / I9）：每轮必带 growth/pruned/ratio 三列快照
    let cons = { growth: 0, pruned: 0, ratio: 1, inBand: true, verdict: 'balanced', idle: true };
    try { cons = require('./conservation.js').measureConservation(this.store, {}); } catch (_) { /* 读数失败不阻断本轮 */ }
    const edge = cons && cons.edge ? cons.edge : cons;
    try {
      db.run(`UPDATE meko_cycles SET status = ?, executed_at = ?, kespi_snapshot = ?, kespi_source = ?, growth = ?, pruned = ?, conservation_ratio = ? WHERE id = ?`,
        [status, new Date().toISOString(), kespi, kespiSource || null,
          edge.growth, edge.pruned, edge.ratio, cycleId]);
    } catch (_) { /* 收口失败不阻断返回 */ }
    // SPEC-1.16：本轮记账（实体快照 + 新边归属 + 上限裁剪）
    try { require('./round-ledger.js').recordRound(this.store, cycleId); } catch (_) { /* 记账失败不阻断编排 */ }
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

    // SPEC-1.14 修订 I：开轮先回收超期轮，并取续跑候选
    const reclaimed = opts.resume === false ? [] : this._reclaimExpired();
    const resumeFrom = reclaimed.length ? reclaimed[0] : null;
    // SPEC-1.14 修订 I §4.3：领写令牌（单调）
    const leaseToken = typeof this.store.claimWriter === 'function'
      ? this.store.claimWriter(opts.epoch || 0)
      : null;

    for (let round = 1; round <= rounds; round++) {
      let failed = null;
      // SPEC-1.14 修订 I（AC-9）：轮首即落账（running），中途被杀也看得出跑到哪
      const attempt = (round === 1 && resumeFrom) ? Number(resumeFrom.attempt || 0) + 1 : 1;
      const roundRowId = this._beginRound(cycleType, round, endsAt, leaseToken, attempt);
      let skipping = false;
      // 续跑：只跳过第 1 轮里已完成的段（连 last_step 本身一起跳过）
      if (round === 1 && resumeFrom && resumeFrom.lastStep) {
        if (this._stepIdsInOrder().includes(resumeFrom.lastStep)) skipping = true;
        // last_step 指到已不存在/未注册的步（改名或下线）：不跳。跳了会整轮静默空转还报 ok:true
        else results.push({ round, id: '*', ok: true, resumeIgnored: `last_step=${resumeFrom.lastStep} 未注册` });
      }
      // SPEC-7.1 §0.2：产物只被代谢一次——本轮开局已在库的 future 产物，读完即打标
      const roundStartProducts = this._openProducts();
      for (const strand of STRANDS) {
        const steps = this.steps.filter(s => s.strand === strand);
        for (const step of steps) {
          if (skipping) {
            if (step.id === resumeFrom.lastStep) skipping = false;
            results.push({ round, id: step.id, ok: true, skippedByResume: true });
            continue;
          }
          const stepStart = _nowMs();
          const quotaMs = (Number(step.budgetTick) || 1) * loadFactor * 1000;
          let entry;
          // SPEC-1.14 修订 H（AC-7）：进下一步前先查预算——剩余已耗尽就不启动新步，
          // 免得把一个注定被外部 SIGKILL 的步开在半途。
          if (_nowMs() >= endsAt) {
            failed = `deadline:before:${step.id}`;
            results.push({ round, id: step.id, ok: false, reason: 'deadline-before-step', elapsedMs: 0 });
            break;
          }
          try {
            const r = await step.onCycle({
              store: this.store, round, strand, bus, cycleId,
              cycleType, opts, selfOptimize: opts.selfOptimize,
              deadlineAt: endsAt, remaining: () => endsAt - _nowMs()
            });
            const okFlag = r ? r.ok !== false : true;
            entry = { round, id: step.id, ok: okFlag, actions: r && r.actions };
            // SPEC-1.14 修订 H（AC-8）：步主动收口 != 步抛错，两者都要可见、都不静默吞
            if (!okFlag) {
              entry.reason = r && r.reason ? String(r.reason) : 'step-failed';
              if (r && (r.done != null || r.total != null)) entry.partial = { done: r.done, total: r.total };
              failed = failed || step.id;
            }
          } catch (e) {
            entry = { round, id: step.id, ok: false, error: e.message };
            failed = failed || step.id;
          }
          // 分步软配额（SPEC-6.9b §2.4）：只记账，不抢占；硬停仍由整轮 deadline 负责
          entry.quotaMs = quotaMs;
          entry.elapsedMs = _nowMs() - stepStart;
          entry.overBudget = entry.elapsedMs > quotaMs;
          results.push(entry);
          // SPEC-1.14 修订 I：只把「已完成的步」记为 last_step（失败的步不算完成，续跑时要重跑）
          if (entry.ok) this._markStep(roundRowId, step.id);
          if (!failed && _nowMs() > endsAt) failed = `timeout:${step.id}`;
          if (failed) break;
        }
        if (failed) break;
      }

      // SPEC-7.1 §0.2：本轮全绿 → 给开局已在库的产物写 metabolized_at + meta（幂等，重跑不变）
      if (!failed) this._closeProducts(roundStartProducts);

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
      this._finishRound(roundRowId, cycleType, round, failed ? 'failed' : 'executed', kespi, kespiSource);

      if (failed) {
        try {
          await require('./trajectory.js').logCycle(this.store, {
            cycleId, ok: false, rounds: round, results, failedStep: failed, elapsedMs: _nowMs() - startedAt
          });
        } catch (_) { /* 轨迹写失败不阻断编排 */ }
        return {
          ok: false, cycleId, rounds: round, failedRound: round, failedStep: failed,
          results, deadline: new Date(endsAt).toISOString(), deadlineAt: endsAt, elapsedMs: _nowMs() - startedAt,
          resumedFrom: resumeFrom, reclaimedRounds: reclaimed, leaseToken
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
      deadline: new Date(endsAt).toISOString(), deadlineAt: endsAt, elapsedMs: _nowMs() - startedAt,
      resumedFrom: resumeFrom, reclaimedRounds: reclaimed, leaseToken
    };
  }
}

module.exports = { MekoOrchestrator };
