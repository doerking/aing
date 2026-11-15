'use strict';
// test-0.6-doc-tags.js —— 锁 SPEC-0.6 §六 AC-8：全仓 md Tolaria 9 段格式。
// 正例：本仓 tools/doc-tags-lint.js 全绿；反例：缺 tags / 强度越界 / 无入口标签各造一档必红。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0;
let fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

const repo = path.resolve(__dirname, '..');
const lint = path.join(repo, 'tools', 'doc-tags-lint.js');

function run(dir) {
  const r = spawnSync(process.execPath, [lint, '--dir', dir], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// AC-1 本仓全绿
const good = run(repo);
ac('AC-1 本仓 md 全绿（Tolaria 9 段）', good.code === 0, good.out.trim().split('\n').slice(-3).join(' | '));

// 反例工装
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aing-v2-tags-'));
function write(name, content) { fs.writeFileSync(path.join(yard, name), content); }

write('ok.md', '---\ntags: [aing-v2, spec:9]\ndescription: 正例\ndate: 2026-11-16\n---\n正文\n');
write('no-tags.md', '---\ndescription: 缺 tags\ndate: 2026-11-16\n---\n正文\n');
write('bad-strength.md', '---\ntags: [spec:0, x:10]\ndescription: 越界\ndate: 2026-11-16\n---\n正文\n');
write('no-entry.md', '---\ntags: [aing-v2, spec:5, meko:3]\ndescription: 无入口\ndate: 2026-11-16\n---\n正文\n');
write('no-fm.md', '正文缺 frontmatter\n');

// AC-2~5 反例逐个红
const r1 = run(yard);
ac('AC-2 缺 tags → 红', r1.code === 1 && /no-tags\.md/.test(r1.out), r1.out.trim());
ac('AC-3 强度 0/10 → 红', r1.code === 1 && /bad-strength\.md/.test(r1.out));
ac('AC-4 无 :7-:9 入口标签 → 红', r1.code === 1 && /no-entry\.md/.test(r1.out));
ac('AC-5 无 frontmatter → 红', r1.code === 1 && /no-fm\.md/.test(r1.out));
ac('AC-6 正例 ok.md 不被误杀', !/ok\.md/.test(r1.out));

fs.rmSync(yard, { recursive: true, force: true });

console.log(`${pass}/${pass + fail} 绿`);
process.exit(fail ? 1 : 0);
