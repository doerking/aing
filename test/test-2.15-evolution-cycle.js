'use strict';
// M2 任务 2.15 failing test —— 锁 SPEC-2.15 六维×四时点五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-evocycle-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let RT, store;
try {
  RT = require('../src/evolution-cycle.js');
  store = require('../src/knowledge-store.js');
  if (typeof RT.EvolutionRuntime !== 'function') throw new Error('EvolutionRuntime 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/evolution-cycle.js 未实现 SPEC-2.15'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql, b = []) => { const s = store._getDb().prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'raw-a', name: 'A', type: 'Concept', content: '接线样本甲', status: 'active', confidence: 0.6 });
  db.run("UPDATE entities SET tolaria_strength=6");
  db.run("INSERT INTO genes (id,name,score,status,created_at,updated_at) VALUES ('g1','良基因',0.9,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO genes (id,name,score,status,created_at,updated_at) VALUES ('g2','弱基因',0.21,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  store._persist();

  const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
  const evo = require('../src/evolution-team.js');
  const orch = new MekoOrchestrator({ store });
  evo.registerEvolutionTeam(orch);
  const rt = new RT.EvolutionRuntime({ store, orchestrator: orch });

  // AC-1 T0
  const p0 = rt.t0Plan();
  ac('AC-1 T0 出 plan', ['supply', 'digest', 'restore', 'maintain'].includes(p0.focus) && p0.budget && typeof p0.budget.rounds === 'number',
    JSON.stringify(p0));

  // AC-2 T1 可复现：造两条动作（一条有证据 promote、一条无证据）
  db.run("INSERT INTO field_actions (id,action,target,before_json,after_json,cycle_id,reversible,created_at) VALUES ('fa-1','promote','raw-a','{\"strength\":6,\"evidence\":[\"mirror\",\"access\"]}','{\"strength\":7}','cycX',1,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO field_actions (id,action,target,before_json,after_json,cycle_id,reversible,created_at) VALUES ('fa-2','promote','raw-a','{\"strength\":6}','{\"strength\":7}','cycX',1,CURRENT_TIMESTAMP)");
  db.run("INSERT INTO field_actions (id,action,target,before_json,after_json,cycle_id,reversible,created_at) VALUES ('fa-3','rebond','raw-a->wiki-a','null','{}','cycX',1,CURRENT_TIMESTAMP)");
  store._persist();
  const r1 = await rt.t1Review({ cycleId: 'cycX' });
  const r2 = await rt.t1Review({ cycleId: 'cycX' });
  ac('AC-2 T1 清单可复现',
    JSON.stringify(r1) === JSON.stringify(r2) && r1.allow.includes('fa-1') && r1.allow.includes('fa-3') &&
    r1.hold.some(h => h.id === 'fa-2'),
    JSON.stringify({ r1, r2 }));

  // AC-3 T2 每轮快照 + I9
  const run = await rt.run({ rounds: 2, t3Every: 99 });
  const cycRows = rows("SELECT * FROM meko_cycles WHERE cycle_type LIKE '维护%'");
  const cycOk = cycRows.length >= 2 && cycRows.every(c => c.conservation_ratio != null);
  ac('AC-3 T2 每轮快照 I9',
    run.snapshots.length === 2 && run.snapshots.every(s => s.complete) && cycOk,
    JSON.stringify({ snaps: run.snapshots.length, cyc: cycRows.length, ratio: cycRows.map(c => c.conservation_ratio) }));

  // AC-5 六维
  const s0 = run.snapshots[0];
  const dims = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
  ac('AC-5 六维各一条断言', dims.every(d => s0[d] && typeof s0[d].value === 'number' && typeof s0[d].definition === 'string'),
    JSON.stringify(Object.keys(s0)));

  // AC-4 T3 衰减归档可回滚
  const t3 = await rt.t3Evolve({ decay: 0.5, archiveBelow: 0.2 });
  const g1 = rows("SELECT * FROM genes WHERE id='g1'")[0];
  const g2 = rows("SELECT * FROM genes WHERE id='g2'")[0];
  const rb = await rt.rollbackGene('g2');
  const g2r = rows("SELECT * FROM genes WHERE id='g2'")[0];
  ac('AC-4 T3 衰减归档可回滚',
    Math.abs(Number(g1.score) - 0.45) < 1e-9 && g2.status === 'archived' && g2.archived_at != null &&
    rb.restored && g2r.status === 'active' && Math.abs(Number(g2r.score) - 0.21) < 1e-9 && g2r.archived_at == null,
    JSON.stringify({ g1, g2, rb, g2r }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
