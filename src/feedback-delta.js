'use strict';
// aing-v2 feedback-delta.js —— 任务 6.5 反馈差分（只读）
// 契约见 spec/SPEC-6.5-成长观察四件.md §2.2：最近两轮周期比 Delta 与走势，不调参。
// 铁律：零写（不写 config、不改 DEFAULTS、不审批）；store 注入，不直连 knowledge-store。

const TREND_EPS = 0.01;     // 走势判定阈值
const TRAJ_WINDOW = 20;     // 成功率取样窗口

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

function trajectory(db) {
  const rows = rowsOf(db,
    `SELECT success FROM task_trajectories
     WHERE task_type = 'session' ORDER BY rowid DESC LIMIT ?`, [TRAJ_WINDOW]);
  if (!rows.length) return { samples: 0, successRate: null };
  const ok = rows.filter(r => Number(r.success) === 1).length;
  return { samples: rows.length, successRate: round4((ok / rows.length) * 100) };
}

// 守恒比差分守护（SPEC-2.10 修订 A）：Inf 是合法读数，不是坏值。
// Inf−Inf 会得 NaN、∞→有限会被算成假跌幅，所以非有限一律不出数，只标状态。
function _ratioDelta(toRaw, fromRaw) {
  if (toRaw == null || fromRaw == null) return { ratio: null, state: 'missing' };
  const a = Number(toRaw), b = Number(fromRaw);
  const aInf = a === Infinity, bInf = b === Infinity;
  if (aInf || bInf) return { ratio: null, state: aInf && bInf ? 'inf' : (aInf ? 'to-inf' : 'from-inf') };
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ratio: null, state: 'missing' };
  return { ratio: round4(a - b), state: 'finite' };
}

function delta(store) {
  if (!store || typeof store._getDb !== 'function') throw new Error('feedback-delta 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const cycles = rowsOf(db,
    `SELECT id, kespi_snapshot, growth, pruned, conservation_ratio
     FROM meko_cycles
     WHERE kespi_source = 'kespi_scores'
     ORDER BY rowid DESC LIMIT 2`);

  const counts = {
    entities: Number(scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE invalid_at IS NULL`) || 0),
    edges: Number(scalar(db, `SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL`) || 0)
  };
  const traj = trajectory(db);

  if (cycles.length < 2) {
    return {
      from: cycles[0] ? cycles[0].id : null,
      to: null,
      delta: { kespi: null, growth: null, pruned: null, ratio: null, ratioState: 'insufficient' },
      counts,
      trajectory: traj,
      verdict: 'insufficient'
    };
  }

  const [to, from] = cycles;   // DESC：第一条是较新
  const kd = Number(to.kespi_snapshot) - Number(from.kespi_snapshot);
  const rd = _ratioDelta(to.conservation_ratio, from.conservation_ratio);
  const out = {
    kespi: Number.isFinite(kd) ? round4(kd) : null,
    growth: Number(to.growth) - Number(from.growth),
    pruned: Number(to.pruned) - Number(from.pruned),
    ratio: rd.ratio,
    ratioState: rd.state
  };
  let verdict = 'flat';
  if (out.kespi != null && out.kespi > TREND_EPS) verdict = 'improving';
  else if (out.kespi != null && out.kespi < -TREND_EPS) verdict = 'regressing';

  return { from: from.id, to: to.id, delta: out, counts, trajectory: traj, verdict };
}

module.exports = { TREND_EPS, TRAJ_WINDOW, delta, trajectory };
