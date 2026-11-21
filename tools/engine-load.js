'use strict';
// tools/engine-load.js —— 引擎负载对比（测量工具，不是门禁）
//
// 目的：给「默认引擎切不切 nodesqlite」提供真实负载数据（SPEC-8 修订 A / 交接单 §十三#2）。
// 不作拍脑袋切换——只量：峰值 RSS / 写放大（文件增量）/ 查询时延，同一副本、同一负载。
//
// 用法（本仓根）：node tools/engine-load.js [--db <源库>] [--rounds N] [--queries N] [--engine both|sqljs|nodesqlite] [--keep]
//   源库缺省 data/knowledge.db（真库，只读源——每个引擎各拷一份，绝不碰源）。
//   输出 JSON 对比表。--keep 保留临时现场（默认跑完即删）。
//
// 负载 = ① N 轮完整代谢（orchestrate runCycle，写路径）
//        ② 每轮后跑 M 条检索查询（读路径，检索融合）
//        ③ 全程采样峰值 RSS。
// 写放大代理：sqljs 每次 persist 整库 export（≈ 最终文件大小 × persist 次数）；
//             nodesqlite 走 WAL（文件 + -wal + -shm 增量）。两者不可直接比字节，
//             但「进程常驻内存 + 文件增量」足够支撑引擎切换决策。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const SRC_DB = path.join(root, 'data', 'knowledge.db');

function flag(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : dflt;
}
function has(name) { return process.argv.includes('--' + name); }

const rounds = Math.max(1, Number(flag('rounds', '2')) || 2);
const queries = Math.max(1, Number(flag('queries', '10')) || 10);
const engines = String(flag('engine', 'both')).split(',').map(s => s.trim()).filter(Boolean);
const ENGINE_SET = ['sqljs', 'nodesqlite'];
const engineList = engines.includes('both') ? ENGINE_SET : engines.filter(e => ENGINE_SET.includes(e));
const keep = has('keep');

function fileSize(p) { try { return fs.statSync(p).size; } catch (_) { return 0; } }

// 子进程：开库 → N 轮 + 查询 → 报峰值 RSS / 时延 / 文件增量（stdout 一行 JSON）
function childScript() {
  return `
'use strict';
const path = require('path');
const fs = require('fs');
const root = process.cwd();   // spawn 时 cwd=仓根
const dbPath = process.env.LOAD_DB;
const engine = process.env.AING_DB_ENGINE;
const rounds = Number(process.env.LOAD_ROUNDS);
const queries = Number(process.env.LOAD_QUERIES);
// 峰值 RSS 用 process.resourceUsage().maxRSS（OS 追踪，KB）——setInterval 采样在同步负载下
// 未必等到 timer 阶段，靠唔住。maxRSS 系累计峰值，结尾读一次即真值。
(async () => {
  const store = require(path.join(root, 'src/knowledge-store.js'));
  const t0 = Date.now();
  await store.init(dbPath);
  const openMs = Date.now() - t0;
  const { MekoOrchestrator } = require(path.join(root, 'src/meko-orchestrator.js'));
  const { buildDefaultSteps } = require(path.join(root, 'src/metabolism.js'));
  const orch = new MekoOrchestrator({ store });
  for (const s of buildDefaultSteps()) orch.registerStep(s);
  const roundMs = [];
  const queryLat = [];
  for (let r = 0; r < rounds; r++) {
    const tr = Date.now();
    const out = await orch.runCycle('代谢', { rounds: 1, budgetMs: 60000 });
    roundMs.push(Date.now() - tr);
    // 读路径：检索融合查询
    const { search } = require(path.join(root, 'src/retrieval.js'));
    const sample = ['意识神经', '可靠性', '回单', '蒸馏', '向量', '代谢'];
    for (let q = 0; q < queries; q++) {
      const tq = Date.now();
      await search(store, sample[q % sample.length], { limit: 5 });
      queryLat.push(Date.now() - tq);
    }
  }
  const peakRssKb = process.resourceUsage().maxRSS;
  const lat = queryLat.slice().sort((a, b) => a - b);
  const pct = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0;
  const dbSize = fs.statSync(dbPath).size;
  const walSize = (() => { try { return fs.statSync(dbPath + '-wal').size; } catch (_) { return 0; } })();
  const shmSize = (() => { try { return fs.statSync(dbPath + '-shm').size; } catch (_) { return 0; } })();
  store._close();
  console.log(JSON.stringify({
    engine, ok: true, openMs, peakRssMb: +(peakRssKb / 1024).toFixed(1),
    totalMs: Date.now() - t0, roundMs, dbSize, walSize, shmSize,
    queryN: queryLat.length, queryP50: pct(0.5), queryP95: pct(0.95),
    queryAvg: +(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length)).toFixed(1)
  }));
  process.exit(0);
})().catch(e => { console.error('CHILD-ERROR: ' + (e && e.stack || e)); process.exit(1); });
`;
}

async function runEngine(engine) {
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-load-'));
  const dbPath = path.join(yard, 'knowledge.db');
  fs.copyFileSync(SRC_DB, dbPath);
  const before = fileSize(dbPath);
  const script = path.join(yard, 'load-child.js');
  fs.writeFileSync(script, childScript());
  const env = { ...process.env, AING_DB_ENGINE: engine, LOAD_DB: dbPath, LOAD_ROUNDS: String(rounds), LOAD_QUERIES: String(queries) };
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    // 写放大显性化：parent 每 8ms 看 db 文件 mtime，数整库覆写次数（sqljs 每次 persist 重写全文件；
    // nodesqlite 不覆写、mtime 只在 WAL checkpoint/增长时变）。
    let lastMtime = 0, writes = 0;
    const watch = setInterval(() => {
      try {
        const mt = fs.statSync(dbPath).mtimeMs;
        if (mt !== lastMtime) { writes++; lastMtime = mt; }
      } catch (_) { /* 文件瞬时不读 */ }
    }, 8);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', (code) => {
      clearInterval(watch);
      let r = null;
      try { r = JSON.parse(out.trim().split('\n').pop()); } catch (_) { r = null; }
      if (!r) { resolve({ engine, ok: false, error: (err || out).slice(0, 400), before, after: fileSize(dbPath) }); return; }
      r.before = before;
      r.after = fileSize(dbPath);
      r.walBytes = r.walSize; // 文件增量代理
      r.growBytes = Math.max(0, r.after - before);
      r.dbWrites = writes; // 整库文件写次数（mtime 变化次数）
      r.dbBytesWritten = writes * r.after; // sqljs 每次覆写≈全文件；nodesqlite 系 WAL 追加（此代理只对 sqljs 有意义）
      if (!keep) { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} }
      else { r.yard = yard; }
      resolve(r);
    });
  });
}

(async () => {
  if (!fs.existsSync(SRC_DB)) { console.error('源库不存在: ' + SRC_DB); process.exit(2); }
  const results = [];
  for (const e of engineList) {
    results.push(await runEngine(e));
  }
  const table = results.map(r => ({
    engine: r.engine, ok: r.ok,
    peakRssMb: r.peakRssMb, openMs: r.openMs, totalMs: r.totalMs,
    roundMs: r.roundMs, growBytes: r.growBytes, walBytes: r.walBytes,
    dbWrites: r.dbWrites, dbBytesWritten: r.dbBytesWritten,
    queryN: r.queryN, queryP50: r.queryP50, queryP95: r.queryP95, queryAvg: r.queryAvg,
    error: r.error || undefined
  }));
  console.log('==== engine-load 对比 (rounds=' + rounds + ', queries/round=' + queries + ', 源=' + SRC_DB + ') ====');
  console.log(JSON.stringify(table, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
