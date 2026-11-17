'use strict';
// M7 任务 7.1k failing test —— 同义/别名扩展层（查询侧）
// 口径：同义词只进查询扩展，不进行检索词面；每组别名仍受 AC-12 上限（原词 + 最多 3 个扩展）；
//      同族词能互相命中（写盘→落盘），无关词不许串门（番茄不扩成检索）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-syn-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const derive = require('../src/derive.js');
const R = require('../src/retrieval.js');

(async () => {
  // AC-1 同义词查询：写盘 → 落盘
  const syn = typeof derive.synonymsOf === 'function' ? derive.synonymsOf('写盘') : [];
  ac('AC-1 同义词可查（写盘→落盘）', syn.includes('落盘'), JSON.stringify(syn));

  // AC-2 组内别名不超上限（原词 + ≤3 扩展）
  const groups = typeof R.queryTokenGroups === 'function' ? R.queryTokenGroups('写盘安全') : [];
  ac('AC-2 别名上限仍守 ≤4',
    groups.length > 0 && groups.every((g) => g.length >= 1 && g.length <= 4) &&
    groups[0][0] === '写盘安全',
    JSON.stringify(groups));

  // AC-3 无关词不串门
  const none = typeof derive.synonymsOf === 'function' ? derive.synonymsOf('番茄') : ['x'];
  ac('AC-3 无关词不乱扩', none.length === 0, JSON.stringify(none));

  // AC-4 端到端：词面零重叠也能找回
  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active' });
  put('doc-write', '落盘时先写临时文件再改名，失败不留残留。');
  put('doc-search', '检索的算法：向量、词面、名称三路分数加权融合后再排序。');
  put('doc-noise', '番茄种植手册，注意浇水和光照。');
  await require('../src/vector.js').vectorStep(store, {});

  const LEX = { vector: 0, lexical: 1, name: 0 };
  const OFF = { kespi: 0, recency: 0 };
  const r1 = await R.search(store, '写盘安全', { weights: LEX, rerank: OFF, limit: 5 });
  const ids1 = (r1.candidates || []).map((c) => c.id);
  ac('AC-4 同义词端到端命中', ids1[0] === 'doc-write', JSON.stringify(ids1));

  const r2 = await R.search(store, '找东西的算法', { weights: LEX, rerank: OFF, limit: 5 });
  const ids2 = (r2.candidates || []).map((c) => c.id);
  ac('AC-5 口语同义（找东西→检索）', ids2[0] === 'doc-search', JSON.stringify(ids2));

  console.log(`\n----- 7.1k pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
