'use strict';
// M6 任务 6.3b failing test —— 缺省融合权重按语义后端重调（SPEC-6.3 修订 B）
// 口径：缺省后端已切语义（SPEC-5.9），向量通道应主导；词面只作补字，名称通道保留。
// 依据：冻结集 v2 扫描，0.8/0.05/0.15 的 nDCG@10、正负名次差、粤语分层均优于 0.6/0.25/0.15。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-fw-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const R = require('../src/retrieval.js');

(async () => {
  const w = R.DEFAULTS.weights;
  const sum = w.vector + w.lexical + w.name;
  ac('AC-1 缺省向量主导（向量 ≥0.75、三路和 =1、词面 <0.15）',
    w.vector >= 0.75 && Math.abs(sum - 1) < 1e-9 && w.lexical < 0.15 && w.name > 0,
    JSON.stringify({ w, sum }));

  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active' });
  // 语义向量用桩：查询向量只跟 doc-semantic 接近
  V.registerBackend({ name: 'probe-sem', dim: 3, model: 'probe-sem', embed: (t) => (/落盘|临时文件/.test(String(t)) ? [1, 0, 0] : [0, 1, 0]) });
  put('doc-semantic', '先写临时文件再改名，失败不留残留。');   // 正文不含「落盘」，语义桩按查询对齐
  put('doc-lexical', '番茄种植手册，注意浇水。');
  store._getDb().run("UPDATE entities SET tags='[\"落盘\"]' WHERE id='doc-lexical'");
  store.insertEntity({ id: 'doc-other', name: 'doc-other', type: 'Concept', content: '无关内容。', tags: '[]', status: 'active' });
  await V.vectorStep(store, { backend: 'probe-sem' });

  const OFF = { kespi: 0, recency: 0 };
  const r = await R.search(store, '落盘', { backend: 'probe-sem', rerank: OFF, limit: 3 });
  const ids = (r.candidates || []).map((c) => c.id);
  ac('AC-2 语义命中排在仅词面命中之前（缺省权重）',
    ids[0] === 'doc-semantic' && ids.indexOf('doc-semantic') < ids.indexOf('doc-lexical'),
    JSON.stringify(ids.map((id, i) => [id, +(r.candidates[i].final).toFixed(3)])));

  const r2 = await R.search(store, '落盘', { backend: 'probe-sem', rerank: OFF, weights: { vector: 0, lexical: 1, name: 0 }, limit: 3 });
  ac('AC-3 显式覆盖仍生效（词面全开时标签命中排前）',
    (r2.candidates || [])[0] && r2.candidates[0].id === 'doc-lexical',
    JSON.stringify((r2.candidates || []).map((c) => c.id)));

  console.log(`\n----- 6.3b pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
