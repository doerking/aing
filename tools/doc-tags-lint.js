'use strict';
// tools/doc-tags-lint.js —— SPEC-0.6 §六：全仓 md 走 Tolaria 9 段格式。
// 用法：node tools/doc-tags-lint.js [--dir <目录>] [--json]
// 规矩：frontmatter 必有 + description 非空 + tags 数组非空（≤20）
//      标签语法 类目[:N]，N∈1-9；至少一个 :7-:9 入口标签。
// 退出码：0 全绿 / 1 有违规。

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const root = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : path.resolve(__dirname, '..');
const asJson = args.includes('--json');

const SKIP = new Set(['node_modules', '.temp', '.git']);

function walk(d, out = []) {
  for (const name of fs.readdirSync(d)) {
    if (SKIP.has(name)) continue;
    const p = path.join(d, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}

function parseFrontmatter(text) {
  const s = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = s.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const block = m[1];
  const desc = (block.match(/^description:\s*(.*)$/m) || [])[1] || '';
  const tagsLine = (block.match(/^tags:\s*\[(.*)\]\s*$/m) || [])[1];
  if (tagsLine == null) return { description: desc.trim(), tags: null };
  const tags = tagsLine.split(',').map(t => t.trim()).filter(Boolean);
  return { description: desc.trim(), tags };
}

function checkFile(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  const errs = [];
  if (!fm) return [`${rel}: 无 frontmatter`];
  if (!fm.description) errs.push(`${rel}: description 缺失或为空`);
  if (!fm.tags) return [...errs, `${rel}: tags 缺失`];
  if (fm.tags.length === 0) errs.push(`${rel}: tags 为空`);
  if (fm.tags.length > 20) errs.push(`${rel}: tags ${fm.tags.length} 个 > 20`);
  let entry = false;
  for (const t of fm.tags) {
    const m = t.match(/^(.+?)(?::(\d+))?$/);
    const n = m[2] == null ? 5 : Number(m[2]);
    if (!m[1] || m[1].includes(':')) errs.push(`${rel}: 标签语法坏 "${t}"`);
    if (n < 1 || n > 9) errs.push(`${rel}: 强度越界 "${t}"（N∈1-9）`);
    if (n >= 7) entry = true;
  }
  if (!entry) errs.push(`${rel}: 无 :7-:9 入口标签`);
  return errs;
}

const files = walk(root);
const all = [];
for (const f of files) all.push(...checkFile(f));

if (asJson) {
  console.log(JSON.stringify({ scanned: files.length, problems: all }, null, 2));
} else {
  console.log(`扫描 ${files.length} 档 md`);
  for (const p of all) console.log('❌ ' + p);
  console.log(all.length ? `🔴 ${all.length} 处违规` : '🟢 Tolaria 9 段全绿');
}
process.exit(all.length ? 1 : 0);
