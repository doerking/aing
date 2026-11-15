'use strict';
// aing-v2 ingest-scrub.js —— M3 任务 3.5 实现（SPEC-3.5 采集痕迹剥除）
// 剥除：行首引用 / 行首来源 / 内联引用标记 / 检索标记；返回剥除处数（C10h 断言用）。
// 纯函数：唔碰库、唔碰文件。

const LINE_PATTERNS = [
  /^\s*引用\s*[:：]\s*\d+.*$/gm,
  /^\s*(?:来源|Source)\s*[:：].*$/gmi,
  /^\s*URL\s*[:：]\s*\S+.*$/gmi
];
const INLINE_PATTERNS = [
  /\[cite[^\]]*\]/gi,
  /\[citation[^\]]*\]/gi,
  /【(?:检索|搜索)】/g
];

function scrubCollectionTrace(text) {
  let out = String(text == null ? '' : text);
  let scrubbed = 0;
  for (const re of LINE_PATTERNS) {
    out = out.replace(re, (m) => { scrubbed++; return ''; });
  }
  for (const re of INLINE_PATTERNS) {
    out = out.replace(re, (m) => { scrubbed++; return ''; });
  }
  // 收口：连续空行压成一行，去行尾空白
  out = out.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, scrubbed };
}

module.exports = { scrubCollectionTrace };
