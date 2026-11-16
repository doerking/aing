'use strict';
// M1 任务 1.13 failing test —— 锁 SPEC-1.13 prune 逻辑退役六条 AC
// 运行（本仓根）：node test/test-1.13-prune.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-prune-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

let prune, store;
try {
  prune = require('../src/prune.js');
  store = require('../src/knowledge-store.js');
} catch (e) {
  console.error('❌ 红（正确的红）—— src/prune.js 未实现 SPEC-1.13');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  // SPEC-1.13 修订 A / SPEC-6.11：分层判据——短料层按窗，知识层不按时间退
  const ins = (id, type) => store.insertEntity({ id, name: id, type: type, content: 'c-' + id, status: 'active', confidence: 0.5 });
  ins('low', 'Conversation'); ins('mid', 'Conversation'); ins('high', 'Conversation'); ins('know', 'Concept');
  const db = store._getDb();
  // 统一置为久未访问（last_access NULL，strength 由列表驱动）
  db.run("UPDATE entities SET tolaria_strength = 3 WHERE id='low'");
  db.run("UPDATE entities SET created_at='2020-01-01 00:00:00', updated_at='2020-01-01 00:00:00' WHERE id IN ('low','know')");
  db.run("UPDATE entities SET tolaria_strength = 5 WHERE id='mid'");
  db.run("UPDATE entities SET tolaria_strength = 7 WHERE id='high'");
  store._persist();

  // AC-1 候选只取短料层且到窗
  const dry = await prune.pruneCycle(store, { dryRun: true, inactiveDays: 90 });
  ac('AC-1 候选只取短料层且到窗', JSON.stringify(dry.candidates) === JSON.stringify(['low']), JSON.stringify(dry.candidates));

  // AC-2 dry-run 零写
  const before = store.getEntity('low');
  ac('AC-2 dry-run 零写', before.invalid_at == null && dry.retired == null);

  // AC-3 退役可逆
  const r = await prune.retireEntity(store, 'low');
  const afterRetire = store.getEntity('low');
  const revived = await prune.reviveEntity(store, 'low');
  const afterRevive = store.getEntity('low');
  ac('AC-3 退役打戳 + 复活清戳 + 内容不变',
    afterRetire.invalid_at != null && afterRevive.invalid_at == null && afterRevive.content === afterRetire.content,
    `retire:${JSON.stringify(r)}`);

  // AC-4 幂等：重复 retire 不报错；同参数连跑两趟，第二趟 retired 为空
  await prune.retireEntity(store, 'mid'); // mid 非候选（strength 5），只测重复 retire 幂等
  let noThrow = true;
  try { await prune.retireEntity(store, 'mid'); } catch (e) { noThrow = false; }
  const run1 = await prune.pruneCycle(store, { dryRun: false, inactiveDays: 90 });
  const run2 = await prune.pruneCycle(store, { dryRun: false, inactiveDays: 90 });
  ac('AC-4 幂等：重复 retire 不报错 + 第二趟 retired 空',
    noThrow && run1.retired.includes('low') && run2.retired.length === 0,
    JSON.stringify({ run1: run1.retired, run2: run2.retired }));

  // AC-5 禁物理删
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'prune.js'), 'utf8');
  const rows = (() => { const s = db.prepare('SELECT COUNT(*) AS n FROM entities'); s.step(); const n = s.getAsObject().n; s.free(); return n; })();
  ac('AC-5 无 DELETE FROM + 行数不变', !/DELETE\s+FROM/i.test(src) && rows === 4, `rows=${rows}`);

  // AC-6 活跃保护
  db.run("UPDATE entities SET last_access = CURRENT_TIMESTAMP WHERE id='mid'");
  db.run("UPDATE entities SET invalid_at = NULL WHERE id='mid'");
  store._persist();
  const dry2 = await prune.pruneCycle(store, { dryRun: true, inactiveDays: 90 });
  ac('AC-6 新近访问实体唔入选', !dry2.candidates.includes('mid'), JSON.stringify(dry2.candidates));

  // AC-7 知识层不按时间退役（SPEC-6.11 四件判据 + 分层）
  const dry3 = await prune.pruneCycle(store, { dryRun: true, inactiveDays: 90 });
  ac('AC-7 知识层不随时间退役', !dry3.candidates.includes('know'), JSON.stringify(dry3.candidates));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
