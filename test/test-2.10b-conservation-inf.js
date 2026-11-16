'use strict';
// M2 任务 2.10b failing test —— 守恒比 Infinity 读侧守护（SPEC-2.10 修订 A）
// 判据不动（Infinity 仍是 Infinity、verdict 仍 growth-only）；只堵差分的哑弹：
// Inf−Inf=NaN、∞→有限被算成假跌幅。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cons-inf-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const C = require('../src/conservation.js');
const FD = require('../src/feedback-delta.js');
const call = (fn, ...args) => { try { return fn(...args); } catch (e) { return { error: e.message }; } };

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();
  const cyc = (id, growth, pruned, ratio, at) => db.run(
    `INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot, kespi_source, growth, pruned, conservation_ratio)
     VALUES (?, 'memory', 'both', ?, ?, 'done', 0.8, 'kespi_scores', ?, ?, ?)`,
    [id, at, at, growth, pruned, ratio]
  );

  // AC-1 判据不动：growth>0、pruned=0 → Infinity / growth-only / 不带内
  db.run(`INSERT INTO links (source_id, target_id, relation, created_at) VALUES ('a', 'b', 'sprout-candidate', CURRENT_TIMESTAMP)`);
  const m = C.measureConservation(store, {});
  ac('AC-1 判据不动', m.ratio === Infinity && m.verdict === 'growth-only' && m.inBand === false,
    JSON.stringify({ ratio: String(m.ratio), verdict: m.verdict, inBand: m.inBand }));

  // AC-2 两轮都 Inf：delta 不再出 NaN，ratio 置 null 并标状态
  cyc('c1', 24, 0, Infinity, '2026-11-17 01:00:00');
  cyc('c2', 63, 0, Infinity, '2026-11-17 02:00:00');
  const d2 = call(FD.delta, store);
  const round = d2 && d2.delta ? JSON.parse(JSON.stringify(d2.delta)) : {};
  ac('AC-2 Inf−Inf 不出 NaN', d2 && !d2.error && round.ratio === null && round.ratioState === 'inf',
    JSON.stringify({ raw: d2 && d2.delta, round }));

  // AC-3 ∞→有限 不出假跌幅：ratio null，状态指明哪端是 inf
  cyc('c3', 10, 10, 1.0, '2026-11-17 03:00:00');
  const d3 = call(FD.delta, store); // 比较 c3（新）与 c2（旧）：1.0 vs Inf
  ac('AC-3 ∞→有限不假跌', d3 && !d3.error && d3.delta.ratio === null && d3.delta.ratioState === 'from-inf',
    JSON.stringify(d3 && d3.delta));
  cyc('c4', 63, 0, Infinity, '2026-11-17 04:00:00');
  const d4 = call(FD.delta, store); // 比较 c4（新，Inf）与 c3（旧，1.0）
  ac('AC-4 有限→∞ 不出假涨', d4 && !d4.error && d4.delta.ratio === null && d4.delta.ratioState === 'to-inf',
    JSON.stringify(d4 && d4.delta));

  // AC-5 有限对有限：数值与旧口径一致（round4 后差）
  cyc('c5', 10, 10, 1.25, '2026-11-17 05:00:00');
  cyc('c6', 10, 10, 1.0, '2026-11-17 06:00:00');
  const d5 = call(FD.delta, store);
  ac('AC-5 有限照旧', d5 && !d5.error && d5.delta.ratio === -0.25 && d5.delta.ratioState === 'finite',
    JSON.stringify(d5 && d5.delta));

  // AC-6 铁律：两件只读、源码无物理删
  const srcC = fs.readFileSync(path.join(__dirname, '..', 'src', 'conservation.js'), 'utf8');
  const srcD = fs.readFileSync(path.join(__dirname, '..', 'src', 'feedback-delta.js'), 'utf8');
  const nBefore = db.exec('SELECT COUNT(*) FROM entities')[0].values[0][0];
  call(C.measureConservation, store, {});
  call(FD.delta, store);
  const nAfter = db.exec('SELECT COUNT(*) FROM entities')[0].values[0][0];
  ac('AC-6 铁律', nBefore === nAfter && !/DELETE\s+FROM/i.test(srcC + srcD) && !/UPDATE\s+entities/i.test(srcC + srcD),
    JSON.stringify({ nBefore, nAfter }));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
