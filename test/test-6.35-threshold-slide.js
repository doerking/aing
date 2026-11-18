'use strict';
// M6 任务 6.35 failing test —— 段有效阈值滑动（20±5，按实体散列定向）
// 要修的病：阈值钉死 20，外部件刚好写 20 字就贴线过关。
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

// 找两种档位的 id
function findIds(th) {
  const ids = [];
  for (let i = 0; i < 200 && ids.length < 2; i++) {
    const id = 'e-' + i;
    if (K.sectionThreshold && K.sectionThreshold(id) === th) ids.push(id);
  }
  return ids;
}

(async () => {
  const th = K.sectionThreshold ? K.sectionThreshold('sample-id') : null;

  // AC-1 只两档且同 id 恒定
  const a1 = K.sectionThreshold ? [K.sectionThreshold('x-1'), K.sectionThreshold('x-1')] : [];
  ac('AC-1 阈值只 15/25 且同 id 恒定', a1.length === 2 && a1[0] === a1[1] && [15, 25].includes(a1[0]), JSON.stringify({ th, a1 }));

  // AC-2 两档都出现
  const lo = findIds(15), hi = findIds(25);
  ac('AC-2 不同 id 两档都出现', lo.length > 0 && hi.length > 0, JSON.stringify({ lo, hi }));

  // AC-3 无 id → 20
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const covNoId = K.narrativeCoverage ? K.narrativeCoverage(mdOf(17)) : null;
  ac('AC-3 无 entityId 退回 20（17 字 → 覆盖 0）', covNoId === 0, JSON.stringify({ covNoId }));

  // AC-4 17 字段：15 档有效、25 档无效
  const lowId = lo[0] || 'e-0', highId = hi[0] || 'e-1';
  const put = (id) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,'[\"a\",\"b\",\"c\"]','active',0.6,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, narrative(mdOf(17))]);
  put(lowId); put(highId);
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('p-plain','p-plain','Conversation',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['# 会话\n\n' + '甲'.repeat(1600)]);
  store._persist();
  await K.kespiStep(store, {});
  const sc = (id) => { const s = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? Number(r.kq) : null; };
  const cLo = K.narrativeCoverage(mdOf(17), { entityId: lowId });
  const cHi = K.narrativeCoverage(mdOf(17), { entityId: highId });
  ac('AC-4 17 字段：15 档有效、25 档无效', cLo === 1 && cHi === 0 && sc(lowId) > sc(highId), JSON.stringify({ cLo, cHi, kqLo: sc(lowId), kqHi: sc(highId) }));

  // AC-5 同实体两轮不跳变
  const k1 = sc(lowId);
  await K.kespiStep(store, {});
  ac('AC-5 同实体连跑两轮 kq 一致', sc(lowId) === k1, JSON.stringify({ k1, k2: sc(lowId) }));

  // AC-6 非叙事不变
  ac('AC-6 非叙事实体读数不变', Math.abs(sc('p-plain') - 0.675) <= 0.02, JSON.stringify({ kq: sc('p-plain') }));

  console.log(`\n----- 6.35 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
