'use strict';
// M6 任务 6.5 failing test —— 锁 SPEC-6.5 成长观察四件八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-grow-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
let G, F, S, IX;
try {
  G = require('../src/gap-scan.js');
  F = require('../src/feedback-delta.js');
  S = require('../src/self-model.js');
  IX = require('../src/insight-extract.js');
  if (typeof G.gapScan !== 'function' || typeof F.delta !== 'function' || typeof S.measure !== 'function' || typeof IX.extractInsights !== 'function') {
    throw new Error('四件入口未齐');
  }
} catch (e) { console.error('❌ 红（正确的红）—— 6.5 四件未实现（gap-scan / feedback-delta / self-model / insight-extract）'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const LONG = '健康实体正文，长度需要超过五十个字符，才不会被缺口扫描判作稀薄；这一条同时带有一条有效边，供五维缺口排除使用，再补几个字稳妥一些。';

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active', confidence: 0.6 });
  put('healthy', LONG); put('healthy2', LONG + '乙');
  put('orphan', LONG + '孤'); put('thin', '短');
  put('stale', LONG + '旧'); put('empty', '');
  store.insertLink({ source_id: 'healthy', target_id: 'healthy2', relation: 'rel', confidence: 0.9 });
  store.insertLink({ source_id: 'thin', target_id: 'healthy', relation: 'rel', confidence: 0.9 });
  store.insertLink({ source_id: 'stale', target_id: 'healthy', relation: 'rel', confidence: 0.9 });
  store.insertLink({ source_id: 'empty', target_id: 'healthy', relation: 'rel', confidence: 0.9 });
  db.run("UPDATE entities SET updated_at='2020-01-01 00:00:00' WHERE id='stale'");
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00' WHERE id='healthy'");
  store._persist();
  await V.vectorStep(store, {});
  put('unindexed', LONG + '缺');               // 向量建好之后才插，确保未索引
  store.insertLink({ source_id: 'unindexed', target_id: 'healthy', relation: 'rel', confidence: 0.9 });
  store._persist();

  // AC-1 五维缺口
  const g = G.gapScan(store);
  const hit = (d) => (g.ids[d] || []).includes(d === 'orphan' ? 'orphan' : d === 'thin' ? 'thin' : d === 'stagnant' ? 'stale' : d === 'unindexed' ? 'unindexed' : 'empty');
  const healthyClean = ['healthy', 'healthy2'].every(id => !G.DIMENSIONS.some(d => (g.ids[d] || []).includes(id)));
  ac('AC-1 五维缺口', G.DIMENSIONS.every(hit) && healthyClean && g.counts.orphan >= 1 && g.counts.empty >= 1,
    JSON.stringify(g));

  // AC-3 自我模型（尚无周期）
  const self = S.measure(store);
  const cov = self.metrics.vectorCoverage;
  ac('AC-3 自我模型', self.metrics.entities === 7 && self.metrics.active === 7 && self.metrics.edges === 5 &&
    cov > 0 && cov < 100 && self.metrics.distillDebt === 0 && self.metrics.gaps >= 5,
    JSON.stringify(self.metrics));

  // AC-5a 不造料：周期不足 → insufficient + 零写入
  const beforeCnt = (() => { const s = db.prepare('SELECT COUNT(*) AS n FROM entities'); s.step(); const n = s.getAsObject().n; s.free(); return Number(n); })();
  const ins0 = await IX.extractInsights(store, {});
  const afterCnt = (() => { const s = db.prepare('SELECT COUNT(*) AS n FROM entities'); s.step(); const n = s.getAsObject().n; s.free(); return Number(n); })();
  ac('AC-5 不造料（周期不足）', ins0.insufficient === true && ins0.extracted === 0 && beforeCnt === afterCnt, JSON.stringify(ins0));

  // AC-2 反馈差分（两条周期，KESPI 上升）
  const cyc = (id, kespi, growth, pruned, ratio) => db.run(
    `INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot, kespi_source, growth, pruned, conservation_ratio)
     VALUES ('${id}', '维护:round1', 'both', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'executed', ${kespi}, 'kespi_scores', ${growth}, ${pruned}, ${ratio})`
  );
  cyc('c1', 0.5, 2, 0, 1.0);
  cyc('c2', 0.6, 3, 1, 0.9);
  store._persist();
  const d2 = F.delta(store, {});
  ac('AC-2 反馈差分', Math.abs(d2.delta.kespi - 0.1) < 1e-9 && d2.delta.growth === 1 && d2.delta.pruned === 1 &&
    d2.verdict === 'improving' && d2.counts.entities === 7 && d2.counts.edges === 5,
    JSON.stringify({ delta: d2.delta, verdict: d2.verdict, counts: d2.counts }));

  // 第三轮 + 每轮动作，供洞察抽取
  cyc('c3', 0.55, 1, 0, 0.95);
  db.run("INSERT INTO field_actions (id,action,target,before_json,after_json,cycle_id,reversible,created_at) VALUES ('fa1','promote','healthy','{}','{}','c1',1,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO field_actions (id,action,target,before_json,after_json,cycle_id,reversible,created_at) VALUES ('fa2','rebond','healthy->healthy2','{}','{}','c2',1,CURRENT_TIMESTAMP)");
  store._persist();

  // AC-4 洞察落候选
  const ins1 = await IX.extractInsights(store, {});
  const rows = (() => { const s = db.prepare("SELECT * FROM entities WHERE id LIKE 'raw-insight-%' ORDER BY id"); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })();
  const allGood = rows.length >= 1 && rows.length <= 3 && rows.every(r =>
    r.type === 'MetaKnowledge' && r.status === 'pending-distillation' && Number(r.confidence) === 0 &&
    String(r.tags).includes('insight') && /条件/.test(r.content) && /动作/.test(r.content) &&
    /效果/.test(r.content) && /样本量/.test(r.content) && /不作因果/.test(r.content));
  ac('AC-4 洞察落候选', ins1.extracted === rows.length && allGood, JSON.stringify({ ins1, rows: rows.map(r => ({ id: r.id, t: r.type, s: r.status, c: r.confidence })) }));

  // AC-5b 幂等
  const ins2 = await IX.extractInsights(store, {});
  ac('AC-5 幂等', ins2.extracted === 0 && ins2.skipped >= 1, JSON.stringify(ins2));

  // AC-6 T2 消费
  const { EvolutionRuntime } = require('../src/evolution-cycle.js');
  const rt = new EvolutionRuntime({ store });
  const snap = rt.t2Snapshot();
  ac('AC-6 T2 消费', !!snap.gaps && !!snap.feedback && !!snap.selfModel &&
    snap.gaps.counts.orphan >= 1 && snap.selfModel.metrics.entities === 7 + ins1.extracted,
    JSON.stringify({ gaps: snap.gaps && snap.gaps.counts, fb: snap.feedback && snap.feedback.verdict, sm: snap.selfModel && snap.selfModel.metrics.entities }));

  // AC-7 链上可见
  const meta = require('../src/metabolism.js');
  ac('AC-7 链上可见', meta.DEFAULT_STEPS.includes('insight-extract'), JSON.stringify(meta.DEFAULT_STEPS));

  // AC-8 铁律：三只读件零写 + last_access + 无物理删 + 无直连 store
  const fp = () => JSON.stringify(['entities', 'links', 'kespi_scores', 'meko_cycles', 'field_actions', 'task_trajectories'].map(t => {
    const s = db.prepare('SELECT * FROM ' + t); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o;
  }));
  const f0 = fp();
  G.gapScan(store); F.delta(store, {}); S.measure(store);
  const f1 = fp();
  const la = db.prepare("SELECT last_access FROM entities WHERE id='healthy'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const srcBad = ['gap-scan.js', 'feedback-delta.js', 'self-model.js', 'insight-extract.js'].filter(f => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    return /DELETE\s+FROM/i.test(src) || /require\(['"][^'"]*knowledge-store/.test(src);
  });
  ac('AC-8 铁律', f0 === f1 && String(laV) === '2021-06-01 00:00:00' && srcBad.length === 0, JSON.stringify({ fpSame: f0 === f1, srcBad }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
