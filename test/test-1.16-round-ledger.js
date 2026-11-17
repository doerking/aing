'use strict';
// M1 任务 1.16 failing test —— 轮账与逐条存活（SPEC-1.16）
// 口径：每轮给在场实体留一行快照；新边打 cycle_id；账本有界；记账不阻断编排。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-ledger-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let L = null;
try { L = require('../src/round-ledger.js'); } catch (_) { L = null; }

const iso = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const cols = (t) => { const r = db.exec(`PRAGMA table_info(${t})`); return r.length ? r[0].values.map((v) => v[1]) : []; };

  // AC-1 表与列
  const ec = cols('entity_rounds'); const lc = cols('links');
  ac('AC-1 建表与列（entity_rounds 齐全、links 有 cycle_id）',
    ['entity_id', 'cycle_id', 'alive', 'accessed', 'degree', 'content_len', 'strand', 'recorded_at'].every((c) => ec.includes(c)) && lc.includes('cycle_id'),
    JSON.stringify({ ec, lc: lc.includes('cycle_id') }));

  const put = (id, content, lastAccess) => {
    store.insertEntity({ id, name: id, type: 'Concept', content, tags: '[]', status: 'active' });
    if (lastAccess) db.run('UPDATE entities SET last_access = ? WHERE id = ?', [lastAccess, id]);
  };
  put('ent-a', '甲正文。', iso(Date.now() - 2 * 86400000));      // 2 天前访问 → 热
  put('ent-b', '乙正文。', iso(Date.now() - 40 * 86400000));     // 40 天前 → 不热
  put('ent-c', '丙正文。');                                       // 无 last_access，但有 access_hits

  db.run("INSERT INTO access_hits (entity_id, hit_at, source) VALUES ('ent-c', ?, 'test')", [iso(Date.now() - 86400000)]);
  store.insertLink({ source_id: 'ent-a', target_id: 'ent-b', relation: 'related' });
  store.insertLink({ source_id: 'ent-b', target_id: 'ent-c', relation: 'related' });
  // 一条记账前的旧边（created_at 早于上一轮）
  store.insertLink({ source_id: 'ent-c', target_id: 'ent-a', relation: 'related' });
  db.run("UPDATE links SET created_at = '2025-01-01 00:00:00' WHERE source_id = 'ent-c' AND target_id = 'ent-a'");
  // 上一轮锚点
  db.run("INSERT INTO meko_cycles (id, cycle_type, executed_at, status) VALUES ('cyc-prev', 'test:prev', '2025-06-01 00:00:00', 'executed')");

  const ready = !!L && typeof L.recordRound === 'function';
  if (!ready) {
    ac('AC-2 快照与幂等', false, 'round-ledger.js 未实现');
    ac('AC-3 访问标记', false, 'round-ledger.js 未实现');
    ac('AC-4 边归属', false, 'round-ledger.js 未实现');
    ac('AC-5 上限', false, 'round-ledger.js 未实现');
    ac('AC-6 编排接线', false, 'round-ledger.js 未实现');
    console.log(`\n----- 1.16 pass=${pass} fail=${fail} -----`);
    process.exit(fail ? 1 : 0);
  }

  const out = L.recordRound(store, 'cyc-now');
  const rows = (q) => { const r = db.exec(q); return r.length ? r[0].values : []; };

  // AC-2 快照：N 行、度数、正文长度、幂等
  const n1 = rows("SELECT COUNT(*) FROM entity_rounds WHERE cycle_id='cyc-now'")[0][0];
  const degA = rows("SELECT degree FROM entity_rounds WHERE entity_id='ent-a' AND cycle_id='cyc-now'")[0][0];
  const degB = rows("SELECT degree FROM entity_rounds WHERE entity_id='ent-b' AND cycle_id='cyc-now'")[0][0];
  const lenA = rows("SELECT content_len FROM entity_rounds WHERE entity_id='ent-a' AND cycle_id='cyc-now'")[0][0];
  const aliveAll = rows("SELECT COUNT(*) FROM entity_rounds WHERE cycle_id='cyc-now' AND alive=1")[0][0];
  L.recordRound(store, 'cyc-now');
  const n2 = rows("SELECT COUNT(*) FROM entity_rounds WHERE cycle_id='cyc-now'")[0][0];
  ac('AC-2 快照与幂等（3 行、度数对、重跑不增）',
    n1 === 3 && n2 === 3 && aliveAll === 3 && degA === 2 && degB === 2 && lenA === String('甲正文。').length,
    JSON.stringify({ n1, n2, degA, degB, lenA }));

  // AC-3 访问标记
  const acc = Object.fromEntries(rows("SELECT entity_id, accessed FROM entity_rounds WHERE cycle_id='cyc-now'"));
  ac('AC-3 访问标记（近 7 天 last_access/命中=1，其余 0）',
    acc['ent-a'] === 1 && acc['ent-b'] === 0 && acc['ent-c'] === 1, JSON.stringify(acc));

  // AC-4 边归属
  const byEdge = Object.fromEntries(rows('SELECT source_id, cycle_id FROM links WHERE source_id IN (\'ent-a\',\'ent-b\',\'ent-c\')'));
  ac('AC-4 边归属（新边归本轮，旧边保持空）',
    byEdge['ent-a'] === 'cyc-now' && byEdge['ent-b'] === 'cyc-now' && byEdge['ent-c'] == null,
    JSON.stringify(byEdge));

  // AC-5 上限：keepRounds=3 跑 4 轮只剩 3 轮
  for (const cid of ['cyc-r2', 'cyc-r3', 'cyc-r4']) L.recordRound(store, cid, { keepRounds: 3 });
  const kept = rows('SELECT COUNT(DISTINCT cycle_id) FROM entity_rounds')[0][0];
  const hasOldest = rows("SELECT COUNT(*) FROM entity_rounds WHERE cycle_id='cyc-now'")[0][0];
  ac('AC-5 上限（keepRounds=3 只留最近 3 轮）', kept === 3 && hasOldest === 0, JSON.stringify({ kept, hasOldest }));

  // AC-6 编排接线
  const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
  const orch = new MekoOrchestrator({ store });
  orch.registerStep({ id: 'touch', strand: 'raw', band: 'cross', reads: [], writes: [], budgetTick: 1, reversible: true,
    onCycle: async () => ({ ok: true }) });
  const rt = await orch.runCycle('测试', { rounds: 1 });
  const cyc = rows("SELECT id FROM meko_cycles WHERE cycle_type LIKE '测试%' ORDER BY rowid DESC LIMIT 1")[0];
  let wiredN = 0;
  if (cyc) {
    const st = db.prepare('SELECT COUNT(*) AS n FROM entity_rounds WHERE cycle_id = ?'); st.bind([cyc[0]]);
    if (st.step()) wiredN = st.getAsObject().n; st.free();
  }
  ac('AC-6 编排接线（runCycle 后本轮有账行，且本轮未失败）',
    rt.ok === true && !!cyc && wiredN >= 3, JSON.stringify({ ok: rt.ok, cyc: cyc && cyc[0], wiredN }));

  console.log(`\n----- 1.16 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
