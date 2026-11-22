'use strict';
// SPEC-3.14 修订 C failing test —— api entity REST（cli.js api）
// 四条路由：GET /health、GET /entities、GET /entities/:id、POST /entities。
// 写面复用 src/api-gate.js 嘅 gateWrite（身份闸 + 标签闸），唔另起平行写路径。
// 读面纯 SELECT，唔碰 last_access（无旁路访问面）。HTTP 用 node:http，零外部依赖。
const fs = require('fs'); const os = require('os'); const path = require('path');
const http = require('http'); const { execFile } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cli-a-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

// 加载失败要降成断言红（唔系 setup crash）——先 test 验红先算锁死
let entityApi = null, loadErr = null;
try { entityApi = require('../src/entity-api.js'); } catch (e) { loadErr = e.message; }
const cli = require('../src/cli.js');
const storeMod = require('../src/knowledge-store.js');
const ROOT = path.join(__dirname, '..');

// 假 req/res，喂 handleRequest 纯路由解析（唔 spawn 亦跑得动）
function fakeRes() {
  const r = {
    code: null, body: '', headers: {}, chunks: [],
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; },
    writeHead(c, h) { r.code = c; Object.assign(r.headers, h || {}); },
    write(b) { r.chunks.push(Buffer.from(b)); return true; },
    end(b) { if (b) r.chunks.push(Buffer.from(b)); }
  };
  r.json = () => JSON.parse(Buffer.concat(r.chunks).toString('utf8'));
  return r;
}

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');
  const s = await cli.openStore(dbPath);

  // AC-1 导出在位
  ac('AC-1 entity-api 导出在位（createServer/handleRequest/listEntities/readEntity）',
    !!entityApi && typeof entityApi.createServer === 'function' && typeof entityApi.handleRequest === 'function'
      && typeof entityApi.listEntities === 'function' && typeof entityApi.readEntity === 'function',
    loadErr || String(Object.keys(entityApi || {}).join(',')));
  ac('AC-1b cli.cmdApi 已接线', typeof cli.cmdApi === 'function', String(typeof cli.cmdApi));

  // 起真服务（port 0 → 随机端口，避免端口竞态）
  let srv = null, port = null, down = null;
  try {
    srv = entityApi.createServer({ port: 0, host: '127.0.0.1', store: s });
    await new Promise((res, rej) => { srv.server.once('listening', res); srv.server.once('error', rej); });
    port = srv.address();
  } catch (e) { down = e.message; }

  const call = (method, p, body) => new Promise((resolve, reject) => {
    const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const q = http.request({ host: '127.0.0.1', port, method, path: p }, res => {
      let buf = ''; res.on('data', c => { buf += c; });
      res.on('end', () => {
        let j = null; try { j = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, json: j, raw: buf });
      });
    });
    q.on('error', reject);
    if (data != null) q.setHeader('content-type', 'application/json');
    q.end(data);
  });

  // AC-2 health 真跑
  const h = await (srv && port ? call('GET', '/health') : Promise.reject(new Error('no-server'))).catch(e => ({ status: 0, json: null, why: down || e.message }));
  ac('AC-2 GET /health → 200 且 ok=true、entities 为非负整数',
    h.status === 200 && h.json && h.json.ok === true && Number.isInteger(h.json.entities) && h.json.entities >= 0,
    JSON.stringify({ status: h.status, json: h.json, why: h.why || null }));

  // AC-3 写后读闭环（hana 写入 → 列表 → 单读）
  const post = { id: 'wiki-api-probe', name: 'api 探针', type: 'Concept', content: '经 REST 面写入嘅探针实体。', tags: ['probe'] };
  const w = await (srv && port ? call('POST', '/entities', { actor: 'hana', payload: post }) : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  const ls = await (srv && port ? call('GET', '/entities') : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  const one = await (srv && port ? call('GET', '/entities/wiki-api-probe') : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  const listHas = !!(ls.json && Array.isArray(ls.json.entities) && ls.json.entities.some(e => e.id === 'wiki-api-probe'));
  ac('AC-3 POST(hana) → 201，随后列表含该实体、单读返同一实体',
    w.status === 201 && listHas && one.status === 200 && one.json && one.json.found === true && one.json.entity && one.json.entity.id === 'wiki-api-probe',
    JSON.stringify({ post: w.status, listStatus: ls.status, listHas, one: one.status, oneId: one.json && one.json.entity && one.json.entity.id, why: down || null }));

  // AC-4 身份闸：actor 唔系 hana → 403；写入方自报 status/confidence/tags 一律忽略
  const rej = await (srv && port ? call('POST', '/entities', { actor: 'user', payload: { id: 'wiki-evil', name: 'x', content: 'y', status: 'active', confidence: 0.99, tags: ['sneaky'] } }) : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  const ignoredOk = Array.isArray(w.json && w.json.ignored) && ['status', 'confidence', 'tags'].every(k => w.json.ignored.includes(k));
  ac('AC-4 actor≠hana → 403；写面回执 ignored 明列 status/confidence/tags',
    rej.status === 403 && ignoredOk,
    JSON.stringify({ rejectedStatus: rej.status, ignored: w.json && w.json.ignored, why: down || null }));

  // AC-5 幂等（同 id 重发 → 409）与未命中（404 found:false）
  const dup = await (srv && port ? call('POST', '/entities', { actor: 'hana', payload: post }) : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  const miss = await (srv && port ? call('GET', '/entities/wiki-no-such') : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  ac('AC-5 同 id 重发 → 409；未命中 id → 404 且 found:false',
    dup.status === 409 && miss.status === 404 && miss.json && miss.json.found === false,
    JSON.stringify({ dup: dup.status, miss: miss.status, missBody: miss.json, why: down || null }));

  // AC-6 错误面：坏 JSON → 400；未知路由 → 404
  const bad = await (srv && port ? call('POST', '/entities', '{oops') : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  const noRoute = await (srv && port ? call('GET', '/nope') : Promise.reject(new Error('no-server')))
    .catch(e => ({ status: 0, json: null, why: down || e.message }));
  ac('AC-6 坏 JSON → 400；未知路由 → 404',
    bad.status === 400 && noRoute.status === 404,
    JSON.stringify({ bad: bad.status, noRoute: noRoute.status, why: down || null }));

  // AC-7 纯路由解析可用（唔靠 spawn）：fake req/res 走 handleRequest
  let pureOk = false, pureWhy = '';
  try {
    const r = fakeRes();
    entityApi.handleRequest({ method: 'GET', url: '/health', headers: {} }, r, s);
    await new Promise(res => setImmediate(res));
    pureOk = r.code === 200 && r.json().ok === true && /application\/json/.test(String(r.headers['content-type'] || ''));
  } catch (e) { pureWhy = e.message; }
  ac('AC-7 handleRequest 纯路由解析（fake req/res，health 200 + json 头）', pureOk, pureWhy);

  // AC-8 CLI 真跑：spawn cli.js api --port 0 --json → exit0 且回执带实际端口
  const out = await new Promise(resolve => {
    execFile(process.execPath, [path.join(ROOT, 'src', 'cli.js'), 'api', '--port', '0', '--json', '--db', dbPath], { timeout: 30000 }, (err, so, se) => resolve({ code: err ? err.code : 0, out: String(so), err: String(se) }));
  });
  let cliJson = null; try { cliJson = JSON.parse(out.out); } catch (_) {}
  ac('AC-8 spawn cli.js api --port 0 --json → exit0 且回执含实际端口',
    out.code === 0 && !!cliJson && Number.isInteger(cliJson.port),
    JSON.stringify({ code: out.code, out: out.out.slice(0, 120), err: out.err.slice(0, 120) }));

  // AC-9（spec AC-8）ready 契约：createServer 返回 ready；await 后 address() 为正整数。
  // 修订 D 前的真实缺陷：listen 系异步，同步返回后 address() 为 null，
  // 调用方被迫自己挂 server.once('listening')（本文件上方仍在噚此写法）。
  let ac9ok = false, ac9why = '';
  try {
    const s2 = entityApi.createServer({ port: 0, host: '127.0.0.1', store: s });
    ac9ok = s2.ready != null && typeof s2.ready.then === 'function';
    if (!ac9ok) ac9why = 'ready 未导出: ' + JSON.stringify(Object.keys(s2));
    else {
      await s2.ready;
      const p2 = s2.address();
      ac9ok = Number.isInteger(p2) && p2 > 0;
      if (!ac9ok) ac9why = 'ready 后 address() 非正整数: ' + String(p2);
    }
    try { await s2.close(); } catch (_) {}
  } catch (e) { ac9ok = false; ac9why = e.message; }
  ac('AC-9 ready 契约：await ready 后 address() 为正整数（唔需自挂 listening）', ac9ok, ac9why);

  // AC-10（spec AC-9）ready 真连：唔自挂 listening，只靠 await ready，然后真请求 /health
  const savedPort = port;
  let ac10ok = false, ac10why = '';
  try {
    const s3 = entityApi.createServer({ port: 0, host: '127.0.0.1', store: s });
    await s3.ready;
    port = s3.address();
    const h3 = await call('GET', '/health');
    ac10ok = h3.status === 200 && h3.json != null && h3.json.ok === true;
    if (!ac10ok) ac10why = JSON.stringify({ port: port, status: h3.status, body: h3.raw || h3.json });
    try { await s3.close(); } catch (_) {}
  } catch (e) { ac10ok = false; ac10why = e.message; }
  finally { port = savedPort; }
  ac('AC-10 ready 真连：await ready 后 GET /health 真跑 200', ac10ok, ac10why);

  // AC-11（真库实跑踩到）：q 须系**模糊**（中缀命中），唔该系前缀匹配。
  // 缺陷形态：binds = [escape(q) + '%'] 只有右通配 → 只匹配「以 q 开头」的 name，
  // 与 spec「q name 模糊」不符（真库实跑：name=「真库实跑白名单探针」，q=白名单 → 0 命中）。
  let ac11ok = false, ac11why = '';
  try {
    const mid = await call('GET', '/entities?q=' + encodeURIComponent('探针'));
    const pre = await call('GET', '/entities?q=' + encodeURIComponent('api'));
    ac11ok = mid.status === 200 && mid.json && Number(mid.json.total) >= 1
      && Array.isArray(mid.json.entities) && mid.json.entities.some(e => e.id === 'wiki-api-probe')
      && pre.status === 200 && pre.json && Number(pre.json.total) >= 1;
    if (!ac11ok) ac11why = JSON.stringify({ mid: { status: mid.status, total: mid.json && mid.json.total }, pre: { status: pre.status, total: pre.json && pre.json.total } });
  } catch (e) { ac11why = e.message; }
  ac('AC-11 q 系模糊匹配（中缀命中 + 前缀仍命中）', ac11ok, ac11why);

  if (srv) await new Promise(res => srv.server.close(() => res()));
  storeMod._close();
  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
