'use strict';
// M3 任务 3.13 failing test —— 锁 SPEC-3.13 三源入库闭环五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-ingest-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let S, store;
try {
  S = require('../src/session-ingest.js');
  store = require('../src/knowledge-store.js');
  if (typeof S.ingestSession !== 'function') throw new Error('ingestSession 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/session-ingest.js 未实现 SPEC-3.13'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql, b = []) => { const s = store._getDb().prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'old', name: '旧', type: 'Concept', content: '旧料', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();

  const payload = {
    sessionId: 's1', at: '2026-11-16T08:00:00Z', topic: 'aing 双链',
    reply: '建议先把回炉接进链。',
    searchShown: ['双链互校论文', 'DNA 复制图解'],
    rationale: '用户问闭环缺口 → 先补回炉'
  };
  const r1 = await S.ingestSession(store, payload);
  const e1 = store.getEntity('conv-s1');
  const tags = e1 ? String(e1.tags) : '';
  const body = e1 ? JSON.parse(e1.content) : {};
  ac('AC-1 三源齐入', r1.ingested && e1 && e1.type === 'Conversation' &&
    !!body.reply && Array.isArray(body.searchShown) && !!body.rationale &&
    tags.includes('src:reply') && tags.includes('src:search') && tags.includes('src:rationale'),
    JSON.stringify({ r1, e1, body }));

  const n0 = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  let thrown = null;
  try { await S.ingestSession(store, { ...payload, sessionId: 's2', reply: '' }); } catch (e) { thrown = e.message; }
  ac('AC-2 缺回复拒入 G1', /reply-required/.test(String(thrown)) && rows('SELECT COUNT(*) AS n FROM entities')[0].n === n0, String(thrown));

  const r3 = await S.ingestSession(store, payload);
  const e1b = store.getEntity('conv-s1');
  ac('AC-3 幂等', r3.skipped && e1b.content === e1.content && rows('SELECT COUNT(*) AS n FROM entities')[0].n === n0, JSON.stringify(r3));

  // AC-4 回喂
  const linksBefore = rows('SELECT COUNT(*) AS n FROM links')[0].n;
  const f1 = await S.recordPlanFeedback(store, { planId: 'p1', hit: true, basisIds: ['s1'] });
  const fb1 = store.getEntity('fb-p1');
  const f1again = await S.recordPlanFeedback(store, { planId: 'p1', hit: true, basisIds: ['s1'] });
  const f2 = await S.recordPlanFeedback(store, { planId: 'p2', hit: false, basisIds: ['s1', 'missing'] });
  const fb2 = store.getEntity('fb-p2');
  const linksAfter = rows('SELECT COUNT(*) AS n FROM links')[0].n;
  ac('AC-4 回喂 G5',
    !!fb1 && String(fb1.tags).includes('plan-hit') && f1.edges === 1 &&
    !!fb2 && String(fb2.tags).includes('plan-miss') && f1again.skipped &&
    linksAfter === linksBefore + 2,
    JSON.stringify({ f1, f1again, f2, linksBefore, linksAfter }));

  const la = rows("SELECT last_access FROM entities WHERE id='old'")[0].last_access;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'session-ingest.js'), 'utf8');
  ac('AC-5 铁律', String(la) === '2021-01-01 00:00:00' && !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
