'use strict';
// M6 任务 6.13 failing test —— 意图路由（SPEC-6.13）
// 口径：规则分类可解释；只在证据清楚时改权重；一般查询逐项等于 SPEC-6.3 修订 B。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-intent-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const R = require('../src/retrieval.js');

(async () => {
  // AC-1 分类表（分类器可能尚未实现 → 先认红）
  let I = null;
  try { I = require('../src/intent.js'); } catch (_) {}
  const cases = [
    ['三分编组学说嗰份草案放咗喺边度', 'lookup'],
    ['e-20260101-0001 是哪条', 'lookup'],
    ['外派第一单搞掂未', 'recall'],
    ['上次讲过嘅复盘记录', 'recall'],
    ['技能和知识怎么互相代谢', 'explain'],
    ['点解向量要归一', 'explain'],
    ['安全债还剩几项没决策', 'general'],
    ['红蓝技能拉入完成', 'general']
  ];
  let ok1 = !!I && typeof I.classifyIntent === 'function';
  const got = [];
  if (ok1) {
    for (const [q, want] of cases) {
      const c = I.classifyIntent(q);
      got.push([q, want, c.intent]);
      if (c.intent !== want || !Array.isArray(c.hits) || c.intent !== 'general' ? !(c.hits.length > 0) : false) ok1 = false;
      if (c.intent === want && c.intent !== 'general' && (!c.hits || !c.hits.length)) ok1 = false;
    }
  }
  ac('AC-1 分类表（查物/回忆/解释/一般 各 ≥2 条，命中可解释）', ok1, JSON.stringify(got));

  // AC-2 优先级：找物压过回忆
  ac('AC-2 优先级 lookup > recall',
    !!I && I.classifyIntent('唔记得边份文件放咗喺边度').intent === 'lookup',
    I ? I.classifyIntent('唔记得边份文件放咗喺边度').intent : 'n/a');

  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, content, tags) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: tags || '[]', status: 'active' });
  V.registerBackend({ name: 'probe-sem', dim: 3, model: 'probe-sem', embed: (t) => (/落盘|临时文件/.test(String(t)) ? [1, 0, 0] : [0, 1, 0]) });
  put('e-20260101-0001', '无关正文。');
  put('doc-about-atomic', '落盘先写临时文件再改名。');
  put('doc-old', '落盘 归档 旧。');
  put('doc-new', '落盘 归档 新。');
  store._getDb().run("UPDATE entities SET updated_at='2020-01-01 00:00:00' WHERE id='doc-old'");
  await V.vectorStep(store, { backend: 'probe-sem' });
  const OFF = { kespi: 0, recency: 0 };
  const NOW = Date.parse('2026-11-17T00:00:00Z');

  // AC-3 lookup：id 精确命中因名称权重抬高排第一
  const r3 = await R.search(store, 'e-20260101-0001', { backend: 'probe-sem', rerank: OFF, limit: 3 });
  ac('AC-3 lookup 名称通道抬升（id 命中排前）',
    (r3.candidates[0] || {}).id === 'e-20260101-0001' && r3.meta.intent && r3.meta.intent.intent === 'lookup' &&
    r3.meta.weights.name >= 0.3,
    JSON.stringify({ ids: r3.candidates.map((c) => c.id), intent: r3.meta.intent, w: r3.meta.weights }));

  // AC-4 recall：新鲜度权重抬高，新的排前
  const r4 = await R.search(store, '上次 落盘 归档', { backend: 'probe-sem', now: NOW, limit: 3 });
  const rr4 = r4.meta.rerank || {};
  ac('AC-4 recall 抬新鲜度（rerank.recency=0.25 且新条排前）',
    r4.meta.intent && r4.meta.intent.intent === 'recall' && rr4.recency === 0.25 &&
    (r4.candidates[0] || {}).id === 'doc-new',
    JSON.stringify({ ids: r4.candidates.map((c) => c.id), rerank: rr4, intent: r4.meta.intent }));

  // AC-5 显式权重 / 关闭路由
  const r5 = await R.search(store, '边份文件 落盘', { backend: 'probe-sem', rerank: OFF, weights: { vector: 0, lexical: 1, name: 0 } });
  const r5b = await R.search(store, '边份文件 落盘', { backend: 'probe-sem', rerank: OFF, intentRouting: false });
  ac('AC-5 显式权重压过路由、关路由恢复缺省',
    r5.meta.weights.vector === 0 && r5.meta.weights.lexical === 1 &&
    r5b.meta.weights.vector === R.DEFAULTS.weights.vector && r5b.meta.weights.name === R.DEFAULTS.weights.name,
    JSON.stringify({ explicit: r5.meta.weights, off: r5b.meta.weights, intent: r5.meta.intent }));

  // AC-6 一般查询缺省不退步
  const r6 = await R.search(store, '安全债还剩几项没决策', { backend: 'probe-sem' });
  ac('AC-6 一般查询权重 = 修订 B 缺省',
    r6.meta.intent && r6.meta.intent.intent === 'general' &&
    ['vector', 'lexical', 'name'].every((k) => r6.meta.weights[k] === R.DEFAULTS.weights[k]),
    JSON.stringify({ w: r6.meta.weights, def: R.DEFAULTS.weights }));

  console.log(`\n----- 6.13 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });

