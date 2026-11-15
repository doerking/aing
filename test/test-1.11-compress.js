'use strict';
// M1 任务 1.11 failing test —— 锁 SPEC-1.11 compress 六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-compress-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
let compressStep, store;
try { compressStep = require('../src/compress.js').compressStep; store = require('../src/knowledge-store.js'); if (typeof compressStep !== 'function') throw new Error('compressStep 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/compress.js 未实现 SPEC-1.11'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }
const rows = (sql) => { const s = store._getDb().prepare(sql); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };
const crypto = require('crypto');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const longText = '长内容'.repeat(20);
  const shortText = '短';
  const ins = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content, status: 'active', confidence: 0.5 });

  ins('old-long', longText);
  ins('recent-long', longText);
  ins('old-short', shortText);
  ins('never-access', longText);
  db.run("UPDATE entities SET last_access='2020-01-01 00:00:00' WHERE id IN ('old-long','old-short')");
  db.run("UPDATE entities SET last_access=CURRENT_TIMESTAMP WHERE id='recent-long'");
  db.run("UPDATE entities SET last_access=NULL WHERE id='never-access'");
  store._persist();

  const r1 = await compressStep(store, {});
  const seeds = rows('SELECT * FROM compressed_seeds');
  const seed = (id) => seeds.find(s => s.entity_id === id);

  ac('AC-1 旧长实体入籽 + hash 正确',
    !!seed('old-long') && Number(seed('old-long').active) === 1 &&
    seed('old-long').content_hash === crypto.createHash('sha1').update(longText).digest('hex'),
    JSON.stringify(seed('old-long') || null));
  ac('AC-2 新近访问不入籽', !seed('recent-long'));
  ac('AC-3 短内容不入籽', !seed('old-short'));
  ac('AC-4 never-access（NULL）不入籽', !seed('never-access'));

  const r2 = await compressStep(store, {});
  ac('AC-5 幂等', r2.seeded === 0 && r2.revived === 0, JSON.stringify(r2));

  // 可逆：刷新 last_access 后解压
  db.run("UPDATE entities SET last_access=CURRENT_TIMESTAMP WHERE id='old-long'"); store._persist();
  const r3 = await compressStep(store, {});
  const fresh = rows("SELECT * FROM compressed_seeds WHERE entity_id='old-long'")[0];
  ac('AC-6 可逆（重新访问 → active=0）', !!fresh && Number(fresh.active) === 0 && r3.revived === 1, JSON.stringify({ fresh, r3 }));

  const la = rows('SELECT last_access FROM entities').map(r => String(r.last_access));
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'compress.js'), 'utf8');
  ac('AC-7 铁律（无物理删）', !/DELETE\s+FROM/i.test(src) && la.length === 4);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
