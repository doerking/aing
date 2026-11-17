'use strict';
// tools/judge-real.js —— 真库判读集评分器（SPEC-6.3 修订 E/F 的调参标尺）
// 读 data/eval/real-labeled-*.json（题 + 人工判读的正确答案卡），在真库冷备副本上跑检索，
// 出 top1 / top3 / MRR 与逐题名次。任何检索改动前后跑同一条命令，结论才可比。
// 只读：副本跑完即删，不碰 data/knowledge.db，不写 last_access。
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULTS = {
  db: path.join(ROOT, 'data', 'knowledge.db'),
  labels: path.join(ROOT, 'data', 'eval', 'real-labeled-2026-11-18.json'),
  limit: 10
};

function parseWeights(s) {
  if (!s) return undefined;
  const parts = String(s).split(',').map((x) => Number(x.trim()));
  if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) {
    throw new Error('--weights 需要三个数：vector,lexical,name');
  }
  return { vector: parts[0], lexical: parts[1], name: parts[2] };
}

async function judge(opts = {}) {
  const dbPath = opts.db || DEFAULTS.db;
  const labelsPath = opts.labels || DEFAULTS.labels;
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULTS.limit;
  const weights = opts.weights || undefined;

  const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-judge-'));
  const copy = path.join(yard, 'knowledge.db');
  fs.copyFileSync(dbPath, copy);

  const store = require(path.join(ROOT, 'src', 'knowledge-store.js'));
  const R = require(path.join(ROOT, 'src', 'retrieval.js'));
  await store.init(copy);
  // 语义后端按缺省注册；注册不上就照旧回退字面（run 结果里带 backend 名，便于解释）
  let backend = null;
  try {
    const reg = await require(path.join(ROOT, 'src', 'onnx-backend.js')).ensureRegistered();
    if (reg && reg.ok) backend = reg.name || 'onnx-e5-small';
  } catch (_) { /* 回退字面 */ }

  const rows = [];
  for (const item of labels.items) {
    const want = Array.isArray(item.answers) ? item.answers : [];
    const r = await R.search(store, item.q, { limit, ...(weights ? { weights } : {}) });
    const ids = (r.candidates || []).map((c) => c.id);
    const rank = want.map((w) => ids.indexOf(w) + 1).filter((x) => x > 0).sort((a, b) => a - b)[0] || 0;
    rows.push({ n: item.n, q: item.q, want, rank });
  }
  fs.rmSync(yard, { recursive: true, force: true });

  const top1 = rows.filter((r) => r.rank === 1).length;
  const top3 = rows.filter((r) => r.rank >= 1 && r.rank <= 3).length;
  const mrr = rows.reduce((s, r) => s + (r.rank >= 1 ? 1 / r.rank : 0), 0) / rows.length;
  const miss = rows.filter((r) => r.rank === 0).length;
  return {
    labels: path.relative(ROOT, labelsPath),
    version: labels.version,
    limit,
    weights: weights || R.DEFAULTS.weights,
    backend,
    n: rows.length,
    top1, top3, mrr: Math.round(mrr * 1000) / 1000, miss,
    rows
  };
}

function printTable(r) {
  console.log(`判读集 ${r.version} · 题 ${r.n} · K=${r.limit} · 权重 ${JSON.stringify(r.weights)} · 后端 ${r.backend || '字面回退'}`);
  console.log(`top1 ${r.top1}/${r.n} · top3 ${r.top3}/${r.n} · MRR ${r.mrr} · 未进候选 ${r.miss}`);
  console.log('');
  console.log('| 题 | 名次 | 问题 |');
  console.log('|---|---|---|');
  for (const row of r.rows) console.log(`| ${row.n} | ${row.rank || '>K'} | ${row.q} |`);
}

module.exports = { DEFAULTS, judge, printTable, parseWeights };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const get = (key) => { const i = args.indexOf('--' + key); return i >= 0 ? args[i + 1] : undefined; };
    const has = (key) => args.includes('--' + key);
    const r = await judge({
      db: get('db'),
      labels: get('labels'),
      limit: get('limit') ? Number(get('limit')) : undefined,
      weights: parseWeights(get('weights'))
    });
    if (has('json')) console.log(JSON.stringify(r, null, 2));
    else printTable(r);
  })().catch((e) => { console.error('judge-real 失败: ' + e.message); process.exitCode = 1; });
}
