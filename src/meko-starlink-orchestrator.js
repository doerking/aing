'use strict';
// aing-v2 meko-starlink-orchestrator.js —— M1 任务 1.3 实现（SPEC-0.3 星闪确定性调度协议）
// G 节点中心调度 + 确定性时延上界 T_bound + SLB/SLE 双模 + 噪声拒入口 + 通感写回。
// spec-first：本文件是 SPEC-0.3 的代码结果。
//   T_bound(cycleType) = base(cycleType) × loadFactor（SPEC-0.3 §4.1）
//     base: 解旋=1 / 复制=2 / 再螺旋=2 / 互校=3（tick，1 tick = 1s）
//     loadFactor = ceil(pendingEdges / edgeBatchSize)，edgeBatchSize=10
//   deadline = scheduled_at + T_bound；有界承诺：任一 cycle 必在 deadline 内完成或标记 failed。
//   Polar 抗干扰：strength<3 噪声边拒做检索入口（noiseRejected 标记）。
//   通感一体：每轮 scheduleCycle 顺带写 meko_cycles 行含 kespi_snapshot。

const BASE_TICK = {
  '解旋': 1, '复制': 2, '再螺旋': 2, '互校': 3,                 // SPEC-0.3 §4.1（DNA 四类）
  '代谢': 120, '维护': 120, '进化团': 120, '迁移首跑': 300, '首跑': 300 // 运算类（SPEC-6.9b §2.3）
};
const DEFAULT_BASE = 120; // 未知类型 fail-closed，不再落到 3 秒
const EDGE_BATCH_SIZE = 10;
const TICK_MS = 1000;
const NOISE_STRENGTH = 3; // strength<3 = 噪声边，拒入口（§4.2）

class StarlinkOrchestrator {
  constructor(store) { this.store = store; }

  // 确定性 base（同 cycleType 恒同值；未知类型 fail-closed 给 DEFAULT_BASE）
  _base(cycleType) { return BASE_TICK[cycleType] || DEFAULT_BASE; }

  // T_bound 毫秒 = max(base, 契约 tick 总和) × ceil(pendingEdges/batchSize) × tickMs
  _tBoundMs(cycleType, pendingEdges, declaredTicks = 0) {
    const base = Math.max(this._base(cycleType), Number(declaredTicks) || 0);
    const loadFactor = Math.max(1, Math.ceil((pendingEdges || 0) / EDGE_BATCH_SIZE));
    return base * loadFactor * TICK_MS;
  }

  computeDeterministicDeadline(cycleType, pendingEdges = 0, declaredTicks = 0) {
    return new Date(Date.now() + this._tBoundMs(cycleType, pendingEdges, declaredTicks));
  }

  // 通感一体：优先真 KESPI 均值；无读数才退回实体数换算的占位值
  _scalar(sql, binds = []) {
    const db = this.store._getDb();
    const s = db.prepare(sql);
    if (binds.length) s.bind(binds);
    s.step();
    const r = s.getAsObject();
    s.free();
    return r;
  }

  _probeKespi() {
    try {
      const row = this._scalar('SELECT COUNT(*) AS n FROM entities');
      const n = Number((row && row.n) || 0);
      return Math.round((0.5 + Math.min(n, 50) / 100) * 100) / 100; // 0.5~1.0
    } catch (_) { return 0.5; }
  }

  // SPEC-6.9b §2.1：真读数 = kespi_scores.overall 的活跃实体均值；纯读
  async probeTopologyHealth() {
    try {
      const row = this._scalar(
        `SELECT AVG(s.overall) AS a, COUNT(*) AS n
         FROM kespi_scores s JOIN entities e ON e.id = s.entity_id
         WHERE e.invalid_at IS NULL`);
      const n = Number((row && row.n) || 0);
      const avg = row && row.a != null ? Number(row.a) : null;
      if (n > 0 && Number.isFinite(avg)) {
        return { kespiSnapshot: Math.round(avg * 1e4) / 1e4, source: 'kespi_scores', scored: n };
      }
    } catch (_) { /* 探针失败不阻断调度 */ }
    return { kespiSnapshot: null, source: 'none', scored: 0 };
  }

  // 占位读数（无真值时保底非空，SPEC-6.9b §2.2）
  fallbackKespi() { return this._probeKespi(); }

  async scheduleCycle(cycleType, helixStrand, pendingEdges = 0, opts = {}) {
    const scheduledAt = new Date();
    const tBoundMs = this._tBoundMs(cycleType, pendingEdges, opts.declaredTicks || 0);
    const deadline = new Date(scheduledAt.getTime() + tBoundMs);

    // Polar 抗干扰：噪声边（strength<3）拒入口
    const meta = opts.pendingEdgesMeta || [];
    const noiseRejected = meta.filter(e => Number(e.strength) < NOISE_STRENGTH).map((_, i) => i);

    // 通感写回：优先真 KESPI；无读数才写占位并标记来源
    const probe = await this.probeTopologyHealth();
    const kespiSnapshot = probe.kespiSnapshot == null ? this._probeKespi() : probe.kespiSnapshot;
    const source = probe.kespiSnapshot == null ? 'placeholder' : 'kespi_scores';
    this._writeCycle(cycleType, helixStrand, scheduledAt, deadline, kespiSnapshot, source);

    return { scheduledAt, deadline, mode: helixStrand === 'both' ? 'SLB' : 'SLE', noiseRejected, kespiSource: source };
  }

  _writeCycle(cycleType, helixStrand, scheduledAt, deadline, kespi, source) {
    const db = this.store._getDb();
    const id = 'cyc-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const stmt = db.prepare(
      `INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot, kespi_source)
       VALUES (?, ?, ?, ?, NULL, 'scheduled', ?, ?)`
    );
    stmt.run([id, cycleType, helixStrand, scheduledAt.toISOString(), kespi, source || null]);
    stmt.free();
    if (this.store._persist) this.store._persist();
  }
}

module.exports = { StarlinkOrchestrator };
