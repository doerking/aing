'use strict';
// tools/candidate-scrub.js —— SPEC-6.52 旧候选边清账 CLI
// 用法：node tools/candidate-scrub.js --db <副本> [--apply] [--json]
// 铁律：必须显式 --db，真库路径拒跑（exit 3）；默认干跑。
const fs = require('fs');
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

async function main(argv) {
  const args = argv.slice(2);
  const dbPath = _flag(args, 'db', null);
  const real = path.join(__dirname, '..', 'data', 'knowledge.db');
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  if (!dbPath) { console.error('用法: node tools/candidate-scrub.js --db <副本> [--apply] [--json]'); process.exit(2); }
  if (path.resolve(dbPath) === path.resolve(real)) { console.error('拒在真库上跑：先复制一份到副本'); process.exit(3); }
  if (!fs.existsSync(dbPath)) { console.error('库不存在: ' + dbPath); process.exit(2); }

  const store = require('../src/knowledge-store.js');
  const { scrubCandidates } = require('../src/candidate-scrub.js');
  await store.init(dbPath);
  const rep = scrubCandidates(store, { apply });

  if (json) { console.log(JSON.stringify(rep, null, 2)); return; }
  console.log(`${apply ? '已退役' : '将退役'} ${rep.wouldRetire} 条空证据候选边（扫描 ${rep.scanned} 条）`);
  for (const r of rep.retired.slice(0, 20)) console.log(`  · ${r.source_id} → ${r.target_id} (${r.relation}@${r.strength})`);
  if (rep.retired.length > 20) console.log(`  … 其余 ${rep.retired.length - 20} 条`);
  if (!apply && rep.wouldRetire) console.log('干跑结束；加 --apply 落库');
}

main(process.argv).catch((e) => { console.error('❌ ' + e.message); process.exitCode = 1; });
