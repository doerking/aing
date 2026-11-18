'use strict';
// M6 任务 6.21 failing test —— memo 节拍强标识（pulse）
// 要修的病：memo 读了 meko_cycles 却不判「最后动是什么时候、积压有没有在动」，
// 部署方看到的只有读数，分不清 STUCK（有活不干）与 IDLE（没活可干）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-pulse-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const M = require('../src/memo.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const count = (t) => Number((() => { const s = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`); s.step(); const r = s.getAsObject(); s.free(); return r; })().n || 0);

  const P = M.PULSE_STATES;
  ac('AC-1 导出强标识枚举', Array.isArray(P) && ['PROGRESSING', 'IDLE', 'STUCK'].every(x => P.includes(x)), JSON.stringify(P));

  // 空库：无轮次、无积压 → IDLE，绝不误报 STUCK
  const m0 = await M.buildMemo(store, {});
  const p0 = m0.pulse || {};
  ac('AC-2 空库冷启动 → IDLE（不误报 STUCK）',
    p0.state === 'IDLE' && p0.code === 'IDLE' && p0.reason === 'cold-start',
    JSON.stringify(p0));

  // 有积压 + 内核停滞计数达阈值 → STUCK，且系统行带强标识
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('e-p','P','Article','x','[]','pending-distillation',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO kernel_state (id,state,attention,stagnation_count,breaker_json,last_cycle_id,updated_at) VALUES ('kernel','stagnant',0.2,4,NULL,NULL,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES ('c1','field',CURRENT_TIMESTAMP,'ok',0,0)");
  store._persist();
  const m1 = await M.buildMemo(store, {});
  const p1 = m1.pulse || {};
  ac('AC-3 有积压 + 停滞达阈值 → STUCK，带强标识',
    p1.state === 'STUCK' && p1.code === 'STUCK' && p1.marker === '⚠' &&
    p1.stallRounds === 4 && p1.backlog >= 1 && String(m1.systemLine).startsWith('⚠ STUCK'),
    JSON.stringify({ pulse: p1, line: m1.systemLine }));

  // 有积压但不停滞 → PROGRESSING，系统行不加标识（保持干净）
  db.run("UPDATE kernel_state SET stagnation_count = 0, state = 'integrating' WHERE id = 'kernel'");
  store._persist();
  const m2 = await M.buildMemo(store, {});
  const p2 = m2.pulse || {};
  ac('AC-4 有积压但不停滞 → PROGRESSING，系统行无前导标识',
    p2.state === 'PROGRESSING' && p2.marker === '▶' && !String(m2.systemLine).startsWith('▶'),
    JSON.stringify({ pulse: p2, line: m2.systemLine }));

  // 积压清空 → IDLE（没活可干不是故障）
  db.run("UPDATE entities SET status = 'active' WHERE id = 'e-p'");
  store._persist();
  const m3 = await M.buildMemo(store, {});
  ac('AC-5 积压清空 → IDLE，健康不受影响',
    (m3.pulse || {}).state === 'IDLE' && m3.pulse.reason === 'no-backlog' && m3.pulse.backlog === 0,
    JSON.stringify(m3.pulse || {}));

  // 强标识纪律：code 恒等于 state，且 state 必属枚举；lastCycleAt 为真值
  const enumOk = [m0, m1, m2, m3].every(m => m.pulse && m.pulse.code === m.pulse.state && P.includes(m.pulse.state));
  ac('AC-6 强标识：code === state 且必属枚举', enumOk,
    JSON.stringify([m0, m1, m2, m3].map(m => m.pulse && m.pulse.state)));
  ac('AC-7 lastCycleAt 取最后一条轮次',
    (m2.pulse || {}).lastCycleAt != null && Number(m2.pulse.cyclesTotal) >= 1,
    JSON.stringify({ at: (m2.pulse || {}).lastCycleAt, total: (m2.pulse || {}).cyclesTotal }));

  // 纯读：memo 不写任何表（C16）
  const before = { e: count('entities'), c: count('meko_cycles'), k: count('kernel_state'), t: count('opt_tickets') };
  await M.buildMemo(store, {});
  const after = { e: count('entities'), c: count('meko_cycles'), k: count('kernel_state'), t: count('opt_tickets') };
  ac('AC-8 纯读（读表不扰表）', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));

  // 系统行上限仍守 80
  ac('AC-9 系统行仍 ≤ 上限', [m0, m1, m2, m3].every(m => String(m.systemLine).length <= M.SYSTEM_LINE_MAX),
    JSON.stringify([m0, m1, m2, m3].map(m => String(m.systemLine).length)));

  console.log(`\n----- 6.21 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
