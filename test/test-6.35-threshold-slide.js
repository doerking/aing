'use strict';
// M6 任务 6.35 测试 —— 段有效阈值不再钉死 20（口径由 6.36 细化：游标 20→±1..±5→20）
// 本档守的是下限性质：任何一轮都落在 15~25，同一 (实体, 轮) 可复算，缺参退回 20。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-slide2-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');

const mdOf = (len) => N.SECTIONS.map(k => `### ${k}\n` + '甲'.repeat(len)).join('\n\n');
const narrative = (md) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown: md, turns: [], stats: { bodyChars: md.length }, calibrations: []
});
const TH = (id, r) => (K.sectionThreshold ? K.sectionThreshold(id, { round: r }) : null);

(async () => {
  // AC-1 任何一轮都落在 15~25，且同 (实体, 轮) 恒定
  const seq = Array.from({ length: 12 }, (_, r) => TH('x-1', r));
  ac('AC-1 阈值恒在 15~25 且同轮可复算',
    seq.every(v => v >= 15 && v <= 25) && TH('x-1', 3) === seq[3] && TH('x-1', 0) === 20,
    JSON.stringify({ seq }));

  // AC-2 游标两端都到过（下界 15 与上界 >20）
  ac('AC-2 序列内出现过 15 与上界值', seq.includes(15) && seq.some(v => v > 20), JSON.stringify({ seq }));

  // AC-3 无 id → 20
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const covNoId = K.narrativeCoverage ? K.narrativeCoverage(mdOf(17)) : null;
  ac('AC-3 无 entityId 退回 20（17 字 → 覆盖 0）', covNoId === 0, JSON.stringify({ covNoId }));

  // AC-4 17 字段：阈值 15 的轮有效、阈值 25 的轮无效
  const lowRound = seq.findIndex(v => v === 15);
  const highRound = seq.findIndex((v, r) => r % 6 !== 0 && v > 20);
  const cLo = K.narrativeCoverage(mdOf(17), { entityId: 'x-1', round: lowRound });
  const cHi = K.narrativeCoverage(mdOf(17), { entityId: 'x-1', round: highRound });
  ac('AC-4 17 字段随轮有效性变化', lowRound >= 0 && highRound >= 0 && cLo === 1 && cHi === 0,
    JSON.stringify({ lowRound, highRound, cLo, cHi }));

  // AC-5 同实体同一轮连跑两轮 kq 一致
  const put = (id, content, tags, conf) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,?,'active',?,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, content, tags, conf]);
  put('x-1', narrative(mdOf(17)), '["a","b","c"]', 0.6);
  put('p-plain', '# 会话\n\n' + '甲'.repeat(1600), '[]', 0.5);
  store._persist();
  await K.kespiStep(store, { round: lowRound });
  const sc = (id) => { const s = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? Number(r.kq) : null; };
  const k1 = sc('x-1');
  await K.kespiStep(store, { round: lowRound });
  ac('AC-5 同实体同轮连跑两轮 kq 一致', sc('x-1') === k1, JSON.stringify({ k1, k2: sc('x-1') }));

  // AC-6 非叙事不变
  ac('AC-6 非叙事实体读数不变', Math.abs(sc('p-plain') - 0.675) <= 0.02, JSON.stringify({ kq: sc('p-plain') }));

  console.log(`\n----- 6.35 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
