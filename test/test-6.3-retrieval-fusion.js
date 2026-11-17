'use strict';
// M6 任务 6.3 failing test —— 锁 SPEC-6.3 检索融合消费七条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-rf-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
let R;
try { R = require('../src/retrieval.js'); if (typeof R.search !== 'function') throw new Error('search 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/retrieval.js 未实现 SPEC-6.3'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const NARR = require('../src/capability-narrative.js');
const MESSAGES = [
  { role: 'user', content: '复核预算。' },
  { role: 'assistant', content: [{ type: 'text', text: '先对表再定。' }] }
];
const convBody = (topic, reply) => JSON.stringify({
  format: 'capability-narrative-v1', topic,
  ...NARR.buildCapabilityNarrative(MESSAGES, {}, []),
  reply, rationale: '先对表再定'
});

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, name, type, content, tags) =>
    store.insertEntity({ id, name, type, content, tags, status: 'active', confidence: 0.6 });

  put('tagged', '台账甲', 'Concept', '与查询无关的正文甲。', '["鲸落"]');
  put('plain', '台账乙', 'Concept', '与查询无关的正文乙。', '[]');
  put('exact-name', '唯一名称甲乙丙', 'Concept', '完全无关的内容。', '[]');
  put('retired', '退役样本', 'Concept', '退役正文。', '["鲸落"]');
  put('doc-x', '双链样本', 'Concept', '双链样本正文。', '["双链"]');
  put('wiki-doc-x', '双链样本', 'Concept', '双链样本正文。', '["双链"]');
  put('conv-name', '预算复核', 'Conversation', convBody('预算复核', '复核预算'), '["conv:9"]');
  put('conv-other', '其他会话', 'Conversation', convBody('别的', '别的内容'), '["conv:9"]');
  put('seed', '种子', 'Concept', 'alpha 关键词共同体。', '[]');
  put('nb', '邻居', 'Concept', '完全不同的内容。', '[]');
  put('other', '旁观', 'Concept', '无关内容。', '[]');
  put('k-hi', '评分样本', 'Concept', '相同的评分正文。', '[]');
  put('k-lo', '评分样本', 'Concept', '相同的评分正文。', '[]');

  db.run("UPDATE entities SET invalid_at='2026-01-01 00:00:00' WHERE id='retired'");
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00' WHERE id='conv-name'");

  store.insertLink({ source_id: 'seed', target_id: 'nb', relation: 'rel', confidence: 0.9 });
  db.run("UPDATE links SET strength=9 WHERE source_id='seed' AND target_id='nb'");

  const insK = db.prepare('INSERT INTO kespi_scores (entity_id, overall, computed_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  insK.run(['k-hi', 0.9]); insK.run(['k-lo', 0.1]); insK.free();
  store._persist();

  await V.vectorStep(store, {});

  const off = { kespi: 0, recency: 0 };

  // AC-1 三路融合形状（tagged 只在标签命中 → 词面分按 7.1l 字段权重打六折）
  const r1 = await R.search(store, '鲸落', { rerank: off });
  const t1 = (r1.candidates || []).find(c => c.id === 'tagged');
  const shapeOk = !!t1 && t1.channels && ['vector', 'lexical', 'name'].every(k => typeof t1.channels[k] === 'number');
  const w = R.DEFAULTS.weights;
  const formula = t1 ? w.vector * t1.channels.vector + w.lexical * t1.channels.lexical + w.name * t1.channels.name : NaN;
  ac('AC-1 三路融合形状', shapeOk && Math.abs(t1.channels.lexical - R.TAG_WEIGHT) < 1e-9 &&
    Math.abs(t1.final - formula) < 1e-9,
    JSON.stringify({ t1: t1 && { ch: t1.channels, final: t1.final, formula, tagWeight: R.TAG_WEIGHT } }));

  // AC-2 序列号路生效（SPEC-7.1 §4.1 修订：表头不入键，序列号 id 才是身份）
  const r2 = await R.search(store, 'exact-name', { weights: { vector: 0, lexical: 0, name: 1 }, rerank: off });
  const r2t = await R.search(store, '唯一名称甲乙丙', { weights: { vector: 0, lexical: 0, name: 1 }, rerank: off });
  ac('AC-2 序列号路生效（表头伪造无效）',
    r2.candidates.length > 0 && r2.candidates[0].id === 'exact-name' && r2.candidates[0].channels.name === 1 &&
    r2t.candidates.length === 0,
    JSON.stringify({ byId: r2.candidates.slice(0, 2).map(c => ({ id: c.id, ch: c.channels })), byTitle: r2t.candidates.map(c => c.id) }));

  // AC-3 词面路生效（标签命中按 TAG_WEIGHT 计分，仍能召回排前）
  const r3 = await R.search(store, '鲸落', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: off });
  ac('AC-3 词面路生效', r3.candidates.length > 0 && r3.candidates[0].id === 'tagged' &&
    Math.abs(r3.candidates[0].channels.lexical - R.TAG_WEIGHT) < 1e-9 &&
    r3.candidates[0].final > (r3.candidates[1] ? r3.candidates[1].final : 0),
    JSON.stringify(r3.candidates.slice(0, 2).map(c => ({ id: c.id, ch: c.channels, f: c.final }))));

  // AC-4 慢回忆
  const r4a = await R.search(store, 'alpha 关键词', { slowRecallThreshold: 0.99, rerank: off });
  const nb = r4a.candidates.find(c => c.id === 'nb');
  const r4b = await R.search(store, 'alpha 关键词', { slowRecallThreshold: 0, rerank: off });
  ac('AC-4 慢回忆', !!nb && nb.slowRecall === true && r4a.meta.slowExpanded >= 1 && !r4b.candidates.some(c => c.id === 'nb'),
    JSON.stringify({ slow: r4a.meta, nb: nb && { id: nb.id, slowRecall: nb.slowRecall } }));

  // AC-5 伪精排
  const r5 = await R.search(store, '评分样本', { weights: { vector: 0, lexical: 1, name: 1 }, rerank: { kespi: 0.15, recency: 0 } });
  const idxHi = r5.candidates.findIndex(c => c.id === 'k-hi');
  const idxLo = r5.candidates.findIndex(c => c.id === 'k-lo');
  ac('AC-5 伪精排', idxHi >= 0 && idxLo >= 0 && idxHi < idxLo, JSON.stringify({ idxHi, idxLo }));

  // AC-6 去重 + k + 退役
  const r6a = await R.search(store, '双链样本', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: off });
  const dup = r6a.candidates.filter(c => c.base === 'doc-x');
  const r6b = await R.search(store, '双链样本', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: off, k: 1 });
  const r6c = await R.search(store, '鲸落', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: off });
  ac('AC-6 去重 + k + 退役', dup.length === 1 && dup[0].id === 'doc-x' && r6b.candidates.length === 1 &&
    !r6c.candidates.some(c => c.id === 'retired'), JSON.stringify({ dup: dup.map(c => c.id), k1: r6b.candidates.length }));

  // AC-7 predict 接线 + 铁律
  const { predict } = require('../src/predict.js');
  const p = await predict(store, { message: '预算复核' });
  const la = db.prepare("SELECT last_access FROM entities WHERE id='conv-name'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'retrieval.js'), 'utf8');
  ac('AC-7 predict 接线 + 铁律', p.coldStart === false && p.plans.length > 0 && p.plans[0].basis[0].id === 'conv-name' &&
    String(laV) === '2021-06-01 00:00:00' &&
    !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src),
    JSON.stringify({ cold: p.coldStart, plans: p.plans.map(x => x.basis.map(b => b.id)) }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
