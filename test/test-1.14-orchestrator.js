'use strict';
// M1 任务 1.14 failing test —— 锁 SPEC-1.14 meko 螺旋编排六条 AC
// 运行（本仓根）：node test/test-1.14-orchestrator.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-orch-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let Orchestrator, store;
try {
  Orchestrator = require('../src/meko-orchestrator.js').MekoOrchestrator;
  store = require('../src/knowledge-store.js');
} catch (e) {
  console.error('❌ 红（正确的红）—— src/meko-orchestrator.js 未实现 SPEC-1.14');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

const base = (id, strand, fn, extra = {}) => ({ id, strand, band: strand === 'wiki' ? 'entry' : 'raw' === strand ? 'cross' : 'field', reads: [], writes: [], budgetTick: 1, reversible: true, onCycle: fn, ...extra });

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));

  // AC-1 契约校验
  const orch0 = new Orchestrator({ store });
  let e1 = null, e2 = null;
  try { orch0.registerStep({ id: 'bad' }); } catch (e) { e1 = e; }
  orch0.registerStep(base('a', 'raw', async () => ({ ok: true })));
  try { orch0.registerStep(base('a', 'raw', async () => ({ ok: true }))); } catch (e) { e2 = e; }
  ac('AC-1 缺字段/重复 id 抛错', !!e1 && !!e2, `e1=${!!e1} e2=${!!e2}`);

  // AC-2/AC-3 螺旋：各跑 2 轮，轮内 raw 先于 wiki，第 2 轮 raw 见到第 1 轮 wiki 写入
  const calls = [];
  const busSeen = [];
  const orch = new Orchestrator({ store });
  orch.registerStep(base('rawStep', 'raw', async (ctx) => {
    calls.push({ id: 'rawStep', round: ctx.round });
    busSeen.push({ round: ctx.round, wikiWrote: ctx.bus.wikiWrote ?? null });
    return { ok: true };
  }));
  orch.registerStep(base('wikiStep', 'wiki', async (ctx) => {
    calls.push({ id: 'wikiStep', round: ctx.round });
    ctx.bus.wikiWrote = ctx.round;
    return { ok: true };
  }));
  const res = await orch.runCycle('解旋', { rounds: 2 });

  const order = calls.map(c => `${c.round}:${c.id}`).join(',');
  ac('AC-2 各跑 2 次 + 轮内 raw 先于 wiki', order === '1:rawStep,1:wikiStep,2:rawStep,2:wikiStep', order);
  ac('AC-3 第 2 轮 raw 读到第 1 轮 wiki 写入', busSeen[1] && busSeen[1].wikiWrote === 1, JSON.stringify(busSeen));

  // AC-4 结算留痕
  const db = store._getDb();
  const st = db.prepare("SELECT cycle_type, status, kespi_snapshot FROM meko_cycles ORDER BY rowid");
  const rows = [];
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  ac('AC-4 meko_cycles 2 行 + kespi 非空 + executed',
    rows.length >= 2 && rows.slice(-2).every(r => r.status === 'executed' && r.kespi_snapshot != null && /round2/.test(rows[rows.length - 1].cycle_type)),
    JSON.stringify(rows.slice(-2)));

  // AC-5 有界：超时步骤 → 当轮 failed、后续不执行
  const orchT = new Orchestrator({ store });
  let after = false;
  orchT.registerStep(base('slow', 'raw', async () => { const t = Date.now(); while (Date.now() - t < 1300) {} return { ok: true }; }));
  orchT.registerStep(base('later', 'wiki', async () => { after = true; return { ok: true }; }));
  const t0 = Date.now();
  const rt = await orchT.runCycle('解旋', { rounds: 1, budgetMs: 500 });
  const elapsed = Date.now() - t0;
  ac('AC-5 超时 → failed + 后续唔跑 + 有界', rt.ok === false && after === false && elapsed < 4000, `ok=${rt.ok} after=${after} ${elapsed}ms`);

  // AC-6 错误可见
  const orchE = new Orchestrator({ store });
  orchE.registerStep(base('boom', 'raw', async () => { throw new Error('boom-test'); }));
  const re = await orchE.runCycle('解旋', { rounds: 1 });
  ac('AC-6 抛错入 results.error 且 ok=false', re.ok === false && re.results.some(r => r.error && /boom-test/.test(r.error)), JSON.stringify(re.results));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
