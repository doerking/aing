'use strict';
// M7 任务 7.1h failing test —— 锁 SPEC-7.1 AC-17（多轮只长网）
// 口径：连跑多轮——产物落 future；上轮产物过一轮即写 metabolized_at + meta；
//       已标记产物不再进加工；产物实体数不随轮次增长；重跑标记不变；
//       links 只按发芽/授粉配额有界增长（不爆炸）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-rounds-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
const { buildDefaultSteps } = require('../src/metabolism.js');

// 只跑产物/边生命周期相关的步骤，不引入 compile（读仓内 raw 目录，结果不稳）
const STEPS = ['distill', 'insight-extract', 'link-sync', 'vector', 'sprout',
  'pollinate', 'hub-trim', 'field-maintain', 'conservation'];

function rows(db, sql, b = []) { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }
function one(db, sql, b = []) { return rows(db, sql, b)[0] || null; }
function snapshot(db) {
  const ent = one(db, 'SELECT COUNT(*) AS n FROM entities');
  const past = one(db, "SELECT COUNT(*) AS n FROM entities WHERE COALESCE(strand,'past')='past'");
  const future = one(db, "SELECT COUNT(*) AS n FROM entities WHERE strand='future'");
  const links = one(db, 'SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL');
  return { entities: Number(ent.n), past: Number(past.n), future: Number(future.n), links: Number(links.n) };
}
function metaTags(db, id) {
  const r = one(db, 'SELECT tags FROM entities WHERE id = ?', [id]);
  if (!r) return -1;
  let tags = []; try { tags = JSON.parse(r.tags || '[]'); } catch (_) { tags = []; }
  return tags.filter(t => String(t).replace(/:\d+$/, '') === 'meta').length;
}

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content, tags, strand = 'past') =>
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: JSON.stringify(tags), status: 'active', confidence: 0.6, strand });

  // 原文（past）：给发芽/授粉一点物料
  put('raw-p1', '调度器把任务拆成可并行的子任务，再按预算回收。', ['调度']);
  put('raw-p2', '记忆层负责把会话原文与加工产物分开存放。', ['记忆层']);
  put('raw-p3', '检索面只认正文与派生词，不认标题。', ['检索']);
  put('raw-p4', '分仓按时间片切分，封仓后只读。', ['存储']);

  // 上轮产物（future，未标记）：本轮读过即应打标
  put('raw-insight-legacy', '条件：balanced\n动作：rebuild\n效果：+0.0100\n样本量：2 轮', ['insight'], 'future');

  // 已标记的旧产物（future + pending）：不得再被蒸馏
  put('raw-insight-old', '条件：prune-only\n动作：unwind\n效果：-0.0200\n样本量：3 轮', ['insight'], 'future');
  db.run("UPDATE entities SET metabolized_at='2026-11-17 00:00:01', status='pending-distillation' WHERE id='raw-insight-old'");
  db.run("UPDATE entities SET tags='[\"insight\",\"meta:5\"]' WHERE id='raw-insight-old'");

  // 周期账（insight-extract 的输入）：两只手能配出一对条件/动作
  const cyc = (id, growth, pruned, k) => db.run(
    `INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot, kespi_source, growth, pruned, conservation_ratio)
     VALUES (?, '代谢:round1', 'both', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'executed', ?, 'kespi_scores', ?, ?, 1)`,
    [id, k, growth, pruned]);
  cyc('c1', 2, 0, 0.500);
  cyc('c2', 0, 2, 0.550);
  cyc('c3', 1, 1, 0.600);
  const fa = (id, action, cycle) => db.run(
    'INSERT INTO field_actions (id, action, target, cycle_id, reversible, created_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)',
    [id, action, 'p1', cycle]);
  fa('fa-c1', 'rebond', 'c1');
  fa('fa-c2', 'unwind', 'c2');
  store._persist();

  const orch = new MekoOrchestrator({ store });
  for (const step of buildDefaultSteps(STEPS)) orch.registerStep(step);
  const before = snapshot(db);

  // ── 第一轮 ──
  const r1 = await orch.runCycle('代谢', { rounds: 1 });
  const s1 = snapshot(db);
  ac('AC-17a 单轮全绿', r1.ok === true && !r1.failedStep, JSON.stringify({ ok: r1.ok, failed: r1.failedStep, err: r1.results && r1.results.filter(x => !x.ok).slice(0, 3) }));

  const legacy = one(db, 'SELECT * FROM entities WHERE id = ?', ['raw-insight-legacy']);
  ac('AC-17b 上轮产物过一轮即标记',
    !!legacy && !!legacy.metabolized_at && metaTags(db, 'raw-insight-legacy') === 1,
    JSON.stringify({ at: legacy && legacy.metabolized_at, meta: metaTags(db, 'raw-insight-legacy') }));

  const insight = one(db, "SELECT * FROM entities WHERE id LIKE 'raw-insight-%' AND id NOT IN ('raw-insight-legacy','raw-insight-old')");
  ac('AC-17c 新产物落 future 档', !!insight && insight.strand === 'future', JSON.stringify({ id: insight && insight.id, strand: insight && insight.strand }));

  const oldMirror = one(db, "SELECT id FROM entities WHERE id = 'wiki-insight-old'");
  const oldRow = one(db, 'SELECT * FROM entities WHERE id = ?', ['raw-insight-old']);
  ac('AC-17d 已标记产物不再进加工',
    !oldMirror && oldRow.status === 'pending-distillation' && oldRow.metabolized_at === '2026-11-17 00:00:01',
    JSON.stringify({ mirror: oldMirror && oldMirror.id, status: oldRow.status, at: oldRow.metabolized_at }));

  // ── 第二轮（同一批输入）──
  const r2 = await orch.runCycle('代谢', { rounds: 1 });
  const s2 = snapshot(db);
  ac('AC-17e 连跑两轮产物实体数不增',
    r2.ok === true && s2.future === s1.future,
    JSON.stringify({ r1: s1.future, r2: s2.future, ok: r2.ok }));

  const legacy2 = one(db, 'SELECT * FROM entities WHERE id = ?', ['raw-insight-legacy']);
  ac('AC-17f 重跑标记不变（幂等）',
    !!legacy2 && legacy2.metabolized_at === legacy.metabolized_at && metaTags(db, 'raw-insight-legacy') === 1,
    JSON.stringify({ a: legacy.metabolized_at, b: legacy2 && legacy2.metabolized_at, meta: metaTags(db, 'raw-insight-legacy') }));

  // ── 第三轮：产物全部过完一次代谢后，实体面必须完全静止，只长边 ──
  const r3 = await orch.runCycle('代谢', { rounds: 1 });
  const s3 = snapshot(db);
  ac('AC-17g 稳态轮实体零增长（只长网）',
    r3.ok === true && s3.entities === s2.entities && s3.past === s2.past && s3.future === s2.future,
    JSON.stringify({ r2: s2, r3: s3, ok: r3.ok }));

  // 边配额：发芽 4 + 授粉 4；其余新边只能是上一代边的镜像或本轮新建实体的键，
  // 即每轮增长 ≤ 配额 + 上一轮增长 + 本轮新建实体数（不许凭空膨胀，也不许逐轮放大）
  const QUOTA = 8;
  const inc = [s1.links - before.links, s2.links - s1.links, s3.links - s2.links];
  const newEnt = [s1.entities - before.entities, s2.entities - s1.entities, s3.entities - s2.entities];
  const bounded = inc.every((x, i) => x >= 0 && x <= QUOTA + (i ? inc[i - 1] : 0) + newEnt[i]);
  ac('AC-17h links 只按发芽/授粉配额有界增长',
    bounded && inc[2] >= 0,
    JSON.stringify({ inc, newEnt, links: [before.links, s1.links, s2.links, s3.links] }));

  console.log(`\n----- 7.1h pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); console.error(e.stack); process.exit(1); });
