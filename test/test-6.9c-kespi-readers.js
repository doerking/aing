'use strict';
// M6 任务 6.9c failing test —— 锁 SPEC-6.9c 成长观察读数同源四条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kreaders-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let F, IX;
try {
  F = require('../src/feedback-delta.js');
  IX = require('../src/insight-extract.js');
  if (typeof F.delta !== 'function' || typeof IX.extractInsights !== 'function') throw new Error('契约未齐');
} catch (e) {
  console.error('❌ 红（正确的红）—— 6.9c 读数同源未实现'); console.error('   ' + e.message.split('\n')[0]); process.exit(1);
}

const rows = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const cyc = (db, id, kespi, src, growth = 1, pruned = 0, ratio = 1.0) => db.run(
  `INSERT INTO meko_cycles (id,cycle_type,helix_strand,scheduled_at,executed_at,status,kespi_snapshot,kespi_source,growth,pruned,conservation_ratio)
   VALUES ('${id}','维护:round1','both',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'executed',${kespi},'${src}',${growth},${pruned},${ratio})`);

(async () => {
  // ── DB1：真 0.5 → 真 0.7 → 占位 0.3 ──────────────────
  await store.init(path.join(yard, 'one.db'));
  let db = store._getDb();
  cyc(db, 'c1', 0.5, 'kespi_scores', 1, 0, 1.0);
  cyc(db, 'c2', 0.7, 'kespi_scores', 2, 0, 0.9);
  cyc(db, 'c3', 0.3, 'placeholder', 3, 0, 0.8);
  store._persist();

  const d1 = F.delta(store, {});
  ac('AC-1 反馈差分只取真读数', Math.abs(d1.delta.kespi - 0.2) < 1e-9 && d1.verdict === 'improving',
    JSON.stringify({ kd: d1.delta.kespi, verdict: d1.verdict }));

  // ── AC-2：仅 1 条真读数 + 占位 → insufficient ────────
  await store.init(path.join(yard, 'two.db'));
  db = store._getDb();
  cyc(db, 'v1', 0.5, 'kespi_scores');
  cyc(db, 'v2', 0.9, 'placeholder');
  store._persist();
  const d2 = F.delta(store, {});
  ac('AC-2 真读数不足 → insufficient', d2.verdict === 'insufficient' && d2.delta.kespi === null,
    JSON.stringify({ verdict: d2.verdict, kd: d2.delta.kespi }));

  // ── AC-3：洞察只用真读数相邻轮 ───────────────────────
  await store.init(path.join(yard, 'one.db'));
  db = store._getDb();
  const ins = await IX.extractInsights(store, {});
  const cands = rows(db, "SELECT * FROM entities WHERE id LIKE 'raw-insight-%'");
  const hit = cands.find(r => /\+0\.2000/.test(String(r.content)) && /样本量：1 轮/.test(String(r.content)));
  const bad = cands.find(r => /-0\.1000|\-0\.05/.test(String(r.content)));
  ac('AC-3 洞察效果不混占位轮', ins.extracted >= 1 && !!hit && !bad,
    JSON.stringify({ extracted: ins.extracted, contents: cands.map(r => String(r.content).split('\n')[2]) }));

  // ── AC-4：源码条件 + 无删 + delta 只读 ───────────────
  const srcs = ['feedback-delta.js', 'insight-extract.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'));
  const hasCond = srcs.every(s => /kespi_source\s*=\s*'kespi_scores'/.test(s));
  const noDel = srcs.every(s => !/DELETE\s+FROM/i.test(s));
  const e0 = JSON.stringify(rows(db, 'SELECT * FROM entities'));
  const l0 = JSON.stringify(rows(db, 'SELECT * FROM links'));
  F.delta(store, {});
  const e1 = JSON.stringify(rows(db, 'SELECT * FROM entities'));
  const l1 = JSON.stringify(rows(db, 'SELECT * FROM links'));
  ac('AC-4 过滤条件 + 无删 + 差分只读', hasCond && noDel && e0 === e1 && l0 === l1,
    JSON.stringify({ hasCond, noDel, entities: e0 === e1, links: l0 === l1 }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
