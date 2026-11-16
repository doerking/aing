'use strict';
// M6 任务 6.10 failing test —— 锁 SPEC-6.10 蒸馏点消费 AC-1~5
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-point-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const P = require('../src/predict.js');
const S = require('../src/session-ingest.js');
const store = require('../src/knowledge-store.js');
const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  await S.ingestSession(store, { sessionId: 'p1', topic: '蒸馏点消费', at: '2026-11-10T10:00:00Z',
    reply: '蒸馏点要有人读，否则就是缓存。', searchShown: [], rationale: '先给消费者' });
  await S.ingestSession(store, { sessionId: 'p2', topic: '另一话题', at: '2026-11-11T10:00:00Z',
    reply: '无关材料。', searchShown: [], rationale: '凑数' });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();
  await require('../src/vector.js').vectorStep(store, {});

  // 关联实体 + 蒸馏点：p1 ↔ wiki-distill（强度 6）
  store.insertEntity({ id: 'wiki-distill', type: 'Concept', name: '蒸馏点素材', content: '蒸馏点的原文素材。' });
  store.insertLink({ source_id: 'conv-p1', target_id: 'wiki-distill', relation: 'mention', confidence: 0.8 });
  db.run("UPDATE links SET strength=6");
  db.prepare('INSERT INTO distill_points (base_id, digest, raw_count, line_count, points_json, updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)')
    .run(['wiki-distill', 'd1', 3, 3, JSON.stringify(['蒸馏点要有人读，否则就是缓存。', '第二条不取。'])]);
  store._persist();

  const TABLES = ['entities', 'links', 'distill_points', 'entity_vectors', 'meko_cycles'];
  const fp = () => TABLES.map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();
  const before = fp();
  const r1 = await P.predict(store, { message: '蒸馏点消费点做？' });
  const r2 = await P.predict(store, { message: '蒸馏点消费点做？' });
  const after = fp();

  const card = (r) => (r.plans || []).find(p => (p.basis || []).some(b => b.id === 'conv-p1')) || {};
  const pts = (card(r1).basis || []).filter(b => b.kind === 'point');

  // AC-1 point 依据出现，quote = 首条
  ac('AC-1 point 依据出现', pts.length === 1 && pts[0].id === 'wiki-distill' &&
    pts[0].quote === '蒸馏点要有人读，否则就是缓存。' && String(pts[0].quote).length <= 80,
    JSON.stringify(pts));

  // AC-2 不造依据：另条会话无点 → 无 point；全部 point quote 非空
  const otherCard = (r1.plans || []).find(p => (p.basis || []).some(b => b.id === 'conv-p2')) || {};
  const otherPts = (otherCard.basis || []).filter(b => b.kind === 'point');
  const allPts = (r1.plans || []).flatMap(p => (p.basis || []).filter(b => b.kind === 'point'));
  ac('AC-2 不造依据', otherPts.length === 0 && allPts.every(b => String(b.quote || '').trim() !== ''),
    JSON.stringify({ otherPts, allPts }));

  // AC-3 信心带：conversation + point → high
  ac('AC-3 信心带', card(r1).confidenceBand === 'high', JSON.stringify({ band: card(r1).confidenceBand, basis: (card(r1).basis || []).map(b => b.kind) }));

  // AC-4 纯读
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'predict.js'), 'utf8');
  ac('AC-4 纯读', before === after && !/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i.test(src),
    JSON.stringify({ before, after }));

  // AC-5 确定性
  const sig = (r) => JSON.stringify((r.plans || []).map(p => (p.basis || []).map(b => [b.kind, b.id, b.quote])));
  ac('AC-5 确定性', sig(r1) === sig(r2), sig(r1).slice(0, 160));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
