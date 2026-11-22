'use strict';
// M6 任务 6.61 failing test —— P3 位寄生承接（SPEC-6.61）
// 病：P3 位有声明、claimable 有取单口，但冇承接者——kd-cited 单落库后停在 proposed，
// 只等 TTL 到期 proposal-expired。可达性 8/8 系手工模拟出来的，唔系系统自己跑出来的。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-p3r-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const P = require('../src/parasite-slot.js');
const T = require('../tools/parasite-round.js');
const D = require('../src/ticket-demand.js');
const K = require('../src/kespi.js');
const R = require('../src/parasite-runner.js');

const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };
const one = (sql, binds = []) => rows(sql, binds)[0];
const countLinks = () => Number(one('SELECT COUNT(*) AS n FROM links').n);
const entState = (id) => one('SELECT status, confidence, invalid_at, strand, last_access FROM entities WHERE id = ?', [id]);

const mkEnt = (id) => store.insertEntity({
  id, name: id, type: 'Concept', content: '短正文', tags: '["t:7"]',
  status: 'active', confidence: 0.5, strand: 'past'
});

const mkTicket = (id, ent) => store._getDb().run(
  "INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'red','proposed',0,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
  [id, ent, 'kd', 'kd-cited', 'slot', 0.1, JSON.stringify({
    score: 0.1, zone: 'red', source: 'kespi',
    readings: { kq: 0.7, ka: 0.6, kd: 0, kc: 0.6, kr: 0.6, overall: 0.5 },
    demand: D.demandFor('kd-cited')
  })]);

(async () => {
  await store.init(path.join(yard, 'k.db'));

  for (const id of ['e-citer', 'e-cited', 'e-nocit', 'f1', 'f2', 'f3', 'f4']) mkEnt(id);
  // e-citer 强引用 e-cited（e-cited 系「被引用唔催化」：kd = 出向强边/3 = 0）
  store._getDb().run(
    "INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence,created_at) VALUES ('e-citer','e-cited','hydrogen-bond',0.8,7,'[]',CURRENT_TIMESTAMP)");
  // 4 条「早建、近期退役」的候选边：只计入边退、唔计入边产，把 conservation 拉回带内
  for (const pair of ["'f1','f2'", "'f2','f3'", "'f3','f4'", "'f4','f1'"]) store._getDb().run(
    `INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence,created_at,invalid_at) VALUES (${pair},'pollinate-candidate',0.5,4,'[]',datetime('now','-35 days'),CURRENT_TIMESTAMP)`);

  mkTicket('t-kdc', 'e-cited');
  mkTicket('t-none', 'e-nocit');   // 无入向强边：外部件拒 no-evidence

  const before = entState('e-cited');

  // AC-1：外部件注册声明 P3/full，claimable 取走 kd-cited 单
  ac('AC-1 外部件注册声明 P3/full', T.EDGES_REG && T.EDGES_REG.slot === 'P3' && T.EDGES_REG.mode === 'full',
    JSON.stringify(T.EDGES_REG || null));
  const list = P.claimable(store, T.EDGES_REG, {});
  ac('AC-1 claimable 取走 kd-cited 提案单', list.some(t => t.id === 't-kdc'), '取到 ' + list.map(t => t.id).join(','));

  // AC-5：外部件唔写库——只产回单
  const claim = list.find(t => t.id === 't-kdc');
  const nBefore = countLinks();
  const ret = T.externalPartEdges(store._getDb(), claim, { round: 1 });
  ac('AC-5 外部件唔写库（links 数前后一致）', countLinks() === nBefore && !!ret && !!ret.result,
    'links ' + nBefore + ' → ' + countLinks());
  const edges = ret && ret.result && ret.result.edges;
  ac('AC-5 回单指向入向强边来源（镜像）', Array.isArray(edges) && edges.some(e => e.target === 'e-citer'), JSON.stringify(edges));

  // AC-6：无入向强边 → 外部件返 null，runner 记 no-return 而唔抛错
  ac('AC-6 无入向强边时外部件返 null', T.externalPartEdges(store._getDb(), list.find(t => t.id === 't-none'), { round: 1 }) === null);

  // AC-2：一轮 runP3Once —— 建候选边 → 提升 → 重算 → 验收
  const out = await R.runP3Once(store, { round: 1 });
  const applied = rows("SELECT * FROM opt_tickets WHERE id = 't-kdc'")[0];
  const ev = JSON.parse(applied.evidence_json || '{}');
  const built = rows("SELECT relation, strength FROM links WHERE source_id = 'e-cited' AND target_id = 'e-citer'");
  ac('AC-2 一轮后建咗边（e-cited → e-citer）', built.length === 1, '建到 ' + built.length + ' 条，reason=' + (ev.reason || '-'));
  ac('AC-2 边已提升成强边（hydrogen-bond@7）', built.length === 1 && built[0].relation === 'hydrogen-bond' && Number(built[0].strength) === 7,
    JSON.stringify(built[0] || null));
  await K.kespiStep(store, { round: 1 });
  const ks = one('SELECT kd FROM kespi_scores WHERE entity_id = ?', ['e-cited']);
  ac('AC-2 重算后 kd > 0 且过 acceptance（>= 0.30）', ks && Number(ks.kd) >= 0.30, JSON.stringify(ks || null));
  const after = one("SELECT status FROM opt_tickets WHERE id = 't-kdc'");
  ac('AC-2 票已 verified', after && after.status === 'verified', JSON.stringify(after || null));

  // AC-3：幂等——第二轮唔再领该单、唔再建边
  const nMid = countLinks();
  const out2 = await R.runP3Once(store, { round: 2 });
  ac('AC-3 第二轮唔再领 t-kdc（已 verified）', !out2.claimed.some(c => c.id === 't-kdc'),
    JSON.stringify(out2.claimed));
  ac('AC-3 第二轮 links 数唔变', countLinks() === nMid, nMid + ' → ' + countLinks());

  // AC-6：runner 对无入向强边嘅单记 no-return，唔抛错
  ac('AC-6 runner 记 no-return 而唔抛错', out.returned.some(r => r.id === 't-none' && r.error === 'no-return'),
    JSON.stringify(out.returned));

  // AC-4：铁律五字段前后唔变
  const fin = entState('e-cited');
  ac('AC-4 铁律：last_access / status / confidence / invalid_at / strand 唔变',
    JSON.stringify(before) === JSON.stringify(fin), JSON.stringify({ before, fin }));

  console.log('\n6.61: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('6.61 崩: ' + e.message); console.error(e.stack); process.exitCode = 1; });
