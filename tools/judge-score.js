'use strict';
// tools/judge-score.js —— SPEC-2.19 人工判定计分器
// 只认人手填的值：未判 ? 一律拒收，格式错一律拒收，分母为 0 说「样本不足」。
// 不碰数据库、不写任何状态、不猜。

const fs = require('fs');

const NL = String.fromCharCode(10);
const KINDS = {
  edges: { head: '判定', ok: ['真', '假', '存疑'], bad: '假', good: '真', name: '假边率' },
  twohop: { head: '判定', ok: ['应连', '不应连', '存疑'], bad: '不应连', good: '应连', name: '二跳污染率' }
};

function argOf(argv, name, dflt) {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v == null || v.startsWith('--') ? true : v;
}

function cellsOf(line) {
  const parts = line.split('|');
  parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map((c) => c.trim());
}

function parseSheet(text) {
  const lines = String(text || '').split(NL);
  const title = lines.find((l) => /^#\s*链接质量人工判定/.test(l)) || '';
  const m = title.match(/·\s*(edges|twohop)\s*·/);
  const kind = m ? m[1] : null;
  const headerLine = lines.find((l) => /^\|\s*#\s*\|/.test(l));
  if (!kind || !headerLine) return { kind, rows: [], header: null };
  const header = cellsOf(headerLine);
  const vi = header.indexOf('判定');
  if (vi === -1) return { kind, rows: [], header };
  const rows = [];
  for (const line of lines) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const c = cellsOf(line);
    if (c.length < vi + 1) continue;
    rows.push({ idx: c[0], verdict: c[vi], raw: line });
  }
  return { kind, rows, header };
}

function score(parsed) {
  const spec = KINDS[parsed.kind];
  const unjudged = [];
  const bad = [];
  const counts = {};
  for (const v of spec.ok) counts[v] = 0;
  for (const r of parsed.rows) {
    if (r.verdict === '?') { unjudged.push(r.idx); continue; }
    if (!spec.ok.includes(r.verdict)) { bad.push(`${r.idx}=${r.verdict}`); continue; }
    counts[r.verdict]++;
  }
  const denom = counts[spec.good] + counts[spec.bad];
  const rate = denom > 0 ? counts[spec.bad] / denom : null;
  return { kind: parsed.kind, name: spec.name, counts, denom, rate, unjudged, bad, sampleSize: parsed.rows.length };
}

function main(argv) {
  const file = argOf(argv, 'in', '');
  const json = argv.includes('--json');
  if (!file || file === true) {
    console.error('用法：node tools/judge-score.js --in <已填写样本单> [--json]');
    return 2;
  }
  const parsed = parseSheet(fs.readFileSync(file, 'utf8'));
  if (!parsed.kind) {
    console.error('读不出类型：样本单标题应为「# 链接质量人工判定 · edges|twohop · …」');
    return 2;
  }
  if (!parsed.rows.length) {
    console.error('读不出样本行：表内没有「| 序号 | …」形式的数据行');
    return 2;
  }
  const s = score(parsed);
  if (s.unjudged.length) {
    console.error(`未判 ${s.unjudged.length} 行（第 ${s.unjudged.join('、')} 行）：判完再计分，不出半个数。`);
    return 3;
  }
  if (s.bad.length) {
    console.error(`判定值格式错：${s.bad.join(' ')}。只认 ${KINDS[s.kind].ok.join(' / ')}。`);
    return 4;
  }
  if (json) {
    process.stdout.write(JSON.stringify({
      kind: s.kind, metric: s.name, rate: s.rate, counts: s.counts, sampleSize: s.sampleSize
    }, null, 2) + NL);
    return 0;
  }
  const pct = s.rate == null ? '样本不足（无有效判定）' : (s.rate * 100).toFixed(1) + '%';
  const detail = Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(' / ');
  console.log(`${s.name} ${pct}（${s.counts[KINDS[s.kind].bad]}/${s.denom}）；样本 ${s.sampleSize} 条；${detail}`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseSheet, score, main };
