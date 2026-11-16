'use strict';
// M6 任务 6.4c failing test —— 轨迹导入两链（growth-loop episodes / metabolism lineage）
// 口径来自旧院 aing/src/trajectory-store.js：logFromGrowthLoop / logFromLineage。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-traj2-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const T = require('../src/trajectory.js');
const call = (fn, ...args) => { try { return fn(...args); } catch (e) { return { error: e.message }; } };
const rowsOf = (db, sql, binds = []) => { const s = db.prepare(sql); if (binds.length) s.bind(binds); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();

  // AC-1 growth-loop episodes 映射：字段齐、source 标记
  const episodes = [
    { id: 'ep-1', taskType: 'refactor', route: ['分析', '改码'], success: true, durationMs: 1200, retries: 1, lesson: '先写测试', evidence: 'diff', patternKey: 'refactor::a' },
    { id: 'ep-2', taskType: 'review', route: ['读文'], success: false, durationMs: 300, retries: 0, lesson: '', evidence: '', patternKey: 'review::b' }
  ];
  const r1 = call(T.logFromGrowthLoop, store, episodes);
  const t1 = rowsOf(db, "SELECT * FROM task_trajectories WHERE id = 'ep-1'")[0];
  const ev1 = t1 ? JSON.parse(t1.evidence) : {};
  ac('AC-1 growth-loop 映射', r1.imported === 2 && t1 && t1.task_type === 'refactor' && t1.success === 1 &&
    t1.retries === 1 && t1.duration_ms === 1200 && JSON.parse(t1.route).join(',') === '分析,改码' &&
    JSON.parse(t1.step_sequence).length === 2 && ev1.lesson === '先写测试' && t1.source === 'growth-loop',
    JSON.stringify({ r1, t1 }));

  // AC-2 幂等：同一 episodes 重导 → skipped，行数不变
  const n1 = rowsOf(db, 'SELECT COUNT(*) AS n FROM task_trajectories')[0].n;
  const r2 = call(T.logFromGrowthLoop, store, episodes);
  const n2 = rowsOf(db, 'SELECT COUNT(*) AS n FROM task_trajectories')[0].n;
  ac('AC-2 幂等', r2.imported === 0 && r2.skipped === 2 && n1 === n2,
    JSON.stringify({ r2, n1, n2 }));

  // AC-3 代谢因果链：缺 step 跳过，成功/失败按 outcome
  const lineage = [
    { step: 's1', outcome: 'success', evidence: { durationMs: 88 }, timestamp: '2026-11-17T01:00:00Z', action: 'a1', target: 't1' },
    { step: 's2', outcome: 'failure', evidence: { durationMs: 12 }, timestamp: '2026-11-17T01:00:01Z' },
    { outcome: 'success' }
  ];
  const r3 = call(T.logFromLineage, store, lineage);
  const s1 = rowsOf(db, "SELECT * FROM task_trajectories WHERE task_type = 'metabolism' AND source = 'metabolism-decision-lineage' ORDER BY route")[0];
  const all3 = rowsOf(db, "SELECT success FROM task_trajectories WHERE source = 'metabolism-decision-lineage' ORDER BY success");
  ac('AC-3 因果链导入', r3.imported === 2 && all3.length === 2 && Number(all3[0].success) === 0 && Number(all3[1].success) === 1 && s1,
    JSON.stringify({ r3, all3 }));

  // AC-4 幂等（因果链）：同 timestamp 重导不重复
  const r4 = call(T.logFromLineage, store, lineage);
  const n4 = rowsOf(db, "SELECT COUNT(*) AS n FROM task_trajectories WHERE source = 'metabolism-decision-lineage'")[0].n;
  ac('AC-4 因果链幂等', r4.imported === 0 && r4.skipped === 3 && n4 === 2, JSON.stringify({ r4, n4 }));

  // AC-5 统计可见：两条链进 stats.byType 与 listTrajectories 过滤
  const st = await T.stats(store);
  const list = await T.listTrajectories(store, { taskType: 'metabolism' });
  ac('AC-5 统计可见', st.byType.refactor === 1 && st.byType.review === 1 && st.byType.metabolism === 2 && list.length === 2,
    JSON.stringify({ byType: st.byType, list: list.length }));

  // AC-6 铁律：不造实体、不碰实体字段、源码无物理删
  const ents = rowsOf(db, 'SELECT COUNT(*) AS n FROM entities')[0].n;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'trajectory.js'), 'utf8');
  ac('AC-6 铁律', ents === 0 && !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src),
    JSON.stringify({ ents }));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
