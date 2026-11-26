#!/usr/bin/env node\n'use strict';
// aing-v2 cli.js —— M3 任务 3.14 CLI 入口（SPEC-3.14）
// 统一开库入口（与 neural.js 同角色，arch-lint C5 白名单）：memo / ingest / orchestrate。
// 组件本体保持纯库，store 由本层注入；库路径取 --db > AING_DB > 缺省 data/knowledge.db。

const path = require('path');
const store = require('./knowledge-store.js');

function resolveDbPath(dbPath) {
  return dbPath || process.env.AING_DB || path.join(__dirname, '..', 'data', 'knowledge.db');
}

// Windows PowerShell 5.1 Set-Content -Encoding UTF8 会写 BOM（\uFEFF），JSON.parse 会拋
// Unexpected token。CLI 面统一过这里去 BOM 再解析（--payload / dispatch-card --file / snapshot / swarm-card）。
function parseJsonInput(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/, ''));
}
function readJsonFile(p) {
  const fs = require('fs');
  return parseJsonInput(fs.readFileSync(path.resolve(String(p)), 'utf8'));
}

async function openStore(dbPath) {
  await ensureRequestedBackend();
  await store.init(resolveDbPath(dbPath));
  return store;
}

/** SPEC-5.5 / SPEC-5.9：按缺省或显式请求注册语义后端；注册不上只告警并回退，不拦开库 */
async function ensureRequestedBackend() {
  const want = String(process.env.AING_VECTOR_BACKEND || require('./vector.js').DEFAULT_BACKEND);
  if (!want.startsWith('onnx-')) return null;
  const O = require('./onnx-backend.js');
  const r = await O.ensureRegistered();
  if (!r.ok) {
    console.error(`[vector] 语义后端 ${want} 不可用（${r.reason}），回退 ${require('./vector.js').MODEL}`);
  }
  return r;
}

async function cmdReindex(dbPath) {
  const s = await openStore(dbPath);
  const V = require('./vector.js');
  const stats = await V.vectorStep(s);
  return { backend: V.resolveBackend().name, ...stats };
}

async function cmdMemo(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { buildMemo } = require('./memo.js');
  return buildMemo(s, opts);
}

async function cmdPredict(dbPath, opts = {}) {
  const message = String(opts.message == null ? '' : opts.message).trim();
  if (!message) throw new Error('predict 需要 --message（空词不猜）');
  const s = await openStore(dbPath);
  const { predict } = require('./predict.js');
  return predict(s, { message });
}

async function cmdIngest(dbPath, payload = {}) {
  const s = await openStore(dbPath);
  const { autoIngest } = require('./auto-ingest.js');
  return autoIngest(s, payload);
}

// SPEC-3.14 修订 A：batch-ingest——复用 compile（walk 目录 → frontmatter → 实体 upsert，幂等）
async function cmdCompile(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { compile } = require('./compile.js');
  return compile(String(opts.dir), s, { quality: opts.quality === true });
}

// SPEC-3.14 修订 B：search-and-ingest——query 拆词评分源档，选 top-N ≥ threshold，经 compile(files) 入库
async function cmdSearchIngest(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { searchIngest } = require('./search-ingest.js');
  return searchIngest(s, opts);
}

// SPEC-3.14 修订 C：api entity REST——起 HTTP 面，路由在 src/entity-api.js（写面复用 api-gate）
async function cmdApi(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { createServer } = require('./entity-api.js');
  const svc = createServer({
    port: opts.port == null ? 3000 : Number(opts.port),
    host: opts.host || '127.0.0.1',
    store: s
  });
  // 修订 D：起服回执必须喺 listen 完成后打，唔该打印 port: null；唔自挂 listening 事件
  await svc.ready;
  const bound = {
    port: svc.address(),
    host: svc.server.address().address,
    db: resolveDbPath(dbPath),
    routes: ['GET /health', 'GET /entities', 'GET /entities/:id', 'POST /entities'],
    started: true
  };
  if (opts.selftest) { await svc.close(); return bound; }
  console.log(`api 监听 http://${bound.host === '0.0.0.0' ? '0.0.0.0' : bound.host}:${bound.port}`);
  return { ...bound, server: svc };
}

async function cmdBoard(dbPath, opts = {}) {
  const s = await openStore(dbPath);
  const { boardOf } = require('./ticket-board.js');
  return boardOf(s, opts);
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
  const { buildDispatchCard } = require('./dispatch-card.js');
  const ticket = opts.file ? readJsonFile(opts.file) : {};
  const snapshot = opts.snapshot ? readJsonFile(opts.snapshot) : undefined;
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

function humanPredict(p) {
  const plans = (p && p.plans) || [];
  const L = [`—— 预案（${p && p.coldStart ? '冷启动' : plans.length + ' 张'}）——`];
  for (let i = 0; i < plans.length; i++) {
    const c = plans[i];
    L.push(`${i + 1}) [${c.confidenceBand || 'low'}] ${c.hypothesis}`);
    const basis = c.basis || [];
    L.push('   依据：' + (basis.length
      ? basis.map((b) => `${b.kind} ${b.id}「${String(b.quote || '').slice(0, 30)}」`).join(' / ')
      : '无（冷启动，不造依据）'));
    if (c.suggested) L.push('   建议：' + c.suggested);
    if (c.risk) L.push('   风险：' + c.risk);
  }
  return L.join(String.fromCharCode(10));
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
    '  node src/cli.js predict --message "..." [--json] [--db <path>]',
    '  node src/cli.js dispatch-card --file <ticket.json> [--snapshot <path>] [--json]',
    '  node src/cli.js ingest --payload <json>',
    '  node src/cli.js compile --dir <path>   # SPEC-3.14 修订 A：batch-ingest（markdown 知识档 → 实体，幂等）',
    '  node src/cli.js ingest-search --query "..." --source <dir> [--top N] [--threshold x]   # SPEC-3.14 修订 B：search-and-ingest',
    '  node src/cli.js api --port 3000 [--host 127.0.0.1] [--json]   # SPEC-3.14 修订 C：api entity REST（GET /entities、/entities/:id、POST /entities、/health）',
    '  node src/cli.js orchestrate [--rounds N] [--json] [--self-optimize]',
    '  node src/cli.js access --ids a,b [--source cli]',
    '  node src/cli.js self-optimize [--cycle <id>] [--no-rescore]',
    '  node src/cli.js board [--limit N] [--json] [--db <path>]   # SPEC-6.16：回单外接屏（只读）',
    '  node src/cli.js reindex [--db <path>]   # SPEC-5.5：换后端后全量重建向量'
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
        const { buildDispatchCard } = require('./dispatch-card.js');
        const ticket = readJsonFile(flags['swarm-card']);
        const snapshot = flags.snapshot ? readJsonFile(flags.snapshot) : undefined;
        opts.swarmCard = buildDispatchCard(ticket, { snapshot });
      }
      const out = await cmdMemo(dbPath, opts);
      console.log(flags.json ? JSON.stringify(out, null, 2) : humanMemo(out));
      return 0;
    }
    if (cmd === 'reindex') {
      const out = await cmdReindex(dbPath);
      console.log(flags.json ? JSON.stringify(out, null, 2) : `重建：后端 ${out.backend}，扫描 ${out.scanned}，新建 ${out.indexed}，重建 ${out.rebuilt}，跳过 ${out.skipped}`);
      return 0;
    }
    if (cmd === 'predict') {
      const message = flags.message && flags.message !== true ? String(flags.message) : '';
      if (!message.trim()) { usage(); return 2; }
      const out = await cmdPredict(dbPath, { message });
      console.log(flags.json ? JSON.stringify(out, null, 2) : humanPredict(out));
      return 0;
    }
    if (cmd === 'dispatch-card') {
      const out = cmdDispatchCard({ file: flags.file, snapshot: flags.snapshot });
      console.log(flags.json ? JSON.stringify(out, null, 2) : out.card);
      return out.ok ? 0 : 3;
    }
    if (cmd === 'ingest') {
      const payload = flags.payload ? parseJsonInput(flags.payload) : {};
      const out = await cmdIngest(dbPath, payload);
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
    if (cmd === 'compile') {
      const dir = flags.dir && flags.dir !== true ? String(flags.dir) : '';
      if (!dir) { usage(); return 2; }
      const out = await cmdCompile(dbPath, { dir });
      console.log(flags.json ? JSON.stringify(out, null, 2) : `compile scanned=${out.scanned} created=${out.created} updated=${out.updated} skipped=${out.skipped} rejected=${out.rejected}`);
      return 0;
    }
    if (cmd === 'ingest-search') {
      const query = flags.query && flags.query !== true ? String(flags.query) : '';
      const source = flags.source && flags.source !== true ? String(flags.source) : '';
      if (!query || !source) { usage(); return 2; }
      const out = await cmdSearchIngest(dbPath, { query, source, top: flags.top, threshold: flags.threshold });
      console.log(flags.json ? JSON.stringify(out, null, 2) : `ingest-search scanned=${out.scanned} matched=${out.matched} ingested=${out.ingested} skipped=${out.skipped} rejected=${out.rejected}`);
      return 0;
    }
    if (cmd === 'api') {
      const selftest = flags.json === true;
      const out = await cmdApi(dbPath, {
        port: flags.port != null && flags.port !== true ? Number(flags.port) : undefined,
        host: flags.host && flags.host !== true ? String(flags.host) : undefined,
        selftest
      });
      if (selftest) { console.log(JSON.stringify({ port: out.port, host: out.host, routes: out.routes }, null, 2)); return 0; }
      return 0;
    }
    if (cmd === 'board') {
      const out = await cmdBoard(dbPath, { limit: flags.limit ? Number(flags.limit) : undefined });
      console.log(flags.json ? JSON.stringify(out, null, 2) : (out.lines || []).join(String.fromCharCode(10)));
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

module.exports = { openStore, cmdReindex, cmdMemo, cmdPredict, cmdIngest, cmdCompile, cmdSearchIngest, cmdApi, cmdAccess, cmdBoard, cmdSelfOptimize, cmdOrchestrate, cmdDispatchCard, humanMemo, humanPredict, usage, main };
