'use strict';
// M3 任务 3.1 failing test —— 锁 SPEC-3.1 意识层闭环六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kernel-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let K, store;
try {
  K = require('../src/consciousness-kernel.js');
  store = require('../src/knowledge-store.js');
  if (typeof K.recordCycleResult !== 'function') throw new Error('recordCycleResult 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/consciousness-kernel.js 未实现 SPEC-3.1'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  // 造有反应的世界：会话 + 实体 + 边 + KESPI
  store.insertEntity({ id: 'conv-a', name: '会话 A', type: 'Conversation', content: JSON.stringify({ topic: '回炉', at: '2026-11-15T10:00:00Z', reply: '回炉接链', outcome: 'open' }), status: 'active', confidence: 0.6 });
  store.insertEntity({ id: 'raw-b', name: 'B', type: 'Concept', content: '回炉样本', status: 'active', confidence: 0.6 });
  store.insertLink({ source_id: 'conv-a', target_id: 'raw-b', relation: 'gen', confidence: 0.7 });
  db.run("INSERT INTO kespi_scores (entity_id, overall) VALUES ('raw-b', 0.9)");
  store._persist();

  const att = K.computeAttention(store);
  const f = att.factors || {};
  const recomputed = Math.round((f.vitality * 0.3 + f.recency * 0.25 + f.connectionDensity * 0.2 + f.anomaly * 0.15 + f.userInterest * 0.1) * 1e6) / 1e6;
  ac('AC-1 注意力五因子', att.attention >= 0 && att.attention <= 1 &&
    ['vitality', 'recency', 'connectionDensity', 'anomaly', 'userInterest'].every(k => typeof f[k] === 'number') &&
    Math.abs(att.attention - recomputed) < 1e-6,
    JSON.stringify(att));

  const hi = await K.observe(store, { events: [{ type: 'ingest' }], attentionOverride: 0.85 });
  const idle = await K.observe(store, { events: [] });
  ac('AC-2 状态迁移', hi.state === 'aroused' && idle.state === 'idle', JSON.stringify({ hi, idle }));

  // AC-3 停滞累积
  const r1 = await K.recordCycleResult(store, { cycleId: 'c1', ok: true, actions: {} });
  const r2 = await K.recordCycleResult(store, { cycleId: 'c2', ok: true, actions: {} });
  const r3 = await K.recordCycleResult(store, { cycleId: 'c3', ok: true, actions: {} });
  ac('AC-3 停滞累积', r1.stagnationCount === 1 && r2.stagnationCount === 2 &&
    r3.stagnationCount === 3 && r3.state === 'stagnant' && !!r3.breaker && r3.breaker.at,
    JSON.stringify({ r1, r2, r3 }));

  // AC-4 有产出清零
  const r4 = await K.recordCycleResult(store, { cycleId: 'c4', ok: true, actions: { bonded: 2 } });
  ac('AC-4 有产出清零', r4.stagnationCount === 0 && r4.state !== 'stagnant', JSON.stringify(r4));

  // AC-5 唯一写者（静态）
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'consciousness-kernel.js'), 'utf8');
  const writers = (src.match(/stagnation_count/g) || []).length;
  const updates = (src.match(/UPDATE kernel_state SET[^`;]*stagnation_count/g) || []).length;
  ac('AC-5 唯一写者', writers >= 2 && updates === 1, JSON.stringify({ writers, updates }));

  // AC-6 只读
  const before = rows('SELECT COUNT(*) AS n FROM kernel_state')[0].n;
  const st = K.kernelStatus(store);
  const after = rows('SELECT COUNT(*) AS n FROM kernel_state')[0].n;
  ac('AC-6 只读状态', !!st && st.state && before === after, JSON.stringify({ st, before, after }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
