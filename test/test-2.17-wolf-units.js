'use strict';
// M2 任务 2.17 failing test —— 锁 SPEC-2.17 狼位四条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-wolf-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let W, E, store;
try {
  W = require('../src/wolf-units.js');
  E = require('../src/evolution-team.js');
  store = require('../src/knowledge-store.js');
  if (typeof W.WolfUnits !== 'function') throw new Error('WolfUnits 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/wolf-units.js 未实现 SPEC-2.17'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'raw-a', name: 'A', type: 'Concept', content: '狼位样本甲', status: 'active', confidence: 0.6 });
  store.insertEntity({ id: 'raw-b', name: 'B', type: 'Concept', content: '狼位样本乙', status: 'active', confidence: 0.6 });
  store.insertLink({ source_id: 'raw-a', target_id: 'raw-b', relation: 'gen', confidence: 0.6 });
  db.run("UPDATE entities SET tolaria_strength=6, last_access=datetime('now')");
  db.run("INSERT INTO genes (id,name,score,status,created_at,updated_at) VALUES ('g1','基',0.8,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  db.run("UPDATE links SET strength=6");
  db.run("INSERT INTO meko_cycles (id,cycle_type,helix_strand,status,growth,pruned,conservation_ratio) VALUES ('c1','维护:round1','both','executed',0,0,1)");
  store._persist();

  // AC-1 身份不变
  const snap = W.IDENTITY_SNAPSHOT;
  const same = E.MEMBERS.every(m => {
    const s = snap.find(x => x.id === m.id);
    return s && s.name === m.name && s.role === m.role &&
      JSON.stringify(s.reads) === JSON.stringify(m.reads) && JSON.stringify(s.writes) === JSON.stringify(m.writes);
  });
  const tamper = (() => { try { const c = snap[0]; c.role = '被改'; return snap[0].role !== '被改'; } catch (_) { return true; } })();
  ac('AC-1 五角色身份不变', same && snap.length === 5 && W.assertIdentitiesUnchanged() === true && tamper,
    JSON.stringify({ same, len: snap.length }));

  // AC-2 编制 + 零写权
  const units = new W.WolfUnits();
  const w1 = units.spawn('gene-keeper', { dimension: 'D3' });
  const w2 = units.spawn('gene-keeper', { dimension: 'D5' });
  let third = false;
  try { units.spawn('gene-keeper', { dimension: 'D1' }); } catch (_) { third = true; }
  let writeThrew = false;
  try { units.write(w1.id, 'entities', { id: 'x' }); } catch (e) { writeThrew = /wolf-no-write/.test(e.message); }
  ac('AC-2 ≤2 狼位 + 零写权', third && writeThrew && w1.writes.length === 0 && w2.writes.length === 0 && units.snapshot().length === 2,
    JSON.stringify({ third, writeThrew, w: units.snapshot() }));

  // AC-3 完即弃
  const res = units.retire(w1.id, { store });
  const after = units.snapshot();
  ac('AC-3 完即弃只回残渣', !!res && res.dimension === 'D3' && typeof res.sample === 'number' && !!res.residue &&
    after.length === 1 && !after.some(x => x.id === w1.id), JSON.stringify({ res, after }));

  // AC-4 D1–D5 各有采样
  const owners = ['gene-keeper', 'omni-gate', 'pilot', 'tri-cross', 'poll'];
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const u = new W.WolfUnits();
    const wolf = u.spawn(owners[i], { dimension: W.WOLF_DIMENSIONS[i] });
    samples.push({ dim: W.WOLF_DIMENSIONS[i], v: u.sample(wolf.id, { store }) });
  }
  ac('AC-4 D1–D5 各有采样', samples.length === 5 && samples.every(s => typeof s.v.value === 'number') &&
    new Set(samples.map(s => s.v.definition)).size === 5, JSON.stringify(samples));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
