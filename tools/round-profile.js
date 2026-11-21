'use strict';
// tools/round-profile.js —— 代谢轮逐步时相画像（测量工具，不是门禁）
//
// 目的：搵一轮代谢嘅时间喺边步。编排器已记 per-step elapsedMs，本工具只汇总，唔改行为。
// 用法（本仓根）：node tools/round-profile.js [--db <源库>] [--rounds N] [--json] [--keep]
//   源库缺省 data/knowledge.db（真库，只读源——拷副本，绝不碰源）。
//
// 输出：每步累计/均值/最大耗时 + 占比，按占比降序；另报 overBudget 命中数。

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..');

function argv(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  if (v == null || v.startsWith('--')) throw new Error('--' + name + ' 缺参数值');
  return v;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const keep = process.argv.includes('--keep');
  const rounds = Number(argv('rounds', 3));
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('--rounds 须系正整数');

  const srcArg = argv('db', null);
  const src = srcArg ? path.resolve(srcArg) : path.join(REPO, 'data', 'knowledge.db');
  if (!fs.existsSync(src)) throw new Error('源库不存在: ' + src);

  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-roundprof-'));
  const dbPath = path.join(yard, 'knowledge.db');
  fs.copyFileSync(src, dbPath);

  const store = require(path.join(REPO, 'src', 'knowledge-store.js'));
  await store.init(dbPath);

  const { MekoOrchestrator } = require(path.join(REPO, 'src', 'meko-orchestrator.js'));
  const { buildDefaultSteps } = require(path.join(REPO, 'src', 'metabolism.js'));
  const orch = new MekoOrchestrator({ store });
  for (const s of buildDefaultSteps()) orch.registerStep(s);

  const acc = new Map();   // id -> {sum, max, n, over}
  const totalWall = [];
  for (let r = 0; r < rounds; r++) {
    const t0 = Date.now();
    const out = await orch.runCycle('代谢', { rounds: 1, budgetMs: 120000 });
    const wall = Date.now() - t0;
    totalWall.push(wall);
    if (!out || !Array.isArray(out.results)) throw new Error('runCycle 未返 results（ok=' + (out && out.ok) + '）');
    for (const e of out.results) {
      const ms = Number(e.elapsedMs) || 0;
      const a = acc.get(e.id) || { sum: 0, max: 0, n: 0, over: 0 };
      a.sum += ms; a.n += 1; a.max = Math.max(a.max, ms);
      if (e.overBudget) a.over++;
      acc.set(e.id, a);
    }
  }

  const perStep = [...acc.entries()].map(([id, a]) => ({
    id, n: a.n, sumMs: a.sum, avgMs: Math.round(a.sum / a.n), maxMs: a.max, overBudget: a.over
  })).sort((x, y) => y.sumMs - x.sumMs);
  const sumOfSteps = perStep.reduce((a, s) => a + s.sumMs, 0);
  for (const s of perStep) s.sharePct = sumOfSteps ? Math.round(s.sumMs / sumOfSteps * 1000) / 10 : 0;

  const out = {
    source: src, rounds,
    wallMs: totalWall,
    wallAvgMs: Math.round(totalWall.reduce((a, b) => a + b, 0) / totalWall.length),
    wallP90Ms: Math.round(totalWall.sort((a, b) => a - b)[Math.min(totalWall.length - 1, Math.floor(totalWall.length * .9))]),
    sumOfStepsMs: sumOfSteps,
    perStep
  };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`代谢轮逐步画像 — 源 ${src}`);
    console.log(`${rounds} 轮 / 墙钟均值 ${out.wallAvgMs} ms / p90 ${out.wallP90Ms} ms\n`);
    console.log(pad('步骤', 26) + pad('轮数', 6) + pad('累计ms', 10) + pad('均值ms', 10) + pad('最大ms', 10) + '占比');
    for (const s of perStep) {
      console.log(pad(s.id, 26) + pad(String(s.n), 6) + pad(String(s.sumMs), 10) +
        pad(String(s.avgMs), 10) + pad(String(s.maxMs), 10) + s.sharePct + '%' +
        (s.overBudget ? `  ⚠超预算 ${s.over} 次` : ''));
    }
    console.log(`\n步骤合计 ${sumOfSteps} ms（墙钟差 = 编排开销 / 未计时间）`);
  }

  store._close();
  if (!keep) { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} }
  else console.error('（现场保留: ' + yard + '）');
}

function pad(s, w) {
  s = String(s);
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return s + ' '.repeat(Math.max(0, w - n));
}

main().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
