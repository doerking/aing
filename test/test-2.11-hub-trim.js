'use strict';
// M2 任务 2.11 failing test —— 锁 SPEC-2.11 存量 hub 裁剪六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-hubtrim-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let hub, store, gate;
try {
  hub = require('../src/hub-trim.js');
  store = require('../src/knowledge-store.js');
  gate = require('../src/tri-axis-gate.js');
  if (typeof hub.trimHubs !== 'function') throw new Error('trimHubs 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/hub-trim.js 未实现 SPEC-2.11'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };
const activeDeg = (id) => Number(rows("SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND (source_id=? OR target_id=?)", [id, id])[0].n);

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const CAP = 8;
  // hub 连 12 个叶子，强度 12..1（越后越弱）
  store.insertEntity({ id: 'hub', name: 'H', type: 'Concept', content: '中心', status: 'active', confidence: 0.9 });
  for (let i = 0; i < 12; i++) {
    store.insertEntity({ id: 'leaf' + i, name: 'L' + i, type: 'Concept', content: '叶' + i, status: 'active', confidence: 0.5 });
    store.insertLink({ source_id: 'hub', target_id: 'leaf' + i, relation: 'gen', confidence: 0.5 });
    // 强度按真实 1–9 刻度铺：9,8,8,7,7,6,6,5,4,4,3,2（top-8 = leaf0..leaf7，弱边 4 条）
    const S = [9, 8, 8, 7, 7, 6, 6, 5, 4, 4, 3, 2];
    db.run('UPDATE links SET strength = ? WHERE source_id=? AND target_id=?', [S[i], 'hub', 'leaf' + i]);
  }
  // 小节点（度数 3）与一对互不相干节点，验「小节点零动」
  for (const [a, b] of [['s1', 's2'], ['s2', 's3'], ['s3', 's1']]) {
    if (!store.getEntity(a)) store.insertEntity({ id: a, name: a, type: 'Concept', content: '小' + a, status: 'active', confidence: 0.5 });
    if (!store.getEntity(b)) store.insertEntity({ id: b, name: b, type: 'Concept', content: '小' + b, status: 'active', confidence: 0.5 });
    store.insertLink({ source_id: a, target_id: b, relation: 'gen', confidence: 0.5 });
  }
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();

  const thresholdBefore = gate.STRENGTH_THRESHOLD;
  const before = rows('SELECT source_id, target_id, strength, confidence, relation FROM links ORDER BY source_id, target_id');
  const r1 = await hub.trimHubs(store, { degreeCap: CAP });

  const kept = rows("SELECT target_id FROM links WHERE source_id='hub' AND invalid_at IS NULL ORDER BY strength DESC");
  const trimmed = rows("SELECT target_id, strength FROM links WHERE source_id='hub' AND invalid_at IS NOT NULL");
  ac('AC-1 hub 裁到 cap 且留最强', activeDeg('hub') === CAP && trimmed.length === 4 &&
    kept.map(k => k.target_id).sort().join() === ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5', 'leaf6', 'leaf7'].sort().join(),
    JSON.stringify({ deg: activeDeg('hub'), kept: kept.map(k => k.target_id), trimmed: trimmed.map(t => t.target_id) }));

  // AC-2 误删=0：每条退役边都是弱边（<5）且至少一端裁剪前超 cap；无强边被退
  const demoted = rows("SELECT source_id, target_id, strength FROM links WHERE invalid_at IS NOT NULL");
  const bad = demoted.filter(e => !(Number(e.strength) < 5 && (e.source_id === 'hub' || e.target_id === 'hub')));
  const strongGone = rows("SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NOT NULL AND strength >= 5")[0].n;
  ac('AC-2 误删=0 负向证', bad.length === 0 && Number(strongGone) === 0 && r1.trimmed === 4,
    JSON.stringify({ bad, strongGone, r1 }));

  const small = rows("SELECT COUNT(*) AS n FROM links WHERE (source_id LIKE 's%' OR target_id LIKE 's%') AND invalid_at IS NOT NULL")[0].n;
  ac('AC-3 不改准入 + 小节点零动', gate.STRENGTH_THRESHOLD === thresholdBefore && Number(small) === 0, JSON.stringify({ thresholdBefore, threshold: gate.STRENGTH_THRESHOLD, small }));

  const after = rows('SELECT source_id, target_id, strength, confidence, relation FROM links ORDER BY source_id, target_id');
  const reasonRow = rows("SELECT DISTINCT invalid_reason FROM links WHERE invalid_at IS NOT NULL")[0];
  const reason = reasonRow ? reasonRow.invalid_reason : null;
  ac('AC-6 只碰两列（其余列逐列不变）+ 原因码 hub-trim',
    JSON.stringify(before) === JSON.stringify(after) && reason === 'hub-trim' && /^hub-trim$/.test(String(reason)));

  const r2 = await hub.trimHubs(store, { degreeCap: CAP });
  ac('AC-5 幂等', r2.trimmed === 0 && activeDeg('hub') === CAP, JSON.stringify(r2));

  const r3 = await hub.restoreHubTrim(store, {});
  ac('AC-4 可逆', r3.restored === 4 && activeDeg('hub') === 12 &&
    Number(rows("SELECT COUNT(*) AS n FROM links WHERE invalid_reason='hub-trim'")[0].n) === 0, JSON.stringify(r3));

  const la = rows("SELECT DISTINCT last_access FROM entities")[0].last_access;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'hub-trim.js'), 'utf8');
  ac('AC-6b 无物理删 + last_access 不变', !/DELETE\s+FROM/i.test(src) && String(la) === '2021-01-01 00:00:00');

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
