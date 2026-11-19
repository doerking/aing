'use strict';
// tools/parasite-loop.js —— SPEC-6.45 P1 自动领单 CLI
// 用法：node tools/parasite-loop.js --db <库副本> [--once] [--interval <ms>] [--max N]
// 铁律：必须显式 --db，真库路径直接拒跑；默认跑一轮即退；不装守护进程，常驻与否由宿主决定。
const fs = require('fs');
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

async function main(argv) {
  const args = argv.slice(2);
  const dbPath = _flag(args, 'db', null);
  const real = path.join(__dirname, '..', 'data', 'knowledge.db');
  if (!dbPath) { console.error('用法: node tools/parasite-loop.js --db <副本> [--once] [--interval <ms>] [--max N]'); process.exit(2); }
  if (path.resolve(dbPath) === path.resolve(real)) { console.error('拒在真库上跑：先复制一份到副本'); process.exit(3); }
  if (!fs.existsSync(dbPath)) { console.error('库不存在: ' + dbPath); process.exit(2); }

  const interval = Number(_flag(args, 'interval', 0));
  const once = args.includes('--once') || !interval;
  const max = Number(_flag(args, 'max', 50));

  const store = require('../src/knowledge-store.js');
  const { runP1Once } = require('../src/parasite-runner.js');
  await store.init(dbPath);

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n收到中断，跑完本轮后退出'); });

  let cycles = 0;
  do {
    cycles++;
    const r = await runP1Once(store, { max, round: _flag(args, 'round', undefined) });
    const v = r.verify || {};
    console.log(`[轮 ${cycles}] round=${r.round} 领单 ${r.claimed.length} / 写回 ${r.rewritten.filter(x => x.ok).length}` +
      (r.verify ? ` / 验收 verified=${(v.verified || []).length} rejected=${(v.rejected || []).length} stillOpen=${(v.stillOpen || []).length}` : ' / 未验收'));
    for (const w of r.rewritten) if (w.error) console.log(`  ⚠️ ${w.entity_id}: ${w.error}`);
    if (once) break;
    if (!r.claimed.length && !r.verify) break;
    if (!stop) await new Promise(res => setTimeout(res, interval));
  } while (!stop && !once);
}

main(process.argv).catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
