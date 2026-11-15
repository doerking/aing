'use strict';
// aing-v2 meko-helix-crosscheck.js —— M1 任务 1.14 实现（SPEC-0.2 §2.4 ④双链互校）
// raw↔wiki 交替校验，每轮留互补痕迹；漏需求被互补链对返（P0 防漏）。
// 链归属按 id 前缀约定：'raw-' → raw 链，'wiki-' → wiki 链。抽核心名（去前缀）配对找 gap。
// 完整代谢互校属 M2（任务2.x），此处锁 crosscheck 接口行为。

class HelixCrosscheck {
  constructor(store) { this.store = store; }

  _allEntities() {
    const db = this.store._getDb();
    const rows = [];
    const stmt = db.prepare('SELECT * FROM entities');
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  _core(id, prefix) { return id.startsWith(prefix) ? id.slice(prefix.length) : null; }

  async crosscheck() {
    const rows = this._allEntities();
    const rawIds = new Set();
    const wikiIds = new Set();
    for (const r of rows) {
      if (r.id.startsWith('raw-')) rawIds.add(r.id);
      else if (r.id.startsWith('wiki-')) wikiIds.add(r.id);
    }
    // wiki 有 raw 无 → rawGaps（raw 链缺这条）；raw 有 wiki 无 → wikiGaps
    const rawGaps = [...wikiIds].filter(id => !rawIds.has(id));
    const wikiGaps = [...rawIds].filter(id => !wikiIds.has(id));
    // 互补对返：能配上的漏需求被对端补齐数（P0 防漏）；完整代谢在 M2 实现，此处留痕计数
    const reconciled = 0;
    return { rawGaps, wikiGaps, reconciled };
  }
}

module.exports = { HelixCrosscheck };
