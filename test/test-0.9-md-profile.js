'use strict';
// M0 任务 0.9 failing test —— 锁 SPEC-0.9 md9 两面五条 AC
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const LINT = path.join(__dirname, '..', 'tools', 'doc-tags-lint.js');
const ROOT = path.join(__dirname, '..');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-md9p-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

function runLint(dir, profile) {
  const args = [LINT, '--dir', dir, '--json'];
  if (profile) args.push('--profile', profile);
  try {
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
  } catch (e) {
    try { return JSON.parse(e.stdout || '{}'); } catch (_) { return { scanned: 0, problems: ['输出不是 JSON'] }; }
  }
}

function write(name, front, body = '\n# 标题\n\n正文。\n') {
  fs.writeFileSync(path.join(yard, name), '---\n' + front + '\n---\n' + body, 'utf8');
}

// ── 样本 ────────────────────────────────────────────────
write('quoted.md', 'tags: ["doc-entry:8", "x:6"]\ndescription: 引号标签样本');
write('entity-ok.md', 'tags: []\ndescription: 五段实体\ntolaria_strength: 5');
write('entity-bad.md', 'tags: ["a:b:9"]\ndescription:\ntolaria_strength: 12');
write('entity-badtags.md', 'tags: ["a:b:9"]\ndescription: 只在标签语法上犯错\ntolaria_strength: 6');
write('entity-notags.md', 'description: 没有 tags 行\ntolaria_strength: 7');

const docQ = runLint(yard, 'doc');
const entAll = runLint(yard, 'entity');
const docAll = runLint(yard, 'doc');

const probs = (r) => r.problems || [];
const byFile = (r, f) => probs(r).filter(p => p.startsWith(f + ':') || p.startsWith(f + ':'));

// ── AC-1 引号标签被正确解析 ─────────────────────────────
const qProbs = probs(docQ).filter(p => p.startsWith('quoted.md:'));
ac('AC-1 引号标签解析', qProbs.length === 0, JSON.stringify(qProbs));

// ── AC-2 entity 面：desc + 段位 + 空 tags 通过 ───────────
const okEnt = probs(entAll).filter(p => p.startsWith('entity-ok.md:'));
const okDoc = probs(docAll).filter(p => p.startsWith('entity-ok.md:'));
ac('AC-2 entity 面通过', okEnt.length === 0, JSON.stringify(okEnt));

// ── AC-3 同一档两面结论不同 ─────────────────────────────
ac('AC-3 两面分明', okEnt.length === 0 && okDoc.some(p => /入口标签/.test(p)), JSON.stringify(okDoc));

// ── AC-4 entity 面仍抓真问题 ────────────────────────────
const bad = probs(entAll).filter(p => p.startsWith('entity-bad.md:')).join(' | ');
const badTags = probs(entAll).filter(p => p.startsWith('entity-badtags.md:')).join(' | ');
const noTags = probs(entAll).filter(p => p.startsWith('entity-notags.md:')).join(' | ');
ac('AC-4 entity 面抓坏样本',
  /description/.test(bad) && /tolaria_strength/.test(bad) && /标签语法坏/.test(badTags) && /tags 缺失/.test(noTags),
  JSON.stringify({ bad, badTags, noTags }));

// ── AC-5 默认 profile 对 v2 本仓 0 违规 ─────────────────
const repo = runLint(ROOT);
ac('AC-5 本仓默认面全绿', (repo.problems || []).length === 0 && (repo.scanned || 0) > 30,
  JSON.stringify({ scanned: repo.scanned, n: (repo.problems || []).length, sample: (repo.problems || []).slice(0, 3) }));

console.log(`${pass}/${pass + fail} 绿`);
process.exitCode = fail ? 1 : 0;
