'use strict';
// tools/tag-scrub.js —— SPEC-6.42 存量标签洗消
// 用法：node tools/tag-scrub.js --db <库副本> [--apply] [--json]
// 铁律：必须显式 --db，且与真库 data/knowledge.db 同路径直接拒跑；默认 dry-run。
const fs = require('fs');
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

async function main(argv) {
  const args = argv.slice(2);
  const dbPath = _flag(args, 'db', null);
  const real = path.join(__dirname, '..', 'data', 'knowledge.db');
  if (!dbPath) { console.error('用法: node tools/tag-scrub.js --db <副本> [--apply] [--json]'); process.exit(2); }
  if (path.resolve(dbPath) === path.resolve(real)) { console.error('拒在真库上跑：先复制一份到副本'); process.exit(3); }
  if (!fs.existsSync(dbPath)) { console.error('库不存在: ' + dbPath); process.exit(2); }

  const store = require('../src/knowledge-store.js');
  const H = require('../src/tag-hygiene.js');
  await store.init(dbPath);
  const apply = args.includes('--apply');
  const r = H.scrubStore(store, { apply });

  const report = {
    db: path.resolve(dbPath),
    mode: apply ? 'apply' : 'dry-run',
    scanned: r.scanned,
    hits: r.hits.length,
    applied: r.applied,
    details: r.hits
  };
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[${report.mode}] 扫描 ${report.scanned} 实体，命中 ${report.hits}，写回 ${report.applied}`);
    for (const h of report.details.slice(0, 20)) {
      console.log(`  - ${h.id}: ${h.before} → ${h.after}`);
      for (const d of h.dropped) console.log(`      ${d.why}: ${JSON.stringify(d.tag)}`);
    }
    if (report.details.length > 20) console.log(`  …其余 ${report.details.length - 20} 条省略（--json 看全量）`);
    if (!apply && report.hits) console.log('（dry-run 未写库；要落库加 --apply）');
  }
}

main(process.argv).catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
