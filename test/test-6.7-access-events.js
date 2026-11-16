'use strict';
// M6 任务 6.7 failing test —— 锁 SPEC-6.7 访问事件接口八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-access-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const store = require('../src/knowledge-store.js');
let A;
try {
  A = require('../src/access.js');
  for (const k of ['recordAccess', 'latestHitMap', 'lastActivityDays', 'recentActivity']) {
    if (typeof A[k] !== 'function') throw new Error(k + ' 未导出');
  }
  if (typeof A.ACCESS_DAYS !== 'number') throw new Error('ACCESS_DAYS 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— 6.7 访问事件未实现（src/access.js）'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const LONG = '访问事件测试正文，长度足够触发压缩与质量评分，同时不带任何特殊结构。'.repeat(12);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function rows(db, sql) { const s = db.prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  let db = store._getDb();
  const put = (id, conf) => store.insertEntity({ id, name: id, type: 'Concept', content: LONG, tags: '["t"]', status: 'active', confidence: conf });
  put('bg-old', 0.2); put('recent-hit', 0.2); put('bg-fresh', 0.2); put('promo', 0.5);
  db.run("UPDATE entities SET tolaria_strength=1, last_access='2020-01-01 00:00:00' WHERE id IN ('bg-old','recent-hit')");
  db.run("UPDATE entities SET tolaria_strength=1, last_access=CURRENT_TIMESTAMP WHERE id='bg-fresh'");
  db.run("UPDATE entities SET tolaria_strength=5, last_access=NULL WHERE id='promo'");
  store._persist();

  // 事件：recent-hit 近 1 天；bg-old 旧 400 天；promo 近 2 天（无 last_access）
  await A.recordAccess(store, ['recent-hit'], { source: 'test', at: daysAgo(1) });
  await A.recordAccess(store, ['bg-old'], { source: 'test', at: daysAgo(400) });
  await A.recordAccess(store, ['promo'], { source: 'test', at: daysAgo(2) });

  // AC-1 表与索引 + 只追加
  const tbl = rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='access_hits'").length === 1;
  const idx = rows(db, "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_access_entity'").length === 1;
  await A.recordAccess(store, ['recent-hit'], { source: 'test', at: daysAgo(0) });
  const cnt = Number(rows(db, "SELECT COUNT(*) AS n FROM access_hits WHERE entity_id='recent-hit'")[0].n);
  ac('AC-1 表与索引 + 只追加', tbl && idx && cnt === 2, JSON.stringify({ tbl, idx, cnt }));

  // AC-2 记录契约
  const laBefore = rows(db, "SELECT last_access FROM entities WHERE id='promo'")[0].last_access;
  const r = await A.recordAccess(store, ['promo', 'ghost'], { source: 'test' });
  const laAfter = rows(db, "SELECT last_access FROM entities WHERE id='promo'")[0].last_access;
  ac('AC-2 记录契约', r.recorded === 1 && r.skipped.includes('ghost') && String(laBefore) === String(laAfter),
    JSON.stringify({ r, laBefore, laAfter }));

  // AC-3 prune 只救不杀
  const P = require('../src/prune.js');
  const cands = P.listCandidates(store, { inactiveDays: 90 });
  ac('AC-3 prune 只救不杀', cands.includes('bg-old') && !cands.includes('recent-hit') && !cands.includes('bg-fresh'),
    JSON.stringify(cands));

  // AC-4 compress 双锚
  const C = require('../src/compress.js');
  await C.compressStep(store, { inactiveDays: 30, minLength: 10 });
  const seeds = new Map(rows(db, 'SELECT entity_id, active FROM compressed_seeds').map(x => [x.entity_id, Number(x.active)]));
  ac('AC-4 compress 双锚', seeds.get('bg-old') === 1 && !seeds.has('recent-hit'),
    JSON.stringify([...seeds]));

  // AC-5 晋级证据
  const FP = require('../src/field-promote.js');
  const ev = await FP.evidenceFor(store, 'promo');
  ac('AC-5 晋级证据', ev.kinds.includes('access'), JSON.stringify(ev));

  // AC-6 KESPI KA
  const K = require('../src/kespi.js');
  await K.kespiStep(store, {});
  const kaPromo = Number(rows(db, "SELECT ka FROM kespi_scores WHERE entity_id='promo'")[0].ka);
  const kaOld = Number(rows(db, "SELECT ka FROM kespi_scores WHERE entity_id='bg-old'")[0].ka);
  ac('AC-6 KESPI KA', kaPromo >= 0.9 && kaOld < 0.01, JSON.stringify({ kaPromo, kaOld }));

  // AC-7 CLI 接线
  const CL = require('../src/cli.js');
  const known = typeof CL.cmdAccess === 'function';
  const w = known ? await CL.cmdAccess(dbPath, ['bg-fresh'], { source: 'cli' }) : null;
  await store.init(dbPath);
  db = store._getDb();
  const wRows = Number(rows(db, "SELECT COUNT(*) AS n FROM access_hits WHERE source='cli'")[0].n);
  ac('AC-7 CLI 接线', known && w && w.recorded === 1 && wRows === 1, JSON.stringify({ known, w, wRows }));

  // AC-8 铁律
  const snap = () => JSON.stringify(rows(db, 'SELECT * FROM entities'));
  const s0 = snap();
  await A.recordAccess(store, ['bg-fresh'], { source: 'test' });
  const s1 = snap();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'access.js'), 'utf8');
  ac('AC-8 铁律', s0 === s1 && !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src),
    JSON.stringify({ same: s0 === s1 }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
