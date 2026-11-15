'use strict';
// M3 任务 3.11 failing test —— 锁 SPEC-3.11 memo 用户面六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-memo-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let M, store;
try {
  M = require('../src/memo.js');
  store = require('../src/knowledge-store.js');
  if (typeof M.buildMemo !== 'function') throw new Error('buildMemo 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/memo.js 未实现 SPEC-3.11'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  const cold = await M.buildMemo(store, {});
  ac('AC-6b 冷启动诚实', cold.user.coldStart === true && cold.user.recent.length === 0 &&
    cold.user.plans.length === 1 && /无以往依据/.test(cold.user.plans[0].hypothesis),
    JSON.stringify(cold.user));

  const S = require('../src/session-ingest.js');
  await S.ingestSession(store, { sessionId: 'm1', topic: '回炉闭环', at: '2026-11-01T10:00:00Z', reply: '回炉接进链。', rationale: '闭环优先', outcome: 'open' });
  await S.ingestSession(store, { sessionId: 'm2', topic: '回炉闭环', at: '2026-11-02T10:00:00Z', reply: '回炉留血统。', rationale: '血统可追', outcome: 'done' });
  await S.ingestSession(store, { sessionId: 'm3', topic: '回炉闭环', at: '2026-11-03T10:00:00Z', reply: '回炉加门禁。', rationale: '门禁兜底', outcome: 'done' });
  await S.ingestSession(store, { sessionId: 'm4', topic: '场域提升', at: '2026-11-04T10:00:00Z', reply: '提升要证据。', rationale: '证据优先', outcome: 'open' });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();
  await require('../src/vector.js').vectorStep(store, {});

  const tables = ['entities', 'links', 'entity_vectors', 'meko_cycles', 'compressed_seeds'];
  const before = tables.map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();
  const memo = await M.buildMemo(store, {});
  const after = tables.map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();

  const u = memo.user;
  ac('AC-1 用户面齐全', u.recent.length === 4 && u.recent.every(r => r.sessionId && r.topic && 'outcome' in r),
    JSON.stringify(u.recent));
  ac('AC-2 未闭环', u.openLoops.length === 2 && u.openLoops.every(l => l.text && l.since),
    JSON.stringify(u.openLoops));
  const pat = u.patterns.find(p => p.pattern === '回炉闭环');
  ac('AC-3 模式只在 ≥2 次', !!pat && pat.hits === 3 && pat.evidenceIds.length === 3 &&
    !u.patterns.some(p => p.pattern === '场域提升'), JSON.stringify(u.patterns));
  ac('AC-4 预案接入', !u.coldStart && u.plans.length >= 1 && u.plans.length <= 3, JSON.stringify(u.plans));
  ac('AC-5 系统一行', typeof memo.systemLine === 'string' && memo.systemLine.length > 0 && memo.systemLine.length <= M.SYSTEM_LINE_MAX,
    memo.systemLine);
  ac('AC-6 纯读', before === after && Array.isArray(memo.agentTodos) && memo.agentTodos.length === 0,
    JSON.stringify({ before, after }));

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'memo.js'), 'utf8');
  ac('AC-6c 无写语句', !/INSERT\s+INTO|UPDATE\s+[a-z_]+\s+SET|DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
