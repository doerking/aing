'use strict';
// M3 任务 3.10 —— 门禁 C20–C21 适配（文档命令可执行 + Tolaria 基线账）
const { spawnSync } = require('child_process');
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const root = path.join(__dirname, '..');
const IDS = ['C20', 'C21'];
const r = spawnSync(process.execPath, [path.join(root, 'verify-deploy.js')], {
  cwd: root, encoding: 'utf8', env: { ...process.env, VD_ONLY: IDS.join(',') }, timeout: 120000
});
const out = (r.stdout || '') + (r.stderr || '');

ac('AC-1 两项全在', IDS.every(id => new RegExp('✅ ' + id + ' ').test(out)), out);
ac('AC-2 无红', r.status === 0, 'exit=' + r.status);
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'doc-tags-baseline.json'), 'utf8')).files || [];
const missing = ledger.filter(f => !fs.existsSync(path.join(root, f)));
ac('AC-3 基线账在位', ledger.length > 30 && missing.length === 0, `ledger=${ledger.length} 缺=${missing.join(',')}`);

console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
