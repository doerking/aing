'use strict';
// aing-v2 ticket-gate.js —— M6 任务 6.14 实现（SPEC-6.14 回单内容闸 · L4 基础件）
// 三道硬闸：膜透性（内容能过什么）→ 落盘粒度（够不够厚）→ 发布门（够不够格）。
// 纯函数：不碰 store、不做 I/O、不改任何实体。调用方自己决定怎么用。
// 口径来处：docs/M6-SWARM33-三层流层归位-2026-11-18.md（留档 58 条中的 L4 面）。

const MEMBRANE_LEVELS = ['open', 'semi', 'closed'];
const SOURCE_GRADES = ['high', 'medium', 'low'];

function _arr(x) { return Array.isArray(x) ? x.filter((v) => v != null && String(v).trim() !== '') : []; }
function _str(x) { return x == null ? '' : String(x).trim(); }

// ── 膜透性三档 ─────────────────────────────────────────────────────
// open   ：只给落点摘要，结论与全文一律不带出
// semi   ：只过事实 + 证据指针（结论/全文/落点全丢）
// closed ：零交换
function membrane(level, payload = {}) {
  if (!MEMBRANE_LEVELS.includes(level)) throw new Error('unknown-membrane: ' + level);
  const p = payload || {};
  if (level === 'closed') return {};
  if (level === 'semi') {
    const facts = _arr(p.facts);
    const pointers = _arr(p.pointers).length ? _arr(p.pointers) : _arr(p.evidence);
    if (!facts.length && !pointers.length) return {};
    return { facts, pointers };
  }
  const out = {};
  if (_str(p.landing)) out.landing = String(p.landing);
  return out;
}

// ── 发布门：五条硬拦，原因码收全 ─────────────────────────────────
function publishGate(record = {}) {
  const r = record || {};
  const reasons = [];
  if (!_arr(r.facts).length) reasons.push('no-facts');
  const evidence = _arr(r.evidence).length ? _arr(r.evidence) : _arr(r.pointers);
  if (!evidence.length) reasons.push('no-evidence');
  const grade = _str(r.sourceGrade);
  if (!SOURCE_GRADES.includes(grade)) reasons.push('no-source-grade');
  if (!_str(r.selfAssessment)) reasons.push('no-self-assessment');
  if (grade === 'low') reasons.push('weak-evidence');
  return { ok: reasons.length === 0, reasons };
}

// ── 落盘粒度：事实与证据指针缺一不可 ─────────────────────────────
function landingGate(record = {}) {
  const r = record || {};
  const hasFacts = _arr(r.facts).length > 0;
  const hasPointers = _arr(r.pointers).length > 0 || _arr(r.evidence).length > 0;
  if (!hasFacts || !hasPointers) return { ok: false, reason: 'thin-payload' };
  return { ok: true };
}

// ── 组合闸：膜 → 粒度 → 发布门，分阶段回报 ───────────────────────
function admit(record = {}, opts = {}) {
  const level = opts.membrane || 'semi';
  const passed = membrane(level, record);
  if (level !== 'open' && Object.keys(passed).length === 0) {
    return { admitted: false, stage: 'membrane', reasons: ['membrane-blocked'], payload: {} };
  }
  const land = landingGate({ ...(record || {}), ...passed });
  if (!land.ok) return { admitted: false, stage: 'landing', reasons: [land.reason], payload: passed };
  const pub = publishGate(record);
  if (!pub.ok) return { admitted: false, stage: 'publish', reasons: pub.reasons, payload: passed };
  return { admitted: true, stage: 'publish', reasons: [], payload: passed };
}

module.exports = { MEMBRANE_LEVELS, SOURCE_GRADES, membrane, publishGate, landingGate, admit };
