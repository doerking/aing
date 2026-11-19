'use strict';
// tools/seed-demo.js —— SPEC-6.49 演示语料播种 CLI
// 用法：node tools/seed-demo.js --root <目录> [--json]
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

async function main(argv) {
  const args = argv.slice(2);
  const root = _flag(args, 'root', null);
  const json = args.includes('--json');
  if (!root) { console.error('用法: node tools/seed-demo.js --root <目录> [--json]'); process.exit(2); }

  const store = require('../src/knowledge-store.js');
  const { seedDemo } = require('../src/demo-seed.js');
  await store.init(path.join(path.resolve(root), 'data', 'knowledge.db'));
  const rep = await seedDemo(store, { root });

  if (json) { console.log(JSON.stringify(rep, null, 2)); return; }
  console.log(`播种 ${rep.ids.length} 条（新建 ${rep.created} / 更新 ${rep.updated}）`);
  console.log('原稿: ' + rep.files.join('、'));
  console.log('账本: ' + rep.marker);
}

main(process.argv).catch((e) => {
  console.error('❌ ' + e.message);
  process.exitCode = /^root-missing|^root-not-dir/.test(e.message) ? 4 : 1;
});
