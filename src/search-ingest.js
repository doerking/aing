'use strict';
// aing-v2 search-ingest.js —— SPEC-3.14 修订 B：search-and-ingest（D14 第 2 项）
// 语义：query 拆词（len>=2）评分源档（name+type+tags+content 命中占比），
// 选 top-N ≥ threshold，经 compile(source, store, {files}) 入库——复用 compile 管线
// （gate/upsert/compile_audit/幂等），唔另起平行入库机制。组件唔直连 store（arch-lint C5）。
const fs = require('fs');
const path = require('path');
const { compile, parseFrontmatter, walkMarkdown } = require('./compile.js');

// 可检索文本：name + type + tags + content（全小写）
function searchableText(metadata, content) {
  const parts = [metadata && metadata.name, metadata && metadata.type, metadata && metadata.tags, content];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// 关键词重叠分：命中词数 / 总词数（0..1）
function scoreText(text, terms) {
  if (!terms.length) return 0;
  const hit = terms.filter((t) => text.includes(t)).length;
  return hit / terms.length;
}

async function searchIngest(store, opts = {}) {
  const query = String(opts.query || '').trim();
  const source = String(opts.source || '');
  const top = Number.isFinite(Number(opts.top)) ? Number(opts.top) : 5;
  const threshold = Number.isFinite(Number(opts.threshold)) ? Number(opts.threshold) : 0.5;
  const terms = query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);

  const files = fs.existsSync(source) ? walkMarkdown(source, []) : [];
  const scored = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const { metadata, content } = parseFrontmatter(text);
    scored.push({ file: f, score: scoreText(searchableText(metadata, content), terms) });
  }

  const matched = scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, top);

  const stats = await compile(source, store, { files: matched.map((m) => m.file) });

  return {
    query, terms, threshold, top,
    scanned: files.length, scored: files.length, matched: matched.length,
    ingested: stats.created, updated: stats.updated, skipped: stats.skipped, rejected: stats.rejected,
    selected: matched.map((m) => ({ file: path.basename(m.file), score: Number(m.score.toFixed(3)) })),
    compile: stats
  };
}

module.exports = { searchIngest, searchableText, scoreText };
