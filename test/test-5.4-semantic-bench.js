'use strict';
// M5 任务 5.4 failing test —— 语义后端旁路评测（SPEC-5.4）
// 只测纯函数面：注入假嵌入器，不联网、不加载模型、不碰 src/vector.js 的同步契约。
const assert = require('assert');

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const SR = require('../src/semantic-rank.js');
const BR = require('../tools/bench-retrieval.js');

// 假嵌入器：文本 → 定长向量（按关键词记号），并记录收到的文本
function makeFakeEmbedder(dim = 4) {
  const seen = [];
  const embedBatch = async (texts) => {
    const out = [];
    for (const t of texts) {
      seen.push(t);
      const v = new Float64Array(dim).fill(0);
      const s = String(t);
      if (s.includes('回炉')) v[0] = 1;
      if (s.includes('检索')) v[1] = 1;
      if (s.includes('固化')) v[2] = 1;
      if (s.includes('向量')) v[3] = 1;
      out.push(v);
    }
    return out;
  };
  return { embedBatch, seen };
}

const corpus = [
  { id: 'e1', name: '回炉', content: '把已压缩的籽重新展开成微粒。' },
  { id: 'e2', name: '检索', content: '用余弦相似度找最接近的实体。' },
  { id: 'e3', name: '固化', content: '把活跃实体压成籽。' }
];
const pairs = [
  { q: '回炉闭环', pos: ['e1'], neg: ['e3'], lang: 'zh', kind: 'paraphrase' },
  { q: '检索', pos: ['e2'], neg: [], lang: 'zh', kind: 'exact' }
];

(async () => {
  // AC-1 cosine：零向量不自造 NaN；同向量为 1
  {
    const z = new Float64Array([0, 0, 0, 0]);
    const a = new Float64Array([1, 0, 0, 0]);
    const c1 = SR.cosine(a, a);
    const c2 = SR.cosine(a, z);
    ac('AC-1 零向量安全', Math.abs(c1 - 1) < 1e-9 && c2 === 0 && !Number.isNaN(c2),
      JSON.stringify({ c1, c2 }));
  }

  // AC-2 rankBy：分数降序，同分按 id 升序
  {
    const q = new Float64Array([1, 0, 0, 0]);
    const vecs = new Map([
      ['z', new Float64Array([0, 1, 0, 0])],
      ['b', new Float64Array([1, 0, 0, 0])],
      ['a', new Float64Array([1, 0, 0, 0])],
      ['c', new Float64Array([0.5, 0.5, 0, 0])]
    ]);
    const ranked = SR.rankBy([...vecs.keys()], vecs, q);
    const ids = ranked.map((r) => r.id).join(',');
    ac('AC-2 排序确定', ids === 'a,b,c,z', ids);
  }

  // AC-3 前缀恰好加一次
  {
    const { embedBatch, seen } = makeFakeEmbedder();
    await SR.evaluate({ corpus, pairs, k: 3, embedBatch, queryPrefix: 'query: ', docPrefix: 'passage: ' });
    const qs = seen.filter((t) => t.startsWith('query: '));
    const ds = seen.filter((t) => t.startsWith('passage: '));
    const dbl = seen.filter((t) => t.startsWith('query: query: ') || t.startsWith('passage: passage: '));
    ac('AC-3 前缀各一次', qs.length === pairs.length && ds.length === corpus.length && dbl.length === 0,
      JSON.stringify({ qs: qs.length, ds: ds.length, dbl: dbl.length }));
  }

  // AC-4 指标与 bench-retrieval.metricsFor 口径一致
  {
    const { embedBatch } = makeFakeEmbedder();
    const r = await SR.evaluate({ corpus, pairs, k: 3, embedBatch });
    const row = r.rows[0] || {};
    const rankedIds = row.ranked || [];
    const m = BR.metricsFor(rankedIds, pairs[0], 3);
    ac('AC-4 指标同源', row.p10 === m.p10 && row.r10 === m.r10 && row.negHit === m.negHit,
      JSON.stringify({ row: { p10: row.p10, r10: row.r10, negHit: row.negHit }, m }));
  }

  // AC-5 复跑逐字一致
  {
    const a = await SR.evaluate({ corpus, pairs, k: 3, embedBatch: makeFakeEmbedder().embedBatch });
    const b = await SR.evaluate({ corpus, pairs, k: 3, embedBatch: makeFakeEmbedder().embedBatch });
    const strip = (x) => JSON.stringify({ ...x, elapsed_ms: 0 });
    ac('AC-5 复跑一致', strip(a) === strip(b), '两次结果不同');
  }

  // AC-6 空集不抛、计数 0、k 缺省 10
  {
    let ok = true, msg = '';
    try {
      const r = await SR.evaluate({ corpus: [], pairs: [], embedBatch: makeFakeEmbedder().embedBatch });
      ok = r.corpus === 0 && r.pairs === 0 && r.k === 10 && r.overall.n === 0;
      msg = JSON.stringify({ corpus: r.corpus, pairs: r.pairs, k: r.k });
    } catch (e) { ok = false; msg = e.message; }
    ac('AC-6 空集安全', ok, msg);
  }

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
