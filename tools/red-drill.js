'use strict';
// tools/red-drill.js —— SPEC-6.44 红队沙盘演练 CLI
// 用法：node tools/red-drill.js [--keep]
// 全程临时库：建 mkdtemp 库 → 跑 S1/S2/S3/S4/S5 + C1 对照 → 打印报告 → 删库（--keep 保留现场）。
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main(argv) {
  const keep = argv.includes('--keep');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-red-drill-'));
  const dbPath = path.join(dir, 'drill.db');
  const store = require('../src/knowledge-store.js');
  await store.init(dbPath);
  const { runDrills } = require('../src/red-drill.js');
  const r = await runDrills({ store, keep });

  console.log('═══ 红队演练报告 ═══');
  for (const x of r.results) console.log(`${x.pass ? '✅' : '❌'} ${x.id} ${x.name} — ${x.detail}`);
  console.log('');
  console.log(`${r.failures === 0 ? '🟢' : '🔴'} ${r.results.filter(x => x.pass).length}/${r.results.length} 过 — ` +
    (r.failures === 0 ? '五类载荷全接住，干净对照未误伤' : r.failures + ' 道防线失守，见 ❌ 行'));

  if (keep) {
    console.log(`沙盘保留(--keep): ${dir}`);
  } else {
    try { fs.rmSync(dir, { recursive: true, force: true }); console.log(`沙盘已清: ${dir}`); } catch (_) {}
  }
  process.exitCode = r.failures === 0 ? 0 : 1;
}

main(process.argv).catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
