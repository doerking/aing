'use strict';
// 开源加固三连 failing test —— ①身份闸 env 可配 ②迁移对旧 links schema 容错 ③CLI 去 BOM
// 背景：三个真问题（有证据可复现），先红后绿。
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-oss-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');

(async () => {
  // ============ ① 身份闸：写面白名单可由 AING_ALLOWED_ACTORS 扩展 ============
  // 默认（不设 env）：写面拒所有 actor（含 hana）——deny-by-default，唔烧死任何代号
  const G = require('../src/api-gate.js');
  await store.init(path.join(yard, 'db1.db'));
  let thrownHana = null, thrownHakimi = null;
  try { await G.gateWrite(store, { actor: 'hana', payload: { id: 'raw-a0', content: 'x' } }); }
  catch (e) { thrownHana = e.message; }
  try { await G.gateWrite(store, { actor: 'hakimi', payload: { id: 'raw-a', content: 'x' } }); }
  catch (e) { thrownHakimi = e.message; }
  ac('①-a 默认空：hana 与 hakimi 一律拒写', /identity-rejected/.test(String(thrownHana)) && /identity-rejected/.test(String(thrownHakimi)),
    'hana=' + thrownHana + ' | hakimi=' + thrownHakimi);

  // 设 env 后 hana / hakimi 都放行——这是本次要修的核心（开源唔烧死个人代号，env 显式配）
  process.env.AING_ALLOWED_ACTORS = 'hana,hakimi';
  // 重新 require 以触发模块顶层重读 env
  delete require.cache[require.resolve('../src/api-gate.js')];
  const G2 = require('../src/api-gate.js');
  let okHana = null, okHakimi = null, err2 = null;
  try { okHana = await G2.gateWrite(store, { actor: 'hana', payload: { id: 'raw-b0', content: 'y' } }); }
  catch (e) { err2 = 'hana:' + e.message; }
  try { okHakimi = await G2.gateWrite(store, { actor: 'hakimi', payload: { id: 'raw-b', content: 'y' } }); }
  catch (e) { err2 = 'hakimi:' + e.message; }
  ac('①-b env 配置后 hana 与 hakimi 都过闸',
    okHana && okHana.accepted === true && okHakimi && okHakimi.accepted === true, err2 || JSON.stringify(okHakimi));
  delete process.env.AING_ALLOWED_ACTORS;
  delete require.cache[require.resolve('../src/api-gate.js')];

  // ============ ② 迁移：旧库 links 仅 5 栏（无 strength/invalid_at）不崩 ============
  const SQL = await require('sql.js')();
  const oldPath = path.join(yard, 'old5col.db');
  {
    const db = new SQL.Database();
    db.run(`CREATE TABLE entities (id TEXT PRIMARY KEY, name TEXT, type TEXT, content TEXT, tags TEXT,
      status TEXT, confidence REAL, tolaria_strength INTEGER, last_access TEXT, created_at TEXT, updated_at TEXT,
      invalid_at TEXT, invalid_reason TEXT, title TEXT)`);
    db.run(`CREATE TABLE links (source_id TEXT, target_id TEXT, relation TEXT, confidence REAL, created_at TEXT)`);
    db.run(`INSERT INTO entities (id,name,type,content,created_at) VALUES ('e1','一','Concept','甲','2024-01-01 00:00:00')`);
    db.run(`INSERT INTO entities (id,name,type,content,created_at) VALUES ('e2','二','Concept','乙','2024-01-02 00:00:00')`);
    db.run(`INSERT INTO links (source_id,target_id,relation,confidence,created_at) VALUES ('e1','e2','rel',0.8,'2024-01-03 00:00:00')`);
    const bytes = Buffer.from(db.export());
    fs.writeFileSync(oldPath, bytes);
  }
  const M = require('../src/migrate.js');
  await store.init(path.join(yard, 'db2.db'));
  let rep2 = null, err2b = null;
  try { rep2 = await M.migrateFrom(store, { sourcePath: oldPath }); }
  catch (e) { err2b = e.message; }
  ac('②-a 5栏links迁移不抛 no such column', !err2b, String(err2b));
  const lrow = () => { const s = store._getDb().prepare('SELECT source_id,target_id,strength,invalid_at FROM links'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
  const lr = err2b ? [] : lrow();
  ac('②-b 边零丢失 + strength 缺省 5',
    lr.length === 1 && lr[0].source_id === 'e1' && lr[0].target_id === 'e2' && Number(lr[0].strength) === 5,
    JSON.stringify(lr));

  // ============ ③ CLI 去 BOM：--payload 与 dispatch-card --file 带 BOM 不崩 ============
  const bomTicket = path.join(yard, 'ticket.json');
  fs.writeFileSync(bomTicket, '\uFEFF' + JSON.stringify({ title: 'T', goal: 'g' }), 'utf8');
  const cli = path.resolve(__dirname, '..', 'src', 'cli.js');
  // dispatch-card --file 带 BOM
  const r1 = spawnSync(process.execPath, [cli, 'dispatch-card', '--file', bomTicket], { encoding: 'utf8' });
  const out1 = (r1.stdout || '') + (r1.stderr || '');
  ac('③-a dispatch-card --file 容忍 BOM（渲染成功即算过）', /外派派单卡/.test(r1.stdout || '') && !/not valid JSON/.test(r1.stderr || ''),
    out1.trim().split('\n').slice(-1)[0]);
  // ingest --payload 带 BOM
  const bomPayload = '﻿' + JSON.stringify({ actor: 'hana', sessionId: 's3b', at: '2026-01-01 00:00:00', topic: 'T', reply: '回复正文', searchShown: [], rationale: '理由' });
  const r2 = spawnSync(process.execPath, [cli, 'ingest', '--payload', bomPayload, '--db', path.join(yard, 'db3.db')], { encoding: 'utf8', env: { ...process.env, AING_ALLOWED_ACTORS: 'hana' } });
  const out2 = (r2.stdout || '') + (r2.stderr || '');
  ac('③-b ingest --payload 容忍 BOM', r2.status === 0 && !/not valid JSON|Unexpected token/.test(r2.stderr || ''),
    out2.trim().split('\n').slice(-1)[0]);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
