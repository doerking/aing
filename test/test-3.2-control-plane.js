'use strict';
process.env.AING_ALLOWED_ACTORS = 'hana'; // 写面默认拒所有写，测试档显式配 hana 过闸
// M3 任务 3.2 failing test —— 锁 SPEC-3.2 控制面四路由（CLI + HTTP 同源）
const fs = require('fs'); const os = require('os'); const path = require('path');
const http = require('http'); const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-control-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let CP, store, dbPath;
try {
  CP = require('../src/control-plane.js');
  store = require('../src/knowledge-store.js');
  if (typeof CP.runAction !== 'function') throw new Error('runAction 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/control-plane.js 未实现 SPEC-3.2'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const count = (t, w = '') => Number(rows(`SELECT COUNT(*) AS n FROM ${t} ${w}`)[0].n);
const fingerprint = () => JSON.stringify({
  entities: count('entities'), links: count('links'), events: count('events'),
  config: count('config'), gate: count('gate_records'),
  kernel: rows('SELECT * FROM kernel_state ORDER BY id')
});

function req(port, method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (res) => {
      let out = ''; res.on('data', c => out += c); res.on('end', () => { let j = null; try { j = JSON.parse(out); } catch (_) { j = out; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    if (data) r.write(data); r.end();
  });
}

(async () => {
  dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  const db = store._getDb();
  store.insertEntity({ id: 'old', name: '旧', type: 'Concept', content: '旧料', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();

  // AC-1 event 身份闸
  const n0 = count('events');
  let thrown = null;
  try { await CP.runAction(store, 'event', { source: 'user', type: 'probe' }); } catch (e) { thrown = e.message; }
  const n1 = count('events');
  const ev = await CP.runAction(store, 'event', { source: 'hana', type: 'probe', target: 'x', payload: { a: 1 } });
  ac('AC-1 event 身份闸', /identity-rejected/.test(String(thrown)) && n1 === n0 && ev.accepted === true && count('events') === n0 + 1,
    JSON.stringify({ thrown, n0, n1, ev }));

  // AC-2 inhibit 到期自解
  const T = 1700000000000;
  const inh = await CP.runAction(store, 'inhibit', { target: 'noise', reason: 'spec', hours: 2 }, { now: T });
  const s1 = await CP.runAction(store, 'status', {}, { now: T + 60 * 1000 });
  const s2 = await CP.runAction(store, 'status', {}, { now: T + 3 * 3600 * 1000 });
  const pick = (st) => (st.inhibitions || []).find(i => i.target === 'noise') || {};
  ac('AC-2 inhibit 到期自解',
    inh.isInhibited === true && pick(s1).active === true && pick(s2).active !== true &&
    CP.isInhibited(store, 'noise', T + 1000) === true && CP.isInhibited(store, 'noise', T + 3 * 3600 * 1000) === false,
    JSON.stringify({ inh, s1: pick(s1), s2: pick(s2) }));

  // AC-3 无撤销口
  const keys = Object.keys(CP).join(',');
  ac('AC-3 无撤销口', !/revoke|release|clear|remove/i.test(keys) && CP.listActions().join(',') === 'event,inhibit,status,verify',
    keys);

  // AC-4 status 纯读
  const f0 = fingerprint();
  await CP.runAction(store, 'status', {}, { now: T });
  await CP.runAction(store, 'status', {});
  ac('AC-4 status 纯读', fingerprint() === f0, fingerprint() === f0 ? '' : '指纹变了');

  // AC-5 verify 纯读且真判
  const miss = await CP.runAction(store, 'verify', { subject: 'g-x' });
  const g0 = count('gate_records');
  db.run("INSERT INTO gate_records (id, subject, kind, passed, gates_json, created_at) VALUES ('gr1','g-x','promote',1,'{}',CURRENT_TIMESTAMP)");
  store._persist();
  const hit = await CP.runAction(store, 'verify', { subject: 'g-x' });
  ac('AC-5 verify 纯读且真判',
    miss.ok === false && miss.reason === 'gate-required' && hit.ok === true && count('gate_records') === g0 + 1,
    JSON.stringify({ miss, hit }));

  // AC-6 HTTP 四路由
  const srv = await CP.startServer({ store, port: 0 });
  const [r1, r2, r3, r4] = await Promise.all([
    req(srv.port, 'POST', '/api/consciousness/event', { source: 'hana', type: 'http-probe' }),
    req(srv.port, 'POST', '/api/consciousness/inhibit', { target: 'http-noise', hours: 1 }),
    req(srv.port, 'GET', '/api/consciousness/status'),
    req(srv.port, 'POST', '/api/consciousness/verify', { subject: 'g-x' })
  ]);
  await new Promise(r => srv.close(r));
  ac('AC-6 HTTP 四路由',
    r1.status === 200 && r1.body.accepted === true &&
    r2.status === 200 && r2.body.isInhibited === true &&
    r3.status === 200 && r3.body.kernel && Array.isArray(r3.body.inhibitions) &&
    r4.status === 200 && r4.body.ok === true,
    JSON.stringify({ r1, r2, status: r3.status, r4 }));

  // AC-7 CLI 同源
  const cli = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'neural.js'), 'status', '--json'], {
    env: { ...process.env, AING_DB: dbPath }, encoding: 'utf8', timeout: 60000
  });
  let cj = null; try { cj = JSON.parse(cli.stdout); } catch (_) { cj = null; }
  ac('AC-7 CLI 同源', cli.status === 0 && cj && cj.kernel && Array.isArray(cj.inhibitions) && cj.kernel.state === 'idle',
    JSON.stringify({ code: cli.status, out: (cli.stdout || '').slice(0, 120), err: (cli.stderr || '').slice(0, 120) }));

  const la = rows("SELECT last_access FROM entities WHERE id='old'")[0].last_access;
  ac('AC-8 铁律', String(la) === '2021-01-01 00:00:00',
    String(la));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
