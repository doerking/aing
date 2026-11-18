'use strict';
// M6 任务 6.20 failing test —— 锁「需求穿透最后一跳」：回单要按 demand.acceptance 判
// 要修的病：需求写进单、取单口也认，但 verifyTickets 的 proposed 分支从不读 acceptance——
// 外部件回了单，系统只打心跳，直到 TTL 作废。需求断在最后一跳。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-accept-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const D = require('../src/ticket-demand.js');
const S = require('../src/self-optimize.js');

const RESULT_OK = { facts: ['补齐正文 512 字'], pointers: ['entities/e1'], sourceGrade: 'high', selfAssessment: '自评：已补正文与标签' };
const RESULT_THIN = { facts: ['补齐正文 512 字'], pointers: ['entities/e1'], sourceGrade: 'low', selfAssessment: '' };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, dim, kind, score, status, ev) => db.run(
    "INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,? ,? ,?,'memo-card',?,'red',?,0,?,'c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, 'e1', dim, kind, score, status, JSON.stringify(ev)]);
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('e1','E','Concept',?,'[]','active',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['正文'.repeat(300)]);
  db.run("INSERT INTO kespi_scores (entity_id,kq,ka,kd,kc,kr,overall,computed_at) VALUES ('e1',0.60,0.50,0.50,0.50,0.50,0.52,CURRENT_TIMESTAMP)");

  // AC-1/2/3 纯函数：判据本身可测
  const dm = D.demandFor('kq-low');                       // kq >= 0.50
  let r = null;
  try { r = D.checkAcceptance(dm, { kq: 0.60 }); } catch (_) { r = null; }
  ac('AC-1 判据：gte 达标判过', !!(r && r.ok === true && r.checked === 1), JSON.stringify(r));
  let r2 = null;
  try { r2 = D.checkAcceptance(dm, { kq: 0.20 }); } catch (_) { r2 = null; }
  ac('AC-2 判据：gte 不达标判不过且点名维度',
    !!(r2 && r2.ok === false && (r2.failures || []).some(f => f.dim === 'kq')), JSON.stringify(r2));

  const dmImp = { ...D.demandFor('overall-red') };        // overall improved
  let r3 = null, r4 = null;
  try {
    r3 = D.checkAcceptance(dmImp, { overall: 0.52 }, { before: { overall: 0.44 } });
    r4 = D.checkAcceptance(dmImp, { overall: 0.52 }, {});
  } catch (_) { r3 = null; r4 = null; }
  ac('AC-3 判据：improved 靠 before 快照；无快照不假通过',
    !!(r3 && r3.ok === true && r4 && r4.ok === false && (r4.failures || []).some(f => f.reason === 'no-before')),
    JSON.stringify({ ok: r3, noBefore: r4 }));

  const st = (id) => { const s = db.prepare('SELECT status, evidence_json FROM opt_tickets WHERE id = ?'); s.bind([id]); const x = s.step() ? s.getAsObject() : null; s.free(); return x; };

  // AC-4 达标回单 → verified（今日断点）
  ins('t-pass', 'kq', 'kq-low', 0.20, 'proposed', { score: 0.20, demand: dm, result: RESULT_OK, readings: { kq: 0.20, overall: 0.44 } });
  store._persist();
  await S.verifyTickets(store, {});
  ac('AC-4 达标回单按需求判成 verified', st('t-pass').status === 'verified', 'status=' + st('t-pass').status);

  // AC-5 不达标回单 → rejected（接受但不合格，不留着占名额）
  db.run("UPDATE kespi_scores SET kq = 0.20 WHERE entity_id = 'e1'");
  ins('t-fail', 'kq', 'kq-low', 0.20, 'proposed', { score: 0.20, demand: dm, result: RESULT_OK, readings: { kq: 0.20, overall: 0.44 } });
  store._persist();
  const v5 = await S.verifyTickets(store, {});
  const failEv = JSON.parse(st('t-fail').evidence_json);
  ac('AC-5 不达标回单 rejected（acceptance-failed）',
    st('t-fail').status === 'rejected' && /acceptance-failed/.test(String(failEv.reason)),
    JSON.stringify({ status: st('t-fail').status, reason: failEv.reason }));

  // AC-6 回单先过内容闸：缺自评/弱证据 → 拒在门口，不进判据
  ins('t-thin', 'kq', 'kq-low', 0.20, 'proposed', { score: 0.20, demand: dm, result: RESULT_THIN, readings: { kq: 0.60 } });
  store._persist();
  await S.verifyTickets(store, {});
  const thinEv = JSON.parse(st('t-thin').evidence_json);
  ac('AC-6 回单先过内容闸（gate 拒绝优先）',
    st('t-thin').status === 'rejected' && /^gate:/.test(String(thinEv.reason)), JSON.stringify({ status: st('t-thin').status, reason: thinEv.reason }));

  // AC-7 扫单时留读数快照，否则 improved 类判据永远判不了
  db.run("UPDATE kespi_scores SET kq = 0.20, ka = 0.20 WHERE entity_id = 'e1'");
  db.run("DELETE FROM opt_tickets");
  store._persist();
  await S.scanTickets(store, {});
  const scanned = db.prepare('SELECT evidence_json FROM opt_tickets LIMIT 1');
  const sEv = scanned.step() ? JSON.parse(scanned.getAsObject().evidence_json || '{}') : {};
  scanned.free();
  ac('AC-7 扫单留 readings 快照（供 improved 判据）',
    !!(sEv.readings && Number.isFinite(Number(sEv.readings.kq)) && Number.isFinite(Number(sEv.readings.overall))), JSON.stringify(sEv.readings || null));

  // AC-8 TTL 回归：无回单超期仍作废（6.18 不被 6.20 撬翻）
  db.run("DELETE FROM opt_tickets");
  ins('t-ttl', 'ka', 'ka-low', 0.20, 'proposed', { score: 0.20, demand: D.demandFor('ka-low'), followup: { beats: 4, beatAt: 'x' } });
  store._persist();
  const v8 = await S.verifyTickets(store, {});
  ac('AC-8 无回单超 TTL 仍作废', (v8.rejected || []).some(x => x.id === 't-ttl' && x.reason === 'proposal-expired'), JSON.stringify(v8.rejected));

  console.log(`\n----- 6.20 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
