'use strict';
// M7 任务 7.1g failing test —— 锁 SPEC-7.1 AC-12（查询扩展上限与权重递减）
// 口径：保留原查询；扩展形式最多 3 条；权重按序递减，扩展不得压过原词。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-exp-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/retrieval.js');
const OFF = { kespi: 0, recency: 0 };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active' });

  // 原词命中
  put('orig', '搞掂之后点样跟进');
  // 只命中派生形（普通话对照），原词不在正文
  put('gloss', '已经搞定，如何跟进');
  // 完全无关
  put('noise', '番茄种植手册');

  await require('../src/vector.js').vectorStep(store, {});
  const LEX = { vector: 0, lexical: 1, name: 0 };

  // AC-12a 扩展有上限：别名组 = 原词 + 最多 3 个扩展
  const groups = typeof R.queryTokenGroups === 'function' ? R.queryTokenGroups('搞掂') : null;
  ac('AC-12a 扩展上限 ≤3',
    Array.isArray(groups) && groups.length > 0 && groups.every((g) => g.length >= 1 && g.length <= 4) &&
    groups[0][0] === '搞掂',
    JSON.stringify(groups));

  // AC-12b 权重递减：原词命中的档必须高于只命中扩展形的档
  const r = await R.search(store, '搞掂', { weights: LEX, rerank: OFF, limit: 5 });
  const byId = Object.fromEntries((r.candidates || []).map((c) => [c.id, c.channels.lexical]));
  ac('AC-12b 权重递减（原词 > 扩展）',
    byId.orig != null && byId.orig > 0.9 && byId.gloss != null && byId.gloss < byId.orig * 0.8,
    JSON.stringify(byId));

  // AC-12c 原查询保留：扩展不改变「原词优先」的排序
  const ids = (r.candidates || []).map((c) => c.id);
  ac('AC-12c 原查询优先', ids[0] === 'orig', JSON.stringify(ids));

  console.log(`\n----- 7.1g pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
