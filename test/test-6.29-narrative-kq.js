'use strict';
// M6 任务 6.29 failing test —— kq 读叙事的正文，不读 JSON 外壳
// 要修的病：六段叙事入库后 content 是 JSON（markdown + turns + stats），
// cleanBody 直接量整串——键名与 turns 会虚增长度，薄叙事也能拿高 kq。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-narrkq-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');

const narrative = (markdown, turnsChars) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: [{ scene: 'x'.repeat(turnsChars) }], stats: { bodyChars: markdown.length }, calibrations: []
});

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content, tags = '[]') => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,?,'active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, content, tags]);

  // AC-1 外壳很大、正文很薄 → kq 必须低
  put('c-thin', narrative('### 场景（触发）\n短。', 8000));
  put('p-thin', '# 会话\n\n短。');
  store._persist();
  await K.kespiStep(store, {});
  const sc = (id) => { const s = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? Number(r.kq) : null; };
  ac('AC-1 薄叙事不被 JSON 外壳抬分（≤ 同长度纯文本 + 0.1）',
    sc('c-thin') != null && sc('c-thin') <= sc('p-thin') + 0.1,
    JSON.stringify({ narrative: sc('c-thin'), plain: sc('p-thin') }));

  // AC-2 正文够厚 → 读数正常上升
  put('c-rich', narrative('### 场景（触发）\n' + '甲'.repeat(400) + '\n\n### 产出\n' + '乙'.repeat(400), 10));
  put('p-rich', '# 会话\n\n' + '甲'.repeat(400) + '乙'.repeat(400));
  store._persist();
  await K.kespiStep(store, {});
  ac('AC-2 厚叙事读数与同长度纯文本相当（差 ≤ 0.15）',
    sc('c-rich') != null && Math.abs(sc('c-rich') - sc('p-rich')) <= 0.15,
    JSON.stringify({ narrative: sc('c-rich'), plain: sc('p-rich') }));

  // AC-3 坏 JSON / 无 markdown → 退回原串，不抛
  put('c-bad', '{"format":"capability-narrative-v1", broken');
  put('c-nomd', JSON.stringify({ format: N.FORMAT, turns: [] }));
  store._persist();
  await K.kespiStep(store, {});
  const ok3 = sc('c-bad') != null && sc('c-nomd') != null;
  ac('AC-3 坏 JSON / 缺 markdown 退回原串不抛', ok3, JSON.stringify({ bad: sc('c-bad'), nomd: sc('c-nomd') }));

  // AC-4 三源纯文本实体读数不变（回归口径）
  put('p-reg', '# 会话\n\n## 内容\n\n' + '丙'.repeat(800));
  store._persist();
  await K.kespiStep(store, {});
  const reg = sc('p-reg');
  ac('AC-4 非叙事实体读数不受影响', reg != null && reg >= 0.5, JSON.stringify({ kq: reg }));

  // AC-5 取正文是纯函数
  const a = K.narrativeBody ? K.narrativeBody(narrative('正文', 10)) : null;
  const b = K.narrativeBody ? K.narrativeBody(narrative('正文', 10)) : null;
  ac('AC-5 narrativeBody 纯函数且取 markdown', a === '正文' && a === b, JSON.stringify({ a }));

  console.log(`\n----- 6.29 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
