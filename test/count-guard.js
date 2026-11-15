'use strict';
// test/count-guard.js —— 宪法 R4：test 只加唔减。
// 用法（本仓根）：node test/count-guard.js          # 校对
//               node test/count-guard.js --update   # 全部绿之后更新基线
// 基线：test/baseline.json（每个测试文件的断言数 = 该文件 ✅ 出现次数）。
// 任何文件断言数低于基线 → exit 1，禁止删 test 令 pass。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const baselinePath = path.join(dir, 'baseline.json');
const update = process.argv.includes('--update');

const files = fs.readdirSync(dir).filter(f => /^test-.*\.js$/.test(f)).sort();
const current = {};
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  current[f] = (out.match(/✅/g) || []).length;
}

if (update) {
  fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log('基线已更新：', baselinePath);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.log('⚠️  无基线，先跑 node test/count-guard.js --update（须测试全绿后）');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const problems = [];
for (const [f, n] of Object.entries(baseline)) {
  if (!(f in current)) problems.push(`${f} 被删除（基线 ${n} 条断言）`);
  else if (current[f] < n) problems.push(`${f} 断言 ${current[f]} < 基线 ${n}`);
}
for (const f of Object.keys(current)) {
  if (!(f in baseline)) console.log(`ℹ️  新文件 ${f}（${current[f]} 条断言），跑 --update 纳入基线`);
}

if (problems.length) {
  console.log('🔴 test 计数回退：');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log(`🟢 test count guard 通过（${Object.keys(baseline).length} 档）`);
