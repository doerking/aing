'use strict';
// aing-v2 control-plane.js —— M3 任务 3.2 实现（SPEC-3.2 控制面四路由）
// event / inhibit / status / verify 四动作只此一份；CLI 与 HTTP 都转发到 runAction。
// inhibit 唯一清除路径 = 到期，唔提供撤销口；status/verify 纯读。
// 铁律：唔碰 last_access；无物理 DELETE。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const { assertActor } = require('./api-gate.js');
const { getKnob } = require('./config-runtime.js');
const { kernelStatus, computeAttention } = require('./consciousness-kernel.js');
const { hasPassingGate } = require('./omni-gate.js');

const ACTIONS = ['event', 'inhibit', 'status', 'verify'];
const INHIBIT_PREFIX = 'kernel.inhibit:';
const HOUR_MS = 3600 * 1000;

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

function _requireStore(store) {
  if (!store || typeof store._getDb !== 'function') throw new Error('control-plane 需要 store 注入（SPEC-3.2 契约）');
}

function _now(opts) {
  return opts && Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
}

/** 读一个抑制记录（唔判活）；无则 null */
function _inhibition(store, target) {
  const row = _scalar(store._getDb(), 'SELECT value_json FROM config WHERE key = ?', [INHIBIT_PREFIX + target]);
  if (!row || row.value_json == null) return null;
  try { return JSON.parse(row.value_json); } catch (_) { return null; }
}

function isInhibited(store, target, now) {
  _requireStore(store);
  const rec = _inhibition(store, target);
  if (!rec) return false;
  return Number(now == null ? Date.now() : now) < Number(rec.until);
}

async function _event(store, args = {}) {
  assertActor(args.source);
  const type = String(args.type || '').trim();
  if (!type) throw new Error('event-type-required');
  const db = store._getDb();
  const payload = args.payload === undefined ? null : JSON.stringify(args.payload);
  const stmt = db.prepare('INSERT INTO events (source, type, target, payload_json, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
  stmt.run([args.source, type, args.target == null ? null : String(args.target), payload]);
  stmt.free();
  const id = Number(_scalar(db, 'SELECT last_insert_rowid() AS id').id);
  store._persist();
  const row = _scalar(db, 'SELECT created_at FROM events WHERE id = ?', [id]);
  return { accepted: true, id, at: row ? row.created_at : null };
}

async function _inhibit(store, args = {}, opts = {}) {
  const target = String(args.target || '').trim();
  if (!target) throw new Error('target-required');
  const hours = args.hours == null || args.hours === '' ? Number(getKnob(store, 'kernel.inhibitHours')) : Number(args.hours);
  if (!Number.isFinite(hours) || hours <= 0) throw new Error(`invalid-hours: ${args.hours}`);
  const now = _now(opts);
  const existing = _inhibition(store, target);
  const rec = {
    target,
    reason: args.reason == null ? 'manual' : String(args.reason),
    until: now + hours * HOUR_MS,
    created_at: new Date(now).toISOString()
  };
  const db = store._getDb();
  const stmt = db.prepare(
    `INSERT INTO config (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
  );
  stmt.run([INHIBIT_PREFIX + target, JSON.stringify(rec)]);
  stmt.free();
  store._persist();
  return { target, reason: rec.reason, previousUntil: existing ? existing.until : null, until: rec.until, isInhibited: true };
}

async function _status(store, args = {}, opts = {}) {
  const now = _now(opts);
  const db = store._getDb();
  const stored = kernelStatus(store);
  const kernel = {
    state: stored.state || 'idle',
    attention: stored.attention == null ? 0 : stored.attention,
    stagnation_count: stored.stagnation_count == null ? 0 : stored.stagnation_count,
    breaker: stored.breaker || null
  };
  const att = computeAttention(store);
  const rows = _rows(db, "SELECT key, value_json FROM config WHERE key LIKE 'kernel.inhibit:%' ORDER BY key");
  const inhibitions = rows.map((r) => {
    let v = null; try { v = JSON.parse(r.value_json); } catch (_) { v = null; }
    if (!v) return null;
    return { target: v.target, reason: v.reason, until: v.until, created_at: v.created_at, active: now < Number(v.until) };
  }).filter(Boolean);
  const ev = _scalar(db, 'SELECT COUNT(*) AS n FROM events');
  return { kernel, factors: att.factors, attention: att.attention, inhibitions, events: Number(ev.n || 0) };
}

async function _verify(store, args = {}) {
  const subject = String(args.subject || '').trim();
  if (!subject) throw new Error('subject-required');
  const kind = args.kind == null ? 'promote' : String(args.kind);
  if (!hasPassingGate(store, subject, kind)) return { ok: false, reason: 'gate-required', subject, kind };
  return { ok: true, subject, kind };
}

async function runAction(store, name, args = {}, opts = {}) {
  _requireStore(store);
  switch (name) {
    case 'event': return _event(store, args, opts);
    case 'inhibit': return _inhibit(store, args, opts);
    case 'status': return _status(store, args, opts);
    case 'verify': return _verify(store, args, opts);
    default: throw new Error('unknown-action: ' + name);
  }
}

function listActions() { return ACTIONS.slice(); }

// ── HTTP 入口（同一份 runAction） ──
function _readBody(req) {
  return new Promise((resolve, reject) => {
    let out = '';
    req.on('data', (c) => { out += c; if (out.length > 5 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      if (!out.trim()) return resolve({});
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('invalid-json')); }
    });
    req.on('error', reject);
  });
}

function startServer(opts = {}) {
  const store = opts.store;
  _requireStore(store);
  const http = require('http');
  const routes = {
    '/api/consciousness/event': { method: 'POST', action: 'event' },
    '/api/consciousness/inhibit': { method: 'POST', action: 'inhibit' },
    '/api/consciousness/status': { method: 'GET', action: 'status' },
    '/api/consciousness/verify': { method: 'POST', action: 'verify' }
  };
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const send = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
      };
      try {
        const p = new URL(req.url, 'http://localhost').pathname;
        const route = routes[p];
        if (!route) return send(404, { error: 'not-found' });
        if (req.method !== route.method) return send(405, { error: 'method-not-allowed' });
        const args = route.method === 'POST' ? await _readBody(req) : {};
        send(200, await runAction(store, route.action, args));
      } catch (e) {
        const code = /identity-rejected|required|invalid-/.test(e.message) ? 400 : 500;
        send(code, { error: e.message });
      }
    });
    server.on('error', reject);
    server.listen(opts.port == null ? 0 : opts.port, opts.host || '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        close: (cb) => server.close(cb)
      });
    });
  });
}

module.exports = { ACTIONS, listActions, runAction, isInhibited, startServer };
