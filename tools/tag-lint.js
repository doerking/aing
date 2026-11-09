'use strict';
/**
 * tools/tag-lint.js — Tolaria 9 段标签门禁面（C21 单一真源）＋ 报告工具。
 *
 * 规则（纪律 7）：自撰文档面（git 跟踪 md）每份必须：
 *   ① 第 1 行 frontmatter --- 内带 tags: 数组（行内 [a, b] 或列表 - 两形）
 *   ② 至少一个 tag 带 9 段强度 "name:N"（N ∈ 1-9；不带 :N 默认中位 5 系存储口径，frontmatter 要求显式 ≥1 个强度）
 * 豁免面（C20 边界同形）：raw/ 语料（只核 git 已跟踪顶层）、docs/releases/** 历史发布、THIRD-PARTY-NOTICES.md。
 *
 * 基线台账 data/tag-grandfather.json：存量违规 1:1 登记，**只收窄不扩**——
 *   C21 判定：违规文件不在台账 → 红；台账文件已不违规（修好或删档）→ 红（台账未收窄）。
 *   即台账必须永远 = 当前违规集合，修一个 tag 同 commit 删一条台账。
 *
 * 纯读工具：不写库 / 不写 git / 不写台账；exit 0 = 报告完成（违规判红是 verify-deploy C21 的职责）。
 * 用法：
 *   node tools/tag-lint.js          # 人读报告
 *   node tools/tag-lint.js --json   # 机器读（C21 用 computeTagAudit 同一函数，不重读实现）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LEDGER_REL = path.join('data', 'tag-grandfather.json');

/** 豁免判定：raw/ 语料、docs/releases/** 历史、第三方许可文件。 */
function isExempt(rel) {
  return rel.startsWith('raw/')
    || rel.includes('docs/releases/')
    || rel === 'THIRD-PARTY-NOTICES.md';
}

/** 解析 frontmatter 内的 tags（行内 [a, b] 或列表 - a 两形；无 → []）。 */
function parseTags(fm) {
  const m = fm.match(/^tags\s*:\s*/m);
  if (!m) return [];
  let rest = fm.slice(m.index + m[0].length);
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end < 0) return [];
    return rest.slice(1, end).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  const arr = [];
  for (const line of rest.split('\n')) {
    const item = line.match(/^\s*-\s*(.+)$/);
    if (item) { const v = item[1].trim().replace(/^['"]|['"]$/g, ''); if (v) arr.push(v); continue; }
    if (/^\s*$/.test(line)) continue;
    break; // 下一个顶层 key 或 frontmatter 结束
  }
  return arr;
}

/** "name:N" → N（1-9 合法）；非 name:N 形或越界 → null。 */
function tagIntensity(tag) {
  const m = String(tag).match(/^(.*?):(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  return n >= 1 && n <= 9 ? n : null;
}

/** 单档判定：null = 合规；'no-frontmatter' | 'no-tags' | 'no-intensity'。 */
function checkFileText(text) {
  const flat = text.replace(/\r/g, '');
  if (!/^---\n/.test(flat)) return 'no-frontmatter';
  const fm = flat.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return 'no-frontmatter';
  const tags = parseTags(fm[1]);
  if (!tags.length) return 'no-tags';
  if (!tags.some((t) => tagIntensity(t) !== null)) return 'no-intensity';
  return null;
}

function countCategories(reads) {
  const cats = new Set();
  for (const text of reads) {
    const flat = text.replace(/\r/g, '');
    const fm = /^---\n/.test(flat) ? (flat.match(/^---\n([\s\S]*?)\n---/) || [])[1] : '';
    for (const t of parseTags(fm || '')) {
      const name = String(t).replace(/:\d+$/, '');
      if (name) cats.add(name);
    }
  }
  return cats.size;
}

/**
 * 计算标签审计。
 * @param {object} opts { root, extraFiles: { 'rel/path.md': 文件内容 }（C21 负向自证虚拟档面） }
 * @returns {{ gitOk, trackedMd, gateFiles, violations: [{file,reason}],
 *             newViolations, ledger, ledgerInvalid, reclaimable: [], catCount, exemptCount }}
 */
function computeTagAudit({ root = process.cwd(), extraFiles = {} } = {}) {
  let tracked = [];
  let gitOk = true;
  try {
    const out = spawnSync('git', ['ls-files', '-z', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).stdout;
    tracked = out.split('\0').filter(Boolean).filter((f) => f.endsWith('.md'));
  } catch { gitOk = false; }

  const gate = tracked.filter((f) => !isExempt(f));
  const reads = gate.map((f) => {
    try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; }
  });
  const violations = [];
  gate.forEach((f, i) => {
    const reason = checkFileText(reads[i]);
    if (reason) violations.push({ file: f, reason });
  });
  for (const [rel, content] of Object.entries(extraFiles)) {
    if (isExempt(rel)) continue;
    const reason = checkFileText(content);
    if (reason) violations.push({ file: rel, reason });
  }

  let ledger = [];
  let ledgerBroken = false;
  const ledgerPath = path.join(root, LEDGER_REL);
  if (fs.existsSync(ledgerPath)) {
    try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).files || []; } catch { ledgerBroken = true; }
  }
  const violSet = new Set(violations.map((v) => v.file));
  const ledgerSet = new Set(ledger);
  const newViolations = violations.filter((v) => !ledgerSet.has(v.file));
  // 台账只收窄不扩：台账条目必须仍违规（修好/删档而未删台账 → 红）
  const ledgerInvalid = ledger.filter((f) => !violSet.has(f));
  const catCount = countCategories([
    ...reads,
    ...Object.values(extraFiles),
  ]);

  return {
    gitOk,
    trackedMd: tracked.length,
    gateFiles: gate.length + Object.keys(extraFiles).length,
    exemptCount: tracked.length - gate.length,
    violations,
    newViolations,
    ledger,
    ledgerInvalid,
    ledgerBroken,
    catCount,
  };
}

function main() {
  const asJson = process.argv.includes('--json');
  const a = computeTagAudit({ root: process.cwd() });
  if (asJson) {
    process.stdout.write(JSON.stringify(a, null, 2) + '\n');
    return;
  }
  process.stdout.write('=== Tolaria 9 段标签面（C21 单一真源）===\n');
  process.stdout.write('git 跟踪 md ' + a.trackedMd + ' 份 · 门禁面 ' + a.gateFiles + ' 份（豁免 ' + a.exemptCount + '：raw 语料 / docs·releases / 第三方）\n');
  process.stdout.write('9 段类目数 ' + a.catCount + '（容量推演：≤50 健康 · ≤100 可用 · 150 退化 · 200+ 走样，仅报告不判红）\n');
  if (a.ledgerBroken) process.stdout.write('❌ 台账损坏：' + LEDGER_REL + ' 不可解析\n');
  else if (!a.violations.length) process.stdout.write('✅ 违规 0；台账 ' + a.ledger.length + ' 条' + (a.ledger.length ? '（全量已失效，应删空）' : '（空）') + '\n');
  else {
    process.stdout.write('违规 ' + a.violations.length + ' 份（台账内 ' + (a.violations.length - a.newViolations.length) + ' · 台账外 ' + a.newViolations.length + '）：\n');
    for (const v of a.violations) process.stdout.write('  ' + (a.ledger.includes(v.file) ? '[台账] ' : '[新] ') + v.file + ' — ' + v.reason + '\n');
    if (a.ledgerInvalid.length) {
      process.stdout.write('台账待收窄 ' + a.ledgerInvalid.length + ' 条（已修复/已删档，C21 判红直至删台账）：\n');
      for (const f of a.ledgerInvalid) process.stdout.write('  - ' + f + '\n');
    }
  }
  if (!a.gitOk) process.stdout.write('⚠ git 取不到跟踪面 → 语料面未核（C21 只核取到的部分，不算通过）\n');
}

if (require.main === module) main();

module.exports = { computeTagAudit, checkFileText, parseTags, tagIntensity, isExempt, LEDGER_REL };
