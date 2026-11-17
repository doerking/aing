'use strict';
// M7 任务 7.1p failing test —— 锁 SPEC-7.1 AC-12 的剩余两件：全局扩展上限 + 触发条件
// 病根：现在的扩展是「每个词各自 ≤3 条」——四个词的查询就可能扩出 6~12 条同义形，
//       等于把整句都摊开去撞字面；AC-12 要的是「查询扩展 ≤3 条」，是整句共用一个名额池。
// 契约：① 一次查询的同义扩展总数 ≤3（繁简/粤普归一不算扩展，不占名额）；
//       ② 只有短/模糊查询才触发（长而具体的问句不摊开）；
//       ③ 组内去重、原词恒在首位；④ 名额耗尽后不再补位。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-expcap-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const derive = require('../src/derive.js');
const R = require('../src/retrieval.js');

const SYN = new Set();
for (const g of Object.values(require('../data/lexicon/zh-synonym.json').groups)) for (const w of g) SYN.add(w);
const isSyn = (f, head) => f !== head && SYN.has(f);

(async () => {
  // AC-1 全局上限：四词短查询，扩展总数 ≤3（不是每词 3 条）
  const q = '写盘 归档 排序';
  const groups = R.queryTokenGroups(q);
  const heads = groups.map((g) => g[0]);
  const exts = [];
  groups.forEach((g, i) => { for (const f of g.slice(1)) if (isSyn(f, heads[i])) exts.push(f); });
  ac('AC-1 查询扩展整句共 ≤3 条',
    exts.length > 0 && exts.length <= 3,
    JSON.stringify({ exts, groups }));

  ac('AC-2 组内去重、原词恒在首位',
    groups.every((g) => new Set(g).size === g.length) &&
    heads.join('|') === '写盘|归档|排序',
    JSON.stringify(groups));

  // AC-3 长而具体的问句不摊开（繁简/粤普归一仍可留，但同义扩展一条都不加）
  const long = '把写盘过程的原子性落到持久化层再谈召回率的排序融合';
  const lg = R.queryTokenGroups(long);
  const longExts = [];
  lg.forEach((g) => { for (const f of g.slice(1)) if (isSyn(f, g[0])) longExts.push(f); });
  ac('AC-3 长问句不触发同义扩展',
    long.length > 8 && longExts.length === 0,
    JSON.stringify({ longExts, groups: lg }));

  // AC-4 短词仍触发
  const one = R.queryTokenGroups('写盘');
  ac('AC-4 短查询仍触发同义扩展',
    one.length === 1 && one[0].includes('落盘') && one[0][0] === '写盘',
    JSON.stringify(one));

  // AC-5 端到端：名额在组间按序分配，后面的词不再补位
  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active' });
  put('d1', '落盘要原子，失败不留残留。');
  put('d2', '存档按季度。');
  put('d3', '排名按融合分。');
  await require('../src/vector.js').vectorStep(store, {});
  const OFF = { kespi: 0, recency: 0 };
  const LEX = { vector: 0, lexical: 1, name: 0 };
  const r = await R.search(store, '写盘 归档 排序', { weights: LEX, rerank: OFF, limit: 5, intentRouting: false });
  const by = Object.fromEntries((r.candidates || []).map((c) => [c.id, c.channels.lexical]));
  ac('AC-5 端到端：名额按词轮转，三个词各得 1 条都能召回',
    by.d1 > 0 && by.d2 > 0 && by.d3 > 0,
    JSON.stringify(by));

  console.log(`\n----- 7.1p pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
