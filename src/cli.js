'use strict';
// aing-v2 cli.js —— M3 任务 3.14 CLI 入口（SPEC-3.14）
// 统一开库入口（与 neural.js 同角色，arch-lint C5 白名单）：memo / ingest / orchestrate。
// 组件本体保持纯库，store 由本层注入；库路径取 --db > AING_DB > 缺省 data/knowledge.db。

const path = require('path');
const store = require('./knowledge-store.js');

function resolveDbPath(dbPath) {
  return dbPath || process.env.AING_DB || path.join(__dirname, '..', 'data', 'knowledge.db');
}

async function openStore(dbPath) {
  await store.init(resolveDbPath(dbPath));
  return store;
}

async function cmdMemo(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { buildMemo } = require('./memo.js');
  return buildMemo(s, opts);
}

async function cmdIngest(dbPath, payload = {}) {
  const s = await openStore(dbPath);
  const { autoIngest } = require('./auto-ingest.js');
  return autoIngest(s, payload);
}

async function cmdAccess(dbPath, ids, opts = {}) {
  const s = await openStore(dbPath);
  const { recordAccess } = require('./access.js');
  return recordAccess(s, ids, opts);
}

async function cmdSelfOptimize(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { selfOptimizeStep } = require('./self-optimize.js');
  return selfOptimizeStep(s, opts);
}

async function cmdOrchestrate(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { MekoOrchestrator } = require('./meko-orchestrator.js');
  const { buildDefaultSteps } = require('./metabolism.js');
  const orch = new MekoOrchestrator({ store: s });
  const steps = Array.isArray(opts.steps) ? opts.steps : buildDefaultSteps();
  for (const step of steps) orch.registerStep(step);
  return orch.runCycle(opts.cycleType || '代谢', {
    rounds: opts.rounds || 2, budgetMs: opts.budgetMs, selfOptimize: opts.selfOptimize
  });
}

// SPEC-3.15：文件读取只在 CLI 层做，卡本体保持纯函数
function cmdDispatchCard(opts = {}) {
  const fs = require('fs');
  const { buildDispatchCard } = require('./dispatch-card.js');
  const ticket = opts.file ? JSON.parse(fs.readFileSync(path.resolve(String(opts.file)), 'utf8')) : {};
  const snapshot = opts.snapshot ? JSON.parse(fs.readFileSync(path.resolve(String(opts.snapshot)), 'utf8')) : undefined;
  return buildDispatchCard(ticket, { snapshot });
}

function humanMemo(m) {
  const u = m.user || {};
  const L = ['—— 用户面 ——'];
  if (u.coldStart) L.push('（空库：无以往会话可依）');
  for (const r of u.recent || []) L.push(`· ${r.topic || r.sessionId} [${r.outcome}]`);
  if ((u.openLoops || []).length) L.push('未闭环：' + u.openLoops.map(x => x.text).join(' / '));
  if ((u.patterns || []).length) L.push('模式：' + u.patterns.map(p => `${p.pattern}×${p.hits}`).join(' / '));
  if ((u.plans || []).length) L.push('预案：' + u.plans.map(p => p.hypothesis).join(' | '));
  if (m.swarm && m.swarm.attached) L.push(m.swarm.summary + '（卡已挂载）');
  else if (m.swarm && m.swarm.line) L.push(m.swarm.line);
  L.push('系统：' + (m.systemLine || ''));
  return L.join('\n');
}

function parse(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2); const n = argv[i + 1];
      if (n == null || n.startsWith('--')) flags[k] = true; else { flags[k] = n; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

function usage() {
  console.log([
    'aing-v2 cli（CLI 开库入口）',
    '  node src/cli.js memo [--json] [--limit N] [--swarm-card <ticket.json>] [--db <path>]',
    '  node src/cli.js dispatch-card --file <ticket.json> [--snapshot <path>] [--json]',
    '  node src/cli.js ingest --payload <json>',
    '  node src/cli.js orchestrate [--rounds N] [--json] [--self-optimize]',
    '  node src/cli.js access --ids a,b [--source cli]',
    '  node src/cli.js self-optimize [--cycle <id>] [--no-rescore]'
  ].join('\n'));
}

async function main(argv) {
  const { pos, flags } = parse(argv);
  const cmd = pos[0];
  if (!cmd || cmd === 'help' || cmd === '--help') { usage(); return 0; }
  const dbPath = flags.db || undefined;
  try {
    if (cmd === 'memo') {
      const opts = { limit: flags.limit ? Number(flags.limit) : undefined };
      if (flags['swarm-card']) {
        const fs = require('fs');
        const { buildDispatchCard } = require('./dispatch-card.js');
        const ticket = JSON.parse(fs.readFileSync(path.resolve(String(flags['swarm-card'])), 'utf8'));
        const snapshot = flags.snapshot ? JSON.parse(fs.readFileSync(path.resolve(String(flags.snapshot)), 'utf8')) : undefined;
        opts.swarmCard = buildDispatchCard(ticket, { snapshot });
      }
      const out = await cmdMemo(dbPath, opts);
      console.log(flags.json ? JSON.stringify(out, null, 2) : humanMemo(out));
      return 0;
    }
    if (cmd === 'dispatch-card') {
      const out = cmdDispatchCard({ file: flags.file, snapshot: flags.snapshot });
      console.log(flags.json ? JSON.stringify(out, null, 2) : out.card);
      return out.ok ? 0 : 3;
    }
    if (cmd === 'ingest') {
      const payload = flags.payload ? JSON.parse(flags.payload) : {};
      const out = await cmdIngest(dbPath, payload);
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
    if (cmd === 'access') {
      const ids = String(flags.ids || '').split(',').map(x => x.trim()).filter(Boolean);
      const out = await cmdAccess(dbPath, ids, { source: flags.source || 'cli' });
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
    if (cmd === 'orchestrate') {
      const out = await cmdOrchestrate(dbPath, {
        rounds: flags.rounds ? Number(flags.rounds) : undefined,
        selfOptimize: flags['self-optimize'] === true
      });
      console.log(flags.json ? JSON.stringify(out, null, 2) : `orchestrate ok=${out.ok} rounds=${out.rounds} ${out.elapsedMs}ms`);
      return 0;
    }
    if (cmd === 'self-optimize') {
      const out = await cmdSelfOptimize(dbPath, {
        cycleId: flags.cycle ? String(flags.cycle) : null,
        rescore: flags['no-rescore'] === true ? false : true
      });
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
    usage(); return 2;
  } catch (e) {
    console.error('error: ' + e.message);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; });
}

module.exports = { openStore, cmdMemo, cmdIngest, cmdAccess, cmdSelfOptimize, cmdOrchestrate, cmdDispatchCard, humanMemo, usage, main };
