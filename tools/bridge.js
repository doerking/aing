'use strict';
// tools/bridge.js —— SPEC-6.50 meko-bridge CLI
// 用法：
//   node tools/bridge.js status [--db <库>] [--json] [--layer <层>]
//   node tools/bridge.js publish '<signals-json>' [--db <库>]
//   node tools/bridge.js verify <fp> [--reject] [--note "<话>"] [--db <库>]
const fs = require('fs');
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }
function _has(args, name) { return args.includes('--' + name); }

async function main(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  if (!cmd || !['status', 'publish', 'verify'].includes(cmd)) {
    console.error('用法: node tools/bridge.js status|publish <json>|verify <fp> [--db <库>] [--json] [--reject] [--note <话>]');
    process.exit(2);
  }
  const dbPath = _flag(args, 'db', process.env.AING_DB || path.join(__dirname, '..', 'data', 'knowledge.db'));
  const json = _has(args, 'json');
  const store = require('../src/knowledge-store.js');
  const B = require('../src/meko-bridge.js');
  if (!fs.existsSync(dbPath)) { console.error('库不存在: ' + dbPath); process.exit(2); }
  await store.init(dbPath);

  if (cmd === 'status') {
    const rep = B.summarize(store, { ownLayer: _flag(args, 'layer', undefined) });
    if (json) { console.log(JSON.stringify(rep, null, 2)); return; }
    console.log(`待核 ${rep.pending}（超时 ${rep.stalePending}）| 核过 ${rep.verified.length} | 拒 ${rep.rejected}`);
    for (const v of rep.own.verified) console.log(`  ✅ [${v.layer}] ${v.headId}: ${v.summary}`);
    return;
  }

  if (cmd === 'publish') {
    let sigs = null;
    try { sigs = JSON.parse(args[1] || 'null'); } catch (_) { sigs = null; }
    if (!Array.isArray(sigs)) { console.error('publish 需要信号数组 JSON'); process.exit(2); }
    const rep = B.publishSignals(store, sigs);
    if (json) { console.log(JSON.stringify(rep, null, 2)); return; }
    console.log(`发出 ${rep.sent} 条，跳过重复 ${rep.skipped} 条`);
    return;
  }

  // verify
  const fp = args[1];
  if (!fp || fp.startsWith('--')) { console.error('verify 需要回单指纹'); process.exit(2); }
  const rep = B.verifyReturn(store, fp, { ok: !_has(args, 'reject'), note: _flag(args, 'note', '') });
  if (json) { console.log(JSON.stringify(rep, null, 2)); return; }
  if (!rep.ok) { console.error('核单失败: ' + rep.reason); process.exit(1); }
  console.log(`回单 ${fp} → ${rep.status}`);
}

main(process.argv).catch((e) => { console.error('❌ ' + e.message); process.exitCode = 1; });
