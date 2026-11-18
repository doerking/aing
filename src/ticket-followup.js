'use strict';
// aing-v2 ticket-followup.js —— M6 任务 6.15 实现（SPEC-6.15 跟单三律 · L3）
// 律一 追单不补位 / 律二 失败≥2 改派 / 律三 心跳保活。
// 纯函数面：heartbeatOf / isStale（无 I/O、同输入同输出）；staleTickets 需 store 注入。
// SPEC-6.22：判死改用系统轮次拍（空闲库不再被墙钟误判），并区分两种失效：
//   no-beat    = 若干轮没有心跳（进程/会话没了）→ 重派
//   no-progress= 拍在走但阶段签名不变（在跑不推进）→ 换件或升级
// 口径来处：docs/M6-SWARM33-三层流层归位-2026-11-18.md（org §4 三条，留档）。

const CHASE_REASON = 'awaiting-return';
const ESCALATE_REASON = 'escalate-deep-work';
const NO_BEAT = 'no-beat';
const NO_PROGRESS = 'no-progress';
const DEFAULT_MAX_HOURS = 48;   // 无轮次信息时的墙钟回退（旧口径，保留）
const DEFAULT_MAX_ROUNDS = 2;   // 连续 N 轮无心跳即判死
const SAME_STAGE_LIMIT = 3;     // 连续 N 轮同阶段签名即判「在跑不推进」

function _parse(ev) {
  if (ev && typeof ev === 'object') return { ...ev };
  try {
    const o = JSON.parse(ev == null ? '{}' : ev);
    return o && typeof o === 'object' ? o : {};
  } catch (_) { return {}; }
}

// ── 律三 心跳：每轮 +1，记时刻；有轮次与阶段时一并记下（SPEC-6.22）───
function heartbeatOf(evidenceJson, opts = {}) {
  const ev = _parse(evidenceJson);
  const prev = ev.followup && typeof ev.followup === 'object' ? ev.followup : {};
  const at = opts.at || new Date(opts.now || Date.now()).toISOString();
  const round = Number.isFinite(Number(opts.round)) ? Number(opts.round) : null;
  const stage = opts.stage == null ? null : String(opts.stage);
  const same = (stage != null && prev.stageSig != null && stage === String(prev.stageSig))
    ? Number(prev.sameStage || 0) + 1 : 0;
  const followup = { beatAt: at, beats: Number(prev.beats || 0) + 1 };
  if (round != null) followup.beatRound = round;
  else if (Number.isFinite(Number(prev.beatRound))) followup.beatRound = Number(prev.beatRound);
  if (stage != null) { followup.stageSig = stage; followup.sameStage = same; }
  else if (prev.stageSig != null) {
    followup.stageSig = prev.stageSig;
    followup.sameStage = Number(prev.sameStage || 0);
  }
  return { ...ev, followup };
}

// ── 律三 判死：有轮次用轮次拍，没有才回退墙钟（并标明 clock）────────
function isStale(evidenceJson, opts = {}) {
  const ev = _parse(evidenceJson);
  const f = ev.followup && typeof ev.followup === 'object' ? ev.followup : {};
  if (!f.beatAt) return { stale: true, kind: NO_BEAT, clock: 'none', roundsSince: null };

  const round = Number.isFinite(Number(opts.round)) ? Number(opts.round) : null;
  const beatRound = Number.isFinite(Number(f.beatRound)) ? Number(f.beatRound) : null;
  if (round != null && beatRound != null) {
    const maxRounds = opts.maxRounds == null ? DEFAULT_MAX_ROUNDS : Number(opts.maxRounds);
    const since = round - beatRound;
    return { stale: since > maxRounds, kind: NO_BEAT, clock: 'round', roundsSince: since };
  }

  const t = new Date(f.beatAt).getTime();
  if (!Number.isFinite(t)) return { stale: true, kind: NO_BEAT, clock: 'wall', roundsSince: null };
  const now = opts.now == null ? Date.now() : new Date(opts.now).getTime();
  const maxHours = opts.maxHours == null ? DEFAULT_MAX_HOURS : Number(opts.maxHours);
  return { stale: (now - t) > maxHours * 3600 * 1000, kind: NO_BEAT, clock: 'wall', roundsSince: null };
}

// ── 扫出跟单已断的单（唯一可信信号）：两种失效分开报 ───────────────
function staleTickets(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('staleTickets 需要 store 注入');
  const db = store._getDb();
  const round = Number.isFinite(Number(opts.round)) ? Number(opts.round)
    : Number((() => {
      const s = db.prepare('SELECT COUNT(*) AS n FROM meko_cycles');
      s.step(); const r = s.getAsObject(); s.free(); return r;
    })().n || 0);
  const stmt = db.prepare("SELECT id, entity_id, evidence_json FROM opt_tickets WHERE status = 'dispatched'");
  const out = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    const ev = _parse(r.evidence_json);
    const f = ev.followup && typeof ev.followup === 'object' ? ev.followup : {};
    const verdict = isStale(ev, { ...opts, round });
    if (verdict.stale) {
      out.push({ id: r.id, entity_id: r.entity_id, kind: NO_BEAT, clock: verdict.clock,
        beatAt: f.beatAt || null, roundsSince: verdict.roundsSince });
      continue;
    }
    const sameStage = Number(f.sameStage || 0);
    if (sameStage >= SAME_STAGE_LIMIT) {
      out.push({ id: r.id, entity_id: r.entity_id, kind: NO_PROGRESS, clock: 'round',
        beatAt: f.beatAt || null, sameStage, stageSig: f.stageSig || null });
    }
  }
  stmt.free();
  return out;
}

module.exports = {
  CHASE_REASON, ESCALATE_REASON, NO_BEAT, NO_PROGRESS,
  DEFAULT_MAX_HOURS, DEFAULT_MAX_ROUNDS, SAME_STAGE_LIMIT,
  heartbeatOf, isStale, staleTickets
};
