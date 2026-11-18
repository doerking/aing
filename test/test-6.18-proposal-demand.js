'use strict';
// M6 任务 6.18 failing test —— 锁 SPEC-6.18 §一（提案单需求定义 + TTL）
// 要修的病：提案单只有「哪一维低了」，没有「要什么 / 怎样算好 / 几时作废」——所以只能堆。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-demand-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const S = require('../src/self-optimize.js');
const one = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
const all = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

const LONG = '提案需求测试正文，长度足够触发质量评分且不带特殊结构。'.repeat(12);

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, type, content, ts) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at,last_access) VALUES (?,?,?,?,'[]','active',0.8,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)",
    [id, id, type, content, ts == null ? 5 : ts]);

  // ka 低（无访问）+ 正文短（kq 低）→ 两类提案
  put('e-stale', 'Concept', '短正文', 5);
  put('e-cited', 'Conversation', LONG, 8);
  // 被引用却不催化：给 e-cited 两条入向强边
  put('s-a', 'Insight', '来源甲', 5);
  put('s-b', 'Insight', '来源乙', 5);
  store.insertLink({ source_id: 's-a', target_id: 'e-cited', relation: 'hydrogen-bond', confidence: 0.9, strength: 8 });
  store.insertLink({ source_id: 's-b', target_id: 'e-cited', relation: 'hydrogen-bond', confidence: 0.9, strength: 8 });
  store._persist();

  await K.kespiStep(store, {});
  const scan = S.scanTickets(store, { cycleId: 'cyc-618' });
  await S.dispatchTickets(store, { cycleId: 'cyc-618' });
  const props = all(db, "SELECT * FROM opt_tickets WHERE status='proposed'");
  const evOf = (t) => { try { return JSON.parse(t.evidence_json || '{}'); } catch (_) { return {}; } };
  const withDemand = props.filter(t => { const d = evOf(t).demand; return d && d.want && Array.isArray(d.acceptance) && Array.isArray(d.evidence) && d.mode && d.slot && Number.isFinite(Number(d.ttlRounds)); });

  ac('AC-1 提案单带五段需求（want/acceptance/evidence/mode/slot/ttlRounds）',
    props.length >= 2 && withDemand.length === props.length,
    JSON.stringify({ props: props.length, ok: withDemand.length, sample: props[0] && evOf(props[0]).demand }));

  const demands = props.map(t => evOf(t).demand);
  const wants = new Set(demands.map(d => d.want));
  const slots = new Set(demands.map(d => d.slot));
  ac('AC-2 各维需求不同（want 与 slot 可区分）',
    wants.size >= 2 && slots.size >= 2 && demands.every(d => d.mode === 'semi' || d.mode === 'full'),
    JSON.stringify({ wants: [...wants], slots: [...slots] }));

  const ops = new Set(['gte', 'gt', 'improved']);
  const dims = new Set(['kq', 'ka', 'kr', 'kd', 'kc', 'overall']);
  ac('AC-3 验收判据可测（dim 与 op 都在允许集内）',
    demands.every(d => d.acceptance.length >= 1 && d.acceptance.every(a => dims.has(a.dim) && ops.has(a.op))),
    JSON.stringify(demands.map(d => d.acceptance)));

  // TTL：连续跑 verify，超过 ttlRounds 的那一轮作废
  const ttl = Number(demands[0].ttlRounds);
  const beats = [];
  for (let i = 0; i <= ttl; i++) {
    S.verifyTickets(store, { cycleId: 'cyc-618-' + i });
    const t0 = one(db, "SELECT * FROM opt_tickets WHERE id = ?", [props[0].id]);
    beats.push({ status: t0.status, beats: (evOf(t0).followup || {}).beats, reason: evOf(t0).reason });
  }
  const kept = beats.slice(0, ttl).every(b => b.status === 'proposed' && Number(b.beats) >= 1);
  const expired = beats[ttl] && beats[ttl].status === 'rejected' && /proposal-expired/.test(String(beats[ttl].reason));
  ac('AC-4 TTL 到期作废（第 ' + ttl + ' 轮后 rejected + proposal-expired）', kept && expired, JSON.stringify(beats));

  // AC-5 作废后同 (entity, dim) 可再开单
  const dead = one(db, "SELECT * FROM opt_tickets WHERE id = ?", [props[0].id]);
  const scan2 = S.scanTickets(store, { cycleId: 'cyc-618-b' });
  const reopened = all(db, "SELECT * FROM opt_tickets WHERE entity_id = ? AND dim = ? AND status IN ('open','proposed')", [dead.entity_id, dead.dim]);
  ac('AC-5 作废释放名额（同实体同维可再开单）',
    reopened.length >= 1 && scan2.created >= 1,
    JSON.stringify({ created: scan2.created, reopened: reopened.length }));

  ac('AC-6 心跳复用 6.15（未到期提案 beats 逐轮 +1）',
    beats.slice(0, ttl).every((b, i) => Number(b.beats) === i + 1),
    JSON.stringify(beats.map(b => b.beats)));

  // AC-7 分派单不走 TTL
  db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES ('t-disp','e-stale','kd','kd-low','rebond',0.2,'red','dispatched',0,'{}','c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  store._persist();
  for (let i = 0; i < ttl + 2; i++) S.verifyTickets(store, { cycleId: 'cyc-618-x' });
  const disp = one(db, "SELECT * FROM opt_tickets WHERE id='t-disp'");
  ac('AC-7 分派单不受 TTL 影响（仍由 6.15 三律管）',
    disp && disp.status === 'dispatched' && !/proposal-expired/.test(String(disp.evidence_json || '')),
    JSON.stringify({ status: disp && disp.status }));

  // AC-8 需求不完整 → 不开单
  let D = null;
  try { D = require('../src/ticket-demand.js'); } catch (_) { D = null; }
  const bad = D ? D.validateDemand({ want: '补正文' }) : { ok: true, reasons: [] };
  ac('AC-8 需求缺件不落库（校验器拦住）', D && bad.ok === false && Array.isArray(bad.reasons) && bad.reasons.length >= 1,
    JSON.stringify(bad));

  console.log(`\n----- 6.18 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
