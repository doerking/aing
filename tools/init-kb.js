'use strict';
// tools/init-kb.js —— SPEC-6.47 冷启动初始化 CLI
// 用法：node tools/init-kb.js --root <目录> [--db <库路径>] [--json]
// 铁律：root 必须显式给，绝不缺省到仓库；只增不删。
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

async function main(argv) {
  const args = argv.slice(2);
  const root = _flag(args, 'root', null);
  const json = args.includes('--json');
  if (!root) {
    console.error('用法: node tools/init-kb.js --root <目录> [--db <库路径>] [--json]');
    process.exit(2);
  }

  const dbPath = _flag(args, 'db', path.join(path.resolve(root), 'data', 'knowledge.db'));
  const store = require('../src/knowledge-store.js');
  const { initWorkspace } = require('../src/bootstrap.js');

  await store.init(dbPath);
  const rep = initWorkspace({ root, dbPath, store });

  if (json) { console.log(JSON.stringify(rep, null, 2)); return; }
  console.log(`工作区: ${rep.root}`);
  console.log(`库    : ${rep.db.path}（${rep.db.tables} 表）`);
  if (rep.created.length) console.log('新建  : ' + rep.created.join('、'));
  if (rep.existing.length) console.log('已有  : ' + rep.existing.join('、'));
}

main(process.argv).catch((e) => {
  const code = /^root-missing|^root-not-dir/.test(e.message) ? 4 : 1;
  console.error('❌ ' + e.message);
  process.exit(code);
});
