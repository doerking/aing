'use strict';
// aing-v2 evolution-cycle.js —— M2 任务 2.15 实现（SPEC-2.15 六维×四时点维护接线）
// T0 定焦 → T1 复核 → T2 度量（每轮必落快照，I9）→ T3 跨周期演化（gene 衰减/归档，可回滚）。
// 判定与执行分离：本件只出 plan / 拦截清单 / 快照 / gene 演化，唔写双链业务表。
// 组件唔直连 knowledge-store：store 由编外层注入（arch-lint C5 守）。

const { buildEvolutionSteps } = require('./evolution-team.js');

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _conservation(store) {
  try { return require('./conservation.js').measureConservation(store, {}); }
  catch (_) { return { growth: 0, pruned: 0, ratio: 1, inBand: true, verdict: 'balanced', idle: true }; }
}

// 6.5 只读件接入 T2：单件失败置 null，不阻断快照（观测不阻断主链）
function _safe(fn) {
  try { return fn(); } catch (_) { return null; }
}

const EVIDENCE_ACTIONS = ['demote', 'promote', 'promote-edge'];
const MAINTENANCE_ACTIONS = ['rebond', 'unwind', 'reconcile'];

class EvolutionRuntime {
  constructor({ store, orchestrator } = {}) {
    if (!store || typeof store._getDb !== 'function') throw new Error('EvolutionRuntime 需要 store');
    this.store = store;
    this.orchestrator = orchestrator || null;
    this._snapshots = [];
  }

  /** T0 轮前定焦（pilot） */
  t0Plan() {
    const db = this.store._getDb();
    const c = _conservation(this.store);
    const last = _scalar(db, `SELECT * FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 1`);
    let focus = 'maintain';
    if (!last || c.idle) focus = 'supply';
    else if (c.verdict === 'growth-only') focus = 'digest';
    else if (c.verdict === 'prune-only') focus = 'restore';
    return {
      focus,
      reason: c.verdict,
      budget: { rounds: 1, fieldTick: 1 },
      lastCycle: last ? { type: last.cycle_type, status: last.status } : null
    };
  }

  /** T1 轮内复核（tri-cross + omni-gate） */
  async t1Review(opts = {}) {
    const db = this.store._getDb();
    const cycleId = opts.cycleId || null;
    const acts = cycleId
      ? _rows(db, `SELECT id, action, target, before_json FROM field_actions WHERE cycle_id = ? ORDER BY id`, [cycleId])
      : _rows(db, `SELECT id, action, target, before_json FROM field_actions ORDER BY id`);

    const allow = [];
    const hold = [];
    for (const a of acts) {
      let before = null;
      try { before = JSON.parse(a.before_json); } catch (_) { before = null; }
      if (MAINTENANCE_ACTIONS.includes(a.action)) { allow.push(a.id); continue; }
      if (EVIDENCE_ACTIONS.includes(a.action)) {
        const ev = before && Array.isArray(before.evidence) ? [...new Set(before.evidence.map(String))] : [];
        if (ev.length >= 2) allow.push(a.id);
        else hold.push({ id: a.id, action: a.action, reason: 'insufficient-evidence' });
        continue;
      }
      hold.push({ id: a.id, action: a.action, reason: 'unknown-action' });
    }
    return { allow: allow.sort(), hold };
  }

  /** T2 轮尾度量：六维快照（I9） */
  t2Snapshot(cycleId = null) {
    const db = this.store._getDb();
    const c = _conservation(this.store);
    const last = cycleId
      ? _scalar(db, 'SELECT * FROM meko_cycles WHERE id = ?', [cycleId])
      : _scalar(db, `SELECT * FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 1`);

    const raw = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE id LIKE 'raw-%' AND invalid_at IS NULL`).n || 0);
    const wiki = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE id LIKE 'wiki-%' AND invalid_at IS NULL`).n || 0);
    const crossBand = Number(_scalar(db,
      `SELECT COUNT(*) AS n FROM field_actions WHERE action IN ('demote','promote','promote-edge')`).n || 0);
    const kespiAvg = Number(_scalar(db, 'SELECT AVG(overall) AS a FROM kespi_scores').a || 0);

    // D4：连续 idle 轮数（growth=0 且 pruned=0）
    const recent = _rows(db, 'SELECT growth, pruned FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 20');
    let idleStreak = 0;
    for (const r of recent) {
      if (Number(r.growth || 0) === 0 && Number(r.pruned || 0) === 0) idleStreak++;
      else break;
    }

    const genesActive = Number(_scalar(db, `SELECT COUNT(*) AS n FROM genes WHERE status = 'active'`).n || 0);
    const genesArchived = Number(_scalar(db, `SELECT COUNT(*) AS n FROM genes WHERE status = 'archived'`).n || 0);
    const proposals = Number(_scalar(db,
      `SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND relation IN ('sprout-candidate','pollinate-candidate')`).n || 0);

    const snap = {
      cycleId: last ? last.id : null,
      complete: !!last && last.conservation_ratio != null,
      D1: { value: Math.abs(raw - wiki), definition: '断链数（双链同位缺口）' },
      D2: { value: crossBand, definition: '跨带动作数（demote/promote）' },
      D3: { value: Math.round(kespiAvg * 1000) / 1000, definition: `KESPI 均值（守恒比 ${c.ratio === Infinity ? 'inf' : c.ratio}，带内=${c.inBand}）` },
      D4: { value: idleStreak, definition: '连续无动作轮数' },
      D5: { value: genesActive, definition: `活跃 gene 数（归档 ${genesArchived}）` },
      D6: { value: proposals, definition: '待呈提案数（只出数）' },
      conservation: c,
      // 6.5：三只读件由 T2 消费；best-effort，单个失败置 null 不阻断快照
      gaps: _safe(() => require('./gap-scan.js').gapScan(this.store)),
      feedback: _safe(() => require('./feedback-delta.js').delta(this.store)),
      selfModel: _safe(() => require('./self-model.js').measure(this.store))
    };
    this._snapshots.push(snap);
    return snap;
  }

  /** T3 跨周期演化（gene-keeper + poll） */
  async t3Evolve(opts = {}) {
    const db = this.store._getDb();
    const decay = typeof opts.decay === 'number' ? opts.decay : 0.9;
    const archiveBelow = typeof opts.archiveBelow === 'number' ? opts.archiveBelow : 0.2;
    const genes = _rows(db, `SELECT * FROM genes WHERE status = 'active'`);
    const upd = db.prepare('UPDATE genes SET score = ?, status = ?, lineage = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    let decayed = 0; let archived = 0;
    for (const g of genes) {
      const before = { score: Number(g.score), status: g.status, archived_at: g.archived_at || null };
      const score = Math.round(Number(g.score) * decay * 1e6) / 1e6;
      const willArchive = score < archiveBelow;
      upd.run([score, willArchive ? 'archived' : 'active', JSON.stringify(before),
        willArchive ? new Date().toISOString() : null, g.id]);
      decayed++;
      if (willArchive) archived++;
    }
    upd.free();
    if (genes.length) this.store._persist();
    return { decayed, archived };
  }

  async rollbackGene(id) {
    const db = this.store._getDb();
    const g = _scalar(db, 'SELECT * FROM genes WHERE id = ?', [id]);
    if (!g || !g.lineage) return { restored: false, reason: 'no-lineage' };
    let before;
    try { before = JSON.parse(g.lineage); } catch (_) { return { restored: false, reason: 'bad-lineage' }; }
    const upd = db.prepare('UPDATE genes SET score = ?, status = ?, archived_at = ?, lineage = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    upd.run([before.score, before.status, before.archived_at, id]);
    upd.free();
    this.store._persist();
    return { restored: true, id };
  }

  /** 一轮跑齐 T0→T2，每 N 轮跑 T3 */
  async run(opts = {}) {
    if (!this.orchestrator) throw new Error('run 需要 orchestrator（编排唯一入口）');
    const rounds = Math.max(1, Number(opts.rounds) || 2);
    const t3Every = Math.max(1, Number(opts.t3Every) || 4);
    const plans = []; const reviews = []; const snapshots = [];
    let evolution = null;

    for (let r = 1; r <= rounds; r++) {
      const plan = this.t0Plan();
      plans.push(plan);
      const res = await this.orchestrator.runCycle('维护', { rounds: 1 });
      const last = _scalar(this.store._getDb(), `SELECT * FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 1`);
      const cycleId = last ? last.id : null;
      reviews.push({ round: r, cycleId, ...(await this.t1Review({ cycleId })) });
      snapshots.push(this.t2Snapshot(cycleId));
      if (r % t3Every === 0) evolution = await this.t3Evolve(opts.evolution || {});
      if (res && res.ok === false) break;
    }
    return { plans, reviews, snapshots, evolution };
  }
}

module.exports = { EvolutionRuntime, buildEvolutionSteps, EVIDENCE_ACTIONS, MAINTENANCE_ACTIONS };
