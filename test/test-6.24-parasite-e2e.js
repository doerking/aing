'use strict';
// M6 任务 6.24 failing test —— P2 半寄生端到端：取单 → 回单 → 系统写回 → 按需求判 → 上屏
// 锁的是边界而不只是结果：外部件只产回单、不写库；写入一律由系统按写回点做。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-e2e-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const S = require('../src/self-optimize.js');
const P = require('../src/parasite-slot.js');
const K = require('../src/kespi.js');
const D = require('../src/ticket-demand.js');
const T = require('../tools/parasite-round.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const snap = (t) => JSON.stringify((() => { const s = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('e1','E','Concept',?,'[\"x\"]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['正文'.repeat(50)]);
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c1','field',CURRENT_TIMESTAMP,'ok',1,0)");
  await K.kespiStep(store, {});
  await S.scanTickets(store, { maxTickets: 200 });
  await S.dispatchTickets(store, {});

  const list = P.claimable(store, T.REG);
  const claim = list.find(t => t.entity_id === 'e1');
  ac('AC-1 取单口只给 P2 单（ka-low 不被 P2 认领）',
    !!claim && claim.demand.slot === 'P2' && list.every(t => t.demand.slot === 'P2'),
    JSON.stringify(list.map(t => ({ id: t.id, slot: t.demand.slot, kind: t.kind }))));

  const evBefore = snap('entities'), tkBefore = snap('opt_tickets');
  const ret = claim ? T.externalPart(db, claim) : null;
  ac('AC-2 外部件只产回单、不写库',
    !!ret && ret.result.facts.length > 0 && snap('entities') === evBefore && snap('opt_tickets') === tkBefore,
    ret ? '回单已产' : '无回单');

  T.applyReturn(store, claim, ret);
  const after = (() => { const s = db.prepare("SELECT content, tags FROM entities WHERE id='e1'"); s.step(); const r = s.getAsObject(); s.free(); return r; })();
  ac('AC-3 系统按写回点落库（正文变长、标签≥3）',
    after.content.length > 100 && JSON.parse(after.tags).length >= 3,
    JSON.stringify({ len: after.content.length, tags: after.tags }));

  await K.kespiStep(store, {});
  const kq = (() => { const s = db.prepare("SELECT kq FROM kespi_scores WHERE entity_id='e1'"); s.step(); const r = s.getAsObject(); s.free(); return Number(r.kq); })();
  ac('AC-4 重算读数后 kq 达判据（≥0.50）', kq >= 0.5, String(kq));

  await S.verifyTickets(store, { round: 1 });
  const st = (id) => { const s = db.prepare('SELECT status, evidence_json FROM opt_tickets WHERE id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
  const got = st(claim.id);
  const gotEv = JSON.parse(got.evidence_json);
  ac('AC-5 按需求判成 verified（accepted）',
    got.status === 'verified' && gotEv.reason === 'accepted' && gotEv.acceptance && gotEv.acceptance.ok === true,
    JSON.stringify({ status: got.status, reason: gotEv.reason, acc: gotEv.acceptance }));

  // AC-6 回单缺件先被内容闸拦（外部件能力不足不能靠判据兜）
  db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES ('t-thin','e1','kq','kq-low','memo-card',0.3,'red','proposed',0,?,'c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [JSON.stringify({ score: 0.3, demand: D.demandFor('kq-low'), readings: { kq: 0.3 }, result: { facts: ['补了正文'], pointers: ['entities/e1'], sourceGrade: 'medium' } })]);
  store._persist();
  await S.verifyTickets(store, { round: 1 });
  const thin = JSON.parse(st('t-thin').evidence_json);
  ac('AC-6 回单缺自评 → 内容闸拒（gate: 优先于判据）',
    st('t-thin').status === 'rejected' && /^gate:publish/.test(String(thin.reason)),
    JSON.stringify({ status: st('t-thin').status, reason: thin.reason }));

  console.log(`\n----- 6.24 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
