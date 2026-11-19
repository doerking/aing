'use strict';
// tools/unseed-demo.js —— SPEC-6.49 演示语料拆除 CLI
// 用法：node tools/unseed-demo.js --root <目录> [--json] [--dry]
// 只拆 data/demo-seed.json 账上的 id；改过的不拆。
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

async function main(argv) {
  const args = argv.slice(2);
  const root = _flag(args, 'root', null);
  const json = args.includes('--json');
  const dry = args.includes('--dry');
  if (!root) { console.error('用法: node tools/unseed-demo.js --root <目录> [--json] [--dry]'); process.exit(2); }
  if (dry) {
    const fs = require('fs');
    const { MARKER } = require('../src/demo-seed.js');
    const markerPath = path.join(path.resolve(root), MARKER);
    let marker = null;
    try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch (_) { marker = null; }
    const rep = marker
      ? { ok: true, dry: true, willRemove: Object.keys(marker.entities || {}), marker: markerPath }
      : { ok: true, dry: true, reason: 'no-marker' };
    if (json) console.log(JSON.stringify(rep, null, 2)); else console.log(JSON.stringify(rep));
    return;
  }

  const store = require('../src/knowledge-store.js');
  const { unseedDemo } = require('../src/demo-seed.js');
  await store.init(path.join(path.resolve(root), 'data', 'knowledge.db'));
  const rep = await unseedDemo(store, { root });

  if (json) { console.log(JSON.stringify(rep, null, 2)); return; }
  if (rep.reason) console.log('无可拆：' + rep.reason);
  else {
    console.log(`拆除 ${rep.deleted.length} 条` + (rep.skipped.length ? `，跳过 ${rep.skipped.length} 条` : ''));
    for (const s of rep.skipped) console.log(`  ⚠️ ${s.id}: ${s.why}`);
  }
}

main(process.argv).catch((e) => {
  console.error('❌ ' + e.message);
  process.exitCode = /^root-missing|^root-not-dir/.test(e.message) ? 4 : 1;
});
