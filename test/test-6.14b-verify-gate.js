'use strict';
// M6 任务 6.14b failing test —— 锁 SPEC-6.14 修订 A（回单内容闸接入 verifyTickets）
// 口径：工单 evidence_json 带 result 时先过闸——缺自评/缺事实/只有结论 一律 rejected 带原因码，
//       读数上升也不能抵消；不带 result 的工单行为不变（向后兼容）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-vergate-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const S = require('../src/self-optimize.js');

const one = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };

const GOOD = { facts: ['检索命中 86.9%'], pointers: ['eval/frozen@2026-11-18'], evidence: ['eval/frozen@2026-11-18'], sourceGrade: 'high', selfAssessment: '样本单一' };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id) => db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at,last_access) VALUES (?,?, 'Concept', ?, '[]','active',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [id, id, '正文足够长以通过质量评分。'.repeat(8)]);
  const ticket = (id, entityId, ev) => db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,?, 'kd','kd-low','rebond',0.30,'red','dispatched',1,?,'c1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [id, entityId, JSON.stringify(ev)]);

  ['e1', 'e2', 'e3', 'e4'].forEach(put);
  db.run("INSERT INTO kespi_scores (entity_id, kq, kg, ka, km, kd, kc, kr, kb, overall, computed_at) VALUES ('e1',0.5,0.5,0.5,0.5,0.60,0.5,0.5,0.5,0.5,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO kespi_scores (entity_id, kq, kg, ka, km, kd, kc, kr, kb, overall, computed_at) VALUES ('e2',0.5,0.5,0.5,0.5,0.60,0.5,0.5,0.5,0.5,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO kespi_scores (entity_id, kq, kg, ka, km, kd, kc, kr, kb, overall, computed_at) VALUES ('e3',0.5,0.5,0.5,0.5,0.60,0.5,0.5,0.5,0.5,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO kespi_scores (entity_id, kq, kg, ka, km, kd, kc, kr, kb, overall, computed_at) VALUES ('e4',0.5,0.5,0.5,0.5,0.60,0.5,0.5,0.5,0.5,CURRENT_TIMESTAMP)");

  const T_GATE_PUB = 't-gate-pub';
  const T_OK = 't-ok';
  const T_MEMB = 't-memb';
  const T_PLAIN = 't-plain';
  // 1) 回单缺自评（读数已上升 0.30→0.60）
  ticket(T_GATE_PUB, 'e1', { score: 0.30, result: { ...GOOD, selfAssessment: '' } });
  // 2) 回单齐 + 读数上升 → 应 verified
  ticket(T_OK, 'e2', { score: 0.30, result: GOOD });
  // 3) 回单只有结论与全文（无事实/指针）→ 膜拦
  ticket(T_MEMB, 'e3', { score: 0.30, result: { conclusion: '所以合并', fulltext: '全文'.repeat(50), evidence: [] } });
  // 4) 不带 result → 旧行为
  ticket(T_PLAIN, 'e4', { score: 0.30 });
  store._persist();

  const out = S.verifyTickets(store, {});

  const byId = (arr, id) => arr.find((x) => x.id === id);
  const g1 = byId(out.rejected, T_GATE_PUB);
  const v2 = byId(out.verified, T_OK);
  const g3 = byId(out.rejected, T_MEMB);
  const v4 = byId(out.verified, T_PLAIN);

  ac('AC-1 回单缺自评 → 闸拒（读数上升也不放过）',
    !!g1 && /gate:publish/.test(g1.reason) && g1.reasons.includes('no-self-assessment'),
    JSON.stringify(g1));

  ac('AC-2 回单齐 + 读数上升 → verified', !!v2 && v2.after > v2.before, JSON.stringify(v2));

  ac('AC-3 只有结论无事实 → 膜拦', !!g3 && /gate:membrane/.test(g3.reason), JSON.stringify(g3));

  ac('AC-4 不带 result 的工单行为不变（回归）', !!v4 && v4.after > v4.before, JSON.stringify(v4));

  const row = one(db, 'SELECT status, evidence_json FROM opt_tickets WHERE id = ?', [T_GATE_PUB]);
  const row2 = one(db, 'SELECT status FROM opt_tickets WHERE id = ?', [T_OK]);
  ac('AC-5 工单状态落库正确（闸拒=rejected / 通过=verified）',
    row && row.status === 'rejected' && /gate:publish/.test(row.evidence_json || '') && row2 && row2.status === 'verified',
    JSON.stringify({ reject: row && row.status, ok: row2 && row2.status }));

  const stage = g1 && g1.stage;
  ac('AC-6 拒因带阶段与原因码（外接屏可分阶段显示）',
    stage === 'publish' && Array.isArray(g1.reasons) && g1.reasons.length >= 1, JSON.stringify({ stage }));

  console.log(`\n----- 6.14b pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
