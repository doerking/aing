'use strict';
// aing-v2 self-model.js —— 任务 6.5 自我模型（只读测量）
// 契约见 spec/SPEC-6.5-成长观察四件.md §2.3：全部从库内事实算，只建模不自调。
// 铁律：不写任何表；store 注入，不直连 knowledge-store。

const TRAJ_WINDOW = 20;

function round4(x) { return Math.round(Number(x) * 1e4) / 1e4; }

function rowsOf(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function scalar(db, sql, params) {
  const rows = rowsOf(db, sql, params);
  if (!rows.length) return null;
  return rows[0][Object.keys(rows[0])[0]];
}

function measure(store) {
  if (!store || typeof store._getDb !== 'function') throw new Error('self-model 需要 store 注入（SPEC-1.15 契约）');
  const backend = require('./vector.js').resolveBackend();
  const db = store._getDb();

  const entities = Number(scalar(db, `SELECT COUNT(*) AS n FROM entities`) || 0);
  const active = Number(scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE status = 'active' AND invalid_at IS NULL`) || 0);
  const edges = Number(scalar(db, `SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL`) || 0);
  const indexed = Number(scalar(db,
    `SELECT COUNT(DISTINCT v.entity_id) AS n
     FROM entity_vectors v JOIN entities e ON e.id = v.entity_id
     WHERE e.status = 'active' AND e.invalid_at IS NULL AND v.model = ? AND v.dim = ?`,
    [backend.model, backend.dim]) || 0);
  const distillDebt = Number(scalar(db,
    `SELECT COUNT(*) AS n FROM entities
     WHERE status = 'pending-distillation' AND invalid_at IS NULL`) || 0);
  const kespiAvg = Number(scalar(db, `SELECT AVG(overall) AS v FROM kespi_scores`) || 0);

  const trajRows = rowsOf(db,
    `SELECT success FROM task_trajectories
     WHERE task_type = 'session' ORDER BY rowid DESC LIMIT ?`, [TRAJ_WINDOW]);
  const trajOk = trajRows.filter(r => Number(r.success) === 1).length;
  const trajectorySuccessRate = trajRows.length ? round4((trajOk / trajRows.length) * 100) : null;

  const gaps = require('./gap-scan.js').gapScan(store).total;

  return {
    measuredAt: new Date().toISOString(),
    metrics: {
      entities,
      active,
      edges,
      vectorCoverage: active ? round4((indexed / active) * 100) : 0,
      distillDebt,
      kespiAvg: round4(kespiAvg),
      trajectorySuccessRate,
      gaps
    }
  };
}

module.exports = { TRAJ_WINDOW, measure };
