'use strict';
// M7 任务 7.1m failing test —— 检索结果折叠同内容孪生（raw-/wiki- 镜像）
// 口径：同一段正文只占一个名次；镜像对折叠后让出槽位给不同内容的条目。
// 背景：真库上 raw-x 与 wiki-x 正文逐字相同，top10 被同一内容的两个 id 摊掉两个位。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-twin-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/retrieval.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, content) =>
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active' });
  const BODY = '落盘时先写临时文件再改名，失败不留残留。';
  put('raw-atomic', BODY);
  put('wiki-atomic', BODY);            // 逐字镜像
  put('doc-other', '落盘失败时的兜底处理与告警。');  // 相关但不同内容
  put('doc-noise', '番茄种植手册。');

  const LEX = { vector: 0, lexical: 1, name: 0 };
  const OFF = { kespi: 0, recency: 0 };
  const r = await R.search(store, '落盘', { weights: LEX, rerank: OFF, limit: 3 });
  const ids = (r.candidates || []).map((c) => c.id);
  const twins = ids.filter((id) => id === 'raw-atomic' || id === 'wiki-atomic');

  ac('AC-1 同内容孪生只占一个名次', twins.length === 1, JSON.stringify(ids));
  ac('AC-2 槽位让给不同内容', ids.includes('doc-other') && ids.length >= 2, JSON.stringify(ids));

  const merged = (r.candidates || []).find((c) => c.mergedIds && c.mergedIds.length) || null;
  ac('AC-3 被折叠的 id 有记录（可解释）', !!merged, JSON.stringify(r.candidates && r.candidates.map((c) => [c.id, c.mergedIds || []])));

  console.log(`\n----- 7.1m pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
