'use strict';
// M6 任务 6.3e failing test —— 缺省融合权重按真库人工判读集重定（SPEC-6.3 修订 E）
// 依据：真库 24 条真问题人工判读（top1 正确答案卡 9/24、top3 14/24），
//       缺省 0.8/0.05/0.15 → 0.5/0.2/0.3 后 top1 12/24、top3 15/24、MRR 0.512→0.591。
// 冻结集对本项无分辨力（SPEC-6.3 §十三），故以真库判读集为准；旧口径可显式传 opts.weights 恢复。
// 边界：显式档位（lookup / explain）不动；recall 无自有权重，随缺省走。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dw-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const R = require('../src/retrieval.js');
const I = require('../src/intent.js');

(async () => {
  const w = R.DEFAULTS.weights;
  const sum = w.vector + w.lexical + w.name;
  ac('AC-1 缺省权重重定为 0.5/0.2/0.3（和为 1，词面与名称通道合计不低于 0.5）',
    Math.abs(w.vector - 0.5) < 1e-9 && Math.abs(w.lexical - 0.2) < 1e-9 && Math.abs(w.name - 0.3) < 1e-9 &&
    Math.abs(sum - 1) < 1e-9,
    JSON.stringify({ w, sum }));

  const ex = I.PROFILES.explain.weights;
  const lk = I.PROFILES.lookup.weights;
  ac('AC-2 显式档位不动（explain 仍向量主导 ≥0.8；lookup 仍 0.55/0.1/0.35）',
    ex.vector >= 0.8 && Math.abs(lk.vector - 0.55) < 1e-9 && Math.abs(lk.name - 0.35) < 1e-9,
    JSON.stringify({ ex, lk }));

  const rc = I.classifyIntent('上次讲过的那个部署记录');
  ac('AC-3 recall 无自有权重（随缺省走）+ 判意图仍可命中',
    rc.intent === 'recall' && rc.weights && Object.keys(rc.weights).length === 0,
    JSON.stringify(rc));

  await store.init(path.join(yard, 'knowledge.db'));
  // 语义桩：仅「锚点」这条查询 →[1,0]；正文含「锚点」→sim 0.3；正文含「近义」→sim 0.55
  V.registerBackend({
    name: 'probe-w', dim: 2, model: 'probe-w',
    embed: (t) => {
      const s = String(t);
      if (s.trim() === '锚点') return [1, 0];
      if (/锚点/.test(s)) return [0.3, 0.954];
      if (/近义/.test(s)) return [0.55, 0.835];
      return [0, 1];
    }
  });
  store.insertEntity({ id: 'high', name: 'high', type: 'Concept', content: '近义 纯语义命中。', tags: '[]', status: 'active' });
  store.insertEntity({ id: 'x-锚点', name: 'x-锚点', type: 'Concept', content: '中性正文。', tags: '[]', status: 'active' });
  await V.vectorStep(store, { backend: 'probe-w' });

  const OFF = { kespi: 0, recency: 0 };
  const r = await R.search(store, '锚点', { backend: 'probe-w', rerank: OFF, intentRouting: false, limit: 3 });
  const ids = (r.candidates || []).map((c) => c.id);
  ac('AC-4 新缺省下名称命中可压过纯语义命中（sim 0.3 + 名称 0.8 vs sim 0.55）',
    ids[0] === 'x-锚点',
    JSON.stringify((r.candidates || []).map((c) => [c.id, +(c.final == null ? c.fused : c.final).toFixed(3)])));

  const r2 = await R.search(store, '锚点', { backend: 'probe-w', rerank: OFF, intentRouting: false, limit: 3, weights: { vector: 0.8, lexical: 0.05, name: 0.15 } });
  const ids2 = (r2.candidates || []).map((c) => c.id);
  ac('AC-5 旧口径可显式恢复（传 0.8/0.05/0.15 时纯语义命中重新排第一）',
    ids2[0] === 'high',
    JSON.stringify(ids2));

  console.log(`\n----- 6.3e pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
