'use strict';
// M2 任务 2.14 failing test —— 锁 SPEC-2.14 进化团入驻五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-evo-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let E, store;
try {
  E = require('../src/evolution-team.js');
  store = require('../src/knowledge-store.js');
  if (typeof E.buildEvolutionSteps !== 'function') throw new Error('buildEvolutionSteps 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/evolution-team.js 未实现 SPEC-2.14'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'raw-x', name: 'X', type: 'Concept', content: '进化团样本', status: 'active', confidence: 0.6 });
  db.run("UPDATE entities SET tolaria_strength=6");
  store._persist();

  const steps = E.buildEvolutionSteps();
  const ids = steps.map(s => s.id).sort();
  ac('AC-1 五成员全注册且契约齐',
    ids.join() === ['evo-gene-keeper', 'evo-omni-gate', 'evo-pilot', 'evo-poll', 'evo-tri-cross'].sort().join() &&
    steps.every(s => s.strand === 'cross' && s.band === 'field' && Array.isArray(s.reads) && Array.isArray(s.writes) &&
      s.budgetTick === 1 && s.reversible === true && typeof s.onCycle === 'function'),
    JSON.stringify(ids));

  const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
  const orch = new MekoOrchestrator({ store });
  const registered = E.registerEvolutionTeam(orch);
  ac('AC-1b 编排器全收', registered.length === 5 && orch.steps.length === 5, JSON.stringify(registered));

  // AC-3 无独立入口
  const badApi = ['start', 'schedule', 'run', 'boot', 'loop'].filter(k => typeof E[k] === 'function');
  ac('AC-3 无独立调度入口', badApi.length === 0, JSON.stringify(Object.keys(E)));

  // AC-2 零写权：跑一轮编排，三表行数不变
  const before = { e: rows('SELECT COUNT(*) AS n FROM entities')[0].n, l: rows('SELECT COUNT(*) AS n FROM links')[0].n, f: rows('SELECT COUNT(*) AS n FROM field_actions')[0].n };
  const run = await orch.runCycle('进化团', { rounds: 1 });
  const after = { e: rows('SELECT COUNT(*) AS n FROM entities')[0].n, l: rows('SELECT COUNT(*) AS n FROM links')[0].n, f: rows('SELECT COUNT(*) AS n FROM field_actions')[0].n };
  const outputs = run.results.map(r => r && r.actions).filter(Boolean);
  ac('AC-2 成员零写权 I7', run.ok && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after, run }));

  // AC-5 输出只到提案面
  const probe = await steps.find(s => s.id === 'evo-pilot').onCycle({ store, round: 1, cycleId: 'c3' });
  const plain = probe && typeof probe === 'object' && !('store' in probe) && Object.values(probe).every(v => typeof v !== 'function');
  ac('AC-5 输出只到提案面 I10', plain && probe.plan && typeof probe.plan.focus === 'string', JSON.stringify(probe));

  // AC-4 成员池
  const pool = new E.MemberPool();
  const units = ['gene-keeper', 'omni-gate', 'pilot', 'tri-cross', 'poll'];
  const joins = units.map(u => pool.join(u, { wolves: 2 }));
  const sixth = (() => { try { return { ok: pool.join('extra-unit', { wolves: 0 }) }; } catch (e) { return { error: e.message }; } })();
  const tooMany = (() => { try { return { ok: pool.join('gene-keeper', { wolves: 3 }) }; } catch (e) { return { error: e.message }; } })();
  const snap = pool.snapshot();
  const seatsFull = pool.seats;
  const left = pool.leave('poll');
  const rejoin = (() => { try { return { ok: pool.join('poll', { wolves: 1 }) }; } catch (e) { return { error: e.message }; } })();
  ac('AC-4 成员池按信号进出',
    joins.every(j => j.ok) && sixth.error && tooMany.error && snap.length === 5 &&
    seatsFull === E.MAX_SEATS && left.left && rejoin.ok && pool.snapshot().find(s => s.unit === 'poll').wolves === 1,
    JSON.stringify({ sixth, tooMany, snap, seatsFull, left, rejoin }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
