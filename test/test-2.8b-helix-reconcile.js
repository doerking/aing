'use strict';
// M2 任务 2.8b failing test —— 双链互校真对返（SPEC-2.8 修订 A）
// 口径：gap 只数活跃实体；reconciled = 账本里「真把缺位补出来」的对返数，可按 cycle 圈定。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-helix-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const F = require('../src/meko-field.js');
const { HelixCrosscheck } = require('../src/meko-helix-crosscheck.js');
const call = async (fn, ...args) => { try { return await fn(...args); } catch (e) { return { error: e.message }; } };
const rowsOf = (db, sql, binds = []) => { const s = db.prepare(sql); if (binds.length) s.bind(binds); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();
  store.insertEntity({ id: 'raw-a', name: 'A', type: 'Concept', content: '甲', tolaria_strength: 5 });
  store.insertEntity({ id: 'wiki-b', name: 'B', type: 'Concept', content: '乙', tolaria_strength: 5 });
  store.insertEntity({ id: 'wiki-c', name: 'C', type: 'Concept', content: '丙', tolaria_strength: 5 });
  store.insertEntity({ id: 'raw-d', name: 'D', type: 'Concept', content: '丁', tolaria_strength: 5 });
  db.run("UPDATE entities SET invalid_at = '2026-11-01 00:00:00' WHERE id IN ('wiki-c','raw-d')");
  store._persist();

  const hx = new HelixCrosscheck(store);

  // AC-1 gap 只数活跃实体：退役位不构成 gap（否则永远补不完）
  const r1 = await call(() => hx.crosscheck());
  ac('AC-1 只数活跃', r1 && !r1.error &&
    JSON.stringify(r1.rawGaps) === JSON.stringify(['wiki-b']) &&
    JSON.stringify(r1.wikiGaps) === JSON.stringify(['raw-a']),
    JSON.stringify({ r1 }));

  // AC-2 reconciled 是真数：field 对返两条后，gap 清空且 reconciled=2
  const rec = await call(F.reconcile, store, {});
  const r2 = await call(() => hx.crosscheck());
  ac('AC-2 真对返计数', rec.reconciled === 2 && r2.reconciled === 2 &&
    r2.rawGaps.length === 0 && r2.wikiGaps.length === 0,
    JSON.stringify({ rec, r2 }));

  // AC-3 可按 cycle 圈定：新一轮对返只算本轮的账
  store.insertEntity({ id: 'raw-e', name: 'E', type: 'Concept', content: '戊', tolaria_strength: 5 });
  const rec9 = await call(F.reconcile, store, { cycleId: 'cyc-9' });
  const scope = await call(() => hx.crosscheck({ cycleId: 'cyc-9' }));
  const total = await call(() => hx.crosscheck());
  ac('AC-3 cycle 圈定', rec9.reconciled === 1 && scope.reconciled === 1 && total.reconciled === 3,
    JSON.stringify({ rec9, scope, total: total.reconciled }));

  // AC-4 只读：互校不改实体、不写账本
  const snap = () => JSON.stringify(rowsOf(db, 'SELECT id,name,type,content,status,invalid_at,updated_at FROM entities ORDER BY id'));
  const faCount = () => rowsOf(db, 'SELECT COUNT(*) AS n FROM field_actions')[0].n;
  const s0 = snap(); const f0 = faCount();
  await call(() => hx.crosscheck());
  await call(() => hx.crosscheck({ cycleId: 'cyc-9' }));
  ac('AC-4 只读', s0 === snap() && f0 === faCount(), JSON.stringify({ fa: f0, faAfter: faCount() }));

  // AC-5 铁律：源码无物理删、无写实体、无直连 store
  let src = '';
  try { src = fs.readFileSync(path.join(__dirname, '..', 'src', 'meko-helix-crosscheck.js'), 'utf8'); } catch (_) {}
  ac('AC-5 铁律', !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src) && !/INSERT\s+INTO/i.test(src) && !/require\(.*knowledge-store/.test(src),
    '源码含写语句或直连 store');

  // AC-6 形态稳定：三字段齐、reconciled 为有限数
  const r6 = await call(() => hx.crosscheck());
  ac('AC-6 形态稳定', r6 && Array.isArray(r6.rawGaps) && Array.isArray(r6.wikiGaps) && Number.isFinite(r6.reconciled),
    JSON.stringify({ r6 }));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
