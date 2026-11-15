'use strict';
// M3 任务 3.7 —— 门禁 C0–C9 适配（v2 目录/组件映射）
// C1/C2 会反向跑全库（含本档）→ 由外层 run-all / verify 全量覆盖，此处不重入。
const { spawnSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-gate37-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const IDS = ['C0', 'C3', 'C4', 'C5', 'C6', 'C7a', 'C7b', 'C8', 'C9a', 'C9b', 'C9c'];
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'verify-deploy.js')], {
  cwd: path.join(__dirname, '..'), encoding: 'utf8',
  env: { ...process.env, VD_ONLY: IDS.join(',') }, timeout: 120000
});
const out = (r.stdout || '') + (r.stderr || '');
const green = (id) => new RegExp('✅ ' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ').test(out);

ac('AC-1 十一项全在', IDS.every(green), out.split('\n').filter(l => l.startsWith('❌')).join(' | '));
ac('AC-2 无红', r.status === 0, 'exit=' + r.status);
ac('AC-3 部分跑不写登记', /部分跑/.test(out) && !/部署验收通过/.test(out), out.split('\n').slice(-2).join(' | '));

console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
