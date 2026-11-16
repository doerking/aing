'use strict';
// tools/doc-tags-lint.js —— SPEC-0.6 §六 + SPEC-0.7：md9 分两面。
// 用法：node tools/doc-tags-lint.js [--dir <目录>] [--profile doc|entity] [--json]
// 文档面 doc（默认）：frontmatter 必有 + description 非空 + tags 数组非空（≤20）
//      标签语法 类目[:N]，N∈1-9；至少一个 :7-:9 入口标签。
// 实体面 entity：frontmatter 必有 + description 非空 + tolaria_strength 1-9
//      + tags 行存在（可为空数组）+ 标签语法合法；不要求入口标签（段位由 tolaria_strength 承载）。
// 标签两侧引号一律剥离：tags: ["a:8", "b:6"] 与 tags: [a:8, b:6] 等价。
// 退出码：0 全绿 / 1 有违规。

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const profIdx = args.indexOf('--profile');
const root = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : path.resolve(__dirname, '..');
const profile = profIdx >= 0 && args[profIdx + 1] === 'entity' ? 'entity' : 'doc';
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

function unquote(t) {
  return t.trim().replace(/^["']/, '').replace(/["']$/, '');
}

function parseFrontmatter(text) {
  const s = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = s.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const block = m[1];
  const desc = (block.match(/^description:[ \t]*(.*)$/m) || [])[1] || '';
  const strRaw = (block.match(/^tolaria_strength:[ \t]*(.*)$/m) || [])[1];
  const tagsLine = (block.match(/^tags:[ \t]*\[(.*)\][ \t]*$/m) || [])[1];
  const str = strRaw == null ? null : Number(unquote(strRaw));
  if (tagsLine == null) return { description: desc.trim(), tags: null, strength: str };
  const tags = tagsLine.split(',').map(unquote).filter(Boolean);
  return { description: desc.trim(), tags, strength: str };
}

function checkFile(file, prof) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  const errs = [];
  if (!fm) return [`${rel}: 无 frontmatter`];
  if (!fm.description) errs.push(`${rel}: description 缺失或为空`);

  if (prof === 'entity') {
    if (fm.strength == null || !Number.isInteger(fm.strength) || fm.strength < 1 || fm.strength > 9) {
      errs.push(`${rel}: tolaria_strength 缺失或越界（N∈1-9）`);
    }
  }

  if (fm.tags === null) return [...errs, `${rel}: tags 缺失`];
  if (prof === 'doc' && fm.tags.length === 0) errs.push(`${rel}: tags 为空`);
  if (fm.tags.length > 20) errs.push(`${rel}: tags ${fm.tags.length} 个 > 20`);
  let entry = false;
  for (const t of fm.tags) {
    const m = t.match(/^(.+?)(?::(\d+))?$/);
    const n = m[2] == null ? 5 : Number(m[2]);
    if (!m[1] || m[1].includes(':')) errs.push(`${rel}: 标签语法坏 "${t}"`);
    if (n < 1 || n > 9) errs.push(`${rel}: 强度越界 "${t}"（N∈1-9）`);
    if (n >= 7) entry = true;
  }
  if (prof === 'doc' && !entry) errs.push(`${rel}: 无 :7-:9 入口标签`);
  return errs;
}

const files = walk(root);
const all = [];
for (const f of files) all.push(...checkFile(f, profile));

if (asJson) {
  console.log(JSON.stringify({ scanned: files.length, profile, problems: all }, null, 2));
} else {
  console.log(`扫描 ${files.length} 档 md（profile=${profile}）`);
  for (const p of all) console.log('❌ ' + p);
  console.log(all.length ? `🔴 ${all.length} 处违规` : '🟢 Tolaria 9 段全绿');
}
process.exit(all.length ? 1 : 0);
