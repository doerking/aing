'use strict';
// M6 任务 6.3f failing test —— 检索结果不得依赖请求的 K（SPEC-6.3 修订 F）
// 病根（2026-11-18 实测）：向量路按 k=limit*3 取池，只从词面/名称路进来的候选拿不到向量分（sim=0），
// 于是同一张卡在 K=6 与 K=12 下融合分差 3.7 倍（0.148 vs 0.554），名次跟着翻转（真库 23/24 题）。
// 契约：候选池与请求 K 脱钩——大 K 的结果必须严格以「小 K 的完整序列」为前缀；同一 id 的融合分与 K 无关。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kfree-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const R = require('../src/retrieval.js');

// 桩：文本里的 v:<x> 决定与查询「目标」的余弦相似度（查询向量 [1,0]）
const embedByV = (t) => {
  const s = String(t).trim();
  if (s === '目标') return [1, 0];            // 查询词锚在 [1,0]，正文分由 v:<x> 决定
  const m = s.match(/v:([01](?:\.\d+)?)/);
  const x = m ? Number(m[1]) : 0.1;
  return [x, Math.sqrt(Math.max(0, 1 - x * x))];
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  V.registerBackend({ name: 'probe-k', dim: 2, model: 'probe-k', embed: embedByV });

  // 3 条近干扰（0.95）：K=6 时压住目标卡
  for (let i = 0; i < 3; i++) {
    store.insertEntity({ id: 'near-' + i, name: 'near-' + i, type: 'Concept', content: `v:0.95 近干扰 ${i}`, tags: '[]', status: 'active' });
  }
  // 15 条中干扰（0.90）：正好填满小池（limit 6 → k=18）
  for (let i = 0; i < 15; i++) {
    store.insertEntity({ id: 'mid-' + i, name: 'mid-' + i, type: 'Concept', content: `v:0.90 中干扰 ${i}`, tags: '[]', status: 'active' });
  }
  // 7 条远干扰（0.30）
  for (let i = 0; i < 7; i++) {
    store.insertEntity({ id: 'far-' + i, name: 'far-' + i, type: 'Concept', content: `v:0.30 远干扰 ${i}`, tags: '[]', status: 'active' });
  }
  // 目标卡：向量较低（0.50）、正文与 id 都含「目标」——小池里拿不到向量分
  store.insertEntity({ id: 'target-目标', name: 'target-目标', type: 'Concept', content: 'v:0.50 目标 的记录', tags: '[]', status: 'active' });
  await V.vectorStep(store, { backend: 'probe-k' });

  const OFF = { kespi: 0, recency: 0 };
  const run = async (K) => R.search(store, '目标', { backend: 'probe-k', rerank: OFF, intentRouting: false, limit: K });
  const r6 = await run(6);
  const r20 = await run(20);
  const ids6 = r6.candidates.map((c) => c.id);
  const ids20 = r20.candidates.map((c) => c.id);
  const f6 = (r6.candidates.find((c) => c.id === 'target-目标') || {}).final;
  const f20 = (r20.candidates.find((c) => c.id === 'target-目标') || {}).final;

  ac('AC-1 同一候选的融合分与请求 K 无关（只从词面进来的候选也要拿到向量分）',
    f6 != null && f20 != null && Math.abs(f6 - f20) < 1e-9,
    JSON.stringify({ f6, f20 }));

  ac('AC-2 大 K 以完整小 K 序列为前缀（K=6 对 K=20）',
    ids20.slice(0, ids6.length).join('|') === ids6.join('|'),
    JSON.stringify({ ids6: ids6.slice(0, 5), ids20: ids20.slice(0, 5) }));

  const probes = [3, 5, 8, 10];
  const bad = [];
  for (const K of probes) {
    const rk = (await run(K)).candidates.map((c) => c.id);
    if (ids20.slice(0, rk.length).join('|') !== rk.join('|')) bad.push(K);
  }
  ac('AC-3 多个 K 一律前缀一致（3/5/8/10 对 20）', bad.length === 0, JSON.stringify(bad));

  const a = (await run(10)).candidates.map((c) => c.id).join('|');
  const b = (await run(10)).candidates.map((c) => c.id).join('|');
  ac('AC-4 同输入两次调用逐位一致（确定性）', a === b, JSON.stringify({ a: a.slice(0, 60), b: b.slice(0, 60) }));

  // 慢回忆仍要可复现：强制扩跳时，前缀性质不变
  const s6 = await R.search(store, '目标', { backend: 'probe-k', rerank: OFF, intentRouting: false, limit: 6, forceSlow: true });
  const s20 = await R.search(store, '目标', { backend: 'probe-k', rerank: OFF, intentRouting: false, limit: 20, forceSlow: true });
  const i6 = s6.candidates.map((c) => c.id);
  const i20 = s20.candidates.map((c) => c.id);
  ac('AC-5 强制慢回忆下前缀性质同样成立',
    i20.slice(0, i6.length).join('|') === i6.join('|'),
    JSON.stringify({ i6: i6.slice(0, 4), i20: i20.slice(0, 4), slow6: s6.meta.slowExpanded, slow20: s20.meta.slowExpanded }));

  console.log(`\n----- 6.3f pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
