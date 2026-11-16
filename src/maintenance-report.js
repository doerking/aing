'use strict';
// aing-v2 maintenance-report.js —— 任务 6.6 内外维护简报（只读聚合）
// 契约见 spec/SPEC-6.6-内外维护接线.md §2.1：内场（T0/T2）与外场（memo）共用一份读数。
// 铁律：零写；不修边、不改实体、不碰 last_access；store 注入，不直连 knowledge-store。

const TARGETS_MAX = 10;
const PENDING_INSIGHT_MAX = 3;
// 修复优先级：空内容最急，其次孤儿、未索引、停滞，最后稀薄
const TARGET_ORDER = ['empty', 'orphan', 'unindexed', 'stagnant', 'thin'];

function rowsOf(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function buildTargets(ids) {
  const seen = new Set();
  const out = [];
  for (const dim of TARGET_ORDER) {
    for (const id of (ids[dim] || [])) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= TARGETS_MAX) return out;
    }
  }
  return out;
}

function buildReport(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('maintenance-report 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();

  const gaps = require('./gap-scan.js').gapScan(store);
  const selfModel = require('./self-model.js').measure(store);
  const feedback = require('./feedback-delta.js').delta(store, opts);

  const pending = rowsOf(db,
    `SELECT id, name FROM entities
     WHERE type = 'MetaKnowledge' AND status = 'pending-distillation' AND invalid_at IS NULL
     ORDER BY rowid DESC`);

  return {
    generatedAt: new Date().toISOString(),
    internal: {
      gaps,
      selfModel,
      feedback,
      targets: buildTargets(gaps.ids)
    },
    external: {
      pendingInsights: {
        count: pending.length,
        items: pending.slice(0, PENDING_INSIGHT_MAX).map(e => ({ id: String(e.id), name: String(e.name == null ? e.id : e.name) }))
      }
    }
  };
}

module.exports = { TARGETS_MAX, PENDING_INSIGHT_MAX, TARGET_ORDER, buildReport, buildTargets };
