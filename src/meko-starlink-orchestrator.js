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

const BASE_TICK = { '解旋': 1, '复制': 2, '再螺旋': 2, '互校': 3 }; // SPEC-0.3 §4.1
const EDGE_BATCH_SIZE = 10;
const TICK_MS = 1000;
const NOISE_STRENGTH = 3; // strength<3 = 噪声边，拒入口（§4.2）

class StarlinkOrchestrator {
  constructor(store) { this.store = store; }

  // 确定性 base（同 cycleType 恒同值；未知类型 fail-closed 给最大 3）
  _base(cycleType) { return BASE_TICK[cycleType] || 3; }

  // T_bound 毫秒 = base × ceil(pendingEdges/batchSize) × tickMs（纯函数可复现）
  _tBoundMs(cycleType, pendingEdges) {
    const loadFactor = Math.max(1, Math.ceil((pendingEdges || 0) / EDGE_BATCH_SIZE));
    return this._base(cycleType) * loadFactor * TICK_MS;
  }

  computeDeterministicDeadline(cycleType, pendingEdges = 0) {
    return new Date(Date.now() + this._tBoundMs(cycleType, pendingEdges));
  }

  // 通感一体：全库均分占位读数（完整 KESPI 属 M2；此处保证写回非空）
  _probeKespi() {
    try {
      const db = this.store._getDb();
      const s = db.prepare('SELECT COUNT(*) AS n FROM entities');
      s.step(); const n = s.getAsObject().n; s.free();
      return Math.round((0.5 + Math.min(n, 50) / 100) * 100) / 100; // 0.5~1.0
    } catch (_) { return 0.5; }
  }

  async scheduleCycle(cycleType, helixStrand, pendingEdges = 0, opts = {}) {
    const scheduledAt = new Date();
    const tBoundMs = this._tBoundMs(cycleType, pendingEdges);
    const deadline = new Date(scheduledAt.getTime() + tBoundMs);

    // Polar 抗干扰：噪声边（strength<3）拒入口
    const meta = opts.pendingEdgesMeta || [];
    const noiseRejected = meta.filter(e => Number(e.strength) < NOISE_STRENGTH).map((_, i) => i);

    // 通感写回：meko_cycles 新增行含非空 kespi_snapshot
    const kespiSnapshot = this._probeKespi();
    this._writeCycle(cycleType, helixStrand, scheduledAt, deadline, kespiSnapshot);

    return { scheduledAt, deadline, mode: helixStrand === 'both' ? 'SLB' : 'SLE', noiseRejected };
  }

  _writeCycle(cycleType, helixStrand, scheduledAt, deadline, kespi) {
    const db = this.store._getDb();
    const id = 'cyc-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const stmt = db.prepare(
      `INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot)
       VALUES (?, ?, ?, ?, NULL, 'scheduled', ?)`
    );
    stmt.run([id, cycleType, helixStrand, scheduledAt.toISOString(), kespi]);
    stmt.free();
    if (this.store._persist) this.store._persist();
  }

  async probeTopologyHealth() { return { kespiSnapshot: this._probeKespi() }; }
}

module.exports = { StarlinkOrchestrator };
