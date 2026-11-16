'use strict';
// aing-v2 lineage-reflect.js —— 任务 6.9 原版脚手架移植之二（决策谱系反思）
// 契约见 spec/SPEC-6.9-原版脚手架三件移植-能力入原生表.md §2.2：
// field_actions 按动作归组，撤回计入失败；KESPI 走势作证据；落 task_trajectories。
// 铁律：不撤回动作、不改 field_actions / meko_cycles；store 注入，不直连 knowledge-store。

const DEFAULTS = { minSamples: 1, minRate: 0.8, trendLimit: 5 };

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

function _requireStore(store, who) {
  if (!store || typeof store._getDb !== 'function') throw new Error(who + ' 需要 store 注入（SPEC-1.15 契约）');
}

function groupActions(db) {
  const rows = _rows(db,
    `SELECT action,
            COUNT(*) AS n,
            SUM(CASE WHEN reversed_at IS NULL THEN 1 ELSE 0 END) AS stood
     FROM field_actions
     WHERE action IS NOT NULL AND action <> ''
     GROUP BY action
     ORDER BY action`);
  return rows.map(r => {
    const n = Number(r.n) || 0;
    const stood = Number(r.stood) || 0;
    return { action: String(r.action), n, stood, reversed: n - stood, rate: n ? stood / n : 0 };
  });
}

/** KESPI 走势：最近 N 个非空快照，末值 − 首值。 */
function kespiTrend(db, limit) {
  const rows = _rows(db,
    `SELECT kespi_snapshot FROM meko_cycles
     WHERE kespi_snapshot IS NOT NULL AND kespi_source = 'kespi_scores'
     ORDER BY COALESCE(executed_at, scheduled_at, '') DESC, rowid DESC
     LIMIT ?`, [limit]);
  const series = rows.map(r => Number(r.kespi_snapshot)).filter(Number.isFinite).reverse();
  if (series.length < 2) return 0;
  return Math.round((series[series.length - 1] - series[0]) * 1e4) / 1e4;
}

function _upsert(db, row) {
  const existing = _scalar(db, 'SELECT id FROM task_trajectories WHERE id = ?', [row.id]);
  if (existing && existing.id) {
    const stmt = db.prepare(
      `UPDATE task_trajectories SET task_type = ?, route = ?, tools = ?, step_sequence = ?,
         success = ?, retries = ?, duration_ms = ?, score_soft = ?, score_hard = ?,
         evidence = ?, source = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?`
    );
    stmt.run([row.task_type, JSON.stringify(row.route), JSON.stringify(row.tools), JSON.stringify(row.step_sequence),
      row.success, row.retries, row.duration_ms, row.score_soft, row.score_hard, JSON.stringify(row.evidence), row.source, row.id]);
    stmt.free();
    return 'updated';
  }
  const stmt = db.prepare(
    `INSERT INTO task_trajectories
       (id, task_type, route, tools, step_sequence, success, retries, duration_ms, score_soft, score_hard, evidence, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  stmt.run([row.id, row.task_type, JSON.stringify(row.route), JSON.stringify(row.tools), JSON.stringify(row.step_sequence),
    row.success, row.retries, row.duration_ms, row.score_soft, row.score_hard, JSON.stringify(row.evidence), row.source]);
  stmt.free();
  return 'inserted';
}

/**
 * 把场域动作谱系归组成反思轨迹。
 * @returns {{actions:Array, trend:number, cycleId:string|null}}
 */
function reflect(store, opts = {}) {
  _requireStore(store, 'lineage-reflect.reflect');
  const db = store._getDb();
  const minSamples = Number.isInteger(opts.minSamples) && opts.minSamples > 0 ? opts.minSamples : DEFAULTS.minSamples;
  const minRate = typeof opts.minRate === 'number' ? opts.minRate : DEFAULTS.minRate;
  const limit = Number.isInteger(opts.trendLimit) && opts.trendLimit > 0 ? opts.trendLimit : DEFAULTS.trendLimit;
  const cycleId = opts.cycleId || null;

  const trend = kespiTrend(db, limit);
  const groups = groupActions(db);
  const actions = [];

  for (const g of groups) {
    if (g.n < minSamples) continue;
    const rate = Math.round(g.rate * 1e6) / 1e6;
    const success = rate >= minRate ? 1 : 0;
    const id = 'traj-reflect-' + g.action + '-' + (cycleId || 'latest');
    _upsert(db, {
      id,
      task_type: 'reflect',
      route: [g.action],
      tools: ['field_actions', 'meko_cycles'],
      step_sequence: ['group', 'score', 'emit'],
      success,
      retries: 0,
      duration_ms: 0,
      score_soft: rate,
      score_hard: success,
      evidence: { action: g.action, n: g.n, stood: g.stood, reversed: g.reversed, rate, kespiTrend: trend, samples: [] },
      source: 'lineage-reflect'
    });
    actions.push({ action: g.action, n: g.n, stood: g.stood, reversed: g.reversed, rate, success, id });
  }

  if (actions.length) store._persist();
  return { actions, trend, cycleId };
}

module.exports = { DEFAULTS, groupActions, kespiTrend, reflect };
