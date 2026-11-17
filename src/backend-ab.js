'use strict';
// aing-v2 backend-ab.js —— M5 任务 5.6 实现（SPEC-5.6）
// 出并排对照单：同一题，字面后端与语义后端各前 k 张卡，判定列留 `?` 由人手填。
// 检索器由调用方注入（searchOf），本文件不连库、不加载模型、不判定任何一条。

const DEFAULT_K = 3;
const LIT_LABEL = '字面（hash-64w2）';
const SEM_LABEL = '语义（onnx-e5-small）';
const VERDICTS = ['语义好', '字面好', '打平', '都不好'];

function esc(text) {
  return String(text == null ? '' : text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function cellOf(list) {
  if (!list || !list.length) return '（无）';
  return list.map((h, i) => `${i + 1}. ${esc((h && (h.name || h.id)) || '')}`).join('<br>');
}

function render(rows, k) {
  const lines = [
    `# 后端对照自测 · ab · ${rows.length} 条`,
    '',
    `> 填法：判定列填 ${VERDICTS.join(' / ')}。留 \`?\` = 未判，判分器会拒收。`,
    `> 口径：每题给两边各前 ${k} 张卡（带标题），判哪边更接近你想找的；两边都不对填「都不好」。`,
    '',
    `| # | 问题 | ${LIT_LABEL} | ${SEM_LABEL} | 判定 |`,
    '|---|---|---|---|---|'
  ];
  rows.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${esc(r.q)} | ${cellOf(r.lit)} | ${cellOf(r.sem)} | ? |`);
  });
  return lines.join('\n') + '\n';
}

/**
 * @param {object} opts
 * @param {Array<{q:string,lang?:string,kind?:string}>} opts.queries
 * @param {(side:'lit'|'sem', q:string) => Promise<Array<{id:string,name?:string}>>} opts.searchOf
 * @param {number} [opts.k=3]
 */
async function buildSheet(opts = {}) {
  const queries = Array.isArray(opts.queries) ? opts.queries : [];
  const searchOf = opts.searchOf;
  if (typeof searchOf !== 'function') throw new Error('buildSheet 需要注入 searchOf（SPEC-5.6）');
  const k = Number.isInteger(opts.k) && opts.k > 0 ? opts.k : DEFAULT_K;

  const rows = [];
  for (const item of queries) {
    const q = String(item && item.q != null ? item.q : '');
    const lit = (await searchOf('lit', q)) || [];
    const sem = (await searchOf('sem', q)) || [];
    rows.push({ q, lang: item.lang, kind: item.kind, lit: lit.slice(0, k), sem: sem.slice(0, k) });
  }
  return { rows, sheet: render(rows, k), k };
}

module.exports = { buildSheet, render, cellOf, esc, VERDICTS, DEFAULT_K, LIT_LABEL, SEM_LABEL };
