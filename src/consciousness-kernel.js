'use strict';
// aing-v2 consciousness-kernel.js —— M3 任务 3.1 实现（SPEC-3.1 意识层闭环）
// 注意力五因子加权；六态状态机；recordCycleResult 是 stagnation_count 唯一写者。
// 连续 3 轮无产出 → stagnant + 断路器记录（SPEC-0.8 D4 的真信号源）。
// 铁律：唔碰 last_access；无物理 DELETE。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const STATES = ['idle', 'sensing', 'integrating', 'focused', 'aroused', 'stagnant'];
const STAGNANT_AFTER = 3;

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
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function _round(n) { return Math.round(Number(n) * 1e6) / 1e6; }

function computeAttention(store) {
  if (!store || typeof store._getDb !== 'function') throw new Error('consciousness-kernel 需要 store 注入（SPEC-3.1 契约）');
  const db = store._getDb();

  const kespi = _scalar(db, 'SELECT AVG(overall) AS a FROM kespi_scores');
  const vitality = kespi && kespi.a != null ? Math.max(0, Math.min(1, Number(kespi.a))) : 0.5;

  const latest = _scalar(db, `SELECT MAX(created_at) AS t FROM entities WHERE type = 'Conversation'`);
  let recency = 0;
  if (latest && latest.t) {
    const days = Number(_scalar(db, `SELECT (julianday('now') - julianday(?)) AS d`, [String(latest.t)]).d || 0);
    recency = Math.max(0, Math.min(1, Math.exp(-Math.max(0, days) / 7)));
  }

  const ents = Number(_scalar(db, 'SELECT COUNT(*) AS n FROM entities WHERE invalid_at IS NULL').n || 0);
  const edges = Number(_scalar(db, 'SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL').n || 0);
  const connectionDensity = ents > 0 ? Math.min(1, edges / (ents * 5)) : 0;

  const alerts = Number(_scalar(db, `SELECT COUNT(*) AS n FROM approval_queue WHERE status = 'pending'`).n || 0);
  const anomaly = Math.min(1, alerts / 5);

  const convs = _rows(db, `SELECT content FROM entities WHERE type = 'Conversation' AND invalid_at IS NULL`);
  let open = 0;
  for (const c of convs) {
    try {
      const b = JSON.parse(c.content || '{}');
      if (b.outcome == null || b.outcome === 'open') open++;
    } catch (_) { /* 忽略坏行 */ }
  }
  const userInterest = convs.length ? open / convs.length : 0;

  const attention = _round(
    vitality * 0.3 + recency * 0.25 + connectionDensity * 0.2 + anomaly * 0.15 + userInterest * 0.1
  );
  const factors = { vitality: _round(vitality), recency: _round(recency), connectionDensity: _round(connectionDensity), anomaly: _round(anomaly), userInterest: _round(userInterest) };
  return { attention, factors };
}

function _stateFor(attention, hasEvents, stagnant) {
  if (stagnant) return 'stagnant';
  if (!hasEvents) return 'idle';
  if (attention >= 0.8) return 'aroused';
  if (attention >= 0.6) return 'focused';
  if (attention >= 0.4) return 'integrating';
  return 'sensing';
}

function _ensureRow(db) {
  const row = _scalar(db, `SELECT * FROM kernel_state WHERE id = 'kernel'`);
  if (row) return row;
  const ins = db.prepare(`INSERT INTO kernel_state (id, state, attention, stagnation_count, breaker_json, last_cycle_id, updated_at)
    VALUES ('kernel', 'idle', 0, 0, NULL, NULL, CURRENT_TIMESTAMP)`);
  ins.run([]);
  ins.free();
  return _scalar(db, `SELECT * FROM kernel_state WHERE id = 'kernel'`);
}

async function observe(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('consciousness-kernel 需要 store 注入（SPEC-3.1 契约）');
  const db = store._getDb();
  const row = _ensureRow(db);
  const att = computeAttention(store);
  const attention = typeof opts.attentionOverride === 'number' ? opts.attentionOverride : att.attention;
  const hasEvents = Array.isArray(opts.events) && opts.events.length > 0;
  const stagnant = Number(row.stagnation_count || 0) >= STAGNANT_AFTER;
  const state = _stateFor(attention, hasEvents, stagnant);
  const upd = db.prepare(`UPDATE kernel_state SET state = ?, attention = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'kernel'`);
  upd.run([state, attention]);
  upd.free();
  store._persist();
  return { state, attention, factors: att.factors };
}

async function recordCycleResult(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('consciousness-kernel 需要 store 注入（SPEC-3.1 契约）');
  const db = store._getDb();
  const row = _ensureRow(db);
  const actions = opts.actions && typeof opts.actions === 'object' ? opts.actions : {};
  const produced = Object.values(actions).reduce((n, v) => n + (Number(v) || 0), 0) > 0;
  const prev = Number(row.stagnation_count || 0);
  const next = produced ? 0 : prev + 1;

  let breaker = null;
  try { breaker = row.breaker_json ? JSON.parse(row.breaker_json) : null; } catch (_) { breaker = null; }
  if (!produced && next >= STAGNANT_AFTER) {
    breaker = { at: new Date().toISOString(), cycleId: opts.cycleId || null, cycles: next };
  }
  const state = produced ? 'idle' : (next >= STAGNANT_AFTER ? 'stagnant' : (row.state === 'stagnant' ? 'sensing' : row.state || 'idle'));

  // 唯一写者：本语句是全仓唯一改 stagnation_count 的地方
  const upd = db.prepare(`UPDATE kernel_state SET state = ?, stagnation_count = ?, breaker_json = ?, last_cycle_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'kernel'`);
  upd.run([state, next, breaker ? JSON.stringify(breaker) : null, opts.cycleId || null]);
  upd.free();
  store._persist();
  return { stagnationCount: next, state, breaker, produced };
}

function kernelStatus(store) {
  if (!store || typeof store._getDb !== 'function') throw new Error('consciousness-kernel 需要 store 注入（SPEC-3.1 契约）');
  const db = store._getDb();
  const row = _scalar(db, `SELECT * FROM kernel_state WHERE id = 'kernel'`);
  if (!row) return { id: 'kernel', state: 'idle', attention: 0, stagnation_count: 0, breaker: null };
  let breaker = null;
  try { breaker = row.breaker_json ? JSON.parse(row.breaker_json) : null; } catch (_) { breaker = null; }
  return { ...row, breaker };
}

module.exports = { STATES, STAGNANT_AFTER, computeAttention, observe, recordCycleResult, kernelStatus };
