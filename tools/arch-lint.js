'use strict';
// tools/arch-lint.js —— SPEC-1.15 §四 / SPEC-0.6 铁律：组件唔准直连 knowledge-store。
// 用法：node tools/arch-lint.js [--dir <目录>]
// 白名单：knowledge-store.js（本体）、meko-orchestrator.js（编排入口，唯一注入点）。
// 违规 → exit 1。

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const root = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : path.resolve(__dirname, '..', 'src');

const WHITELIST = new Set(['knowledge-store.js', 'meko-orchestrator.js']);
const PATTERN = /require\(\s*['"]\.\/knowledge-store(?:\.js)?['"]\s*\)/;

const problems = [];
const files = fs.existsSync(root)
  ? fs.readdirSync(root).filter(f => f.endsWith('.js'))
  : [];

for (const f of files) {
  if (WHITELIST.has(f)) continue;
  const full = path.join(root, f);
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (PATTERN.test(line)) problems.push(`${f}:${i + 1} 直连 knowledge-store（应经 ctx 注入）`);
  });
}

console.log(`arch-lint 扫描 ${files.length} 档（${root}）`);
for (const p of problems) console.log('❌ ' + p);
console.log(problems.length ? `🔴 ${problems.length} 处违规` : '🟢 无直连 store 违规');
process.exit(problems.length ? 1 : 0);
