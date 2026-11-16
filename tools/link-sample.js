'use strict';
// tools/link-sample.js —— SPEC-2.19 链接质量取样器（只读）
// 出的是「给人判的样本单」：一条边一行，或一条两跳三元组一行，判定列留 ?。
// 不判、不算率——判分另走 tools/judge-score.js，只认人手填的值。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('../src/knowledge-store.js');
const { parseBody, readableTopic } = require('../src/conv-text.js');

const NL = String.fromCharCode(10);
const TITLE_MAX = 28;

function argOf(argv, name, dflt) {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v == null || v.startsWith('--') ? true : v;
}

function sha1(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex');
}

function cell(text) {
  return String(text == null ? '' : text).replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
}

function shortId(id) {
  const s = String(id);
  return s.length <= 22 ? s : s.slice(0, 12) + '…' + s.slice(-6);
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function load(db) {
  const ents = new Map();
  for (const e of _rows(db, 'SELECT id, name, type, content FROM entities')) {
    ents.set(String(e.id), {
      id: String(e.id),
      type: e.type,
      title: readableTopic(e.name, parseBody(e))
    });
  }
  const edges = _rows(db, 'SELECT source_id, target_id, relation, strength, created_at FROM links WHERE invalid_at IS NULL')
    .map((l) => ({ source: String(l.source_id), target: String(l.target_id), relation: l.relation, strength: l.strength }));
  return { ents, edges };
}

function edgeSamples({ edges }, n) {
  const keyed = edges.map((e) => ({ e, k: sha1(e.source + '\u0000' + e.target) }))
    .sort((a, b) => a.k.localeCompare(b.k));
  return keyed.slice(0, n).map((x) => ({ ...x.e }));
}

// 两跳：A—B—C，A≠C，且 A—C 之间无活跃边（有边就不是「缺边」问题）
function twohopSamples({ edges }, n) {
  const adj = new Map();
  const has = new Set();
  for (const e of edges) {
    has.add(e.source + '\u0000' + e.target);
    has.add(e.target + '\u0000' + e.source);
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  }
  const out = [];
  const seen = new Set();
  for (const [middle, nbrs] of adj.entries()) {
    const list = [...new Set(nbrs)].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], c = list[j];
        if (has.has(a + '\u0000' + c)) continue;
        const key = a + '|' + middle + '|' + c;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a, b: middle, c, k: sha1(key) });
      }
    }
  }
  return out.sort((x, y) => x.k.localeCompare(y.k)).slice(0, n).map(({ k, ...rest }) => rest);
}

function titleOf(ents, id) {
  const e = ents.get(String(id));
  if (!e) return shortId(id) + '（库内无此实体）';
  const t = String(e.title || '').slice(0, TITLE_MAX);
  return t ? t + ' `' + shortId(id) + '`' : shortId(id);
}

function renderEdges(rows, ents, meta) {
  const L = [];
  L.push(`# 链接质量人工判定 · edges · ${rows.length} 条`);
  L.push('');
  L.push('> 填法：判定列填 `真` / `假` / `存疑`。留 `?` = 未判，判分器会拒收。');
  L.push(`> 取样：${meta}（按 sha1 排序取前 N，同库同参数可复现）`);
  L.push('');
  L.push('| # | 边 | A | B | 关系 | 强度 | 判定 | 备注 |');
  L.push('|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    L.push(`| ${i + 1} | ${cell(shortId(r.source))}→${cell(shortId(r.target))} | ${cell(titleOf(ents, r.source))} | ${cell(titleOf(ents, r.target))} | ${cell(r.relation || '')} | ${cell(r.strength == null ? '' : r.strength)} | ? |  |`);
  });
  L.push('');
  return L.join(NL);
}

function renderTwohop(rows, ents, meta) {
  const L = [];
  L.push(`# 链接质量人工判定 · twohop · ${rows.length} 条`);
  L.push('');
  L.push('> 填法：判定列填 `应连` / `不应连` / `存疑`。留 `?` = 未判，判分器会拒收。');
  L.push('> 口径：A—B、B—C 有边，A—C 无边；判 A、C 之间本应否直连。');
  L.push(`> 取样：${meta}（按 sha1 排序取前 N，同库同参数可复现）`);
  L.push('');
  L.push('| # | 路径 | A | B | C | 判定 | 备注 |');
  L.push('|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    L.push(`| ${i + 1} | ${cell(shortId(r.a))}→${cell(shortId(r.b))}→${cell(shortId(r.c))} | ${cell(titleOf(ents, r.a))} | ${cell(titleOf(ents, r.b))} | ${cell(titleOf(ents, r.c))} | ? |  |`);
  });
  L.push('');
  return L.join(NL);
}

async function main(argv) {
  const dbPath = argOf(argv, 'db', '');
  const kind = String(argOf(argv, 'kind', 'edges'));
  const nRaw = Number(argOf(argv, 'n', 20));
  const out = argOf(argv, 'out', '');
  if (!dbPath || dbPath === true) {
    console.error('用法：node tools/link-sample.js --db <path> [--kind edges|twohop] [--n 20] [--out <file>]');
    return 2;
  }
  if (!['edges', 'twohop'].includes(kind)) {
    console.error(`未知类型 ${kind}（只认 edges / twohop）`);
    return 2;
  }
  const n = Number.isInteger(nRaw) && nRaw > 0 ? nRaw : 20;
  await store.init(dbPath);
  const db = store._getDb();
  const data = load(db);
  const meta = `kind=${kind} n=${n} 活跃边 ${data.edges.length}`;
  const md = kind === 'edges'
    ? renderEdges(edgeSamples(data, n), data.ents, meta)
    : renderTwohop(twohopSamples(data, n), data.ents, meta);
  if (out && out !== true) {
    fs.writeFileSync(out, md, 'utf8');
    console.log(`样本单 ${kind} → ${out}`);
  } else {
    process.stdout.write(md);
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; })
    .catch((e) => { console.error('取样失败：' + e.message); process.exitCode = 1; });
}

module.exports = { edgeSamples, twohopSamples, load, main };
