'use strict';
// M2 任务 2.10 failing test —— 锁 SPEC-2.10 守恒闸六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cons-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let conservation, store;
try {
  conservation = require('../src/conservation.js');
  store = require('../src/knowledge-store.js');
  if (typeof conservation.measureConservation !== 'function') throw new Error('measureConservation 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/conservation.js 未实现 SPEC-2.10'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // —— AC-1..3 用纯造数（闸只读数，不该被造数方式影响）
  const mk = (id) => store.insertEntity({ id, name: id, type: 'Concept', content: '守恒样本内容' + id, status: 'active', confidence: 0.5 });
  for (let i = 0; i < 6; i++) mk('g' + i);
  for (let i = 0; i < 4; i++) store.insertLink({ source_id: 'g' + i, target_id: 'g' + ((i + 1) % 6), relation: 'sprout-candidate' });
  for (const id of ['g2', 'g3', 'g4', 'g5']) db.run(`UPDATE entities SET invalid_at = datetime('now') WHERE id='${id}'`);
  store._persist();
  const m1 = conservation.measureConservation(store, {});
  ac('AC-1 带内判 balanced', m1.growth === 4 && m1.pruned === 4 && m1.ratio === 1 && m1.inBand === true && m1.verdict === 'balanced', JSON.stringify(m1));

  // 只长不剪
  db.run("UPDATE entities SET invalid_at = NULL WHERE id LIKE 'g%'");
  store._persist();
  const m2 = conservation.measureConservation(store, {});
  ac('AC-2 只长不剪告警', m2.pruned === 0 && m2.verdict === 'growth-only' && m2.inBand === false, JSON.stringify(m2));

  // 只剪不长：清掉候选边（改为不重要关系 = 不计产出）
  db.run("UPDATE links SET relation='hydrogen-bond'");
  db.run("UPDATE entities SET invalid_at = datetime('now') WHERE id LIKE 'g%'");
  store._persist();
  const m3 = conservation.measureConservation(store, {});
  ac('AC-3 只剪不长告警', m3.growth === 0 && m3.pruned === 6 && m3.ratio === 0 && m3.verdict === 'prune-only', JSON.stringify(m3));

  // —— AC-4 长跑 36 轮：每轮新料 6 个 + 发芽 + 退场 4
  const sprint = require('../src/recycle.js') && require('../src/sprout.js');
  const rounds = 36;
  const seededEach = [];
  for (let r = 0; r < rounds; r++) {
    for (let j = 0; j < 6; j++) {
      const id = `r${r}-${j}`;
      store.insertEntity({ id, name: '轮料' + id, type: 'Concept', tags: '["共现主题:7"]',
        content: '时界场域双链守恒发芽授粉' + '轮次' + r + '样本' + r, status: 'active', confidence: 0.5 });
    }
    const s = await sprint.sproutStep(store, { floor: 2, cap: 4 });
    seededEach.push(s.seeded);
    // 退场：本轮最旧的 4 个有效实体
    db.run(`UPDATE entities SET invalid_at = datetime('now') WHERE id IN (
      SELECT id FROM entities WHERE invalid_at IS NULL ORDER BY created_at ASC, rowid ASC LIMIT 4)`);
    store._persist();
  }
  const allIn = seededEach.every(n => n >= 2 && n <= 4);
  const mEnd = conservation.measureConservation(store, { sinceDays: 3650 });
  ac('AC-4 36 轮每轮产出 2-4 且累计守恒在带内', allIn && mEnd.inBand && mEnd.ratio >= 0.8 && mEnd.ratio <= 1.5,
    JSON.stringify({ seededEach: seededEach.slice(0, 5), tail: seededEach.slice(-3), mEnd }));

  // —— AC-5 编排器每轮落盘
  const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
  const orch = new MekoOrchestrator({ store });
  await orch.runCycle('守恒', { rounds: 1 });
  const cyc = rows("SELECT * FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 1")[0];
  const mm = conservation.measureConservation(store, {});
  ac('AC-5 每轮落盘三列且与计量一致',
    cyc && cyc.growth != null && cyc.pruned != null && cyc.conservation_ratio != null &&
    Number(cyc.growth) === mm.growth && Number(cyc.conservation_ratio) === mm.ratio,
    JSON.stringify({ cyc, mm }));

  const before = { e: rows('SELECT COUNT(*) AS n FROM entities')[0].n, l: rows('SELECT COUNT(*) AS n FROM links')[0].n };
  conservation.measureConservation(store, {});
  await conservation.conservationStep(store, {});
  const after = { e: rows('SELECT COUNT(*) AS n FROM entities')[0].n, l: rows('SELECT COUNT(*) AS n FROM links')[0].n };
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'conservation.js'), 'utf8');
  ac('AC-6 闸不擅改 + 无写语句',
    after.e === before.e && after.l === before.l && !/INSERT\s+INTO|UPDATE\s+[a-z_]+\s+SET|DELETE\s+FROM/i.test(src),
    JSON.stringify({ before, after }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
