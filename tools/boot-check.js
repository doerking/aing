'use strict';
// tools/boot-check.js —— SPEC-6.48 开机自检 CLI
// 用法：node tools/boot-check.js --root <目录> [--db <库路径>] [--json]
// 退出码：ok 0 / degraded 1 / broken 4 / 参数缺 2。只读，不改任何东西。
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

const ICON = { ok: '✅', warn: '⚠️', fail: '❌' };

async function main(argv) {
  const args = argv.slice(2);
  const root = _flag(args, 'root', null);
  const json = args.includes('--json');
  if (!root) {
    console.error('用法: node tools/boot-check.js --root <目录> [--db <库路径>] [--json]');
    process.exit(2);
  }
  const dbPath = _flag(args, 'db', path.join(path.resolve(root), 'data', 'knowledge.db'));
  const store = require('../src/knowledge-store.js');
  const { bootCheck } = require('../src/boot-check.js');

  if (require('fs').existsSync(dbPath)) await store.init(dbPath);
  const rep = bootCheck({ root, dbPath, store });

  if (json) console.log(JSON.stringify(rep, null, 2));
  else {
    console.log(`结论: ${rep.verdict.toUpperCase()}`);
    for (const c of rep.checks) console.log(`  ${ICON[c.level]} ${c.id.padEnd(12)} ${c.detail}`);
  }
  // 用 exitCode 而非 process.exit：sql.js 插排在 Windows 上被硬退会触发 libuv 断言
  process.exitCode = rep.verdict === 'ok' ? 0 : rep.verdict === 'degraded' ? 1 : 4;
}

main(process.argv).catch((e) => { console.error('❌ ' + e.message); process.exitCode = 4; });
