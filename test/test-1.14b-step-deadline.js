'use strict';
// M1.14 修订 H failing test —— 锁 SPEC-1.14 AC-7（deadline 传播）与 AC-8（步内自检可止）
// 运行（本仓根）：node test/test-1.14b-step-deadline.js
//
// 为什么有这条：外部执行器（宿主 hook）给整轮挂 timeout 并 SIGKILL。deadline 只判在
// 步骤之间时，长步跑到一半就被外部斩断，留下"写了一半、没人知道"的残局。

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dl-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let Orchestrator, store, deadline;
try {
  Orchestrator = require('../src/meko-orchestrator.js').MekoOrchestrator;
  store = require('../src/knowledge-store.js');
  deadline = require('../src/deadline.js');
} catch (e) {
  console.error('❌ 红（正确的红）—— src/deadline.js 未实现 SPEC-1.14 修订 H');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

const step = (id, strand, fn) => ({
  id, strand, band: strand === 'wiki' ? 'entry' : (strand === 'raw' ? 'cross' : 'field'),
  reads: [], writes: [], budgetTick: 1, reversible: true, onCycle: fn
});

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));

  // ── 纯函数面：余额与耗尽判定 ──
  const now = Date.now();
  ac('AC-7a remainingMs 对无限预算返回 Infinity', deadline.remainingMs(null, now) === Infinity);
  ac('AC-7b remainingMs 正常扣减',
    Math.abs(deadline.remainingMs(now + 5000, now) - 5000) < 2,
    String(deadline.remainingMs(now + 5000, now)));
  ac('AC-7c expired 按余量边界判',
    deadline.expired(now + 1000, 3000, now) === true && deadline.expired(now + 60000, 3000, now) === false);

  // ── AC-7：ctx 真的带 deadlineAt ──
  const seen = [];
  const orch = new Orchestrator({ store });
  orch.registerStep(step('probe', 'raw', async (ctx) => {
    seen.push(ctx.deadlineAt);
    return { ok: true };
  }));
  const r1 = await orch.runCycle('解旋', { rounds: 1, budgetMs: 60000 });
  ac('AC-7d ctx.deadlineAt 是数字', seen.length === 1 && Number.isFinite(seen[0]), JSON.stringify(seen));
  ac('AC-7e ctx.deadlineAt ≈ now + budgetMs',
    Number.isFinite(seen[0]) && Math.abs(seen[0] - (Date.now())) <= 60000 + 5000,
    'delta=' + (seen[0] - Date.now()));
  ac('AC-7f 返回值带 deadline', Number.isFinite(r1.deadlineAt), JSON.stringify(Object.keys(r1)));

  // ── AC-7：预算已耗尽时不再启动新步（第一步自己吃掉整轮预算）──
  const ran = [];
  const orch2 = new Orchestrator({ store });
  orch2.registerStep(step('slow', 'raw', async () => {
    ran.push('slow');
    await new Promise(res => setTimeout(res, 40));   // 吃掉整轮预算
    return { ok: true };
  }));
  orch2.registerStep(step('later', 'raw', async () => { ran.push('later'); return { ok: true }; }));
  const r2 = await orch2.runCycle('解旋', { rounds: 1, budgetMs: 20 });
  ac('AC-7g 预算耗尽后不启动后续步', r2.ok === false && !ran.includes('later'),
    `ok=${r2.ok} ran=${JSON.stringify(ran)} failedStep=${r2.failedStep}`);
  ac('AC-7h 超预算的步在 failedStep 留痕',
    String(r2.failedStep || '').startsWith('timeout:'), `failedStep=${r2.failedStep}`);

  // ── AC-8：步主动收口 → 当轮 failed，reason 可见，后续步不跑 ──
  const after = [];
  const orch3 = new Orchestrator({ store });
  orch3.registerStep(step('longstep', 'raw', async (ctx) => {
    // 模拟长步：每 10 条查一次余额，超了主动收口
    for (let i = 0; i < 100; i++) {
      if (deadline.expired(ctx.deadlineAt, 5000)) {
        return { ok: false, reason: 'step-deadline', done: i, total: 100 };
      }
      await new Promise(res => setTimeout(res, 5));
    }
    return { ok: true };
  }));
  orch3.registerStep(step('never', 'raw', async () => { after.push('never'); return { ok: true }; }));
  const r3 = await orch3.runCycle('解旋', { rounds: 1, budgetMs: 40 });
  const entry = (r3.results || []).find(e => e.id === 'longstep');
  ac('AC-8a 步主动收口令当轮 failed', r3.ok === false, `ok=${r3.ok}`);
  ac('AC-8b results 落 reason=step-deadline', !!entry && entry.reason === 'step-deadline', JSON.stringify(entry));
  ac('AC-8c 收口后不跑后续步', after.length === 0, JSON.stringify(after));
  ac('AC-8d 上报已完成条数与总数', !!entry && Number.isFinite(entry.partial && entry.partial.done) && entry.partial.total === 100,
    JSON.stringify(entry && entry.partial));

  console.log(`\n${fail === 0 ? '🟢' : '🔴'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
