'use strict';
// SPEC-7.1 §三 派生词生成器 —— 纯本地、确定性、无网络（AC-9/13）
// 四维：繁简双形 / 粤语拆解 / 粤普对照 / 缩写词形。
// 词典落 data/lexicon/，按需增补；本文件不含任何在线调用。

const fs = require('fs');
const path = require('path');

const LEX_DIR = path.join(__dirname, '..', 'data', 'lexicon');

function loadJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(LEX_DIR, name), 'utf8')); }
  catch (_) { return null; }
}

const VARIANT = loadJson('zh-variant.json') || { s2t: {} };
const S2T = VARIANT.s2t || {};
const T2S = (() => { const m = {}; for (const [s, t] of Object.entries(S2T)) if (!m[t]) m[t] = s; return m; })();
const YUE = (loadJson('yue-morph.json') || { entries: {} }).entries || {};
// 长词优先，保证「唔返来」不被拆成「唔」+「返来」
const YUE_KEYS = Object.keys(YUE).sort((a, b) => b.length - a.length);

function s2t(text) {
  let out = '';
  for (const ch of String(text == null ? '' : text)) out += S2T[ch] || ch;
  return out;
}

function t2s(text) {
  let out = '';
  for (const ch of String(text == null ? '' : text)) out += T2S[ch] || ch;
  return out;
}

/** 繁简双形（AC-3）：两形都产，繁体作首选展示形 */
function variants(text) {
  const s = String(text == null ? '' : text);
  const traditional = s2t(s);
  const simplified = t2s(s);
  const all = [...new Set([traditional, simplified, s].filter(Boolean))];
  return { original: s, traditional, simplified, all };
}

/** 查询归一（AC-3b）：任一形都能命中另一形的档 */
function normalizeQuery(text) {
  const v = variants(text);
  return { query: v.original, forms: v.all };
}

/** 粤语拆解 + 粤普对照（AC-4） */
function segment(text) {
  const s = String(text == null ? '' : text);
  const tokens = [];
  const mandarin = [];
  const hits = [];
  let i = 0;
  while (i < s.length) {
    let matched = null;
    for (const key of YUE_KEYS) {
      if (key && s.startsWith(key, i)) { matched = key; break; }
    }
    if (matched) {
      const e = YUE[matched];
      const tk = Array.isArray(e.tokens) && e.tokens.length ? e.tokens : [matched];
      tokens.push(...tk);
      if (Array.isArray(e.mandarin)) mandarin.push(...e.mandarin);
      hits.push({ word: matched, tokens: tk, mandarin: e.mandarin || [] });
      i += matched.length;
    } else {
      tokens.push(s[i]);  // 未命中：单字成词（确定性，不猜）
      i += 1;
    }
  }
  return { text: s, tokens, mandarin: [...new Set(mandarin)], hits };
}

/** 整句粤→普：按词表最长匹配替换，未命中原样保留（查询侧归一用，不改原文） */
function toMandarin(text) {
  const s = String(text == null ? '' : text);
  let out = '';
  let i = 0;
  while (i < s.length) {
    let matched = '';
    for (const key of YUE_KEYS) {
      if (key && s.startsWith(key, i)) { matched = key; break; }
    }
    if (matched) {
      const g = YUE[matched];
      out += (Array.isArray(g.mandarin) && g.mandarin.length) ? g.mandarin[0] : matched;
      i += matched.length;
    } else {
      out += s[i];
      i += 1;
    }
  }
  return out;
}

/** 关键词面：CJK 双字 + 拉丁词 ≥2，叠派生形（供 sprout/vector 入键） */
function keywordsOf(text) {
  const s = String(text == null ? '' : text);
  const out = new Set();
  const cjk = [];
  let latin = '';
  for (const ch of s) {
    if (/[一-鿿]/.test(ch)) { cjk.push(ch); if (latin) { if (latin.length >= 2) out.add(latin.toLowerCase()); latin = ''; } }
    else if (/[a-z0-9]/i.test(ch)) latin += ch;
    else if (latin) { if (latin.length >= 2) out.add(latin.toLowerCase()); latin = ''; }
  }
  if (latin.length >= 2) out.add(latin.toLowerCase());
  for (let i = 0; i + 1 < cjk.length; i++) out.add(cjk[i] + cjk[i + 1]);
  for (const f of variants(s).all) {
    for (let i = 0; i + 1 < f.length; i++) if (/[一-鿿]/.test(f[i]) && /[一-鿿]/.test(f[i + 1])) out.add(f[i] + f[i + 1]);
  }
  for (const g of segment(s).mandarin) if (g.length >= 2) out.add(g);
  return out;
}

module.exports = { variants, normalizeQuery, segment, toMandarin, keywordsOf, s2t, t2s, LEX_DIR };
