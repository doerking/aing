'use strict';
// SPEC-6.8 修订 A failing test —— greenZone「绿区自动毕业」闸（opt-in）
// 判据：实体 overall ≥ kespi.greenZone（0.60）→ 毕业，唔开任何维度嘅工单。
// 缘起：greenZone 0.60 声明但未入逻辑（self-optimize 只比 redZone）。量过：真库 101 个
// overall≥0.60 实体，但 13 个 ticket 候选全部 overall<0.60（kq-low/kd-cited 本身拖低
// overall）——闸对真库 0 影响，但系正确语义，opt-in 由 owner 按需开。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-gz-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const C = require('../src/config-runtime.js');
const store = require('../src/knowledge-store.js');
const so = require('../src/self-optimize.js');

const GATE = 'kespi.greenZoneGate';

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, kq, overall) => db.run(
    `INSERT OR REPLACE INTO kespi_scores (entity_id, kq, kg, ka, km, kd, kc, kr, kb, overall, computed_at)
     VALUES (?, ?, NULL, 0.5, NULL, 0.5, 0.5, 0.5, NULL, ?, CURRENT_TIMESTAMP)`, [id, kq, overall]);

  // e-green：overall 0.70（绿）但 kq 0.45（低于 kq 触发 0.50）→ 闸开应唔开票
  // e-yellow：overall 0.55（黄）但 kq 0.45 → 应开票
  store.insertEntity({ id: 'e-green', name: 'e-green', type: 'Concept', content: '正文足够长以通过质量评分。'.repeat(8), tags: '[]', status: 'active', confidence: 0.8 });
  store.insertEntity({ id: 'e-yellow', name: 'e-yellow', type: 'Concept', content: '另一正文足以通过质量评分。'.repeat(8), tags: '[]', status: 'active', confidence: 0.8 });
  put('e-green', 0.45, 0.70);
  put('e-yellow', 0.45, 0.55);
  store._persist();

  const kinds = (scan) => scan.tickets.map(t => t.entity_id + ':' + t.dim).sort();

  // AC-1 旋钮入单源，默认 0（关）
  ac('AC-1 旋钮默认 0（关）', C.getKnob(store, GATE) === 0, JSON.stringify(C.getKnob(store, GATE)));

  // AC-2 闸关：green + yellow 都开票（kq<0.50）
  const off = so.scanTickets(store, { persist: false });
  const offK = kinds(off);
  ac('AC-2 闸关两个都开票', offK.includes('e-green:kq') && offK.includes('e-yellow:kq'), JSON.stringify(offK));

  // AC-3 闸开：green 唔开票（毕业），yellow 照开
  C.setKnob(store, GATE, 1);
  const on = so.scanTickets(store, { persist: false });
  const onK = kinds(on);
  ac('AC-3 闸开 green 毕业唔开票', !onK.includes('e-green:kq') && onK.includes('e-yellow:kq'), JSON.stringify(onK));
  C.setKnob(store, GATE, 0);

  // AC-4 闸开但 greenZone=0 无效：即绿色闸阈值 0 = 关
  C.setKnob(store, GATE, 1);
  C.setKnob(store, 'kespi.greenZone', 0);
  const zero = so.scanTickets(store, { persist: false });
  ac('AC-4 greenZone=0 时闸无效', kinds(zero).includes('e-green:kq'), JSON.stringify(kinds(zero)));
  C.setKnob(store, 'kespi.greenZone', 0.60);
  C.setKnob(store, GATE, 0);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
