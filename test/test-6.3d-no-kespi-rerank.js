'use strict';
// M6 任务 6.3d failing test —— 精排撤出 KESPI（SPEC-6.3 修订 D）
// 口径：缺省精排只留少量新鲜度；KESPI 不再参与排序（显式传参仍可恢复）；
//      召回意图仍可抬新鲜度；冻结集对本项无分辨力（记录在 spec，不在本测里断言）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-nokespi-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const R = require('../src/retrieval.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  // 平铺桩：所有文本同一向量 → 融合分只由词面通道区分
  V.registerBackend({ name: 'probe-flat', dim: 2, model: 'probe-flat', embed: () => [1, 0] });

  const put = (id, content, updated) => {
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active' });
    if (updated) store._getDb().run('UPDATE entities SET updated_at = ? WHERE id = ?', [updated, id]);
  };
  // 词面略优（命中查询词）但 KESPI 低；另一条词面略差但 KESPI 高
  put('doc-answer', '落盘 说明。', '2026-01-01 00:00:00');
  put('doc-active', '其他正文。', '2026-01-01 00:00:00');
  // 新鲜度对照：同分两件，一新一旧
  put('doc-old', '归档 甲。', '2020-01-01 00:00:00');
  put('doc-new', '归档 乙。', '2026-01-01 00:00:00');

  const db = store._getDb();
  const ks = (id, overall) => db.run(
    'INSERT INTO kespi_scores (entity_id,kq,kg,ka,km,kd,kc,kr,kb,overall) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, overall, overall, overall, overall, overall, overall, overall, overall, overall]
  );
  ks('doc-answer', 0.1);
  ks('doc-active', 1.0);

  await V.vectorStep(store, { backend: 'probe-flat' });
  const NOW = Date.parse('2026-11-17T00:00:00Z');

  // AC-1 缺省契约
  const rr = R.DEFAULTS.rerank || {};
  ac('AC-1 缺省精排 kespi=0、recency≤0.05',
    rr.kespi === 0 && typeof rr.recency === 'number' && rr.recency > 0 && rr.recency <= 0.05,
    JSON.stringify(rr));

  // AC-2 行为：词面略优的答案件不该被高 KESPI 翻盘
  const r2 = await R.search(store, '落盘', { backend: 'probe-flat', now: NOW, limit: 2 });
  ac('AC-2 缺省下 KESPI 不管排序（答案件仍第一）',
    (r2.candidates[0] || {}).id === 'doc-answer',
    JSON.stringify(r2.candidates.map((c) => [c.id, c.final])));

  // AC-3 显式传参仍可恢复旧口径（向后兼容）
  const r3 = await R.search(store, '落盘', { backend: 'probe-flat', now: NOW, limit: 2, rerank: { kespi: 1, recency: 0 } });
  ac('AC-3 显式 kespi=1 可恢复（高 KESPI 件排第一）',
    (r3.candidates[0] || {}).id === 'doc-active',
    JSON.stringify(r3.candidates.map((c) => [c.id, c.final])));

  // AC-4 新鲜度仍在（同分两件，新件排前）
  const r4 = await R.search(store, '归档', { backend: 'probe-flat', now: NOW, limit: 4 });
  const ids4 = r4.candidates.map((c) => c.id);
  ac('AC-4 新鲜度保留（同分时新件在旧件前）',
    ids4.indexOf('doc-new') >= 0 && ids4.indexOf('doc-old') >= 0 && ids4.indexOf('doc-new') < ids4.indexOf('doc-old'),
    JSON.stringify(ids4));

  // AC-5 召回意图仍抬新鲜度（SPEC-6.13 不被本次修订破坏）
  const r5 = await R.search(store, '上次 落盘 结果如何', { backend: 'probe-flat', now: NOW, limit: 2 });
  ac('AC-5 召回意图 rerank.recency=0.25',
    r5.meta.intent && r5.meta.intent.intent === 'recall' && r5.meta.rerank.recency === 0.25,
    JSON.stringify({ intent: r5.meta.intent, rerank: r5.meta.rerank }));

  console.log(`\n----- 6.3d pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
