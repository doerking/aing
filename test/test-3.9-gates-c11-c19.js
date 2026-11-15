'use strict';
// M3 任务 3.9 —— 门禁 C11–C19 适配（意识层/控制面/读端/旋钮/计数）
// C19 会反向跑全库（含本档）→ 由外层 verify 全量覆盖，此处不重入。
const { spawnSync } = require('child_process');
const path = require('path');
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const IDS = ['C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18'];
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'verify-deploy.js')], {
  cwd: path.join(__dirname, '..'), encoding: 'utf8',
  env: { ...process.env, VD_ONLY: IDS.join(',') }, timeout: 120000
});
const out = (r.stdout || '') + (r.stderr || '');
const green = (id) => new RegExp('✅ ' + id + ' ').test(out);

ac('AC-1 八项全在', IDS.every(green), out.split('\n').filter(l => l.startsWith('❌')).join(' | '));
ac('AC-2 无红', r.status === 0, 'exit=' + r.status);
ac('AC-3 写端边界守住', /零提交写端/.test(out) && /纯读绿/.test(out), out.match(/C13.*/)?.[0] || '');

console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
