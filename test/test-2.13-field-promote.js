'use strict';
// M2 任务 2.13 failing test —— 锁 SPEC-2.13 场域提升动作七条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-promote-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let P, store, field, cons;
try {
  P = require('../src/field-promote.js');
  store = require('../src/knowledge-store.js');
  field = require('../src/meko-field.js');
  cons = require('../src/conservation.js');
  if (typeof P.promoteEntity !== 'function') throw new Error('promoteEntity 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/field-promote.js 未实现 SPEC-2.13'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql, b = []) => { const s = store._getDb().prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, strength, content, conf = 0.6) => {
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: '["提升:6"]', status: 'active', confidence: conf });
    db.run('UPDATE entities SET tolaria_strength=? WHERE id=?', [strength, id]);
  };
  // AC-2：6 + mirror + access 两信号
  ins('raw-p', 6, '提升样本甲');
  ins('wiki-p', 6, '提升样本甲');
  // AC-1：光秃 6（无镜像、无访问、无 degree）
  ins('bare', 6, '光秃样本');
  db.run("UPDATE entities SET last_access=NULL WHERE id='bare'");
  // 只有 1 类信号（mirror）的 6
  ins('raw-one', 6, '单信号甲');
  ins('wiki-one', 6, '单信号甲');
  db.run("UPDATE entities SET last_access=NULL WHERE id IN ('raw-one','wiki-one')");
  // AC-3：跨度
  ins('five', 5, '五号');
  ins('eight', 8, '八号');
  ins('raw-four', 4, '四号甲');
  ins('wiki-four', 4, '四号甲');
  // 两信号：mirror + access
  db.run("UPDATE entities SET last_access=datetime('now') WHERE id IN ('raw-p','raw-four','wiki-four')");
  store._persist();
  const laBefore = new Map(rows('SELECT id, last_access FROM entities').map(r => [r.id, String(r.last_access)]));

  const s = id => Number(store.getEntity(id).tolaria_strength);

  // AC-1 无证据
  const r1 = await P.promoteEntity(store, { entityId: 'raw-p', cycleId: 'c2' });
  const ev1 = await P.evidenceFor(store, 'raw-p');
  ac('AC-2 ≥2 类成升', r1.promoted && s('raw-p') === 7 && ev1.kinds.length >= 2, JSON.stringify({ r1, ev1 }));

  const rBare = await P.promoteEntity(store, { entityId: 'bare', cycleId: 'c2' });
  const rOne = await P.promoteEntity(store, { entityId: 'raw-one', cycleId: 'c2' });
  ac('AC-1 无证据拒 I2',
    (rBare.refused || {}).reason === 'insufficient-evidence' && s('bare') === 6 &&
    (rOne.refused || {}).reason === 'insufficient-evidence' && s('raw-one') === 6,
    JSON.stringify({ rBare, rOne, oneEv: await P.evidenceFor(store, 'raw-one') }));

  const r5 = await P.promoteEntity(store, { entityId: 'five', cycleId: 'c2' });
  const r8 = await P.promoteEntity(store, { entityId: 'eight', cycleId: 'c2' });
  const r4 = await P.promoteEntity(store, { entityId: 'raw-four', cycleId: 'c2' });
  ac('AC-3 跨步限制', (r5.refused || {}).reason === 'out-of-step' && (r8.refused || {}).reason === 'out-of-step' &&
    r4.promoted && s('raw-four') === 6, JSON.stringify({ r5, r8, r4 }));

  // AC-4 记账 + 可逆
  const act = rows("SELECT * FROM field_actions WHERE action='promote' AND target='raw-p'")[0];
  const rev = act ? await field.revertFieldAction(store, act.id) : null;
  ac('AC-4 记账 + 可逆', !!act && act.cycle_id === 'c2' && rev && rev.reverted && s('raw-p') === 6, JSON.stringify({ act, rev, s: s('raw-p') }));

  // AC-5 守恒闸 I5：造 growth-only（多产出、零退场）后拒绝提升
  store.insertEntity({ id: 'gr1', name: 'g1', type: 'Concept', content: '产', status: 'active', confidence: 0.5 });
  store.insertEntity({ id: 'gr2', name: 'g2', type: 'Concept', content: '产', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET tolaria_strength=6, last_access=datetime('now') WHERE id IN ('gr1','gr2')");
  store.insertLink({ source_id: 'gr1', target_id: 'gr2', relation: 'sprout-candidate', confidence: 0.5 });
  store.insertLink({ source_id: 'gr2', target_id: 'gr1', relation: 'sprout-candidate', confidence: 0.5 });
  store._persist();
  const m = cons.measureConservation(store, {});
  const rGate = await P.promoteEntity(store, { entityId: 'raw-four', cycleId: 'c2' });
  ac('AC-5 守恒闸 I5', m.verdict === 'growth-only' && (rGate.refused || {}).reason === 'conservation-band',
    JSON.stringify({ verdict: m.verdict, rGate }));

  // 消掉超额产出 → 放行
  db.run("UPDATE links SET relation='gen' WHERE relation='sprout-candidate'");
  db.run("UPDATE entities SET invalid_at=datetime('now') WHERE id IN ('gr1','gr2')");
  store._persist();
  const rOk = await P.promoteEntity(store, { entityId: 'raw-four', cycleId: 'c2' });
  ac('AC-5b 守恒恢复后放行', rOk.promoted && s('raw-four') === 7, JSON.stringify(rOk));

  // AC-6 候选边提升
  store.insertEntity({ id: 'ca', name: 'a', type: 'Concept', content: '候选甲时界', status: 'active', confidence: 0.5 });
  store.insertEntity({ id: 'cb', name: 'b', type: 'Concept', content: '候选乙时界', status: 'active', confidence: 0.5 });
  store.insertLink({ source_id: 'ca', target_id: 'cb', relation: 'sprout-candidate', confidence: 0.5 });
  db.run("UPDATE links SET strength=4, evidence='[\"tag\",\"kw\"]' WHERE source_id='ca' AND target_id='cb'");
  // 守恒闸读边层单一量纲（gate.verdict）：先造退边，令 ratio 落带内
  for (const [a2, b2] of [['ca', 'cx'], ['cb', 'cy'], ['cx', 'cy']]) {
    store.insertLink({ source_id: a2, target_id: b2, relation: 'related', confidence: 0.2 });
  }
  db.run("UPDATE links SET invalid_at=datetime('now') WHERE relation='related'");
  store._persist();
  // 边提升不受实体带界限制，但受守恒闸：当前 balanced（有退边），放行
  const rE = await P.promoteEdges(store, { cycleId: 'c2' });
  const ce = rows("SELECT * FROM links WHERE source_id='ca' AND target_id='cb'")[0];
  const actE = rows("SELECT * FROM field_actions WHERE action='promote-edge'")[0];
  const revE = actE ? await field.revertFieldAction(store, actE.id) : null;
  const ceBack = rows("SELECT * FROM links WHERE source_id='ca' AND target_id='cb'")[0];
  ac('AC-6 候选边提升 + 可逆', ce.relation === 'hydrogen-bond' && Number(ce.strength) === 7 && rE.promoted.length >= 1 &&
    revE && revE.reverted && ceBack.relation === 'sprout-candidate' && Number(ceBack.strength) === 4,
    JSON.stringify({ ce, rE, revE, ceBack }));

  const laAfter = new Map(rows('SELECT id, last_access FROM entities').map(r => [r.id, String(r.last_access)]));
  const laKept = [...laBefore.entries()].every(([id, v]) => laAfter.has(id) && laAfter.get(id) === v);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'field-promote.js'), 'utf8');
  ac('AC-7 铁律', laKept && !/DELETE\s+FROM/i.test(src),
    JSON.stringify([...laBefore.entries()].filter(([id, v]) => laAfter.get(id) !== v)));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
