'use strict';
// aing-v2 neural.js —— M3 任务 3.2 CLI 入口（SPEC-3.2）
// 四个动作：event / inhibit / status / verify；与 HTTP 共用 control-plane.runAction。
// 库路径取 AING_DB，缺省 data/knowledge.db。

const path = require('path');
const store = require('./knowledge-store.js');
const cp = require('./control-plane.js');

function usage() {
  console.log([
    'aing-v2 neural（意识层控制面）',
    '  node src/neural.js event <type> [--target t] [--payload <json>] [--source hana]',
    '  node src/neural.js inhibit <target> [--reason r] [--hours N]',
    '  node src/neural.js status [--json]',
    '  node src/neural.js verify <subject> [--kind promote]'
  ].join('\n'));
}

function parse(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

function humanStatus(s) {
  const lines = [
    `state=${s.kernel.state} attention=${s.kernel.attention} stagnant=${s.kernel.stagnation_count} events=${s.events}`,
    `factors: vitality=${s.factors.vitality} recency=${s.factors.recency} density=${s.factors.connectionDensity} anomaly=${s.factors.anomaly} interest=${s.factors.userInterest}`
  ];
  if (s.inhibitions.length) {
    lines.push('inhibitions:');
    for (const i of s.inhibitions) lines.push(`  ${i.target} ${i.active ? 'active' : 'expired'} until=${i.until} reason=${i.reason}`);
  }
  return lines.join('\n');
}

(async () => {
  const { pos, flags } = parse(process.argv.slice(2));
  const action = pos[0];
  if (!action || action === 'help' || action === '--help') { usage(); return; }

  const dbPath = process.env.AING_DB || path.join(__dirname, '..', 'data', 'knowledge.db');
  await store.init(dbPath);

  let args = {};
  if (action === 'event') args = { type: pos[1], target: flags.target, payload: flags.payload ? JSON.parse(flags.payload) : undefined, source: flags.source || 'hana' };
  else if (action === 'inhibit') args = { target: pos[1], reason: flags.reason, hours: flags.hours };
  else if (action === 'verify') args = { subject: pos[1], kind: flags.kind };
  else if (action !== 'status') { usage(); process.exitCode = 2; return; }

  try {
    const out = await cp.runAction(store, action, args);
    if (action === 'status' && !flags.json) console.log(humanStatus(out));
    else console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('error: ' + e.message);
    process.exitCode = 1;
  }
})();
