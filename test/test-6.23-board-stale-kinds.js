'use strict';
// M6 任务 6.23 failing test —— 回单屏分两种失效：no-beat（进程没了）与 no-progress（在跑不推进）
// 要修的病：6.16 屏只显示「心跳 xx（N 拍）」，判死口径改成轮次拍之后，
// 屏上仍看不出「没人拍」与「有人拍但没进展」——两种处理完全不同，不能混成一句。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-board2-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const B = require('../src/ticket-board.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c1','field',CURRENT_TIMESTAMP,'ok',1,0)");
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c2','field',CURRENT_TIMESTAMP,'ok',1,0)");
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c3','field',CURRENT_TIMESTAMP,'ok',1,0)");
  const mk = (id, ev) => db.run(
    "INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,? ,'ka','ka-low','rebond',0.2,'red','dispatched',0,?,'c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, 'e-' + id, JSON.stringify(ev)]);
  mk('t-ok', { score: 0.2, followup: { beatAt: '2026-11-19T00:00:00Z', beats: 4, beatRound: 3, stageSig: 'v0.20:r', sameStage: 0 } });
  mk('t-dead', { score: 0.2, followup: { beatAt: '2026-11-19T00:00:00Z', beats: 2, beatRound: 0, stageSig: 'v0.20:r', sameStage: 0 } });
  mk('t-stuck', { score: 0.2, followup: { beatAt: '2026-11-19T00:00:00Z', beats: 9, beatRound: 3, stageSig: 'v0.20:r', sameStage: 4 } });
  mk('t-bare', { score: 0.2 });
  store._persist();

  const board = B.boardOf(store, { round: 3 });
  const pend = (board.sections.find(s => s.key === 'pending') || { rows: [] }).rows;
  const by = Object.fromEntries(pend.map(r => [r.id, r]));

  ac('AC-1 正常心跳标 ok',
    by['t-ok'] && by['t-ok'].kind === 'ok' && by['t-ok'].beats === 4,
    JSON.stringify(by['t-ok'] || null));

  ac('AC-2 轮次断 → no-beat（带未拍轮数）',
    by['t-dead'] && by['t-dead'].kind === 'no-beat' && by['t-dead'].note === '无心跳' && by['t-dead'].roundsSince === 3,
    JSON.stringify(by['t-dead'] || null));

  ac('AC-3 有拍不推进 → no-progress（带同阶段拍数）',
    by['t-stuck'] && by['t-stuck'].kind === 'no-progress' && by['t-stuck'].sameStage === 4,
    JSON.stringify(by['t-stuck'] || null));

  ac('AC-4 无心跳记录 → no-beat',
    by['t-bare'] && by['t-bare'].kind === 'no-beat', JSON.stringify(by['t-bare'] || null));

  ac('AC-5 汇总分开计数（强标识）',
    board.summary.noBeat === 2 && board.summary.noProgress === 1,
    JSON.stringify({ noBeat: board.summary.noBeat, noProgress: board.summary.noProgress }));

  const text = (board.lines || []).join('\n');
  ac('AC-6 屏上两种失效可分辨',
    /⚠ 无心跳/.test(text) && /⏳ 无进展/.test(text) && /轮未拍/.test(text) && /同阶段 4 拍/.test(text),
    text);

  const r7 = B.boardOf(store, { round: 10 });
  const dead7 = (r7.sections.find(s => s.key === 'pending').rows || []).find(r => r.id === 't-dead');
  ac('AC-7 轮次由调用方指定即按指定算',
    dead7 && dead7.roundsSince === 10, JSON.stringify(dead7 || null));

  const snap = JSON.stringify((() => { const s = db.prepare('SELECT id,status,evidence_json,updated_at FROM opt_tickets ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  B.boardOf(store, { round: 3 });
  const snap2 = JSON.stringify((() => { const s = db.prepare('SELECT id,status,evidence_json,updated_at FROM opt_tickets ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  ac('AC-8 屏是纯读（读表不扰表）', snap === snap2, '表被改动');

  console.log(`\n----- 6.23 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
