'use strict';
// test/run-all.js —— 统一入口：跑 test/ 下全部 test-*.js，汇总红绿。
// 用法（本仓根）：node test/run-all.js  /  npm test
// 退出码：0 = 全绿；1 = 有红。红文件逐个列出，唔藏账。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(f => /^test-.*\.js$/.test(f) && f !== 'count-guard.js')
  .sort();

const results = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const greens = (out.match(/✅/g) || []).length;
  const reds = (out.match(/❌/g) || []).length;
  results.push({ file: f, code: r.status, greens, reds, tail: out.trim().split('\n').slice(-2).join(' | ') });
}

const failed = results.filter(r => r.code !== 0);
console.log('===== aing-v2 test 汇总 =====');
for (const r of results) {
  console.log(`${r.code === 0 ? '🟢' : '🔴'} ${r.file}  ✅${r.greens} ❌${r.reds}`);
}
const totalGreen = results.reduce((n, r) => n + r.greens, 0);
console.log(`----- ${results.length} 档 / 断言 ${totalGreen} 绿 / ${failed.length} 红 -----`);
if (failed.length) {
  console.log('红档明细：');
  for (const f of failed) console.log(`  🔴 ${f.file}: ${f.tail}`);
  process.exit(1);
}
console.log('ALL GREEN');
