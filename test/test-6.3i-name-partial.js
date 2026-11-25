'use strict';
// M6 任务 6.3i failing test —— 名称路要认部分命中（SPEC-6.3 修订 H）
// 病根（2026-11-18 真库实测）：nameScore 只认「整句 query 出现在 id 里」，自然语言问句几乎永真不中，
// 0.3 的名称权重在真库 24 题上全为空转；而 6 道未进候选的答案卡，关键词恰恰都在 id 里
// （首单外派 / 意识神经模块缺口 / 红蓝技能拉入 / 战役单 / 三分编组攻防学说草案）。
// 契约：id 整句包含仍是最高档（0.8）；部分命中按查询词在 id 上的二字覆盖比给分，上限压在其下；
//       opts.namePartial = 0 可关回旧口径；派生标题（name 字段）永不入键（SPEC-7.1 §二）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-namepart-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const R = require('../src/retrieval.js');

(async () => {
  // AC-1 档位契约：整句包含 0.8 仍高于任何部分命中
  const e = { id: 'todo-20261105-首单外派完成-dispatch' };
  ac('AC-1 整句包含仍是最高的部分档（≤0.8），部分命中不超过它',
    Math.abs(R.nameScore(e, '首单外派完成-dispatch') - 0.8) < 1e-9 &&
    R.nameScore(e, '外派第一单结果如何') > 0 &&
    R.nameScore(e, '外派第一单结果如何') < 0.8,
    JSON.stringify({
      exact: R.nameScore(e, '首单外派完成-dispatch'),
      part: R.nameScore(e, '外派第一单结果如何')
    }));

  ac('AC-2 与 id 完全无关的查询仍是 0（不靠乱猜给分）',
    R.nameScore(e, '俄乌无人机战役怎么拆的') < 0.2,
    JSON.stringify(R.nameScore(e, '俄乌无人机战役怎么拆的')));

  // AC-3 派生标题不入键：name 字段写了关键词但 id 没有 → 不给分
  ac('AC-3 派生标题不入键（只有 name 有关键词时不给分）',
    R.nameScore({ id: 'generic-42', name: '红蓝技能拉入完成' }, '红蓝技能是从哪里弄来的') < 1e-9,
    JSON.stringify(R.nameScore({ id: 'generic-42', name: '红蓝技能拉入完成' }, '红蓝技能是从哪里弄来的')));

  // AC-4 可关闭：namePartial=0 回到旧口径（部分命中 0）
  ac('AC-4 opts.namePartial=0 可关回旧口径',
    R.nameScore(e, '外派第一单结果如何', 0) === 0 &&
    R.nameScore(e, '首单外派完成-dispatch', 0) === 0.8,
    JSON.stringify({ off: R.nameScore(e, '外派第一单结果如何', 0) }));

  // AC-5 端到端：等向量分下，id 完整叫出这件事（不是整句照抄）的卡压过只沾边的正文卡
  await store.init(path.join(yard, 'knowledge.db'));
  V.registerBackend({ name: 'probe-nm', dim: 2, model: 'probe-nm', embed: () => [1, 0] });
  store.insertEntity({ id: 'todo-dispatch-首单外派-完成-20', name: '首单外派完成', type: 'Todo', content: 'U1 三人全通。', tags: '[]', status: 'active' });
  store.insertEntity({ id: 'noise-long', name: 'noise-long', type: 'Concept', content: '关于首单的外派情况，完成后另行汇报，我们讨论了许久。', tags: '[]', status: 'active' });
  await V.vectorStep(store, { backend: 'probe-nm' });
  const OFF = { kespi: 0, recency: 0 };
  const Q = '首单外派完成';
  const r = await R.search(store, Q, { backend: 'probe-nm', rerank: OFF, intentRouting: false, limit: 5 });
  const ids = r.candidates.map((c) => c.id);
  ac('AC-5 端到端：id 完整叫出这件事的卡压过只沾边的正文卡', ids[0] === 'todo-dispatch-首单外派-完成-20',
    JSON.stringify(r.candidates.map((c) => [c.id, +(c.final).toFixed(3), c.channels])));

  const r2 = await R.search(store, Q, { backend: 'probe-nm', rerank: OFF, intentRouting: false, limit: 5, namePartial: 0 });
  const fin = (rr, id) => (rr.candidates.find((c) => c.id === id) || {}).final;
  ac('AC-6 关闭名称部分命中后，待办卡回落、只沾边的正文卡不动（证明 AC-5 的加分来自本改动）',
    fin(r2, 'todo-dispatch-首单外派-完成-20') < fin(r, 'todo-dispatch-首单外派-完成-20') - 0.1 &&
    Math.abs(fin(r2, 'noise-long') - fin(r, 'noise-long')) < 1e-9,
    JSON.stringify({
      on: [fin(r, 'todo-dispatch-首单外派-完成-20'), fin(r, 'noise-long')],
      off: [fin(r2, 'todo-dispatch-首单外派-完成-20'), fin(r2, 'noise-long')]
    }));

  console.log(`\n----- 6.3i pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });

