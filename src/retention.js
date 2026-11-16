'use strict';
// aing-v2 retention.js —— M6 任务 6.11（SPEC-6.11 分层留存）
// 只读规划：分层、判据、候选清单。不删任何行、不写表——删除归 tools/archive.js 且须过归档校验。
// 判据四件全中才候选：到窗 + 无访问 + 无证据 + 可还原（短料）/可重建（知识层）。
// KESPI 不参与留存判据：实测饱和（均值 0.847、sd 0.075、六维近常数），当证据等于永不删。

const TIER = { origin: 'origin', short: 'short', knowledge: 'knowledge' };
const MODES = ['desktop', 'mobile-retire'];
const TYPE_TIER = {
  Conversation: 'short',
  Todo: 'short',
  Concept: 'knowledge',
  Paper: 'knowledge',
  MetaKnowledge: 'knowledge',
  Insight: 'knowledge'
};
const ORIGIN_TYPES = ['RawDocument', 'Origin'];
const STRONG_EDGE = 5;
const DEFAULT_WINDOW_DAYS = 30;
const MOBILE_WINDOW_DAYS = 7; // SPEC-6.11 §六：手机端只挂更短热窗
const DEFAULT_MAX_HOT = 30000;

function tierOf(e) {
  if (!e) return 'knowledge';
  const id = String(e.id || '');
  if (id.startsWith('raw-') || ORIGIN_TYPES.includes(e.type)) return 'origin';
  return TYPE_TIER[e.type] || 'knowledge';
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _days(now, ts) {
  if (!ts) return null;
  const t = Date.parse(String(ts).replace(' ', 'T') + (String(ts).includes('Z') || String(ts).includes('T') ? '' : 'Z'));
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 86400000;
}

/** 只读规划：返回分层计数、超限数、候选与逐条跳过理由 */
function planRetention(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('retention 需要 store 注入（SPEC-6.11 契约）');
  const db = store._getDb();
  const mode = MODES.includes(opts.mode) ? opts.mode : 'desktop';
  const defaultWindow = mode === 'mobile-retire' ? MOBILE_WINDOW_DAYS : DEFAULT_WINDOW_DAYS;
  const windowDays = Number.isFinite(opts.windowDays) ? Number(opts.windowDays) : defaultWindow;
  const maxHot = Number.isFinite(opts.maxHot) ? Number(opts.maxHot) : DEFAULT_MAX_HOT;
  const now = opts.now ? new Date(opts.now) : new Date();

  const ents = _rows(db,
    `SELECT id, type, name, status, tolaria_strength, last_access, created_at, updated_at, invalid_at
     FROM entities WHERE invalid_at IS NULL`);
  const strong = new Set(_rows(db,
    `SELECT source_id AS id FROM links WHERE invalid_at IS NULL AND strength >= ?
     UNION SELECT target_id AS id FROM links WHERE invalid_at IS NULL AND strength >= ?`,
    [STRONG_EDGE, STRONG_EDGE]).map(r => r.id));
  const lastHit = new Map(_rows(db,
    `SELECT entity_id AS id, MAX(hit_at) AS at FROM access_hits GROUP BY entity_id`).map(r => [r.id, r.at]));
  const twinOf = (id) => id.startsWith('wiki-') ? 'raw-' + id.slice(5) : 'wiki-' + id.replace(/^raw-/, '');

  const counts = { total: ents.length, origin: 0, short: 0, knowledge: 0 };
  const shortList = [];
  for (const e of ents) {
    const tier = tierOf(e);
    counts[tier]++;
    const hitDays = _days(now, lastHit.get(e.id));
    const accDays = _days(now, e.last_access);
    const accessDays = [hitDays, accDays].filter(v => v != null).sort((a, b) => a - b)[0];
    const ageDays = _days(now, e.updated_at || e.created_at);
    shortList.push({
      id: e.id, type: e.type, name: e.name, tier,
      ageDays: ageDays == null ? null : Math.round(ageDays * 10) / 10,
      accessDays: accessDays == null ? null : Math.round(accessDays * 10) / 10,
      hasStrongEdge: strong.has(e.id),
      hasRawTwin: tier === 'knowledge' ? !!(twinOf(e.id) && _rows(db, 'SELECT 1 AS x FROM entities WHERE id = ?', [twinOf(e.id)]).length) : false
    });
  }

  const candidates = [];
  const skipped = { origin: 0, knowledge: 0, inWindow: 0, accessed: 0, evidenced: 0 };
  for (const r of shortList) {
    if (r.tier === 'origin') { skipped.origin++; continue; }
    if (r.tier === 'knowledge') { skipped.knowledge++; continue; }
    const inWindow = r.ageDays == null || r.ageDays < windowDays;
    if (inWindow) { skipped.inWindow++; continue; }
    const accessed = r.accessDays != null && r.accessDays < windowDays;
    if (accessed) { skipped.accessed++; continue; }
    if (r.hasStrongEdge) { skipped.evidenced++; continue; }
    candidates.push({
      id: r.id, type: r.type, name: r.name, tier: r.tier,
      ageDays: r.ageDays,
      reasons: ['window', 'no-access', 'no-evidence'],
      // 短料无原稿：删前靠归档还原（round-trip 校验）；知识层才谈「从原稿重建」
      restorePath: 'archive'
    });
  }
  candidates.sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0) || String(a.id).localeCompare(String(b.id)));

  const horizon = Math.max(windowDays, opts.capHorizonDays || windowDays);
  return {
    mode,
    windowDays,
    maxHot,
    now: now.toISOString(),
    counts,
    overCap: Math.max(0, counts.short - maxHot),
    horizon,
    candidates,
    skipped,
    applyAllowed: mode === 'desktop'
  };
}

module.exports = {
  TIER, MODES, TYPE_TIER, ORIGIN_TYPES, STRONG_EDGE, DEFAULT_WINDOW_DAYS, MOBILE_WINDOW_DAYS, DEFAULT_MAX_HOT,
  tierOf, planRetention
};
