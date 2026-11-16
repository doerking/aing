'use strict';
// aing-v2 meko-helix-crosscheck.js —— M1 任务 1.14 实现（SPEC-0.2 §2.4 ④双链互校）
// raw↔wiki 交替校验，每轮留互补痕迹；漏需求被互补链对返（P0 防漏）。
// 链归属按 id 前缀约定：'raw-' → raw 链，'wiki-' → wiki 链。抽核心名（去前缀）配对找 gap。
// 完整代谢互校属 M2（任务2.x），此处锁 crosscheck 接口行为。

class HelixCrosscheck {
  constructor(store) { this.store = store; }

  _rows(sql, binds = []) {
    const db = this.store._getDb();
    const stmt = db.prepare(sql);
    if (binds.length) stmt.bind(binds);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
  }

  _core(id, prefix) { return id.startsWith(prefix) ? id.slice(prefix.length) : null; }

  /**
   * 互校：raw↔wiki 交替校验。
   * - gap 只数活跃实体（退役位永远补不完，且 field 对返也跳过退役）
   * - 配对视同 meko-field 口径：无前缀实体归 raw 链
   * @param {{cycleId?: string}} opts cycleId 只统计该轮的对返账
   * @returns {Promise<{rawGaps: string[], wikiGaps: string[], reconciled: number}>}
   */
  async crosscheck(opts = {}) {
    const active = this._rows('SELECT id FROM entities WHERE invalid_at IS NULL ORDER BY id').map((r) => String(r.id));
    const all = new Set(this._rows('SELECT id FROM entities').map((r) => String(r.id)));
    const rawGaps = [];
    const wikiGaps = [];
    for (const id of active) {
      if (id.startsWith('wiki-')) {
        if (!all.has('raw-' + id.slice(5))) rawGaps.push(id);
      } else {
        // raw- 前缀与无前缀（SPEC-1.4 兼容）同属 raw 链
        const base = id.startsWith('raw-') ? id.slice(4) : id;
        if (!all.has('wiki-' + base)) wikiGaps.push(id);
      }
    }
    // 对返数取账本真值：只算「目标实体确实被补出来」的 reconcile 动作
    const cycleId = opts && opts.cycleId != null ? String(opts.cycleId) : null;
    const sql = `SELECT COUNT(*) AS n FROM field_actions fa
      WHERE fa.action = 'reconcile'
        AND EXISTS (SELECT 1 FROM entities e WHERE e.id = fa.target)`
      + (cycleId ? ' AND fa.cycle_id = ?' : '');
    const reconciled = Number((this._rows(sql, cycleId ? [cycleId] : [])[0] || {}).n || 0);
    return { rawGaps, wikiGaps, reconciled };
  }
}

module.exports = { HelixCrosscheck };
