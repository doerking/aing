'use strict';
// M5 任务 5.3b failing test —— 冻结检索评测集（SPEC-5.3 / docs/Engineering/EMBEDDING-BENCH-2026-11-16.md §二）
// 目的：评测集「冻结后只增不改」。改任何一条，本档必红，逼你升版本而不是悄悄改题。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'data', 'eval');
const PAIRS = path.join(DIR, 'embedding-pairs.jsonl');
const CORPUS = path.join(DIR, 'corpus.jsonl');
const FROZEN = path.join(DIR, 'FROZEN.json');

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const sha1 = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
let parseErr = null;
const lines = (p) => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => {
  try { return JSON.parse(l); } catch (e) { parseErr = path.basename(p) + ': ' + e.message; return {}; }
});

const has = fs.existsSync(PAIRS) && fs.existsSync(CORPUS) && fs.existsSync(FROZEN);
const pairs = has ? lines(PAIRS) : [];
const corpus = has ? lines(CORPUS) : [];
const frozen = has ? JSON.parse(fs.readFileSync(FROZEN, 'utf8')) : {};

// AC-1 冻结在位：记录 sha1/bytes 与实际文件一致
const rec = frozen.files || {};
const shaOk = has && !parseErr &&
  rec['embedding-pairs.jsonl'] && rec['corpus.jsonl'] &&
  rec['embedding-pairs.jsonl'].sha1 === sha1(PAIRS) &&
  rec['corpus.jsonl'].sha1 === sha1(CORPUS) &&
  rec['embedding-pairs.jsonl'].bytes === fs.statSync(PAIRS).size &&
  rec['corpus.jsonl'].bytes === fs.statSync(CORPUS).size;
ac('AC-1 冻结在位（sha1/bytes 对齐）', !!shaOk,
  JSON.stringify({ has, parseErr, version: frozen.version, rule: '改题即换评测集，需升版本' }));

// AC-2 规模：题 ≥50、语料 ≥50
ac('AC-2 规模达标', pairs.length >= 50 && corpus.length >= 50,
  JSON.stringify({ pairs: pairs.length, corpus: corpus.length }));

// AC-3 粤语单列：yue ≥15，lang 域合法，counts 与实际一致
const langs = { zh: 0, yue: 0, en: 0 };
let badLang = null;
for (const p of pairs) {
  if (!Object.prototype.hasOwnProperty.call(langs, p.lang)) { badLang = p.q; continue; }
  langs[p.lang]++;
}
const cLangs = (frozen.counts && frozen.counts.langs) || {};
ac('AC-3 粤语单列且计数一致', !badLang && langs.yue >= 15 &&
  cLangs.zh === langs.zh && cLangs.yue === langs.yue && cLangs.en === langs.en,
  JSON.stringify({ badLang, langs, cLangs }));

// AC-4 引用完整：pos 非空、pos/neg 都在语料、id 唯一、q 不重复
const ids = new Set();
let dupId = null;
for (const c of corpus) { if (ids.has(c.id)) dupId = c.id; ids.add(c.id); }
const missing = [];
const qs = new Set();
let dupQ = null;
for (const p of pairs) {
  if (!p.pos || !p.pos.length) missing.push('empty-pos:' + p.q);
  if (qs.has(p.q)) dupQ = p.q;
  qs.add(p.q);
  for (const id of [...(p.pos || []), ...(p.neg || [])]) {
    if (!ids.has(id)) missing.push(p.q + '→' + id);
  }
}
ac('AC-4 引用完整（id/q 唯一）', !dupId && !dupQ && missing.length === 0,
  JSON.stringify({ dupId, dupQ, missing: missing.slice(0, 5) }));

// AC-5 版本自洽：version = pairs sha1 前 12；counts.pairs = 实际行数
ac('AC-5 版本自洽', has && frozen.version === sha1(PAIRS).slice(0, 12) &&
  frozen.counts && frozen.counts.pairs === pairs.length && frozen.counts.corpus === corpus.length,
  JSON.stringify({ version: frozen.version, actual: has ? sha1(PAIRS).slice(0, 12) : null }));

// AC-6 题面自洽：kind 合法、neg 非空、pos ∩ neg = ∅、语料字段齐
const KINDS = new Set(['exact', 'paraphrase', 'trad']);
const bad = [];
for (const p of pairs) {
  if (!KINDS.has(p.kind)) bad.push('kind:' + p.q);
  if (!p.neg || !p.neg.length) bad.push('empty-neg:' + p.q);
  if ((p.pos || []).some((id) => (p.neg || []).includes(id))) bad.push('pos∩neg:' + p.q);
}
for (const c of corpus) {
  if (!c.id || !c.name || !c.content) bad.push('corpus-field:' + (c.id || '?'));
}
ac('AC-6 题面自洽', bad.length === 0, JSON.stringify(bad.slice(0, 5)));

console.log(`${pass}/${pass + fail} 绿`);
process.exitCode = fail ? 1 : 0;
