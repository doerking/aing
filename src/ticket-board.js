'use strict';
// aing-v2 ticket-board.js —— M6 任务 6.16 实现（SPEC-6.16 回单外接屏 · L4）
// 只读展示件：读 opt_tickets + entities，产出一张可印的回单屏（sections + lines）。
// 铁律：store 由调用方注入（arch-lint 守）；只 SELECT；不碰 last_access；不投事件；
//   回单节只显事实与指针，结论与全文一律不入屏（膜透性口径的展示面延续）。
// 口径来处：STATUS.md §七 D17 收尾段「得回单后上外接屏显示」。

const SECTIONS = [
  { key: 'pending', label: '待回单' },
  { key: 'blocked', label: '闸拒/改派' },
  { key: 'verified', label: '已收单' }
];

const NO_BEAT = '无心跳';
const NO_PROGRESS = '无进展';
const F = require('./ticket-followup.js');

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _parse(json) {
  if (json && typeof json === 'object') return { ...json };
  try { const o = JSON.parse(json == null ? '{}' : json); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; }
}

function _num(v) { return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v); }
function _fa(v) { return v == null ? '—' : (Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 100) / 100) : String(v)); }

function _display(r) {
  const t = r.title == null ? '' : String(r.title).trim();
  if (t) return t;
  const n = r.name == null ? '' : String(r.name).trim();
  return n || String(r.entity_id || r.id || '');
}

/** 单行：待回单（含心跳与失效分类，SPEC-6.23） */
function _pendingRow(r, ev, round) {
  const f = (ev.followup && typeof ev.followup === 'object') ? ev.followup : {};
  const beats = _num(f.beats);
  const beatAt = f.beatAt == null ? null : String(f.beatAt);
  let kind = 'ok', note = '', roundsSince = null, sameStage = null;
  if (!beatAt) { kind = 'no-beat'; note = NO_BEAT; }
  else {
    const verdict = F.isStale(ev, { round });
    if (verdict.stale) { kind = 'no-beat'; note = NO_BEAT; roundsSince = verdict.roundsSince; }
    else {
      sameStage = _num(f.sameStage);
      if (sameStage != null && sameStage >= F.SAME_STAGE_LIMIT) { kind = 'no-progress'; note = NO_PROGRESS; }
    }
  }
  return {
    id: String(r.id), entity: _display(r), dim: r.dim == null ? null : String(r.dim),
    beatAt, beats, kind, note, roundsSince, sameStage
  };
}

/** 单行：闸拒 / 改派 / 其他失败 */
function _blockedRow(r, ev) {
  const gate = ev.gate && typeof ev.gate === 'object' ? ev.gate : null;
  const reason = ev.reason == null ? null : String(ev.reason);
  let kind = 'failed';
  if (gate && gate.stage) kind = 'gate';
  else if (reason === 'escalate-deep-work') kind = 'escalate';
  return {
    id: String(r.id), entity: _display(r), dim: r.dim == null ? null : String(r.dim),
    kind,
    stage: gate && gate.stage ? String(gate.stage) : null,
    reasons: gate && Array.isArray(gate.reasons) ? gate.reasons.map(String) : [],
    reason
  };
}

/** 单行：已收单（只取事实与指针，结论/全文不入屏） */
function _verifiedRow(r, ev) {
  const res = ev.result && typeof ev.result === 'object' ? ev.result : {};
  return {
    id: String(r.id), entity: _display(r), dim: r.dim == null ? null : String(r.dim),
    before: _num(ev.before == null ? ev.score : ev.before),
    after: _num(ev.after),
    facts: Array.isArray(res.facts) ? res.facts.map(String) : [],
    pointers: Array.isArray(res.pointers) ? res.pointers.map(String) : (Array.isArray(res.evidence) ? res.evidence.map(String) : [])
  };
}

function _lines(summary, sections) {
  const head = `【回单屏】共 ${summary.total} 单 · 待回单 ${summary.pending} · 闸拒/改派 ${summary.blocked} · 已收单 ${summary.verified}`;
  if (summary.total === 0) return [`【回单屏】暂无回单（0 单）`];
  const out = [head];
  // 不进三节的状态（proposed / graduated 等）明说，不静默吞掉
  if (summary.other > 0) out.push(`· 其他状态 ${summary.other} 单（未派或已结业，未进屏）`);
  for (const s of sections) {
    if (!s.rows.length) continue;
    out.push(`▌${s.label}（${s.rows.length}）`);
    for (const r of s.rows) {
      if (s.key === 'pending') {
        if (r.kind === 'no-beat') {
          out.push(`  · ${r.entity} · ${r.dim || '—'} · ⚠ 无心跳${r.roundsSince != null ? '（' + r.roundsSince + ' 轮未拍）' : ''}`);
        } else if (r.kind === 'no-progress') {
          out.push(`  · ${r.entity} · ${r.dim || '—'} · ⏳ 无进展（同阶段 ${r.sameStage} 拍）`);
        } else {
          out.push(`  · ${r.entity} · ${r.dim || '—'} · 心跳 ${r.beatAt}（${r.beats} 拍）`);
        }
      } else if (s.key === 'blocked') {
        if (r.kind === 'gate') out.push(`  ✗ ${r.entity} · 内容闸 ${r.stage} · ${r.reasons.join('+') || '未列原因'}`);
        else if (r.kind === 'escalate') out.push(`  ⇗ ${r.entity} · 交深工（连试 ≥2 未见改善）`);
        else out.push(`  ✗ ${r.entity} · ${r.reason || '未列原因'}`);
      } else {
        out.push(`  ✓ ${r.entity} · ${r.dim || '—'} ${_fa(r.before)}→${_fa(r.after)}${r.facts.length ? ' · ' + r.facts[0] : ''}`);
      }
    }
  }
  return out;
}

function boardOf(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('boardOf 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const limit = opts.limit == null ? null : Math.max(0, Number(opts.limit));
  // SPEC-6.23：判死轮次；缺省取系统轮次（meko_cycles 行数），调用方可覆盖
  const round = Number.isFinite(Number(opts.round)) ? Number(opts.round)
    : Number((_rows(db, 'SELECT COUNT(*) AS n FROM meko_cycles')[0] || {}).n || 0);

  const rows = _rows(db, `
    SELECT t.id, t.entity_id, t.dim, t.status, t.evidence_json, t.updated_at,
           e.title, e.name
      FROM opt_tickets t
      LEFT JOIN entities e ON e.id = t.entity_id
     ORDER BY t.updated_at, t.id`);

  const buckets = { pending: [], blocked: [], verified: [] };
  for (const r of rows) {
    const ev = _parse(r.evidence_json);
    if (r.status === 'dispatched') buckets.pending.push(_pendingRow(r, ev, round));
    else if (r.status === 'rejected') buckets.blocked.push(_blockedRow(r, ev));
    else if (r.status === 'verified') buckets.verified.push(_verifiedRow(r, ev));
  }
  if (limit != null) for (const k of Object.keys(buckets)) buckets[k] = buckets[k].slice(0, limit);

  const sections = SECTIONS.map(s => ({ ...s, rows: buckets[s.key] }));
  const shown = buckets.pending.length + buckets.blocked.length + buckets.verified.length;
  const summary = {
    total: rows.length,
    pending: buckets.pending.length,
    blocked: buckets.blocked.length,
    escalated: buckets.blocked.filter(r => r.kind === 'escalate').length,
    noBeat: buckets.pending.filter(r => r.kind === 'no-beat').length,
    noProgress: buckets.pending.filter(r => r.kind === 'no-progress').length,
    verified: buckets.verified.length,
    other: Math.max(0, rows.length - shown)
  };
  return { summary, sections, lines: _lines(summary, sections) };
}

module.exports = { SECTIONS, NO_BEAT, NO_PROGRESS, boardOf };
