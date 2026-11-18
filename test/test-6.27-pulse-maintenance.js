'use strict';
// M6 任务 6.27 failing test —— pulse 报「上次维护轮是什么时候」
// 要修的病：pulse 只知道积压与停滞，看不出自优化（L3）有没有被跑过——
// 部署方看到 backlog 也不晓得该不该开维护轮。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-maint-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const M = require('../src/memo.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const cyc = (id, type, at) => db.run("INSERT INTO meko_cycles (id,cycle_type,executed_at,status,growth,pruned) VALUES (?,?,?,'ok',1,0)", [id, type, at]);

  // AC-1 从未跑过维护轮
  cyc('c1', '代谢', '2026-11-01T00:00:00Z');
  cyc('c2', '代谢', '2026-11-02T00:00:00Z');
  store._persist();
  const m0 = await M.buildMemo(store, {});
  ac('AC-1 无维护轮 → lastMaintenanceAt 为 null',
    m0.pulse && m0.pulse.lastMaintenanceAt === null && m0.pulse.maintenanceRoundsSince === null,
    JSON.stringify(m0.pulse || null));

  // AC-2 有维护轮 → 取最新一条
  cyc('c3', '维护', '2026-11-03T00:00:00Z');
  store._persist();
  const m1 = await M.buildMemo(store, {});
  ac('AC-2 取最新维护轮时间',
    m1.pulse.lastMaintenanceAt === '2026-11-03T00:00:00Z' && m1.pulse.maintenanceRoundsSince === 0,
    JSON.stringify(m1.pulse));

  // AC-3 之后又跑 3 轮 → 距上次维护 3 轮
  cyc('c4', '代谢', '2026-11-04T00:00:00Z');
  cyc('c5', '代谢', '2026-11-05T00:00:00Z');
  cyc('c6', '代谢', '2026-11-06T00:00:00Z');
  store._persist();
  const m2 = await M.buildMemo(store, {});
  ac('AC-3 距上次维护的轮数', m2.pulse.maintenanceRoundsSince === 3, JSON.stringify(m2.pulse));

  // AC-4 「自优化」类型同样算维护轮
  cyc('c7', '自优化', '2026-11-07T00:00:00Z');
  store._persist();
  const m3 = await M.buildMemo(store, {});
  ac('AC-4 自优化轮亦算维护', m3.pulse.lastMaintenanceAt === '2026-11-07T00:00:00Z' && m3.pulse.maintenanceRoundsSince === 0,
    JSON.stringify(m3.pulse));

  // AC-5 不影响三态判定
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('e1','E','Article','x','[]','pending-distillation',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  store._persist();
  const m4 = await M.buildMemo(store, {});
  ac('AC-5 三态判定不变（有积压无停滞 → PROGRESSING）', m4.pulse.state === 'PROGRESSING', JSON.stringify(m4.pulse));

  // AC-6 纯读
  const n = () => { const s = db.prepare('SELECT COUNT(*) n FROM meko_cycles'); s.step(); const r = s.getAsObject(); s.free(); return r.n; };
  const b = n();
  await M.buildMemo(store, {});
  ac('AC-6 纯读（轮次表不变）', n() === b, String(n()));

  console.log(`\n----- 6.27 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
