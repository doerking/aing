'use strict';
// M1 任务 1.8 failing test —— 锁 SPEC-1.8 vector 强度加权七条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-vec-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
let m, store;
try { m = require('../src/vector.js'); store = require('../src/knowledge-store.js'); if (typeof m.vectorStep !== 'function') throw new Error('vectorStep 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/vector.js 未实现 SPEC-1.8'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, content, strength) => {
    store.insertEntity({ id, name: id, type: 'Concept', content, status: 'active', confidence: 0.6 });
    if (strength) db.run(`UPDATE entities SET tolaria_strength=${strength} WHERE id='${id}'`);
  };
  ins('apple', '苹果手机发布新旗舰', 9);
  ins('apple-low', '苹果手机发布新旗舰', 3);
  ins('banana', '香蕉种植与热带农业', 5);
  ins('retired', '已退役实体内容', 5);
  db.run("UPDATE entities SET invalid_at='2026-01-01 00:00:00' WHERE id='retired'");
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00'");
  store._persist();

  const r1 = await m.vectorStep(store, {});
  const nVec = db.prepare('SELECT COUNT(*) AS n FROM entity_vectors'); nVec.step(); const cnt = nVec.getAsObject().n; nVec.free();
  ac('AC-1 建表幂等 + 表在', store.listTables().includes('entity_vectors') && cnt >= 0);
  ac('AC-2 有效实体全索引（退役不索引）', r1.indexed === 3 && cnt === 3, JSON.stringify({ r1, cnt }));

  const vBefore = (() => { const s = db.prepare("SELECT vector FROM entity_vectors WHERE entity_id='apple'"); s.step(); const v = s.getAsObject().vector; s.free(); return v; })();
  const r2 = await m.vectorStep(store, {});
  const vAfter = (() => { const s = db.prepare("SELECT vector FROM entity_vectors WHERE entity_id='apple'"); s.step(); const v = s.getAsObject().vector; s.free(); return v; })();
  ac('AC-3 幂等重建', r2.rebuilt === 0 && vBefore === vAfter, JSON.stringify(r2));

  db.run("UPDATE entities SET content='苹果手机发布新旗舰加强版' WHERE id='apple'"); store._persist();
  const r3 = await m.vectorStep(store, {});
  const v3 = (() => { const s = db.prepare("SELECT vector FROM entity_vectors WHERE entity_id='apple'"); s.step(); const v = s.getAsObject().vector; s.free(); return v; })();
  ac('AC-4 内容变重建', r3.rebuilt === 1 && v3 !== vAfter, JSON.stringify(r3));

  const hits = await m.search(store, '苹果手机', { k: 3 });
  ac('AC-5 检索命中', hits.length > 0 && hits[0].id === 'apple', JSON.stringify(hits.map(h => h.id)));

  const rank = await m.search(store, '苹果手机发布新旗舰', { k: 3 });
  const ids = rank.map(h => h.id);
  ac('AC-6 强度加权（9 段排 3 段前）', ids.indexOf('apple') < ids.indexOf('apple-low'), JSON.stringify(ids.map(i => [i, rank.find(h => h.id === i).score.toFixed(3)])));

  const la = db.prepare("SELECT last_access FROM entities WHERE id='apple'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'vector.js'), 'utf8');
  ac('AC-7 铁律', String(laV) === '2021-06-01 00:00:00' && !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
