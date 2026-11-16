'use strict';
// M6 任务 6.6 failing test —— 锁 SPEC-6.6 内外维护接线八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-maint-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const M = require('../src/memo.js');
let R;
try {
  R = require('../src/maintenance-report.js');
  if (typeof R.buildReport !== 'function') throw new Error('buildReport 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— 6.6 维护简报未实现（maintenance-report.js）'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const LONG = '维护实体正文，长度需要超过五十个字符，才不会被缺口扫描判作稀薄；这一条用来验证内外维护接线用的样本。';
const ENUM_FOCUS = ['supply', 'digest', 'restore', 'maintain'];
const ENUM_TREND = ['improving', 'regressing', 'flat', 'insufficient'];
const GLYPH = { improving: '↑', regressing: '↓', flat: '→', insufficient: '─' };

function rows(db, sql) { const s = db.prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }
function fingerprint(db) {
  return JSON.stringify(['entities', 'links', 'kespi_scores', 'meko_cycles', 'field_actions', 'entity_vectors', 'task_trajectories', 'insight_marks']
    .map(t => { try { return rows(db, 'SELECT * FROM ' + t); } catch (_) { return []; } }));
}

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active', confidence: 0.6 });

  put('thin-t', '短');
  put('stagnant-s', LONG + '旧');
  put('orphan-o', LONG + '孤');
  put('empty-e', '');
  put('healthy-h', LONG + '健');
  store.insertLink({ source_id: 'thin-t', target_id: 'healthy-h', relation: 'rel', confidence: 0.9 });
  store.insertLink({ source_id: 'stagnant-s', target_id: 'healthy-h', relation: 'rel', confidence: 0.9 });
  db.run("UPDATE entities SET updated_at='2020-01-01 00:00:00' WHERE id='stagnant-s'");
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00' WHERE id='orphan-o'");
  store._persist();
  await V.vectorStep(store, {});
  put('unindexed-u', LONG + '缺');
  store._persist();

  // 四条待蒸馏洞察候选（>3 验上限）
  for (let i = 1; i <= 4; i++) {
    store.insertEntity({ id: 'raw-insight-test' + i, name: '洞察候选 ' + i, type: 'MetaKnowledge',
      content: '条件：balanced\n动作：promote\n效果：+0.1\n样本量：2 轮\n统计相关，不作因果。',
      tags: '["insight"]', status: 'pending-distillation', confidence: 0 });
  }
  store._persist();

  // AC-1 简报形状
  const r = R.buildReport(store, {});
  const dimsOk = ['orphan', 'thin', 'stagnant', 'unindexed', 'empty'].every(d => typeof r.internal.gaps.counts[d] === 'number');
  ac('AC-1 简报形状', dimsOk && typeof r.internal.gaps.total === 'number' &&
    r.internal.selfModel && typeof r.internal.selfModel.metrics.entities === 'number' &&
    r.internal.feedback && typeof r.internal.feedback.verdict === 'string' &&
    Array.isArray(r.internal.targets) &&
    r.external.pendingInsights.count === 4 && r.external.pendingInsights.items.length === 3,
    JSON.stringify({ gaps: r.internal.gaps.counts, trend: r.internal.feedback.verdict, ins: r.external.pendingInsights.count }));

  // AC-2 targets 优先级（empty → orphan → unindexed → stagnant → thin）
  ac('AC-2 targets 优先级', JSON.stringify(r.internal.targets.slice(0, 5)) === JSON.stringify(['empty-e', 'orphan-o', 'unindexed-u', 'stagnant-s', 'thin-t']) &&
    new Set(r.internal.targets).size === r.internal.targets.length && r.internal.targets.length <= R.TARGETS_MAX,
    JSON.stringify(r.internal.targets));

  // AC-3 洞察候选上浮
  const ids = r.external.pendingInsights.items.map(x => x.id);
  ac('AC-3 洞察候选上浮', ids.length === 3 && ids.every(id => /^raw-insight-test[1-4]$/.test(id)) &&
    r.external.pendingInsights.items.every(x => typeof x.name === 'string'),
    JSON.stringify(r.external.pendingInsights));

  // AC-5 memo 纯读（先取指纹）
  const f0 = fingerprint(db);
  const memo = await M.buildMemo(store, {});
  const f1 = fingerprint(db);
  ac('AC-5 memo 纯读', f0 === f1);

  // AC-4 memo 外场维护块
  const u = memo.user;
  const maint = u.maintenance;
  ac('AC-4 memo 外场块', !!maint && typeof maint.gaps.total === 'number' &&
    ENUM_TREND.includes(maint.trend) && maint.pendingInsights && maint.pendingInsights.count === 4 &&
    /缺口/.test(memo.systemLine) && memo.systemLine.includes(GLYPH[maint.trend]) &&
    memo.systemLine.includes('向量') && memo.systemLine.length <= M.SYSTEM_LINE_MAX,
    JSON.stringify({ maint, line: memo.systemLine, len: memo.systemLine.length }));

  // AC-6 T0 内场
  const { EvolutionRuntime } = require('../src/evolution-cycle.js');
  const rt = new EvolutionRuntime({ store });
  const p = rt.t0Plan();
  ac('AC-6 T0 内场', ENUM_FOCUS.includes(p.focus) && !!p.observation &&
    p.observation.gaps.total === r.internal.gaps.total && Array.isArray(p.targets) &&
    JSON.stringify(p.targets) === JSON.stringify(r.internal.targets),
    JSON.stringify({ focus: p.focus, targets: p.targets }));

  // AC-7 T2 内场
  const snap = rt.t2Snapshot();
  ac('AC-7 T2 内场', !!snap.gaps && !!snap.selfModel && !!snap.feedback &&
    snap.insights && snap.insights.count === 4 && snap.insights.items.length === 3,
    JSON.stringify({ ins: snap.insights && snap.insights.count }));

  // AC-8 铁律
  const f2 = fingerprint(db);
  R.buildReport(store, {});
  const f3 = fingerprint(db);
  const la = rows(db, "SELECT last_access FROM entities WHERE id='orphan-o'")[0].last_access;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'maintenance-report.js'), 'utf8');
  ac('AC-8 铁律', f2 === f3 && String(la) === '2021-06-01 00:00:00' &&
    !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src),
    JSON.stringify({ fpSame: f2 === f3, la }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
