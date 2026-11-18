'use strict';
// aing-v2 ticket-followup.js —— M6 任务 6.15 实现（SPEC-6.15 跟单三律 · L3）
// 律一 追单不补位 / 律二 失败≥2 改派 / 律三 心跳保活。
// 纯函数面：heartbeatOf / isStale（无 I/O、同输入同输出）；staleTickets 需 store 注入。
// 口径来处：docs/M6-SWARM33-三层流层归位-2026-11-18.md（org §4 三条，留档）。

const CHASE_REASON = 'awaiting-return';
const ESCALATE_REASON = 'escalate-deep-work';
const DEFAULT_MAX_HOURS = 48;

function _parse(ev) {
  if (ev && typeof ev === 'object') return { ...ev };
  try {
    const o = JSON.parse(ev == null ? '{}' : ev);
    return o && typeof o === 'object' ? o : {};
  } catch (_) { return {}; }
}

// ── 律三 心跳：每轮 +1，beatAt 记时刻 ────────────────────────────
function heartbeatOf(evidenceJson, opts = {}) {
  const ev = _parse(evidenceJson);
  const prev = ev.followup && typeof ev.followup === 'object' ? ev.followup : {};
  const at = opts.at || new Date(opts.now || Date.now()).toISOString();
  return { ...ev, followup: { beatAt: at, beats: Number(prev.beats || 0) + 1 } };
}

// ── 律三 判死：心跳缺失或超时 → 跟单已断 ─────────────────────────
function isStale(evidenceJson, opts = {}) {
  const ev = _parse(evidenceJson);
  const f = ev.followup && typeof ev.followup === 'object' ? ev.followup : {};
  if (!f.beatAt) return true;
  const t = new Date(f.beatAt).getTime();
  if (!Number.isFinite(t)) return true;
  const now = opts.now == null ? Date.now() : new Date(opts.now).getTime();
  const maxHours = opts.maxHours == null ? DEFAULT_MAX_HOURS : Number(opts.maxHours);
  return (now - t) > maxHours * 3600 * 1000;
}

// ── 扫出跟单已断的 dispatched 单（唯一可信信号）──────────────────
function staleTickets(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('staleTickets 需要 store 注入');
  const db = store._getDb();
  const stmt = db.prepare("SELECT id, entity_id, evidence_json FROM opt_tickets WHERE status = 'dispatched'");
  const out = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    if (isStale(r.evidence_json, opts)) {
      let beatAt = null;
      try { const ev = _parse(r.evidence_json); beatAt = ev.followup ? ev.followup.beatAt : null; } catch (_) {}
      out.push({ id: r.id, entity_id: r.entity_id, beatAt });
    }
  }
  stmt.free();
  return out;
}

module.exports = { CHASE_REASON, ESCALATE_REASON, DEFAULT_MAX_HOURS, heartbeatOf, isStale, staleTickets };
