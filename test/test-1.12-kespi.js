'use strict';
// M1 任务 1.12 failing test —— 锁 SPEC-1.12 kespi 七条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kespi-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
let kespiStep, store;
try { kespiStep = require('../src/kespi.js').kespiStep; store = require('../src/knowledge-store.js'); if (typeof kespiStep !== 'function') throw new Error('kespiStep 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/kespi.js 未实现 SPEC-1.12'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }
const rows = (sql) => { const s = store._getDb().prepare(sql); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, content, type) => {
    store.insertEntity({ id, name: id, type: type || 'Concept', content, tags: '["t:7"]', status: 'active', confidence: 0.6 });
    db.run("UPDATE entities SET updated_at=CURRENT_TIMESTAMP, last_access=CURRENT_TIMESTAMP WHERE id='" + id + "'");
  };

  ins('n0', '零邻居实体', 'Concept');
  ins('iso', '完全孤立实体', 'Concept');
  ins('n2', '两邻居实体', 'Concept');
  ins('n5', '五邻居实体', 'Concept');
  ins('hub', '邻居中枢', 'Concept');
  ins('pair', '苹果手机发布公告正文内容', 'Concept');
  ins('wiki-pair', '苹果手机发布公告正文内容', 'Concept');
  ins('diverge', '苹果手机发布公告正文内容', 'Concept');
  ins('wiki-diverge', '完全不同嘅落定版本', 'Concept');
  ins('retired', '退役实体', 'Concept');
  db.run("UPDATE entities SET invalid_at='2026-01-01 00:00:00' WHERE id='retired'");

  // n2：1 条有效边；hub：2 个邻居；n5：5 个不同目标
  store.insertLink({ source_id: 'n2', target_id: 'hub', relation: 'kb', confidence: 0.6 });
  store.insertLink({ source_id: 'hub', target_id: 'n5', relation: 'kb', confidence: 0.6 });
  store.insertLink({ source_id: 'n5', target_id: 'n0', relation: 'k1', confidence: 0.6 });
  store.insertLink({ source_id: 'n5', target_id: 'n2', relation: 'k2', confidence: 0.6 });
  store.insertLink({ source_id: 'n5', target_id: 'pair', relation: 'k3', confidence: 0.6 });
  store.insertLink({ source_id: 'n5', target_id: 'diverge', relation: 'k4', confidence: 0.6 });
  store.insertLink({ source_id: 'hub', target_id: 'pair', relation: 'k5', confidence: 0.6 });
  store._persist();

  const r1 = await kespiStep(store, {});
  const row = (id) => rows(`SELECT * FROM kespi_scores WHERE entity_id='${id}'`)[0];
  const rp = row('pair');

  ac('AC-1 八维落表 + overall=均值',
    !!rp && ['kq', 'kg', 'ka', 'km', 'kd', 'kc', 'kr', 'kb'].every(k => typeof rp[k] === 'number') &&
    Math.abs(rp.overall - (rp.kq + rp.kg + rp.ka + rp.km + rp.kd + rp.kc + rp.kr + rp.kb) / 8) < 1e-3,
    JSON.stringify(rp));
  ac('AC-2 退役不评', !row('retired'));
  ac('AC-3 KD 只认有效邻居', !!row('iso') && Number(row('iso').kd) === 0, JSON.stringify((row('iso') || {}).kd));
  ac('AC-4 KD 随连接上升',
    !!row('iso') && !!row('n2') && !!row('hub') &&
    Number(row('iso').kd) < Number(row('n2').kd) && Number(row('n2').kd) < Number(row('hub').kd),
    JSON.stringify([row('iso') && row('iso').kd, row('n2') && row('n2').kd, row('hub') && row('hub').kd]));
  ac('AC-5 KC 双链一致（一致=1，不一致=0.4，无镜像=0.3）',
    !!row('wiki-pair') && !!row('wiki-diverge') && !!row('n0') &&
    Number(row('wiki-pair').kc) === 1 && Number(row('wiki-diverge').kc) === 0.4 && Number(row('n0').kc) === 0.3,
    JSON.stringify([row('wiki-pair') && row('wiki-pair').kc, row('wiki-diverge') && row('wiki-diverge').kc, row('n0') && row('n0').kc]));

  const before = JSON.parse(JSON.stringify(rows('SELECT * FROM kespi_scores ORDER BY entity_id')));
  const r2 = await kespiStep(store, {});
  const after = JSON.parse(JSON.stringify(rows('SELECT * FROM kespi_scores ORDER BY entity_id')));
  ac('AC-6 幂等（同日）',
    after.length === before.length && after.every((x, i) => Math.abs(x.overall - before[i].overall) < 1e-9),
    JSON.stringify([before.length, after.length]));

  const la = rows('SELECT last_access FROM entities WHERE id="pair"')[0].last_access;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'kespi.js'), 'utf8');
  ac('AC-7 铁律', !!la && !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
