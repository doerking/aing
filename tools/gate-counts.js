#!/usr/bin/env node
/**
 * gate-counts.js — 门禁计数的**算**权威 / derive gate-count truth from the acceptance script
 *
 * 为什么要它：同一句「N 项门禁（C0–CMAX）」在 AGENTS.md frontmatter、README 部署段、
 * docs/greenlist.json 的声称文案里各手抄一遍。本轮（2026-09-14）从 26 项一路加到 30 项，
 * 我手工同步了三处四次，任何一次漏抄都会留下一条**看似严谨的假账**（历史上 README 就长期
 * 残留过「23 项（C0–C11）」）。纪律第 6 条要求状态单一来源 → 权威只能是验收器本身。
 *
 * 本工具不写文件，只做两件事：
 *   1) 从 verify-deploy.js 里数出真实的门禁项与编号集合；
 *   2) 核对文档里抄写的数字与门禁表行集合，不一致就退出码 1 并列出差额。
 *
 * 用法：
 *   node tools/gate-counts.js            # 人读：印出应当抄写的标准文案 + 一致/不一致
 *   node tools/gate-counts.js --json     # 机器读：结构化结果（门禁 C19 用它复证本工具）
 *   node tools/gate-counts.js --print    # 只印标准文案，方便复制粘贴
 * 退出码：0 = 文档与验收器一致；1 = 有手抄漂移（可进门禁）；2 = 验收器解析失败（无从判断）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const READ = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r/g, '');

// ── 真值：验收器里实际注册的 check 调用（缩进两空格的顶层 await check(...)) ──
const verifySrc = READ('verify-deploy.js');
const ids = [...verifySrc.matchAll(/^  await check\('C(\d+[a-z]?)[\s'（(]/gm)].map(m => 'C' + m[1]);   // 保留 C 前缀：只留数字会与文档表行的 Cn 对不上号
if (!ids.length) {
  console.error('❌ 无法从 verify-deploy.js 解析出任何 check → 门禁命名可能改了写法，本工具需同步（不许当成 0 项）');
  process.exit(2);
}
const uniq = [...new Set(ids)];
if (uniq.length !== ids.length) {
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  console.error('❌ 验收器里有重号门禁：' + dup.join(', ') + '（计数会虚高，先修号）');
  process.exit(2);
}
const count = ids.length;
const maxNum = Math.max(...ids.map(x => parseInt(String(x).slice(1), 10)));   // 'C10a' → 10（直接 parseInt 会 NaN）
const truth = {
  count,
  ids,
  maxId: 'C' + maxNum,
  range: `C0-C${maxNum}`,
  // 三处文档各自的标准抄写形式（历史上就是这三句各抄一遍）
  canonical: {
    agentsFrontmatter: `验收清单 ${`C0-C${maxNum}`}（${count} 项）`,
    readmeDeploy: `${count} 项部署门禁（C0–C${maxNum}`,   // 只印前缀：README 那句实际带逗号尾（`，verify-deploy.js`），印成带右括号会让人以为是完整句
    greenlistClaim: `${count} 项全绿（C0–C${maxNum}）`,
  },
};

// ── 文档抄写值抽取 ──
const problems = [];
const agents = READ('AGENTS.md');
const readme = READ('README.md');
const greenlistRaw = fs.existsSync(path.join(ROOT, 'docs', 'greenlist.json')) ? READ('docs/greenlist.json') : '';

const fm = agents.match(/验收清单 C0-C(\d+)（(\d+) 项）/);
if (!fm) problems.push('AGENTS.md frontmatter 找不到「验收清单 C0-Cn（N 项）」这句 → 句式被改，本工具与门禁都要同步');
else {
  if (Number(fm[2]) !== count) problems.push(`AGENTS frontmatter 抄 ${fm[2]} 项，验收器实为 ${count} 项`);
  if (Number(fm[1]) !== maxNum) problems.push(`AGENTS frontmatter 抄到 C${fm[1]}，验收器最大号是 C${maxNum}`);
}

const rd = readme.match(/(\d+) 项部署门禁（C0–C(\d+)/);
if (!rd) problems.push('README 找不到「N 项部署门禁（C0–Cn）」这句 → 部署段句式被改');
else {
  if (Number(rd[1]) !== count) problems.push(`README 抄 ${rd[1]} 项部署门禁，实为 ${count} 项`);
  if (Number(rd[2]) !== maxNum) problems.push(`README 抄到 C${rd[2]}，实为 C${maxNum}`);
}

for (const m of greenlistRaw.matchAll(/(\d+) 项全绿（C0–C(\d+)）/g)) {
  if (Number(m[1]) !== count) problems.push(`docs/greenlist.json 有声称抄 ${m[1]} 项全绿，实为 ${count} 项`);
  if (Number(m[2]) !== maxNum) problems.push(`docs/greenlist.json 有声称抄到 C${m[2]}，实为 C${maxNum}`);
}

// AGENTS 验收清单表格的行集合必须与验收器**同一集合**（少一行 = 那道门无人知晓；多一行 = 陈账）
const tableIds = [...agents.matchAll(/^\| (C\d+[a-z]?) \|/gm)].map(m => m[1]);
const missing = ids.filter(x => !tableIds.includes(x));
const stale = tableIds.filter(x => !ids.includes(x));
if (missing.length) problems.push('AGENTS 验收清单表缺行（这道门没登记）：' + missing.join(', '));
if (stale.length) problems.push('AGENTS 验收清单表有陈行（验收器里已无此门）：' + stale.join(', '));

const ok = problems.length === 0;
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok, count, maxNum, maxId: truth.maxId, range: truth.range, ids, tableIds, canonical: truth.canonical, problems }, null, 2));
} else if (process.argv.includes('--print')) {
  console.log(truth.canonical.agentsFrontmatter);
  console.log(truth.canonical.readmeDeploy);
  console.log(truth.canonical.greenlistClaim);
} else {
  console.log(`🧮 门禁计数真值 / gate-count truth：验收器注册 ${count} 项，编号 ${truth.range}（最大号 ${truth.maxId}）`);
  console.log('   AGENTS frontmatter 应抄：' + truth.canonical.agentsFrontmatter);
  console.log('   README 部署段应抄：      ' + truth.canonical.readmeDeploy);
  console.log('   greenlist 声称应抄：     ' + truth.canonical.greenlistClaim);
  console.log('   AGENTS 清单表行数：' + tableIds.length + ' 行（验收器 ' + count + ' 项）');
  if (ok) console.log('🟢 文档抄写与验收器一致（no hand-copy drift）');
  else { console.log('🔴 手抄漂移 / hand-copy drift：'); for (const p of problems) console.log('   - ' + p); }
}
process.exitCode = ok ? 0 : 1;
