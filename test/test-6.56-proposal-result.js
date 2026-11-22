'use strict';
// M6 任务 6.56 failing test —— 回单落地（SPEC-6.56）
// 要修的病：外部件交了回单，只落了 evidence_json.result，实体一字未动——
// 判据永远不过，单照旧 TTL 作废。P6 的 writeBack 声明只有半截实现。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-res-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/proposal-result.js');
const K = require('../src/kespi.js');
const SO = require('../src/self-optimize.js');

const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };
const one = (sql, binds = []) => rows(sql, binds)[0];
const evOf = (t) => { try { return JSON.parse(t.evidence_json || '{}'); } catch (_) { return {}; } };

const LONG = '这是补写后的正文。'.repeat(60); // > 400 字
const FACTS = ['该实体正文已补齐至 400 字以上', '标签补到 3 个'];
const POINTERS = ['raw/inbox/kq-low.md'];
const GOOD = { content: LONG, tags: ['t:7', 'kq', '补齐'], facts: FACTS, pointers: POINTERS, sourceGrade: 'high', selfAssessment: '已按需求核对字数与标签数' };

const mkTicket = (id, entityId, dim, kind, action, score, evidence) => store._getDb().run(
  "INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'red','proposed',0,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
  [id, entityId, dim, kind, action, score, JSON.stringify(evidence)]);

(async () => {
  await store.init(path.join(yard, 'k.db'));

  const mkEnt = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '["t:7"]', status: 'active', confidence: 0.5 });
  for (const id of ['e-kq', 'e-short', 'e-gate', 'e-same', 'e-kd', 'e-term']) mkEnt(id, '短正文');
  // 每张单带同一份 demand（kq-low）
  const demandKq = require('../src/ticket-demand.js').demandFor('kq-low');
  const mk = (id, ent, kind, action, demand, score = 0.2) =>
    mkTicket(id, ent, 'kq', kind, action, score, { score, zone: 'red', source: 'kespi', readings: { kq: 0.2, ka: 0.6, kd: 0.5, kc: 0.6, kr: 0.6, overall: 0.5 }, demand });
  mk('t-kq', 'e-kq', 'kq-low', 'slot', demandKq);
  mk('t-short', 'e-short', 'kq-low', 'slot', demandKq);
  mk('t-gate', 'e-gate', 'kq-low', 'slot', demandKq);
  mk('t-same', 'e-same', 'kq-low', 'slot', demandKq);
  store._getDb().run("UPDATE entities SET content = ? WHERE id = 'e-same'", [LONG]);
  mk('t-kd', 'e-kd', 'kd-cited', 'slot', require('../src/ticket-demand.js').demandFor('kd-cited'), 0.1);
  mk('t-term', 'e-term', 'kq-low', 'slot', demandKq);
  store._getDb().run("UPDATE opt_tickets SET status = 'verified' WHERE id = 't-term'");
  store._getDb().run("UPDATE entities SET last_access = '2026-11-01 00:00:00' WHERE id = 'e-kq'");
  store._persist();

  // AC-1 kq 合格回单 → 写回内容与标签，且不碰 last_access
  const r1 = await R.applyProposalResult(store, 't-kq', { result: GOOD });
  const e1 = one("SELECT content, tags, last_access, status, confidence FROM entities WHERE id = 'e-kq'");
  const t1 = one("SELECT * FROM opt_tickets WHERE id = 't-kq'");
  const a1 = (evOf(t1).applied || []);
  ac('AC-1 kq 合格回单 → 正文/标签写回，applied 记账，last_access 不变',
    !!r1.ok && e1.content === LONG && JSON.parse(e1.tags).length >= 3 &&
    e1.last_access === '2026-11-01 00:00:00' && e1.confidence === 0.5 && e1.status === 'active' &&
    a1.length === 2 && a1.every(x => x.field && x.digest) && !!evOf(t1).result,
    JSON.stringify({ r1, e1, applied: a1 }));

  // AC-2 正文过短 → 拒且实体不变
  const r2 = await R.applyProposalResult(store, 't-short', { result: { ...GOOD, content: '太短' } });
  const e2 = one("SELECT content FROM entities WHERE id = 'e-short'");
  const t2 = one("SELECT status FROM opt_tickets WHERE id = 't-short'");
  ac('AC-2 正文 < 400 字 → 拒 content-too-short，票标 rejected',
    !r2.ok && r2.reason === 'content-too-short' && e2.content === '短正文' && t2.status === 'rejected',
    JSON.stringify({ r2, e2, t2 }));

  // AC-3 发布门不过 → 不落地
  const r3 = await R.applyProposalResult(store, 't-gate', { result: { ...GOOD, selfAssessment: '' } });
  const e3 = one("SELECT content FROM entities WHERE id = 'e-gate'");
  const t3 = one("SELECT status FROM opt_tickets WHERE id = 't-gate'");
  ac('AC-3 缺自评 → 过不了发布门、不落地、票标 rejected',
    !r3.ok && /^gate:/.test(String(r3.reason)) && e3.content === '短正文' && t3.status === 'rejected',
    JSON.stringify({ r3, e3, t3 }));

  // AC-4 正文与现文相同 → no-change，票仍 proposed
  const r4 = await R.applyProposalResult(store, 't-same', { result: GOOD });
  const t4 = one("SELECT status FROM opt_tickets WHERE id = 't-same'");
  ac('AC-4 逐字相同 → no-change，票不动',
    !r4.ok && r4.reason === 'no-change' && t4.status === 'proposed',
    JSON.stringify({ r4, t4 }));

  // AC-6 kd-cited 唔走正文写回（正文路径只对 kq-* 开放；建边系 SPEC-6.60 的 edges 路径）
  const e6b = one("SELECT content FROM entities WHERE id = 'e-kd'");
  const r6 = await R.applyProposalResult(store, 't-kd', { result: { ...GOOD, content: '任意' } });
  const e6a = one("SELECT content FROM entities WHERE id = 'e-kd'");
  const t6 = one("SELECT * FROM opt_tickets WHERE id = 't-kd'");
  ac('AC-6 kd-cited 唔走正文写回：无 edges 的回单 → 实体正文零变化（建边路径见 SPEC-6.60）',
    e6b.content === e6a.content && !!evOf(t6).result && (!r6.ok || (Array.isArray(r6.applied) && r6.applied.length === 0)),
    JSON.stringify({ r6, before: e6b, after: e6a }));

  // AC-7 不存在 / 已终态 → 拒且零写入
  const r7a = await R.applyProposalResult(store, 'no-such', { result: GOOD });
  const r7b = await R.applyProposalResult(store, 't-term', { result: GOOD });
  ac('AC-7 不存在 / 已终态 → 拒且零写入',
    !r7a.ok && r7a.reason === 'ticket-not-found' &&
    !r7b.ok && r7b.reason === 'terminal-state' &&
    one("SELECT content FROM entities WHERE id = 'e-term'").content === '短正文',
    JSON.stringify({ r7a, r7b }));

  // AC-5 落地后 kespi + verify → verified
  await K.kespiStep(store, {});
  const kq = Number(one("SELECT kq FROM kespi_scores WHERE entity_id = 'e-kq'").kq);
  const v = await SO.verifyTickets(store, { round: 1 });
  const t5 = one("SELECT status FROM opt_tickets WHERE id = 't-kq'");
  ac('AC-5 落地后 kespi + verify → verified',
    kq >= 0.5 && t5.status === 'verified' && v.verified.some(x => x.id === 't-kq'),
    JSON.stringify({ kq, t5, verified: v.verified.map(x => x.id) }));

  console.log(`\n----- 6.56 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
