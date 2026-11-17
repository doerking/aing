'use strict';
// M6 任务 6.3c failing test —— 会话原文在文档路也让位（SPEC-6.3 修订 C）
// 背景：切语义后相似度挤在 0.84–0.87 的窄带，KESPI/新鲜度的绝对加分直接接管排序，
//      「技能注册：xxx」这类会话原文把真档挤出前三。SPEC-7.1 §〇 的「源头不是答案」
//      目前只对词面通道打折，向量通道没打。
// 口径：一般/查物/解释意图下，Conversation 的向量分按 SOURCE_PRIOR 打折；
//      回忆意图（recall）不折——那时会话原文就是要找的东西。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-convprior-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const R = require('../src/retrieval.js');

// 2 维桩：查询 → [1,0]；conv → 余弦 0.90；concept → 余弦 0.87（模拟窄带）
const byMark = (t) => {
  const s = String(t);
  if (s.includes('Q') || s.includes('查询词')) return [1, 0];
  if (s.includes('CONV')) return [0.9, Math.sqrt(1 - 0.81)];
  if (s.includes('CONCEPT')) return [0.87, Math.sqrt(1 - 0.7569)];
  return [0, 1];
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  V.registerBackend({ name: 'probe-narrow', dim: 2, model: 'probe-narrow', embed: byMark });
  store.insertEntity({ id: 'conv-session', name: 'CONV', type: 'Conversation', content: '会话记录 CONV。', tags: '[]', status: 'active' });
  store.insertEntity({ id: 'doc-answer', name: 'CONCEPT', type: 'Todo', content: '答案正文 CONCEPT。', tags: '[]', status: 'active' });
  await V.vectorStep(store, { backend: 'probe-narrow' });

  const OFF = { kespi: 0, recency: 0 };
  // 一般意图：概念件应压过更相似的会话原文
  const r1 = await R.search(store, '查询词 Q', { backend: 'probe-narrow', rerank: OFF, weights: { vector: 1, lexical: 0, name: 0 } });
  const ids1 = r1.candidates.map((c) => c.id);
  ac('AC-1 一般意图：会话向量分打折，概念件排前',
    ids1[0] === 'doc-answer' && r1.meta.intent && r1.meta.intent.intent === 'general',
    JSON.stringify({ ids: ids1, intent: r1.meta.intent }));

  // 回忆意图：不折，会话原文排前
  const r2 = await R.search(store, '上次 查询词 Q 结果如何', { backend: 'probe-narrow', rerank: OFF, weights: { vector: 1, lexical: 0, name: 0 } });
  const ids2 = r2.candidates.map((c) => c.id);
  ac('AC-2 回忆意图：会话不折，会话原文排前',
    ids2[0] === 'conv-session' && r2.meta.intent && r2.meta.intent.intent === 'recall',
    JSON.stringify({ ids: ids2, intent: r2.meta.intent }));

  // AC-3 概念件不受影响（两种意图下分数一致）
  const f1 = (r1.candidates.find((c) => c.id === 'doc-answer') || {}).final;
  const f2 = (r2.candidates.find((c) => c.id === 'doc-answer') || {}).final;
  ac('AC-3 概念件分数不随意图变', typeof f1 === 'number' && Math.abs(f1 - (f2 || 0)) < 1e-9, JSON.stringify({ f1, f2 }));

  // AC-4 折扣系数可解释（导出 SOURCE_PRIOR，且回忆意图下等于 1）
  ac('AC-4 SOURCE_PRIOR 导出且 <1', typeof R.SOURCE_PRIOR === 'number' && R.SOURCE_PRIOR > 0 && R.SOURCE_PRIOR < 1, String(R.SOURCE_PRIOR));

  console.log(`\n----- 6.3c pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
