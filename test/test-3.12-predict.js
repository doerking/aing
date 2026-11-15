'use strict';
// M3 任务 3.12 failing test —— 锁 SPEC-3.12 预案器六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-predict-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let P, store;
try {
  P = require('../src/predict.js');
  store = require('../src/knowledge-store.js');
  if (typeof P.predict !== 'function') throw new Error('predict 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/predict.js 未实现 SPEC-3.12'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // 空库 → 冷启动
  const cold = await P.predict(store, { message: '回炉闭环应该点接？' });
  ac('AC-3 冷启动诚实',
    cold.coldStart === true && cold.plans.length === 1 && cold.plans[0].basis.length === 0 &&
    /无以往依据/.test(cold.plans[0].hypothesis) && cold.plans[0].confidenceBand === 'low',
    JSON.stringify(cold));

  // 造三条相关会话 + 向量
  const S = require('../src/session-ingest.js');
  await S.ingestSession(store, { sessionId: 'a', topic: '回炉闭环', at: '2026-11-01T10:00:00Z',
    reply: '回炉要接进代谢链，否则压缩单向泄漏。', searchShown: ['回炉设计'], rationale: '先补闭环' });
  await S.ingestSession(store, { sessionId: 'b', topic: '回炉闭环', at: '2026-11-02T10:00:00Z',
    reply: '回炉的籽要留血统，方便追溯。', searchShown: [], rationale: '血统可追' });
  await S.ingestSession(store, { sessionId: 'c', topic: '场域提升', at: '2026-11-03T10:00:00Z',
    reply: '提升要先过证据闸。', searchShown: [], rationale: '证据优先' });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();
  const vec = require('../src/vector.js');
  await vec.vectorStep(store, {});
  // 两条候选边（第二类证据）
  store.insertLink({ source_id: 'conv-a', target_id: 'conv-b', relation: 'sprout-candidate', confidence: 0.7 });
  db.run("UPDATE links SET strength=6, evidence='[\"tag\",\"kw\"]'");
  store._persist();

  const tables = ['entities', 'links', 'entity_vectors', 'meko_cycles'];
  const before = tables.map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();
  const r1 = await P.predict(store, { message: '回炉闭环点样接？' });
  const r2 = await P.predict(store, { message: '回炉闭环点样接？' });
  const after = tables.map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();

  ac('AC-1 有据出卡', !r1.coldStart && r1.plans.length >= 1 && r1.plans.length <= 3 &&
    r1.plans.every(p => p.basis.length >= 1 && p.basis.some(b => String(b.id).startsWith('conv-'))),
    JSON.stringify(r1));

  const quotesOk = r1.plans.every(p => p.basis.every(b => {
    const e = store.getEntity(b.id);
    if (!e) return false;
    const body = JSON.parse(e.content);
    return b.quote && (String(body.reply || '').includes(b.quote) || String(body.rationale || '').includes(b.quote));
  }));
  ac('AC-2 证据可追原文', quotesOk, JSON.stringify(r1.plans.map(p => p.basis)));

  const bands = new Set(r1.plans.map(p => p.confidenceBand));
  const kinds = new Set(r1.plans.flatMap(p => p.basis.map(b => b.kind)));
  ac('AC-4 三档置信', [...bands].every(b => ['high', 'mid', 'low'].includes(b)) && kinds.size >= 2,
    JSON.stringify({ bands: [...bands], kinds: [...kinds] }));

  ac('AC-5 确定性 + 只读', JSON.stringify(r1) === JSON.stringify(r2) && before === after,
    JSON.stringify({ same: JSON.stringify(r1) === JSON.stringify(r2), before, after }));

  // 大量命中 → ≤3 卡
  for (let i = 0; i < 10; i++) {
    await S.ingestSession(store, { sessionId: 'x' + i, topic: '回炉闭环', at: `2026-11-0${(i % 9) + 1}T10:00:00Z`,
      reply: `回炉闭环补充样本 ${i}：籽要能回炉。`, searchShown: [], rationale: '补充' });
  }
  await vec.vectorStep(store, {});
  const r3 = await P.predict(store, { message: '回炉闭环', k: 20 });
  ac('AC-6 上限 3 卡', r3.plans.length <= P.PLAN_MAX && r3.plans.length === 3, JSON.stringify(r3.plans.length));

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'predict.js'), 'utf8');
  ac('AC-5b 无物理删', !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
