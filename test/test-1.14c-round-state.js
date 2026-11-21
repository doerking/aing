'use strict';
// M1.14 修订 I failing test —— 锁 SPEC-1.14 AC-9/10/11（轮状态机与续跑）与 AC-12（围栏拒写）
// 运行（本仓根）：node test/test-1.14c-round-state.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-round-'));
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
  console.error('❌ 红（正确的红）—— 编排器/库缺少 SPEC-1.14 修订 I 的实现');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

const step = (id, strand, fn) => ({
  id, strand, band: strand === 'wiki' ? 'entry' : (strand === 'raw' ? 'cross' : 'field'),
  reads: [], writes: [], budgetTick: 1, reversible: true, onCycle: fn
});

const rowsOf = (db, sql, binds = []) => {
  const s = db.prepare(sql); s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // ── 新列必须在（幂等迁移） ──
  const cols = store.columns('meko_cycles');
  ac('AC-9a meko_cycles 四新列就位',
    ['deadline_at', 'lease_token', 'last_step', 'attempt'].every(c => cols.includes(c)),
    cols.join(','));

  // ── AC-9：轮首落账，步错也能看出跑到哪 ──
  const orch = new Orchestrator({ store });
  orch.registerStep(step('s1', 'raw', async () => ({ ok: true })));
  orch.registerStep(step('s2boom', 'raw', async () => { throw new Error('boom'); }));
  orch.registerStep(step('s3', 'raw', async () => ({ ok: true })));
  const r1 = await orch.runCycle('解旋', { rounds: 1, budgetMs: 60000, resume: false });

  const cyc = rowsOf(db, "SELECT id, status, last_step, lease_token, deadline_at, attempt FROM meko_cycles ORDER BY rowid DESC LIMIT 1")[0];
  ac('AC-9b 抛错轮仍有行且 status=failed', !!cyc && cyc.status === 'failed', JSON.stringify(cyc));
  ac('AC-9c last_step 指到最后完成的步（s1）', !!cyc && cyc.last_step === 's1', JSON.stringify(cyc && cyc.last_step));
  ac('AC-9d 轮首就带 deadline_at 与 lease_token',
    !!cyc && !!cyc.deadline_at && Number(cyc.lease_token) > 0, JSON.stringify(cyc));
  ac('AC-9e 失败轮 ok=false', r1.ok === false, JSON.stringify({ ok: r1.ok, failedStep: r1.failedStep }));

  // ── AC-10：超期 running 轮被回收成 up_for_retry ──
  const past = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  db.run(`INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, kespi_snapshot, kespi_source, deadline_at, lease_token, last_step, attempt)
          VALUES ('cyc-stale-1', '解旋:round1', 'both', ?, NULL, 'running', 0, 'placeholder', ?, 1, 's1', 1)`, [past, past]);

  const orch2 = new Orchestrator({ store });
  const ran = [];
  orch2.registerStep(step('s1', 'raw', async () => { ran.push('s1'); return { ok: true }; }));
  orch2.registerStep(step('s2', 'raw', async () => { ran.push('s2'); return { ok: true }; }));
  const r2 = await orch2.runCycle('解旋', { rounds: 1, budgetMs: 60000 });
  const stale = rowsOf(db, "SELECT status FROM meko_cycles WHERE id='cyc-stale-1'")[0];
  ac('AC-10a 超期 running → up_for_retry', !!stale && stale.status === 'up_for_retry', JSON.stringify(stale));
  ac('AC-10b 回收结果作为续跑候选返回', !!r2.resumedFrom && r2.resumedFrom.cycleId === 'cyc-stale-1', JSON.stringify(r2.resumedFrom));

  // ── AC-11：续跑跳过 last_step 及之前的步 ──
  ac('AC-11a 续跑不重跑已完成步 s1', !ran.includes('s1'), JSON.stringify(ran));
  ac('AC-11b 续跑继续跑剩余步 s2', ran.includes('s2'), JSON.stringify(ran));

  // ── AC-12：围栏令牌 ──
  const seed = store.claimWriter(5);   // 库内 epoch 抬到 5
  let errStale = null;
  try { store._persist({ skipCap: true, epoch: 3 }); } catch (e) { errStale = e; }
  ac('AC-12a 旧令牌落盘被拒（stale-writer）', !!errStale && /stale-writer/.test(errStale.message), errStale && errStale.message);
  const t6 = store.claimWriter(6);
  ac('AC-12b 新令牌领写成功且单调', t6 >= 6 && t6 > seed, `${seed}→${t6}`);
  let okNew = true;
  try { store._persist({ skipCap: true, epoch: t6 }); } catch (e) { okNew = false; }
  ac('AC-12c 新令牌落盘放行', okNew);

  // ── AC-14（修订 L）：候选可辨 + 未注册 last_step 不静默空转 ──
  const later = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  db.run(`INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, deadline_at, lease_token, last_step, attempt)
          VALUES ('cyc-stale-new', '解旋:round1', 'both', ?, NULL, 'running', ?, 2, 's1', 1)`, [later, later]);
  const orch3 = new Orchestrator({ store });
  const ran3 = [];
  orch3.registerStep(step('s1', 'raw', async () => { ran3.push('s1'); return { ok: true }; }));
  orch3.registerStep(step('s2', 'raw', async () => { ran3.push('s2'); return { ok: true }; }));
  const r3 = await orch3.runCycle('解旋', { rounds: 1, budgetMs: 60000 });
  ac('AC-14a 多候选取 deadline_at 最新者', !!r3.resumedFrom && r3.resumedFrom.cycleId === 'cyc-stale-new', JSON.stringify(r3.resumedFrom));

  // last_step 指到已不存在的步 → 不跳，全量跑（不然整轮静默空转还报 ok:true）
  const ghost = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  db.run(`INSERT INTO meko_cycles (id, cycle_type, helix_strand, scheduled_at, executed_at, status, deadline_at, lease_token, last_step, attempt)
          VALUES ('cyc-stale-ghost', '解旋:round1', 'both', ?, NULL, 'running', ?, 3, 'no-such-step', 1)`, [ghost, ghost]);
  const orch4 = new Orchestrator({ store });
  const ran4 = [];
  orch4.registerStep(step('s1', 'raw', async () => { ran4.push('s1'); return { ok: true }; }));
  orch4.registerStep(step('s2', 'raw', async () => { ran4.push('s2'); return { ok: true }; }));
  const r4 = await orch4.runCycle('解旋', { rounds: 1, budgetMs: 60000 });
  ac('AC-14b 未注册 last_step 不静默空转', ran4.includes('s1') && ran4.includes('s2')
    && r4.results.some(x => x.resumeIgnored), JSON.stringify({ ran4, ignored: r4.results.some(x => x.resumeIgnored) }));

  // ── AC-15：领写原子（同请求值连领两次必须拿到不同且递增的令牌）──
  const t_a = store.claimWriter(9);
  const t_b = store.claimWriter(9);
  ac('AC-15 领写原子（不会拿到同一个令牌）', t_a > 0 && t_b > t_a, `${t_a} → ${t_b}`);

  // 同键的存储形态不得随引擎变（CAST 成 TEXT 会把实数写成 "10.0"，两个引擎存出不同形态）
  const st = db.prepare("SELECT value_json AS v FROM config WHERE key = 'writer_epoch'");
  st.step(); const storedRaw = st.getAsObject().v; st.free();
  ac('AC-15b writer_epoch 存储形态引擎无关（纯整数文本）', String(storedRaw).replace(/\.0$/, '') === String(storedRaw)
    && String(storedRaw) === String(store.writerEpoch()), String(storedRaw));

  console.log(`\n${fail === 0 ? '🟢' : '🔴'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
