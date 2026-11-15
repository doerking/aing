'use strict';
// M3 任务 3.8 —— 门禁 C10a–C10i 适配（入库/写面/读数）
const { spawnSync } = require('child_process');
const path = require('path');
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const IDS = ['C10a', 'C10b', 'C10c', 'C10d', 'C10e', 'C10f', 'C10g', 'C10h', 'C10i'];
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'verify-deploy.js')], {
  cwd: path.join(__dirname, '..'), encoding: 'utf8',
  env: { ...process.env, VD_ONLY: IDS.join(',') }, timeout: 120000
});
const out = (r.stdout || '') + (r.stderr || '');
const green = (id) => new RegExp('✅ ' + id + ' ').test(out);

ac('AC-1 九项全在', IDS.every(green), out.split('\n').filter(l => l.startsWith('❌')).join(' | '));
ac('AC-2 无红', r.status === 0, 'exit=' + r.status);
ac('AC-3 剥除门禁真剥', /剥除 \d+ 处/.test(out) && /身份\/标签双闸绿/.test(out), out.match(/C10h.*/)?.[0] || '');

console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
