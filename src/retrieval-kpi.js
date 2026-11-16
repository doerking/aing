'use strict';
// aing-v2 retrieval-kpi.js —— 任务 6.9 原版脚手架移植之一（检索 KPI）
// 契约见 spec/SPEC-6.9-原版脚手架三件移植-能力入原生表.md §2.1：
// 自指 Q&A 跑现成检索面，算 recall@k / MRR，落一条 task_trajectories；零写别的表。
// 铁律：不改实体、不改向量、不碰 last_access；store 注入，不直连 knowledge-store。

const DEFAULTS = { sample: 20, k: 5, baseline: 0.5 };

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

function _base(id) { return String(id).replace(/^wiki-/, ''); }

/** 取样：活跃、有名、同 base 去重且优先 raw；按 id 升序保证可复现。 */
function sampleEntities(db, n) {
  const rows = _rows(db,
    `SELECT id, name, type FROM entities
     WHERE status = 'active' AND invalid_at IS NULL
       AND name IS NOT NULL AND name <> ''
     ORDER BY id`);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const base = _base(r.id);
    if (seen.has(base)) continue;
    seen.add(base);
    out.push({ id: String(r.id), base, name: String(r.name) });
    if (out.length >= n) break;
  }
  return out;
}

function _ymd() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

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
 * 跑一轮检索 KPI。
 * @returns {Promise<{sample:number, k:number, hits:number, recall:number, mrr:number,
 *   baseline:number, success:number, rows:number, id:string}>}
 */
async function runKpi(store, opts = {}) {
  _requireStore(store, 'retrieval-kpi.runKpi');
  const db = store._getDb();
  const sampleN = Number.isInteger(opts.sample) && opts.sample > 0 ? opts.sample : DEFAULTS.sample;
  const k = Number.isInteger(opts.k) && opts.k > 0 ? opts.k : DEFAULTS.k;
  const baseline = typeof opts.baseline === 'number' ? opts.baseline : DEFAULTS.baseline;
  const cycleId = opts.cycleId || null;
  const retrieval = require('./retrieval.js');
  const backend = require('./vector.js').resolveBackend();

  const started = Date.now();
  const sample = sampleEntities(db, sampleN);
  let hits = 0;
  let rrSum = 0;
  const misses = [];

  for (const item of sample) {
    let candidates = [];
    try {
      const res = await retrieval.search(store, item.name, { k });
      candidates = Array.isArray(res && res.candidates) ? res.candidates : [];
    } catch (_) { candidates = []; }
    const rank = candidates.findIndex(c => _base(c.base || c.id) === item.base || String(c.id) === item.id);
    if (rank >= 0) {
      hits++;
      rrSum += 1 / (rank + 1);
    } else {
      misses.push(item.id);
    }
  }

  const n = sample.length;
  const recall = n ? Math.round((hits / n) * 1e6) / 1e6 : 0;
  const mrr = n ? Math.round((rrSum / n) * 1e6) / 1e6 : 0;
  const success = recall >= baseline ? 1 : 0;
  const id = 'traj-rkpi-' + (cycleId || _ymd());

  _upsert(db, {
    id,
    task_type: 'retrieval-kpi',
    route: [],
    tools: ['retrieval.search'],
    step_sequence: ['sample', 'search', 'score'],
    success,
    retries: 0,
    duration_ms: Date.now() - started,
    score_soft: recall,
    score_hard: success,
    evidence: { k, sample: n, hits, recall, mrr, baseline, misses: misses.slice(0, 5), backend: { model: backend.model, dim: backend.dim } },
    source: 'retrieval-kpi'
  });
  store._persist();

  return { sample: n, k, hits, recall, mrr, baseline, success, rows: 1, id };
}

module.exports = { DEFAULTS, sampleEntities, runKpi };
