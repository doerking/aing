'use strict';
// M2 任务 2.16 failing test —— 锁 SPEC-2.16 闸东真接六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-gate-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let G, P, store;
try {
  G = require('../src/omni-gate.js');
  P = require('../src/field-promote.js');
  store = require('../src/knowledge-store.js');
  if (typeof G.runGates !== 'function') throw new Error('runGates 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/omni-gate.js 未实现 SPEC-2.16'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql, b = []) => { const s = store._getDb().prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, strength, content) => {
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: '["闸:6"]', status: 'active', confidence: 0.6 });
    db.run('UPDATE entities SET tolaria_strength=?, last_access=datetime(\'now\') WHERE id=?', [strength, id]);
  };
  ins('raw-g1', 6, '闸样本甲');
  ins('wiki-g1', 6, '闸样本甲');
  ins('raw-g2', 6, '闸样本乙');
  ins('wiki-g2', 6, '闸样本乙');
  store._persist();
  const s = id => Number(store.getEntity(id).tolaria_strength);

  // AC-1 无闸必拒
  const noGate = G.hasPassingGate(store, 'raw-g1', 'promote');
  let threw = false;
  try { G.requireGate(store, 'raw-g1', 'promote'); } catch (e) { threw = /gate-required/.test(e.message); }
  ac('AC-1 无闸必拒 I8', noGate === false && threw, JSON.stringify({ noGate, threw }));

  // AC-4 双重锁：基线高于候选 → canary 失败 → 拒
  const rFail = await P.promoteEntity(store, { entityId: 'raw-g1', cycleId: 'cg', baseline: { score: 0.99 } });
  const gateFail = rows("SELECT * FROM gate_records WHERE subject='raw-g1' AND kind='promote'")[0];
  ac('AC-4 双重锁（闸不过则拒）', (rFail.refused || {}).reason === 'gate-rejected' && s('raw-g1') === 6 &&
    gateFail && Number(gateFail.passed) === 0, JSON.stringify({ rFail, gateFail, s: s('raw-g1') }));

  // 基线低于候选 → 通过，且闸记录 doubleLock=true
  const rOk = await P.promoteEntity(store, { entityId: 'raw-g1', cycleId: 'cg', baseline: { score: 0.1 } });
  const gateOk = rows("SELECT * FROM gate_records WHERE subject='raw-g1' AND kind='promote' AND passed=1")[0];
  const gatesJson = gateOk ? JSON.parse(gateOk.gates_json) : {};
  ac('AC-4b 双重锁（双证据+闸过才升 7）', rOk.promoted && s('raw-g1') === 7 && gatesJson.acceptance && gatesJson.acceptance.doubleLock === true,
    JSON.stringify({ rOk, gateOk, gatesJson }));
  ac('AC-1b 事后有闸记录', G.hasPassingGate(store, 'raw-g1', 'promote') === true && !!G.requireGate(store, 'raw-g1', 'promote'));

  // AC-2 W2 队列
  const before = rows("SELECT COUNT(*) AS n FROM approval_queue")[0].n;
  const q = await G.proposeChange(store, { kind: 'threshold', payload: { key: 'kespi.red', to: 0.5 }, reason: '红阈偏低' });
  const qRow = rows("SELECT * FROM approval_queue WHERE id=?", [q.id])[0];
  const decided = await G.decideChange(store, q.id, { approve: false });
  const qAfter = rows("SELECT * FROM approval_queue WHERE id=?", [q.id])[0];
  ac('AC-2 W2 审批队列', q.queued && qRow && qRow.status === 'pending' && decided.decided && qAfter.status === 'rejected' &&
    Number(before) === 0, JSON.stringify({ q, qRow, decided, qAfter }));

  // AC-3 memo 卡片（只读）
  const tablesBefore = ['entities', 'links', 'field_actions', 'gate_records', 'approval_queue']
    .map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();
  const cards = G.proposalCards(store);
  const tablesAfter = ['entities', 'links', 'field_actions', 'gate_records', 'approval_queue']
    .map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();
  ac('AC-3 memo 卡片只读', Array.isArray(cards) && cards.length >= 1 && cards.every(c => c.title && c.body) &&
    tablesBefore === tablesAfter, JSON.stringify(cards));

  // AC-5 三闸留痕
  const recs = rows("SELECT * FROM gate_records ORDER BY created_at");
  const readable = recs.length >= 2 && recs.every(r => {
    const g = JSON.parse(r.gates_json || '{}');
    return 'canary' in g && 'holdout' in g && 'acceptance' in g;
  });
  ac('AC-5 三闸留痕', readable, JSON.stringify(recs.map(r => r.gates_json)));

  // AC-6 铁律
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'omni-gate.js'), 'utf8');
  ac('AC-6 铁律', !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
