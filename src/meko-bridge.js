'use strict';
// aing-v2 meko-bridge.js —— M6 任务 6.50 实现（SPEC-6.50，D20/D17 推定读法）
// 三条铁律：①单向（aing→memo 只发差量信号，meko→memo 只交回单）②核单后入视野
// ③失败可见（超时计入 stalePending）。summarize 纯读，不写库。
// 组件不直连 knowledge-store：store 由调用方注入（arch-lint C5）。

const crypto = require('crypto');

const STALE_HOURS = 24;
const OWN_LAYER = 'consciousness';
const WATERMARK_KEY = 'bridge.watermark';

const LAYER_OF_HEAD = {
  'head-parasite-hook': 'consciousness',
  'head-feedback-loop': 'consciousness',
  'head-passive-trainer': 'growth',
  'head-insight-extractor': 'growth',
  'head-eval-retrieval': 'routing',
  'head-gap-detector': 'routing'
};

/** headId → 层（注册表优先，其次按名字关键词推断，兜底 dormant） */
function layerOf(headId) {
  const id = String(headId || '');
  if (LAYER_OF_HEAD[id]) return LAYER_OF_HEAD[id];
  if (/feedback|panel|state|conscious/i.test(id)) return 'consciousness';
  if (/gap|eval|retriev|rout|link/i.test(id)) return 'routing';
  if (/insight|reflect|growth/i.test(id)) return 'growth';
  if (/distill|compile|meta|prune/i.test(id)) return 'metabolism';
  if (/ingest|session/i.test(id)) return 'ingest';
  if (/kespi/i.test(id)) return 'kespi';
  return 'dormant';
}

/** 信号指纹：同信号同指纹，换 target/轮次即变（幂等派单的键） */
function fingerprint(sig) {
  const s = sig || {};
  const raw = [s.face || '', s.code || '', s.target || '', s.round == null ? '' : s.round].join('\u0000');
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

/** 回单指纹：同 headId + 同 returnedAt + 同摘要 = 同一张回单 */
function returnFingerprint(ret) {
  const r = ret || {};
  const payload = r.payload || {};
  const summary = String(payload.summary || payload.note || payload.title || '');
  const raw = [r.headId || '', r.returnedAt || '', summary].join('\u0000');
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function _need(store, name) {
  if (!store || typeof store._getDb !== 'function') throw new Error(`${name} 需要 store 注入（SPEC-6.50 契约）`);
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _cfgGet(db, key) {
  const r = _rows(db, 'SELECT value_json FROM config WHERE key = ?', [key]);
  if (!r.length) return null;
  try { return JSON.parse(r[0].value_json || 'null'); } catch (_) { return null; }
}

function _cfgPut(db, key, value) {
  db.run('INSERT OR REPLACE INTO config (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [key, JSON.stringify(value)]);
}

/**
 * 发差量信号（写面）：指纹幂等 + 水位续发。
 * @param {Array<{face,code,target,round?,note?}>} signals
 * @returns {{sent:number, skipped:number, duplicateFps:string[]}}
 */
function publishSignals(store, signals) {
  _need(store, 'meko-bridge');
  const db = store._getDb();
  const wm = _cfgGet(db, WATERMARK_KEY) || { sent: {} };
  if (!wm.sent || typeof wm.sent !== 'object') wm.sent = {};
  const duplicateFps = [];
  let sent = 0;
  for (const sig of (signals || [])) {
    const fp = fingerprint(sig);
    if (wm.sent[fp]) { duplicateFps.push(fp); continue; }
    const at = new Date().toISOString();
    db.run('INSERT OR IGNORE INTO bridge_signals (fp, face, code, target, round, note, sent_at) VALUES (?,?,?,?,?,?,?)',
      [fp, sig.face || null, sig.code || null, sig.target || null, sig.round == null ? null : String(sig.round), sig.note || null, at]);
    wm.sent[fp] = at;
    sent++;
  }
  if (sent) { wm.updatedAt = new Date().toISOString(); _cfgPut(db, WATERMARK_KEY, wm); store._persist(); }
  return { sent, skipped: duplicateFps.length, duplicateFps };
}

/**
 * 交回单（写面，meko 侧唯一入口）：落 pending-verify；同指纹重复提交不重复入库。
 * @returns {{ok:boolean, fp:string, status:string, duplicate?:boolean}}
 */
function submitReturn(store, ret) {
  _need(store, 'meko-bridge');
  const db = store._getDb();
  const fp = returnFingerprint(ret);
  const exists = _rows(db, 'SELECT fp FROM bridge_returns WHERE fp = ?', [fp]);
  if (exists.length) return { ok: true, fp, status: 'pending-verify', duplicate: true };
  const payload = ret.payload || {};
  const summary = String(payload.summary || payload.note || payload.title || '').slice(0, 60);
  const headId = String(ret.headId || '');
  const layer = ret.layer || layerOf(headId);
  const returnedAt = ret.returnedAt || new Date().toISOString();
  db.run('INSERT INTO bridge_returns (fp, head_id, layer, status, payload_json, summary, returned_at) VALUES (?,?,?,?,?,?,?)',
    [fp, headId, layer, 'pending-verify', JSON.stringify(payload), summary, returnedAt]);
  store._persist();
  return { ok: true, fp, status: 'pending-verify', layer };
}

/**
 * 核单（物业动作）：pending-verify → verified / rejected。
 * @returns {{ok:boolean, status?:string, reason?:string}}
 */
function verifyReturn(store, fp, opts = {}) {
  _need(store, 'meko-bridge');
  const db = store._getDb();
  const r = _rows(db, 'SELECT fp FROM bridge_returns WHERE fp = ?', [fp]);
  if (!r.length) return { ok: false, reason: 'not-found' };
  const ok = opts.ok !== false;
  const status = ok ? 'verified' : 'rejected';
  db.run('UPDATE bridge_returns SET status = ?, verified_at = CURRENT_TIMESTAMP, verify_note = ? WHERE fp = ?',
    [status, opts.note || null, fp]);
  store._persist();
  return { ok: true, status };
}

/**
 * 摘要（纯读）：待核只给计数，核过才进 verified。
 * @returns {{verified:object[], rejected:number, pending:number, stalePending:number,
 *            staleHours:number, lastReturnAt:string|null, layers:object, own:object}}
 */
function summarize(store, opts = {}) {
  _need(store, 'meko-bridge');
  const db = store._getDb();
  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  const staleHours = Number.isFinite(Number(opts.staleHours)) ? Number(opts.staleHours) : STALE_HOURS;
  const ownLayer = opts.ownLayer || OWN_LAYER;

  const rows = _rows(db, 'SELECT * FROM bridge_returns');
  const verified = [];
  const layers = {};
  const bucket = (l) => (layers[l] = layers[l] || { verified: [], rejected: 0, pending: 0, stalePending: 0 });
  let rejected = 0, pending = 0, stalePending = 0, oldestPendingMs = null, lastReturnAt = null;

  for (const r of rows) {
    const ts = r.returned_at || null;
    const layer = r.layer || layerOf(r.head_id);
    const b = bucket(layer);
    if (ts && (!lastReturnAt || ts > lastReturnAt)) lastReturnAt = ts;
    if (r.status === 'verified') {
      const item = { headId: r.head_id, layer, returnedAt: ts, summary: String(r.summary || '').slice(0, 60) };
      verified.push(item);
      b.verified.push(item);
    } else if (r.status === 'rejected') {
      rejected++; b.rejected++;
    } else {
      pending++; b.pending++;
      const age = ts ? now - Date.parse(ts) : null;
      if (age != null && age > staleHours * 3600 * 1000) {
        stalePending++; b.stalePending++;
        if (oldestPendingMs == null || age > oldestPendingMs) oldestPendingMs = age;
      }
    }
  }
  verified.sort((a, b) => String(b.returnedAt).localeCompare(String(a.returnedAt)));
  return {
    verified, rejected, pending, stalePending,
    staleHours: oldestPendingMs == null ? 0 : Math.round(oldestPendingMs / 3600 / 1000),
    lastReturnAt,
    ownLayer,
    layers,
    own: layers[ownLayer] || { verified: [], rejected: 0, pending: 0, stalePending: 0 }
  };
}

/** 已发信号（只读，给排障用） */
function listSignals(store, limit = 50) {
  _need(store, 'meko-bridge');
  const db = store._getDb();
  return _rows(db, 'SELECT * FROM bridge_signals ORDER BY sent_at DESC LIMIT ?', [Number(limit) || 50]);
}

module.exports = {
  publishSignals, submitReturn, verifyReturn, summarize, listSignals,
  fingerprint, returnFingerprint, layerOf, STALE_HOURS, OWN_LAYER, WATERMARK_KEY
};
