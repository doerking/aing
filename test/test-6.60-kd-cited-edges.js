'use strict';
// M6 任务 6.60 failing test —— kd-cited 提案建边落地（SPEC-6.60）
// 病：6.56 声明「kd 靠 P3 候选边过闸」，实现只记账——kd-cited 回单无论写什么都唔改 kd，
// 判据永唔可能通过 → TTL 到期 proposal-expired → 下轮重开，空转。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kde-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/proposal-result.js');
const D = require('../src/ticket-demand.js');

const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };
const one = (sql, binds = []) => rows(sql, binds)[0];
const evOf = (t) => { try { return JSON.parse(t.evidence_json || '{}'); } catch (_) { return {}; } };
const countLinks = () => Number(one('SELECT COUNT(*) AS n FROM links').n);

const BASE = {
  facts: ['该实体被三处强引用，却无出向强边'],
  pointers: ['raw/inbox/kd-cited.md'],
  sourceGrade: 'high',
  selfAssessment: '已核对目标实体存在与证据可回原文'
};

const mkEnt = (id, strand = 'past') => store.insertEntity({
  id, name: id, type: 'Concept', content: '短正文', tags: '["t:7"]',
  status: 'active', confidence: 0.5, strand
});

const mkTicket = (id, ent, kind, demand, score = 0.1) => store._getDb().run(
  "INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'red','proposed',0,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
  [id, ent, 'kd', kind, 'slot', score, JSON.stringify({
    score, zone: 'red', source: 'kespi',
    readings: { kq: 0.7, ka: 0.6, kd: 0, kc: 0.6, kr: 0.6, overall: 0.5 },
    demand
  })]);

(async () => {
  await store.init(path.join(yard, 'k.db'));

  for (const [id, st] of [['e-kd', 'past'], ['e-tgt', 'past'], ['e-fut', 'future'], ['e-pst', 'past'],
    ['e-dup', 'past'], ['e-dup2', 'past'], ['e-rep', 'past'], ['e-rep2', 'past'], ['e-kq', 'past']]) mkEnt(id, st);
  // AC-5 用：已存在一条边
  store._getDb().run(
    "INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence,created_at) VALUES ('e-dup','e-dup2','pollinate-candidate',0.5,4,'[]',CURRENT_TIMESTAMP)");

  const demandKd = D.demandFor('kd-cited');
  const demandKq = D.demandFor('kq-low');
  mkTicket('t-kd', 'e-kd', 'kd-cited', demandKd);
  mkTicket('t-noev', 'e-kd', 'kd-cited', demandKd);
  mkTicket('t-f2p', 'e-fut', 'kd-cited', demandKd);
  mkTicket('t-dup', 'e-dup', 'kd-cited', demandKd);
  mkTicket('t-nf', 'e-kd', 'kd-cited', demandKd);
  mkTicket('t-rep', 'e-rep', 'kd-cited', demandKd);
  mkTicket('t-kq', 'e-kq', 'kq-low', demandKq, 0.2);
  store._persist();

  const before = one("SELECT last_access, status, confidence, invalid_at, strand FROM entities WHERE id = 'e-kd'");
  const n0 = countLinks();

  // AC-1 白名单含 kd-cited → edges（kq 两档唔动）
  ac('AC-1 WRITE_BACK 含 kd-cited: [edges]（kq-low / kq-low-narrative 仍系 content+tags）',
    JSON.stringify(R.WRITE_BACK['kd-cited']) === JSON.stringify(['edges']) &&
    JSON.stringify(R.WRITE_BACK['kq-low']) === JSON.stringify(['content', 'tags']) &&
    JSON.stringify(R.WRITE_BACK['kq-low-narrative']) === JSON.stringify(['content', 'tags']),
    JSON.stringify(R.WRITE_BACK));

  // AC-2 合格回单 → 建一条候选边
  const r1 = await R.applyProposalResult(store, 't-kd', { result: { ...BASE, edges: [{ target: 'e-tgt', evidence: ['被正文强引用'] }] } });
  const e1 = one("SELECT source_id, target_id, relation, confidence, strength, evidence FROM links WHERE source_id = 'e-kd' AND target_id = 'e-tgt'");
  ac('AC-2 kd-cited 回单建一条 pollinate-candidate 候选边（confidence 0.5 / strength 4 / evidence 为 JSON 数组）',
    !!r1.ok && !!e1 && e1.relation === 'pollinate-candidate' && e1.confidence === 0.5 && e1.strength === 4 &&
    e1.target_id === 'e-tgt' && JSON.stringify(JSON.parse(e1.evidence)) === JSON.stringify(['被正文强引用']) &&
    countLinks() === n0 + 1,
    JSON.stringify({ r1, e1, n0, n: countLinks() }));

  // AC-6 留账：applied 含 links 条目，票仍 proposed（判定权归 verifyTickets）
  const t1 = one("SELECT * FROM opt_tickets WHERE id = 't-kd'");
  const a1 = evOf(t1).applied || [];
  ac('AC-6 建边留账（applied 含 field=links 带 target/strength），票仍系 proposed',
    a1.length === 1 && a1[0].field === 'links' && a1[0].target === 'e-tgt' && Number.isFinite(Number(a1[0].strength)) &&
    !!evOf(t1).result && t1.status === 'proposed',
    JSON.stringify({ applied: a1, status: t1.status }));

  // AC-7 保护列唔动
  const after = one("SELECT last_access, status, confidence, invalid_at, strand FROM entities WHERE id = 'e-kd'");
  ac('AC-7 建边唔碰 last_access / status / confidence / invalid_at / strand（建边唔算访问事件）',
    JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify({ before, after }));

  // AC-3 无证据拒
  const n3 = countLinks();
  const r3 = await R.applyProposalResult(store, 't-noev', { result: { ...BASE, edges: [{ target: 'e-tgt', evidence: [] }] } });
  ac('AC-3 evidence 为空 → 拒 no-evidence，票标 rejected，links 零改动',
    !r3.ok && r3.reason === 'no-evidence' && countLinks() === n3 &&
    one("SELECT status FROM opt_tickets WHERE id = 't-noev'").status === 'rejected',
    JSON.stringify({ r3, n: countLinks() }));

  // AC-4 future→past 拒（应用层预检，唔靠 DB 触发器抛错）
  const n4 = countLinks();
  const r4 = await R.applyProposalResult(store, 't-f2p', { result: { ...BASE, edges: [{ target: 'e-pst', evidence: ['加工产物引原料'] }] } });
  ac('AC-4 future 源 → past 目标：拒 future-to-past，零建边',
    !r4.ok && r4.reason === 'future-to-past' && countLinks() === n4,
    JSON.stringify({ r4, n: countLinks() }));

  // AC-5 已有边幂等 skip
  const n5 = countLinks();
  const r5 = await R.applyProposalResult(store, 't-dup', { result: { ...BASE, edges: [{ target: 'e-dup2', evidence: ['重复建边'] }] } });
  ac('AC-5 已存在同向/反向边 → edge-exists 幂等 skip，links 数唔变',
    !r5.ok && r5.reason === 'edge-exists' && countLinks() === n5,
    JSON.stringify({ r5, n5, n: countLinks() }));

  // AC-10 目标唔存在拒
  const n10 = countLinks();
  const r10 = await R.applyProposalResult(store, 't-nf', { result: { ...BASE, edges: [{ target: 'nope', evidence: ['目标唔存在'] }] } });
  ac('AC-10 target 唔存在 → 拒 target-not-found，零建边',
    !r10.ok && r10.reason === 'target-not-found' && countLinks() === n10,
    JSON.stringify({ r10, n: countLinks() }));

  // AC-8 自报 relation / strength 一律忽略（唔开刷分路径）
  const r8 = await R.applyProposalResult(store, 't-rep', {
    result: { ...BASE, edges: [{ target: 'e-rep2', evidence: ['a', 'b', 'c'], relation: 'derives', strength: 9 }] }
  });
  const e8 = one("SELECT relation, strength FROM links WHERE source_id = 'e-rep' AND target_id = 'e-rep2'");
  ac('AC-8 自报 relation/strength 被忽略（落库仍系 pollinate-candidate / 按证据数定 strength）',
    !!r8.ok && !!e8 && e8.relation === 'pollinate-candidate' && e8.strength === 6,
    JSON.stringify({ r8, e8 }));

  // AC-9 kq-low 回归：正文写回照旧生效
  const LONG = '这是补写后的正文。'.repeat(60);
  const r9 = await R.applyProposalResult(store, 't-kq', { result: { ...BASE, content: LONG, tags: ['t:7', 'kq', '补齐'] } });
  ac('AC-9 kq-low 路径唔受影响（正文/标签照旧写回）',
    !!r9.ok && one("SELECT content FROM entities WHERE id = 'e-kq'").content === LONG &&
    JSON.parse(one("SELECT tags FROM entities WHERE id = 'e-kq'").tags).length === 3,
    JSON.stringify({ r9 }));

  store._persist();
  console.log(pass + '/' + (pass + fail) + ' 绿');
  if (fail > 0) process.exitCode = 1;
})().catch(e => { console.log('❌ 夹具/执行崩了 — ' + (e && e.message)); process.exitCode = 1; });
