'use strict';
// aing-v2 entity-api.js —— M3 任务 3.14 修订 C（SPEC-3.14 修订 C）
// api entity REST：GET /health、GET /entities、GET /entities/:id、POST /entities。
// 写面单源：POST 只走 src/api-gate.js 嘅 gateWrite（身份闸 + 标签闸，SPEC-3.6），唔另起平行写路径。
// 读面纯 SELECT，唔碰 last_access（无旁路访问面）。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守），SQL 走 store._getDb()。
// HTTP 面用 node:http，零外部依赖。

const http = require('http');
const apiGate = require('./api-gate.js');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const BODY_LIMIT = 1024 * 1024; // 1 MiB：body 上限，超咗即 413

// 列表面唔送正文（列表面唔返 content）——避免一次拉走几万字节
const LIST_COLUMNS = 'id,name,type,title,tags,status,confidence,tolaria_strength,created_at,updated_at';

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function _likeEscape(v) {
  return String(v).replace(/[\\%_]/g, (m) => '\\' + m);
}

function _clampedLimit(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

// SPEC-3.14 修订 C 契约：listEntities(store, {q, limit, offset}) -> {total, limit, offset, entities}
function listEntities(store, opts = {}) {
  const db = store._getDb();
  const q = opts.q != null ? String(opts.q).trim() : '';
  const limit = _clampedLimit(opts.limit == null ? DEFAULT_LIMIT : opts.limit);
  const offset = Number.isFinite(Number(opts.offset)) && Number(opts.offset) > 0
    ? Math.floor(Number(opts.offset)) : 0;
  const where = q ? "WHERE name LIKE ? ESCAPE '\\'" : '';
  const binds = q ? [_likeEscape(q) + '%'] : [];
  const total = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities ${where}`, binds).n);
  const stmt = db.prepare(
    `SELECT ${LIST_COLUMNS} FROM entities ${where} ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`
  );
  stmt.bind([...binds, limit, offset]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return { total, limit, offset, entities: rows };
}

// SPEC-3.14 修订 C 契约：readEntity(store, id) -> {found, entity}
function readEntity(store, id) {
  const row = _scalar(store._getDb(), 'SELECT * FROM entities WHERE id = ?', [String(id).trim()]);
  return { found: !!row, entity: row || null, id: String(id).trim() };
}

function _health(store) {
  const total = Number(_scalar(store._getDb(), 'SELECT COUNT(*) AS n FROM entities').n);
  let backend = 'none';
  try { backend = require('./vector.js').resolveBackend().name; } catch (_) { /* 后端名仅展示，取不到就报 none */ }
  return { ok: true, entities: total, backend, time: new Date().toISOString() };
}

function _send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function _readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new Error('body-too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// SPEC-3.14 修订 C 契约：handleRequest(req, res, store)——路由解析 + 分发，唔监听（测试可直接喂假 req/res）
async function handleRequest(req, res, store) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;
  const method = String(req.method || 'GET').toUpperCase();

  if (route === '/health' && method === 'GET') {
    _send(res, 200, _health(store));
    return;
  }

  if (route === '/entities' && method === 'GET') {
    const { total, limit, offset, entities } = listEntities(store, {
      q: url.searchParams.get('q'),
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset')
    });
    _send(res, 200, { total, limit, offset, entities });
    return;
  }

  const m = /^\/entities\/([^/]+)$/.exec(route);
  if (m && method === 'GET') {
    const id = decodeURIComponent(m[1]);
    const r = readEntity(store, id);
    _send(res, r.found ? 200 : 404, r.found ? { found: true, entity: r.entity } : { found: false, id });
    return;
  }

  if (route === '/entities' && method === 'POST') {
    let raw;
    try { raw = await _readBody(req); } catch (_) { _send(res, 413, { error: 'body-too-large' }); return; }
    let obj;
    try { obj = JSON.parse(raw.toString('utf8')); } catch (_) { _send(res, 400, { error: 'bad-json' }); return; }
    if (!obj || typeof obj !== 'object') { _send(res, 400, { error: 'bad-json' }); return; }
    // 写面单源：身份闸 / 标签闸 / 自报字段忽略，全部喺 api-gate
    try {
      const r = await apiGate.gateWrite(store, { actor: obj.actor, payload: obj.payload || {} });
      _send(res, r.accepted ? 201 : 409, r);
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/identity-rejected/.test(msg)) { _send(res, 403, { error: 'identity-rejected', reason: msg }); return; }
      if (/id-required/.test(msg)) { _send(res, 400, { error: 'id-required' }); return; }
      _send(res, 500, { error: msg });
    }
    return;
  }

  _send(res, 404, { error: 'not-found', route });
}

// SPEC-3.14 修订 C 契约：createServer({port, host, store}) -> {server, address(), close()}
function createServer(opts = {}) {
  const port = opts.port == null ? 3000 : Number(opts.port);
  const host = opts.host || '127.0.0.1';
  const store = opts.store;
  const server = http.createServer((req, res) => {
    handleRequest(req, res, store).catch(() => { try { _send(res, 500, { error: 'internal' }); } catch (_) {} });
  });
  server.listen(port, host);
  return {
    server,
    address: () => (server.address() ? server.address().port : null),
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, BODY_LIMIT, listEntities, readEntity, handleRequest, createServer };
