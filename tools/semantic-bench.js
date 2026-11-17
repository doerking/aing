'use strict';
// aing-v2 tools/semantic-bench.js —— 语义后端旁路评测 CLI（SPEC-5.4）
// 只读冻结集，自己编码自己排序，指标口径复用 src/eval-metrics.js（与 bench-retrieval 同一套）。
// 不改管线、不改发布默认、不写任何库。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SR = require('../src/semantic-rank.js');
const BR = require('../tools/bench-retrieval.js');
const { createOnnxEmbedder, prefixesFor } = require('./onnx-embed.js');
const { pct, aggregate } = require('../src/eval-metrics.js');

function top1Rate(rows) {
  return rows.length ? rows.filter((r) => (r.pos || []).includes(r.ranked[0])).length / rows.length : 0;
}

function withPos(pairs, rows) {
  const byQ = new Map();
  for (const p of pairs) if (!byQ.has(p.q)) byQ.set(p.q, p.pos || []);
  return rows.map((r) => ({ ...r, pos: byQ.get(r.q) || [] }));
}

function frozenSummary(frozenPath) {
  if (!fs.existsSync(frozenPath)) return null;
  const f = JSON.parse(fs.readFileSync(frozenPath, 'utf8'));
  let ok = true;
  const problems = [];
  const base = path.dirname(frozenPath);
  for (const [name, meta] of Object.entries((f && f.files) || {})) {
    const p = path.join(base, name);
    if (!fs.existsSync(p)) { ok = false; problems.push(name + ':missing'); continue; }
    const buf = fs.readFileSync(p);
    const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
    if (sha1 !== meta.sha1) { ok = false; problems.push(name + ':sha1'); }
    if (buf.length !== meta.bytes) { ok = false; problems.push(name + ':bytes'); }
  }
  return { version: f.version, ok, problems };
}

function printTable(r) {
  const line = (label, rows) => {
    const agg = aggregate(rows);
    const s = agg.overall;
    return `| ${label} | ${s.n} | ${pct(s.p10)} | ${pct(s.r10)} | ${pct(s.negHitRate)} | ${pct(top1Rate(rows))} |`;
  };
  console.log(`${r.model} · 维度 ${r.dim} · 前缀 ${r.queryPrefix ? 'query/passage' : '无'} · 语料 ${r.corpus} · 题 ${r.pairs} · K=${r.k}`);
  if (r.frozen) console.log(`冻结集 v${r.frozen.version}${r.frozen.ok ? '（sha1/字节校验通过）' : '（⚠️ 校验失败：' + r.frozen.problems.join(',') + '）'}`);
  console.log('');
  console.log('| 分层 | 题数 | P@10 | R@10 | 负例命中率 | 顶1 |');
  console.log('|---|---|---|---|---|---|');
  console.log(line('全部', r.rows));
  for (const [k, list] of Object.entries(groupBy(r.rows, 'lang'))) console.log(line(k, list));
  console.log('');
  console.log('| 题型 | 题数 | P@10 | R@10 | 负例命中率 | 顶1 |');
  console.log('|---|---|---|---|---|---|');
  for (const [k, list] of Object.entries(groupBy(r.rows, 'kind'))) console.log(line(k, list));
}

function groupBy(rows, key) {
  const out = {};
  for (const r of rows) (out[r[key]] = out[r[key]] || []).push(r);
  return out;
}

async function runSemanticBench(opts = {}) {
  const corpusPath = opts.corpus || BR.DEFAULTS.corpus;
  const pairsPath = opts.pairs || BR.DEFAULTS.pairs;
  const frozenPath = opts.frozen || BR.DEFAULTS.frozen;
  const k = Number.isInteger(opts.k) ? opts.k : BR.DEFAULTS.k;

  const corpus = BR.readJsonl(corpusPath);
  const pairs = BR.readJsonl(pairsPath);
  const frozen = frozenSummary(frozenPath);

  const embedder = opts.embedder || await createOnnxEmbedder({ model: opts.model, host: opts.host });
  const pf = opts.prefixes || prefixesFor(opts.model || embedder.model);

  const res = await SR.evaluate({
    corpus, pairs, k,
    embedBatch: embedder.embedBatch,
    queryPrefix: pf.queryPrefix,
    docPrefix: pf.docPrefix
  });

  const rows = withPos(pairs, res.rows);
  return {
    model: embedder.model,
    dim: embedder.dim || 0,
    queryPrefix: pf.queryPrefix,
    docPrefix: pf.docPrefix,
    k: res.k,
    corpus: res.corpus,
    pairs: res.pairs,
    elapsed_ms: res.elapsed_ms,
    frozen,
    overall: res.overall,
    byLang: res.byLang,
    byKind: res.byKind,
    top1: { overall: top1Rate(rows), byLang: Object.fromEntries(Object.entries(groupBy(rows, 'lang')).map(([g, l]) => [g, top1Rate(l)])), byKind: Object.fromEntries(Object.entries(groupBy(rows, 'kind')).map(([g, l]) => [g, top1Rate(l)])) },
    rows
  };
}

module.exports = { runSemanticBench, top1Rate, frozenSummary };

// ── CLI ────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const get = (key) => { const i = args.indexOf('--' + key); return i >= 0 ? args[i + 1] : undefined; };
    const has = (key) => args.includes('--' + key);
    const r = await runSemanticBench({
      model: get('model'),
      host: get('host'),
      k: get('k') ? Number(get('k')) : undefined
    });
    if (has('json')) console.log(JSON.stringify(r, null, 2));
    else printTable(r);
  })().catch((e) => { console.error('semantic-bench 失败: ' + e.message); process.exitCode = 1; });
}
