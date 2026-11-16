'use strict';
// M6 任务 6.9b failing test —— 锁 SPEC-6.9b 星闪真接八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-starlink69b-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let S, O, LR;
try {
  S = require('../src/meko-starlink-orchestrator.js').StarlinkOrchestrator;
  O = require('../src/meko-orchestrator.js').MekoOrchestrator;
  LR = require('../src/lineage-reflect.js');
  if (typeof S !== 'function' || typeof O !== 'function' || typeof LR.kespiTrend !== 'function') throw new Error('契约未齐');
} catch (e) {
  console.error('❌ 红（正确的红）—— 6.9b 星闪真接未实现'); console.error('   ' + e.message.split('\n')[0]); process.exit(1);
}

const rows = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const one = (db, sql, b = []) => rows(db, sql, b)[0] || null;
const cols = (db, t) => rows(db, `PRAGMA table_info(${t})`).map(r => r.name);
const step = (id, budgetTick, fn) => ({ id, strand: 'raw', band: 'field', reads: [], writes: [], budgetTick, reversible: true, onCycle: fn });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const db1 = path.join(yard, 'one.db');
  await store.init(db1);
  let db = store._getDb();
  const insE = db.prepare(`INSERT INTO entities
    (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at,last_access)
    VALUES (?,?, 'Concept', '正文', '[]', 'active', 0.5, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
  insE.run(['raw-a', 'A']); insE.run(['raw-b', 'B']); insE.free();
  db.run("INSERT INTO kespi_scores (entity_id, overall) VALUES ('raw-a', 0.8)");
  db.run("INSERT INTO kespi_scores (entity_id, overall) VALUES ('raw-b', 0.6)");
  store._persist();

  const so = new S(store);
  const ms = (type, pending = 0, ticks = 0) => so.computeDeterministicDeadline(type, pending, ticks).getTime() - Date.now();

  // ── AC-1 运算类 base + 未知类型不再 3 秒 ────────────────
  const met = ms('代谢'), unk = ms('未知类型'), dna = ms('解旋');
  ac('AC-1 运算类/未知 base ≥120s，DNA 原值不变',
    met >= 119000 && unk >= 119000 && dna >= 900 && dna <= 2000,
    JSON.stringify({ met, unk, dna }));

  // ── AC-2 契约 budgetTick 求和抬升 T_bound ──────────────
  const orchA = new O({ store });
  orchA.registerStep(step('s3', 3, async () => ({ ok: true })));
  orchA.registerStep(step('s2', 2, async () => ({ ok: true })));
  const declared = orchA.steps.reduce((a, s) => a + s.budgetTick, 0);
  const budget = orchA._deadlineMs('解旋', 0, declared);
  ac('AC-2 declaredTicks 抬升预算（1s base + 5 tick → ≥5s）',
    declared === 5 && budget >= 4900, JSON.stringify({ declared, budget }));

  // ── AC-3 分步软配额（超了标记，不中断）──────────────────
  const orchB = new O({ store });
  orchB.registerStep(step('slow', 1, async () => { await sleep(1200); return { ok: true }; }));
  const slowRun = await orchB.runCycle('解旋', { rounds: 1, budgetMs: 10000 });
  const slowRes = slowRun.results.find(r => r.id === 'slow');
  ac('AC-3 超软配额标 overBudget，本轮仍 ok',
    slowRun.ok === true && slowRes && slowRes.overBudget === true && slowRes.quotaMs === 1000 && slowRes.elapsedMs >= 1100,
    JSON.stringify(slowRes));

  // ── AC-4 真 KESPI 探针 ─────────────────────────────────
  const probe = await so.probeTopologyHealth();
  ac('AC-4 探针返回真均值与来源',
    probe.kespiSnapshot === 0.7 && probe.source === 'kespi_scores' && probe.scored === 2,
    JSON.stringify(probe));

  // ── AC-5 编排器写回真值 + 来源 ─────────────────────────
  const orchC = new O({ store });
  orchC.registerStep(step('noop', 1, async () => ({ ok: true })));
  await orchC.runCycle('解旋', { rounds: 1, budgetMs: 10000 });
  const last = one(db, 'SELECT * FROM meko_cycles ORDER BY rowid DESC LIMIT 1');
  ac('AC-5 meko_cycles 写真值 + kespi_source',
    last && Number(last.kespi_snapshot) === 0.7 && last.kespi_source === 'kespi_scores',
    JSON.stringify(last && { k: last.kespi_snapshot, src: last.kespi_source }));

  // ── AC-6 无 KESPI → 占位且标记来源 ─────────────────────
  await store.init(path.join(yard, 'two.db'));
  db = store._getDb();
  const so2 = new S(store);
  const probe2 = await so2.probeTopologyHealth();
  const orchD = new O({ store });
  orchD.registerStep(step('noop2', 1, async () => ({ ok: true })));
  await orchD.runCycle('解旋', { rounds: 1, budgetMs: 10000 });
  const last2 = one(db, 'SELECT * FROM meko_cycles ORDER BY rowid DESC LIMIT 1');
  ac('AC-6 无读数写占位 + placeholder 标记',
    probe2.kespiSnapshot === null && probe2.source === 'none' &&
    last2 && last2.kespi_snapshot != null && last2.kespi_source === 'placeholder',
    JSON.stringify({ probe2, k: last2 && last2.kespi_snapshot, src: last2 && last2.kespi_source }));

  // ── AC-7 反思走势只吃真读数 ────────────────────────────
  let trend = null;
  try {
    const insC = db.prepare(`INSERT INTO meko_cycles (id,cycle_type,kespi_snapshot,kespi_source,executed_at,status)
      VALUES (?,?,?,?,?, 'executed')`);
    insC.run(['c-legacy', '维护', 0.5, 'placeholder', '2026-11-16T00:00:00.000Z']);
    insC.run(['c-real1', '维护', 0.7, 'kespi_scores', '2026-11-16T01:00:00.000Z']);
    insC.run(['c-real2', '维护', 0.9, 'kespi_scores', '2026-11-16T02:00:00.000Z']);
    insC.free();
    trend = LR.kespiTrend(db, 5);
  } catch (_) { trend = null; }
  ac('AC-7 走势排除占位/NULL', trend === 0.2, JSON.stringify({ trend }));

  // ── AC-8 幂等补列 + 无删 + 双链零变化 ──────────────────
  const hasCol = cols(db, 'meko_cycles').includes('kespi_source');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'meko-starlink-orchestrator.js'), 'utf8');
  const e0 = JSON.stringify(rows(db, 'SELECT * FROM entities'));
  const l0 = JSON.stringify(rows(db, 'SELECT * FROM links'));
  await orchD.runCycle('解旋', { rounds: 1, budgetMs: 10000 });
  const e1 = JSON.stringify(rows(db, 'SELECT * FROM entities'));
  const l1 = JSON.stringify(rows(db, 'SELECT * FROM links'));
  ac('AC-8 补列/无删/双链零变化',
    hasCol && !/DELETE\s+FROM/i.test(src) && e0 === e1 && l0 === l1,
    JSON.stringify({ hasCol, entities: e0 === e1, links: l0 === l1 }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
