'use strict';
// aing-v2 tools/backend-ab.js —— SPEC-5.6 后端对照自测 CLI
// 在**副本**上两阶段重建（字面 → 取卡 → 语义 → 取卡），出并排对照单，判定列留 `?` 由人手填。
// 真库保护：解析到 data/knowledge.db 直接拒绝（切换后端会重建向量表）。

const fs = require('fs');
const path = require('path');
const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
const AB = require('../src/backend-ab.js');
const { parseBody, readableTopic } = require('../src/conv-text.js');

const ROOT = path.join(__dirname, '..');
const REAL_DB = path.join(ROOT, 'data', 'knowledge.db');
const DEFAULT_QUERIES = path.join(ROOT, 'data', 'eval', 'backend-ab-queries.jsonl');
const LIT = 'hash-64w2';
const SEM = 'onnx-e5-small';

function readJsonl(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function argOf(argv, name, dflt) {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v == null || v.startsWith('--') ? true : v;
}

async function runAb(opts = {}) {
  const db = opts.db;
  if (!db) throw new Error('--db 必填（只许副本，SPEC-5.6 §二）');
  const resolved = path.resolve(db);
  if (resolved === path.resolve(REAL_DB)) throw new Error('拒绝在真库上跑：切换后端会重建向量表，请用副本');

  const queriesPath = opts.queries || DEFAULT_QUERIES;
  const queries = readJsonl(queriesPath);
  const k = Number.isInteger(opts.k) ? opts.k : AB.DEFAULT_K;

  await store.init(resolved);

  /** 与 memo / predict 同源的读法：markdown 会话不拿时间戳当名字（SPEC-2.19 口径） */
  const humanize = (hits) => hits.map((h) => {
    const e = typeof store.getEntity === 'function' ? store.getEntity(h.id) : null;
    const body = e ? parseBody(e) : null;
    const topic = e ? readableTopic(e.name, body) : (h.name || h.id);
    return { ...h, name: topic || h.name || h.id };
  });

  const lit = new Map();
  await V.vectorStep(store, { backend: LIT });
  for (const it of queries) lit.set(it.q, humanize(await V.search(store, it.q, { backend: LIT, k })));

  const O = require('../src/onnx-backend.js');
  const reg = await O.ensureRegistered({ host: process.env.AING_HF_HOST || undefined });
  if (!reg.ok) throw new Error(`语义后端不可用：${reg.reason}`);
  await V.vectorStep(store, { backend: SEM });
  const sem = new Map();
  for (const it of queries) sem.set(it.q, humanize(await V.search(store, it.q, { backend: SEM, k })));

  const sheet = await AB.buildSheet({
    queries,
    k,
    searchOf: async (side, q) => (side === 'lit' ? lit : sem).get(q) || []
  });
  return { sheet: sheet.sheet, rows: sheet.rows, k, queries: queries.length, db: resolved };
}

module.exports = { runAb, LIT, SEM, DEFAULT_QUERIES };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const db = argOf(args, 'db', '');
    if (!db || db === true) {
      console.error('用法：node tools/backend-ab.js --db <副本.db> [--queries <file>] [--k 3] [--out <file>]');
      console.error(`题源缺省：${DEFAULT_QUERIES}`);
      process.exitCode = 2;
      return;
    }
    const r = await runAb({
      db,
      queries: argOf(args, 'queries', DEFAULT_QUERIES),
      k: argOf(args, 'k', undefined) ? Number(argOf(args, 'k', undefined)) : undefined
    });
    const out = argOf(args, 'out', '');
    if (out && out !== true) {
      fs.writeFileSync(path.resolve(out), r.sheet, 'utf8');
      console.log(`对照单 ${r.queries} 条 → ${path.resolve(out)}`);
    } else {
      process.stdout.write(r.sheet);
    }
  })().catch((e) => { console.error('backend-ab 失败: ' + e.message); process.exitCode = 1; });
}
