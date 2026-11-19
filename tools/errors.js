'use strict';
// tools/errors.js —— SPEC-6.46 错误码行动表 CLI
// 用法：
//   node tools/errors.js                 打印全表（code / klass / action）
//   node tools/errors.js --json          输出 JSON（{klasses, codes:[{code,klass,action}]}）
//   node tools/errors.js --explain "<消息>"  单条分类
const E = require('../src/error-handler.js');

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const ei = args.indexOf('--explain');

  if (ei >= 0) {
    const msg = args[ei + 1];
    if (!msg) { console.error('用法: node tools/errors.js --explain "<错误消息>"'); process.exit(2); }
    const r = E.classify(msg);
    if (json) { console.log(JSON.stringify(r, null, 2)); return; }
    console.log(`code   : ${r.code}`);
    console.log(`klass  : ${r.klass}`);
    console.log(`known  : ${r.known}`);
    console.log(`action : ${r.action}`);
    return;
  }

  const codes = Object.keys(E.ERROR_TABLE).map(code => ({
    code, klass: E.ERROR_TABLE[code].klass, action: E.ERROR_TABLE[code].action
  })).sort((a, b) => (a.klass === b.klass ? a.code.localeCompare(b.code) : a.klass.localeCompare(b.klass)));

  if (json) {
    console.log(JSON.stringify({ klasses: E.KLASSES, codes }, null, 2));
    return;
  }

  let lastKlass = null;
  for (const c of codes) {
    if (c.klass !== lastKlass) { console.log(`\n【${c.klass}】`); lastKlass = c.klass; }
    console.log(`  ${c.code.padEnd(26)} ${c.action}`);
  }
  console.log(`\n共 ${codes.length} 条`);
}

main(process.argv);
