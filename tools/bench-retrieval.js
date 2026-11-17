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

/** 指标口径单一真源在 src/eval-metrics.js（SPEC-5.4 起与语义旁路共用） */
const { metricsFor, aggregate, pct } = require('../src/eval-metrics.js');


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

  // SPEC-5.9：缺省后端已是语义；跑冻结集前按缺省/显式请求注册，注册不上才回退字面并告警
  {
    const want = String(backend || process.env.AING_VECTOR_BACKEND || V.DEFAULT_BACKEND);
    if (want.startsWith('onnx-')) {
      const reg = await require('../src/onnx-backend.js').ensureRegistered();
      if (!reg.ok) console.error(`[vector] 语义后端不可用（${reg.reason}），回退 ${V.MODEL}`);
    }
  }

  await store.init(dbPath);
  for (const e of corpus) {
    // 幂等：同库复跑不重复插入（也保证实体逐字段不被改写）
    if (store.getEntity && store.getEntity(e.id)) continue;
    store.insertEntity({ id: e.id, name: e.name, type: 'Concept', content: e.content, tags: '["eval"]' });
  }
  // 评测确定性（AC-3）：把 updated_at 钉成固定时刻。
  // 否则 CURRENT_TIMESTAMP 在批量插入跨秒时会把语料切成两组，
  // 新鲜度打分被墙钟影响，同输入两次跑可能得到不同名次。
  store._getDb().run("UPDATE entities SET updated_at = '2026-01-01 00:00:00'");
  store._persist();
  const vstats = await V.vectorStep(store, backend ? { backend } : {});

  // 新鲜度参考时刻取语料最新一条（评测可复现；不随墙钟漂移）
  const nowRef = corpus.reduce((mx, e) => {
    const t = R.parseTs((store.getEntity(e.id) || {}).updated_at);
    return Number.isNaN(t) ? mx : Math.max(mx, t);
  }, 0) || undefined;

  // 精排消融（SPEC-6.3 修订 D 实验面）：缺省不传，行为与生产同
  const rerank = opts.rerank && typeof opts.rerank === 'object' ? opts.rerank : null;
  const rows = [];
  for (const p of pairs) {
    const res = await R.search(store, p.q, {
      limit: k, now: nowRef,
      ...(backend ? { backend } : {}),
      ...(rerank ? { rerank } : {})
    });
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
    const rerank = (get('kespi') != null || get('recency') != null)
      ? { ...(get('kespi') != null ? { kespi: Number(get('kespi')) } : {}),
          ...(get('recency') != null ? { recency: Number(get('recency')) } : {}) }
      : undefined;
    const r = await runBench({
      backend: get('backend'),
      k: get('k') ? Number(get('k')) : undefined,
      corpus: get('corpus'),
      pairs: get('pairs'),
      rerank,
      keep: has('keep')
    });
    if (has('json')) console.log(JSON.stringify(r, null, 2));
    else printTable(r);
  })().catch((e) => { console.error('bench 失败: ' + e.message); process.exitCode = 1; });
}
