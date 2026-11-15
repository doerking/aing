'use strict';
// M2 任务 2.12 failing test —— 锁 SPEC-2.12 场域维护动作八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-field-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let field, store;
try {
  field = require('../src/meko-field.js');
  store = require('../src/knowledge-store.js');
  if (typeof field.rebond !== 'function') throw new Error('rebond 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/meko-field.js 未实现 SPEC-2.12'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql, b = []) => { const s = store._getDb().prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, strength, content, conf = 0.6) => {
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: '["场域:6"]', status: 'active', confidence: conf });
    db.run('UPDATE entities SET tolaria_strength=? WHERE id=?', [strength, id]);
  };
  // rebond 面：带内 raw 有镜像无键
  ins('raw-a', 5, '甲正文');
  ins('wiki-a', 5, '甲正文');
  // unwind 面：噪键（内容不一致）+ 正常键
  ins('raw-c', 5, '丙正文甲版');
  ins('wiki-c', 5, '丙正文乙版');
  store.insertLink({ source_id: 'raw-c', target_id: 'wiki-c', relation: 'hydrogen-bond', confidence: 0.5 });
  ins('raw-g', 5, '庚正文');
  ins('wiki-g', 5, '庚正文');
  store.insertLink({ source_id: 'raw-g', target_id: 'wiki-g', relation: 'hydrogen-bond', confidence: 0.5 });
  // reconcile 面：带内 raw 缺镜像
  ins('raw-r', 6, '壬正文多行\n第二行');
  // 带外：强度 8 缺镜像缺键
  ins('raw-hi', 8, '辛正文');
  // demote 面
  ins('x7', 7, '七号无边');
  ins('x6', 6, '六号无边');
  ins('x6e', 6, '六号有边');
  ins('mate', 5, '邻');
  store.insertLink({ source_id: 'x6e', target_id: 'mate', relation: 'gen', confidence: 0.5 });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();
  const laBefore = rows('SELECT id, last_access FROM entities ORDER BY id');

  const rB = await field.rebond(store, { cycleId: 'c1' });
  const bondA = rows("SELECT * FROM links WHERE source_id='raw-a' AND target_id='wiki-a' AND invalid_at IS NULL")[0];
  ac('AC-2 rebond 补键', !!bondA && bondA.relation === 'hydrogen-bond' && Number(bondA.strength) >= 4 && rB.bonded >= 1, JSON.stringify({ bondA, rB }));

  const rU = await field.unwind(store, { cycleId: 'c1' });
  const c = rows("SELECT * FROM links WHERE source_id='raw-c'")[0];
  const g = rows("SELECT * FROM links WHERE source_id='raw-g'")[0];
  ac('AC-3 unwind 断噪', c.invalid_at != null && c.invalid_reason === 'unwind' && g.invalid_at == null && rU.unwound === 1, JSON.stringify({ c, g, rU }));

  const rR = await field.reconcile(store, { cycleId: 'c1' });
  const wr = store.getEntity('wiki-r');
  ac('AC-4 reconcile 对返', !!wr && wr.content === '壬正文多行\n第二行' && Number(wr.tolaria_strength) === 6 && rR.reconciled >= 1, JSON.stringify({ wr, rR }));

  const rD = await field.demote(store, { cycleId: 'c1' });
  const s = id => Number(store.getEntity(id).tolaria_strength);
  ac('AC-5 demote 降级', s('x7') === 6 && s('x6') === 4 && s('x6e') === 6, JSON.stringify({ x7: s('x7'), x6: s('x6'), x6e: s('x6e'), rD }));

  // AC-1 带界：强度 8 始终不动
  const hiBond = rows("SELECT * FROM links WHERE source_id='raw-hi' OR target_id='raw-hi'").length;
  const hiMirror = store.getEntity('wiki-hi');
  const rD8 = await field.demote(store, { cycleId: 'c1', entityId: 'raw-hi' });
  ac('AC-1 带界 I1', !hiMirror && hiBond === 0 && s('raw-hi') === 8 && rD8.refused.some(x => x.id === 'raw-hi'),
    JSON.stringify({ hiMirror: !!hiMirror, hiBond, hi: s('raw-hi'), rD8 }));

  // AC-7 记账
  const acts = rows('SELECT * FROM field_actions ORDER BY created_at');
  ac('AC-7 记账', acts.length >= 4 && acts.every(a => a.action && a.target && a.cycle_id === 'c1'),
    JSON.stringify(acts.map(a => [a.action, a.target])));

  // AC-6 全可逆
  let rev = 0; const bad = [];
  for (const a of acts.filter(x => ['rebond', 'unwind', 'reconcile', 'demote'].includes(x.action))) {
    const r = await field.revertFieldAction(store, a.id);
    if (r.reverted) rev++;
    const again = await field.revertFieldAction(store, a.id);
    if (!again.alreadyReversed) bad.push(a.id);
  }
  const aBack = rows("SELECT * FROM links WHERE source_id='raw-a' AND target_id='wiki-a'")[0] || {};
  const cBack = rows("SELECT * FROM links WHERE source_id='raw-c'")[0];
  const rMirror = store.getEntity('wiki-r');
  ac('AC-6 全可逆 I3',
    aBack.invalid_at != null && cBack.invalid_at == null && rMirror && rMirror.invalid_at != null &&
    s('x7') === 7 && s('x6') === 6 && bad.length === 0 && rev >= 4,
    JSON.stringify({ aBack: aBack.invalid_at, cBack: cBack.invalid_at, rMirror: rMirror && rMirror.invalid_at, x7: s('x7'), x6: s('x6'), rev, bad }));

  const laAfterMap = new Map(rows('SELECT id, last_access FROM entities').map(r => [r.id, r.last_access]));
  const laKept = laBefore.every(r => laAfterMap.has(r.id) && String(laAfterMap.get(r.id)) === String(r.last_access));
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'meko-field.js'), 'utf8');
  ac('AC-8 铁律（原有实体 last_access 全不变 + 无物理删）', laKept && !/DELETE\s+FROM/i.test(src),
    JSON.stringify(laBefore.filter(r => String(laAfterMap.get(r.id)) !== String(r.last_access))));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
