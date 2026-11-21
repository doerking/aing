'use strict';
// SPEC 门禁抗负载单源 failing test —— 2026-11-21 owner 拍板
// 缘起：verify-deploy 全量并发（33 项）时 C1/C2/C19 一度同红——run-all 子进程报 1107（少 5，
//       恰系新增 test-3.4b 断言数），VD_ONLY=C19 隔离跑即绿。根因：C19 parse run-all 子进程输出、
//       count-guard 逐档 parse ✅ 计数，两者都喺 CPU 争用下抖。
// 处置（owner）：C19 计数对账改 baseline 单源（唔再 parse 子进程输出）；count-guard 补短档隔离重跑。
const fs = require('fs'); const os = require('os'); const path = require('path');
const root = path.join(__dirname, '..');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-loadgate-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

(async () => {
  // AC-1 C19 唔再 parse run-all 子进程输出（计数真值 = baseline.json）
  const vd = fs.readFileSync(path.join(root, 'verify-deploy.js'), 'utf8');
  const c19 = (vd.match(/gate\('C19'[\s\S]*?\n\}\);/) || [''])[0];
  ac('AC-1 C19 计数改 baseline 单源',
    c19.length > 0 && !/run-all\.js|runNode\(/.test(c19) && /baseline\.json/.test(c19),
    c19.length ? c19.split('\n').slice(0, 3).join(' ') : 'C19 闸块未搵到');

  // AC-2 count-guard 补短档隔离重跑（load flake 唔再误判删除）
  const cg = fs.readFileSync(path.join(root, 'test', 'count-guard.js'), 'utf8');
  ac('AC-2 count-guard 补短档隔离重跑',
    /重试|retry|again|recheck/i.test(cg) && /spawnSync/.test(cg),
    'count-guard 冇隔离重跑逻辑');

  // AC-3 文档计数 = baseline 单源（C19 所守不变量；唔启 run-all 子进程，避免本档→run-all→本档递归）
  const base = JSON.parse(fs.readFileSync(path.join(root, 'test', 'baseline.json'), 'utf8'));
  const files = Object.keys(base).length;
  const sum = Object.values(base).reduce((a, b) => a + b, 0);
  const bad = [];
  for (const f of ['STATUS.md', 'AGENT.md']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of text.matchAll(/(\d+) 档 \/ (\d+) 条?断言/g)) {
      if (Number(m[1]) !== files || Number(m[2]) !== sum) bad.push(`${f}: ${m[1]}/${m[2]}`);
    }
  }
  ac('AC-3 文档计数 = baseline 单源', bad.length === 0, bad.length ? bad.join('; ') : `${files} 档 / ${sum} 条，文档与基线一致`);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
