'use strict';
// M6 任务 6.22 failing test —— 跟单判死改用系统轮次拍，并区分 no-beat / no-progress
// 要修的病：isStale 用 48 小时墙钟，空闲库上会误判；而且「进程没了」与「有心跳不推进」
// 混成一个 stale，处理方式完全不同（前者重派、后者换件）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-stale-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const F = require('../src/ticket-followup.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // AC-1 心跳带轮次与阶段签名
  const ev0 = JSON.stringify({ score: 0.2 });
  const beat = F.heartbeatOf(ev0, { at: '2026-11-19T00:00:00Z', round: 7, stage: 'v0.20' });
  ac('AC-1 心跳记轮次与阶段签名',
    beat.followup.beatRound === 7 && beat.followup.stageSig === 'v0.20' && beat.followup.beats === 1,
    JSON.stringify(beat.followup));

  // AC-2 同阶段连续心跳会累计 sameStage
  const beat2 = F.heartbeatOf(JSON.stringify(beat), { at: '2026-11-19T01:00:00Z', round: 8, stage: 'v0.20' });
  const beat3 = F.heartbeatOf(JSON.stringify(beat2), { at: '2026-11-19T02:00:00Z', round: 9, stage: 'v0.30' });
  ac('AC-2 同阶段累计、变阶段归零',
    beat2.followup.sameStage === 1 && beat3.followup.sameStage === 0,
    JSON.stringify({ same2: beat2.followup.sameStage, same3: beat3.followup.sameStage }));

  // AC-3 轮次拍判死：超过 maxRounds 才算断
  const r1 = F.isStale(JSON.stringify(beat), { round: 9, maxRounds: 3 });
  const r2 = F.isStale(JSON.stringify(beat), { round: 11, maxRounds: 3 });
  ac('AC-3 轮次拍：未超不判死、超过判死',
    r1.stale === false && r1.clock === 'round' && r2.stale === true && r2.clock === 'round' && r2.roundsSince === 4,
    JSON.stringify({ r1, r2 }));

  // AC-4 无轮次信息时回退墙钟（旧行为不破，但标清 clock）
  const old = JSON.stringify({ followup: { beatAt: '2026-11-17T00:00:00Z', beats: 3 } });
  const w1 = F.isStale(old, { now: '2026-11-18T00:00:00Z', maxHours: 48 });
  const w2 = F.isStale(old, { now: '2026-11-20T00:00:00Z', maxHours: 48 });
  ac('AC-4 无轮次回退墙钟并标明口径',
    w1.stale === false && w2.stale === true && w1.clock === 'wall' && w2.clock === 'wall',
    JSON.stringify({ w1, w2 }));

  // 造单：一条进程丢了（轮次断），一条有心跳不推进（同阶段累计）
  const mk = (id, ev, status = 'dispatched') => db.run(
    "INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,? ,'kc','kc-low','reconcile',0.2,'red',?,0,?,'c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, 'e-' + id, status, JSON.stringify(ev)]);
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c1','field',CURRENT_TIMESTAMP,'ok',0,0)");
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c2','field',CURRENT_TIMESTAMP,'ok',1,0)");
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c3','field',CURRENT_TIMESTAMP,'ok',1,0)");
  mk('dead', { score: 0.2, followup: { beatAt: '2026-11-19T00:00:00Z', beats: 2, beatRound: 0, stageSig: 'v0.20', sameStage: 0 } });
  mk('stuck', { score: 0.2, followup: { beatAt: '2026-11-19T00:00:00Z', beats: 8, beatRound: 3, stageSig: 'v0.20', sameStage: 5 } });
  mk('moving', { score: 0.2, followup: { beatAt: '2026-11-19T00:00:00Z', beats: 8, beatRound: 3, stageSig: 'v0.30', sameStage: 0 } });
  mk('prop', { score: 0.2, demand: {}, followup: { beatAt: '2026-11-19T00:00:00Z', beats: 8, beatRound: 0, stageSig: 'v0.20', sameStage: 5 } }, 'proposed');
  store._persist();

  // AC-5 两种失效分开报
  const rows = F.staleTickets(store, { round: 3 });
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  ac('AC-5 区分 no-beat 与 no-progress',
    byId.dead && byId.dead.kind === 'no-beat' && byId.stuck && byId.stuck.kind === 'no-progress',
    JSON.stringify(rows));

  // AC-6 正常推进不列入、proposed 不误伤
  ac('AC-6 正常件与提案单不列入',
    !byId.moving && !byId.prop, JSON.stringify(rows.map(r => r.id)));

  // AC-7 无心跳记录按 no-beat 处理
  mk('bare', { score: 0.2 });
  store._persist();
  const rows2 = F.staleTickets(store, { round: 3 });
  ac('AC-7 无心跳记录 → no-beat',
    rows2.some(r => r.id === 'bare' && r.kind === 'no-beat'), JSON.stringify(rows2));

  // AC-8 判死是纯读
  const before = Number((() => { const s = db.prepare('SELECT COUNT(*) AS n FROM opt_tickets'); s.step(); const r = s.getAsObject(); s.free(); return r; })().n);
  const snap = JSON.stringify((() => { const s = db.prepare('SELECT id,status,evidence_json FROM opt_tickets ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  F.staleTickets(store, { round: 3 });
  const after = JSON.stringify((() => { const s = db.prepare('SELECT id,status,evidence_json FROM opt_tickets ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  ac('AC-8 判死纯读（读表不扰表）', before >= 5 && snap === after, '表被改动');

  // AC-9 接线：verifyTickets 的心跳真的带上轮次与阶段签名
  const S = require('../src/self-optimize.js');
  db.run("INSERT INTO kespi_scores (entity_id,kq,ka,kd,kc,kr,overall,computed_at) VALUES ('e-wired',0.5,0.5,0.5,0.20,0.5,0.44,CURRENT_TIMESTAMP)");
  mk('wired', { score: 0.2 });
  store._persist();
  await S.verifyTickets(store, { round: 3 });
  const w = (() => { const s = db.prepare("SELECT evidence_json FROM opt_tickets WHERE id='wired'"); s.step(); const r = s.getAsObject(); s.free(); return JSON.parse(r.evidence_json); })();
  ac('AC-9 接线：心跳带 beatRound 与 stageSig',
    w.followup && w.followup.beatRound === 3 && /^v0\.20:n$/.test(String(w.followup.stageSig || '')),
    JSON.stringify(w.followup || null));

  console.log(`\n----- 6.22 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
