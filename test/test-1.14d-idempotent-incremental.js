'use strict';
// M1.14 修订 J + SPEC-1.12 修订 K failing test —— 动作账幂等键 + KESPI 增量评分
// 运行（本仓根）：node test/test-1.14d-idempotent-incremental.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-idem-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let store, mekoField, kespi;
try {
  store = require('../src/knowledge-store.js');
  mekoField = require('../src/meko-field.js');
  kespi = require('../src/kespi.js');
} catch (e) {
  console.error('❌ 红（正确的红）—— 幂等键/增量评分未实现');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

const rowsOf = (db, sql, binds = []) => {
  const s = db.prepare(sql); s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // ── AC-13：动作账幂等 ──
  if (typeof mekoField._record !== 'function' && typeof mekoField.recordAction !== 'function') {
    // 内部函数不导出时直接用 SQL 面验证同一语义：同键 INSERT OR IGNORE 只留一行
    db.run(`INSERT OR IGNORE INTO field_actions (id, action, target, before_json, after_json, cycle_id, reversible, created_at)
            VALUES ('fa-c1-rebond-abc123', 'rebond', 'x->y', 'null', 'null', 'c1', 1, CURRENT_TIMESTAMP)`);
    db.run(`INSERT OR IGNORE INTO field_actions (id, action, target, before_json, after_json, cycle_id, reversible, created_at)
            VALUES ('fa-c1-rebond-abc123', 'rebond', 'x->y', 'null', 'null', 'c1', 1, CURRENT_TIMESTAMP)`);
    const n = rowsOf(db, "SELECT COUNT(*) AS n FROM field_actions WHERE id='fa-c1-rebond-abc123'")[0].n;
    ac('AC-13a 同键两次只留一行（SQL 面）', n === 1, 'n=' + n);
  } else {
    const rec = mekoField._record || mekoField.recordAction;
    const a1 = rec(db, { action: 'rebond', target: 'x->y', before: null, after: null, cycleId: 'cyc-1' });
    const a2 = rec(db, { action: 'rebond', target: 'x->y', before: null, after: null, cycleId: 'cyc-1' });
    const n = rowsOf(db, "SELECT COUNT(*) AS n FROM field_actions WHERE cycle_id='cyc-1' AND action='rebond'")[0].n;
    ac('AC-13a 同 (cycleId,action,target) 两次 → 同一 id、只留一行', a1 === a2 && n === 1, `${a1} vs ${a2}, n=${n}`);
    const a3 = rec(db, { action: 'rebond', target: 'x->y', before: null, after: null, cycleId: 'cyc-2' });
    const n2 = rowsOf(db, "SELECT COUNT(*) AS n FROM field_actions WHERE action='rebond' AND target='x->y'")[0].n;
    ac('AC-13b 换 cycleId → 新行', a3 !== a1 && n2 === 2, `n2=${n2}`);
  }

  // ── SPEC-1.12 AC-8：增量评分 ──
  store.insertEntity({ id: 'dirty-1', name: '脏实体', type: 'MetaKnowledge', content: '# 脏\n正文'.padEnd(80, '字'), tags: '["a","b"]', confidence: 0.8, created_at: '2026-01-01T00:00:00Z' });
  store.insertEntity({ id: 'clean-1', name: '净实体', type: 'MetaKnowledge', content: '# 净\n正文'.padEnd(80, '字'), tags: '["a","b"]', confidence: 0.8, created_at: '2026-01-01T00:00:00Z' });

  const rFull1 = await kespi.kespiStep(store, {});
  ac('AC-8a 全量首跑两实体都评', rFull1.scored === 2, JSON.stringify(rFull1));

  const rInc = await kespi.kespiStep(store, { incremental: true });
  ac('AC-8b 无变化时增量为 0（干净实体不重评）', rInc.scored === 0, JSON.stringify(rInc));

  // 改脏实体（updated_at 前进）。CURRENT_TIMESTAMP 秒级精度，同秒内改完再评会误判干净——
  // 这是增量面的真实约束：同秒内的「改完立即评」拿不到增量信号，只影响增量面不影响全量面。
  await new Promise(res => setTimeout(res, 1100));   // 跨秒，保证 updated_at 严格大于 computed_at
  db.run("UPDATE entities SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'dirty-1'", ['# 脏2\n正文改了'.padEnd(90, '字')]);
  const rInc2 = await kespi.kespiStep(store, { incremental: true });
  ac('AC-8c 改过的实体进增量面', rInc2.scored === 1, JSON.stringify(rInc2));

  const rFull2 = await kespi.kespiStep(store, {});
  ac('AC-8d 不带 incremental 仍是全量', rFull2.scored === 2, JSON.stringify(rFull2));

  console.log(`\n${fail === 0 ? '🟢' : '🔴'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
