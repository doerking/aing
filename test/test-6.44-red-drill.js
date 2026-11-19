'use strict';
// M6 任务 6.44 failing test —— 红队沙盘演练（SPEC-6.44）
// 要修的病：覆盖判定说 v2 缺红队演练——门禁不等于进攻演练，防线退化没人知道。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-drill-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let R = null;
try { R = require('../src/red-drill.js'); } catch (_) { R = null; }

(async () => {
  await store.init(path.join(yard, 'drill.db'));
  const run = (R && typeof R.runDrills === 'function') ? await R.runDrills({ store }) : null;
  const by = (id) => (run && Array.isArray(run.results) ? run.results.find(r => r.id === id) : null);

  ac('AC-1 S1 注入载荷惰性入库、tags 不受污染', !!by('S1') && by('S1').pass === true, JSON.stringify(by('S1')));
  ac('AC-2 S2 脏标签零入列且 tagsDropped 计数正确', !!by('S2') && by('S2').pass === true, JSON.stringify(by('S2')));
  ac('AC-3 S3 空壳覆盖被拒、旧正文不变', !!by('S3') && by('S3').pass === true, JSON.stringify(by('S3')));
  ac('AC-4 S4 降级覆盖被拒、旧正文不变', !!by('S4') && by('S4').pass === true, JSON.stringify(by('S4')));
  ac('AC-5 S5 身份闸拒非授权、标签闸降为提议', !!by('S5') && by('S5').pass === true, JSON.stringify(by('S5')));
  ac('AC-6 干净对照正常入库（双侧断言）', !!by('C1') && by('C1').pass === true, JSON.stringify(by('C1')));
  ac('AC-7 演练全过且报告形状正确',
    !!run && run.failures === 0 && Array.isArray(run.results) && run.results.length === 6 &&
    run.results.every(r => typeof r.id === 'string' && typeof r.name === 'string' && typeof r.detail === 'string'),
    JSON.stringify({ failures: run && run.failures, n: run && run.results && run.results.length }));

  console.log(`\n----- 6.44 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
