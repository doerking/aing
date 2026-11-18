'use strict';
// M6 任务 6.26 failing test —— 维护轮闸：L3 只在维护/自优化轮于链上执行
// 要修的病：自优化在链上有 guard，但没人验过「普通轮真的跳过、维护轮真的跑」——
// 真实库里 14 轮 0 工单，此前只能靠猜。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-guard-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
const { buildDefaultSteps } = require('../src/metabolism.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const tickets = () => { const s = db.prepare('SELECT COUNT(*) n FROM opt_tickets'); s.step(); const r = s.getAsObject(); s.free(); return Number(r.n); };
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('e1','E','Concept',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['短正文']);
  store._persist();

  const run = async (cycleType, opts) => {
    const orch = new MekoOrchestrator({ store });
    for (const step of buildDefaultSteps(['kespi', 'self-optimize'])) orch.registerStep(step);
    return orch.runCycle(cycleType, opts);
  };

  // AC-1 普通轮：步骤被 guard 跳过，不落单
  const a = await run('代谢', { rounds: 1 });
  const aStep = (a.results || []).find(r => r.id === 'self-optimize') || {};
  ac('AC-1 普通轮自优化被跳过且不落单',
    a.ok === true && aStep.ok === true && aStep.actions && aStep.actions.skipped === true && tickets() === 0,
    JSON.stringify({ ok: a.ok, step: aStep.actions, tickets: tickets() }));

  // AC-2 维护轮：真正执行，落单
  const b = await run('维护', { rounds: 1 });
  const bStep = (b.results || []).find(r => r.id === 'self-optimize') || {};
  ac('AC-2 维护轮自优化真执行并落单',
    b.ok === true && bStep.actions && bStep.actions.scanned > 0 && tickets() > 0,
    JSON.stringify({ ok: b.ok, step: bStep.actions, tickets: tickets() }));

  // AC-3 显式开关：普通轮 + selfOptimize:true 也执行
  const before = tickets();
  const c = await run('代谢', { rounds: 1, selfOptimize: true });
  const cStep = (c.results || []).find(r => r.id === 'self-optimize') || {};
  ac('AC-3 显式 selfOptimize=true 在普通轮也执行',
    c.ok === true && cStep.actions && cStep.actions.skipped !== true,
    JSON.stringify({ ok: c.ok, step: cStep.actions }));

  // AC-4 链上走同一套需求逻辑：单据带 demand
  const withDemand = (() => {
    const s = db.prepare("SELECT evidence_json FROM opt_tickets LIMIT 20"); const o = [];
    while (s.step()) o.push(JSON.parse(s.getAsObject().evidence_json || '{}')); s.free(); return o;
  })().filter(ev => ev.demand && ev.demand.slot && ev.demand.acceptance);
  ac('AC-4 维护轮落的单带五段需求（与手动扫描同源）', withDemand.length > 0, JSON.stringify({ n: withDemand.length }));

  // AC-5 顺序：kespi 在 self-optimize 之前跑（读数新鲜）
  const ids = (b.results || []).map(r => r.id);
  ac('AC-5 链序 kespi → self-optimize', ids.indexOf('kespi') >= 0 && ids.indexOf('kespi') < ids.indexOf('self-optimize'), JSON.stringify(ids));

  // AC-6 跳过不是失败：普通轮整体 ok
  ac('AC-6 跳过不污染轮结果', a.ok === true && c.ok === true, JSON.stringify({ a: a.ok, c: c.ok }));

  console.log(`\n----- 6.26 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
