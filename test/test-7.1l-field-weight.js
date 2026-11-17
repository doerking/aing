'use strict';
// M7 任务 7.1l failing test —— 字段权重（正文 > 标签）
// 口径：正文命中满分；只在标签里命中也算召回，但要降权，排序永远在正文命中之后。
// 背景：真库上「技能注册：xxx」这类泛标签在抢分，对照单里满屏都是它们。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-fieldw-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/retrieval.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, content, tags) =>
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: JSON.stringify(tags), status: 'active' });
  put('doc-body', '落盘时先写临时文件再改名，失败不留残留。', ['存储']);
  put('doc-tag', '番茄种植手册，注意浇水和光照。', ['落盘']);

  const eBody = store.getEntity('doc-body');
  const eTag = store.getEntity('doc-tag');
  const sBody = R.keywordScore(eBody, '落盘');
  const sTag = R.keywordScore(eTag, '落盘');

  ac('AC-1 正文命中权重高于标签命中',
    sBody > sTag + 0.05, JSON.stringify({ sBody, sTag }));

  ac('AC-2 标签命中仍可召回（不归零）', sTag > 0, String(sTag));

  const LEX = { vector: 0, lexical: 1, name: 0 };
  const OFF = { kespi: 0, recency: 0 };
  const r = await R.search(store, '落盘', { weights: LEX, rerank: OFF, limit: 5 });
  const ids = (r.candidates || []).map((c) => c.id);
  ac('AC-3 排序：正文命中在前', ids[0] === 'doc-body' && ids.includes('doc-tag'), JSON.stringify(ids));

  ac('AC-4 标签权重可解释（TAG_WEIGHT 导出且 <1）',
    typeof R.TAG_WEIGHT === 'number' && R.TAG_WEIGHT > 0 && R.TAG_WEIGHT < 1,
    String(R.TAG_WEIGHT));

  console.log(`\n----- 7.1l pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
