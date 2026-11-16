'use strict';
// aing-v2 tools/bench-retrieval.js —— 冻结评测集执行器（docs/Engineering/EMBEDDING-BENCH-2026-11-16.md §二）
// 口径：P@10、R@10、负例命中率（噪声代理）；按 zh / yue / en 分层单列，overall 不混算粤语结论。
// 隔离：默认在临时目录建库并载入 data/eval/corpus.jsonl，跑完即删；不碰 data/knowledge.db。
// 未实现：假边率、二跳污染率（需要链接构建器，留待后续）。

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULTS = {
  corpus: path.join(ROOT, 'data', 'eval', 'corpus.jsonl'),
  pairs: path.join(ROOT, 'data', 'eval', 'embedding-pairs.jsonl'),
  frozen: path.join(ROOT, 'data', 'eval', 'FROZEN.json'),
  k: 10
};

function readJsonl(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** 单题指标：ranked = 前 k 条 id（已按名次排好） */
function metricsFor(ranked, pair, k = DEFAULTS.k) {
  const top = ranked.slice(0, k);
  const pos = new Set(pair.pos || []);
  const neg = new Set(pair.neg || []);
  let hit = 0, negHit = 0;
  for (const id of top) {
    if (pos.has(id)) hit++;
    if (neg.has(id)) negHit++;
  }
  return {
    p10: hit / k,
    r10: pos.size ? hit / pos.size : 0,
    negHit: negHit > 0 ? 1 : 0,
    hit
  };
}

function _avg(rows, key) {
  return rows.length ? rows.reduce((s, r) => s + r[key], 0) / rows.length : 0;
}

function aggregate(rows) {
  const shape = (list) => ({
    n: list.length,
    p10: _avg(list, 'p10'),
    r10: _avg(list, 'r10'),
    negHitRate: _avg(list, 'negHit')
  });
  const byLang = {};
  const byKind = {};
  for (const r of rows) {
    (byLang[r.lang] = byLang[r.lang] || []).push(r);
    (byKind[r.kind] = byKind[r.kind] || []).push(r);
  }
  return {
    overall: shape(rows),
    byLang: Object.fromEntries(Object.entries(byLang).map(([k, v]) => [k, shape(v)])),
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, shape(v)]))
  };
}

async function runBench(opts = {}) {
  const t0 = process.hrtime.bigint();
  const corpusPath = opts.corpus || DEFAULTS.corpus;
  const pairsPath = opts.pairs || DEFAULTS.pairs;
  const frozenPath = opts.frozen || DEFAULTS.frozen;
  const k = Number.isInteger(opts.k) ? opts.k : DEFAULTS.k;
  const backend = opts.backend;
  const keep = !!opts.keep;

  const corpus = readJsonl(corpusPath);
  const pairs = readJsonl(pairsPath);
  const frozen = fs.existsSync(frozenPath) ? JSON.parse(fs.readFileSync(frozenPath, 'utf8')) : null;

  const yard = opts.dbPath || fs.mkdtempSync(path.join(opts.tmpDir || os.tmpdir(), 'aingv2-bench-'));
  const dbPath = path.join(yard, 'bench.db');

  const store = require('../src/knowledge-store.js');
  const V = require('../src/vector.js');
  const R = require('../src/retrieval.js');

  await store.init(dbPath);
  for (const e of corpus) {
    // 幂等：同库复跑不重复插入（也保证实体逐字段不被改写）
    if (store.getEntity && store.getEntity(e.id)) continue;
    store.insertEntity({ id: e.id, name: e.name, type: 'Concept', content: e.content, tags: '["eval"]' });
  }
  const vstats = await V.vectorStep(store, backend ? { backend } : {});

  const rows = [];
  for (const p of pairs) {
    const res = await R.search(store, p.q, { limit: k, ...(backend ? { backend } : {}) });
    const m = metricsFor(res.candidates.map((c) => c.base || c.id), p, k);
    rows.push({ q: p.q, lang: p.lang, kind: p.kind, ...m });
  }

  const result = {
    version: frozen ? frozen.version : null,
    backend: V.resolveBackend(backend).name,
    k,
    corpus: corpus.length,
    pairs: pairs.length,
    vector: vstats,
    elapsed_ms: Number(process.hrtime.bigint() - t0) / 1e6,
    ...aggregate(rows),
    rows
  };

  if (!opts.dbPath && !keep) {
    try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
  }
  return result;
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

function printTable(r) {
  const line = (label, s) =>
    `| ${label} | ${s.n} | ${pct(s.p10)} | ${pct(s.r10)} | ${pct(s.negHitRate)} |`;
  console.log(`评测集 v${r.version} · 后端 ${r.backend} · 语料 ${r.corpus} · 题 ${r.pairs} · K=${r.k}`);
  console.log('');
  console.log('| 分层 | 题数 | P@10 | R@10 | 负例命中率 |');
  console.log('|---|---|---|---|---|');
  console.log(line('全部', r.overall));
  for (const lang of ['zh', 'yue', 'en']) if (r.byLang[lang]) console.log(line(lang, r.byLang[lang]));
  console.log('');
  console.log('| 题型 | 题数 | P@10 | R@10 | 负例命中率 |');
  console.log('|---|---|---|---|---|');
  for (const kind of Object.keys(r.byKind)) console.log(line(kind, r.byKind[kind]));
}

module.exports = { DEFAULTS, metricsFor, aggregate, runBench, printTable, readJsonl };

// ── CLI ────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const get = (key) => { const i = args.indexOf('--' + key); return i >= 0 ? args[i + 1] : undefined; };
    const has = (key) => args.includes('--' + key);
    const r = await runBench({
      backend: get('backend'),
      k: get('k') ? Number(get('k')) : undefined,
      corpus: get('corpus'),
      pairs: get('pairs'),
      keep: has('keep')
    });
    if (has('json')) console.log(JSON.stringify(r, null, 2));
    else printTable(r);
  })().catch((e) => { console.error('bench 失败: ' + e.message); process.exitCode = 1; });
}
