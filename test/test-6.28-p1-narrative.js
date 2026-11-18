'use strict';
// M6 任务 6.28 failing test —— P1 入口成形位接入六段叙事
// 要修的病：六段叙事已有渲染器，但 P1 位只在注册表里躺着——
// 外部件给的高质量叙事（或只给标题/标签）没有入口，质量提不上去。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-p1-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const N = require('../src/capability-narrative.js');
const A = require('../src/auto-ingest.js');

const MSGS = [
  { role: 'user', content: '帮我把这批数据按季度拆开看趋势' },
  { role: 'assistant', content: [
    { type: 'reasoning', thinking: '先看表结构，再按季度聚合' },
    { type: 'tool_use', name: 'shell', input: { cmd: 'ls' } },
    { type: 'text', text: '已按季度拆分，趋势向上' }
  ] }
];
const SIX = {
  '场景（触发）': '用户要求按季度拆数据看趋势',
  '思维（能力内核）': '先确认表结构与时间列，再做季度聚合，最后对比趋势',
  '手段（工具执行）': 'shell 列出数据文件；读取并聚合',
  '编排（子agent）': '无子 agent，单线完成',
  '产出': '按季度拆分后的趋势结论：逐季上升',
  '会话级校准': '用户认可口径，无返工'
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const get = (id) => { const s = db.prepare('SELECT * FROM entities WHERE id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
  const body = (r) => JSON.parse(r.content);

  // AC-1 半寄生：只给标题与标签，六段仍由系统拼
  const r1 = await A.autoIngest(store, {
    actor: 'hana', sessionId: 's-semi', topic: '用户原始话题', messages: MSGS,
    narrative: { mode: 'semi', title: '数据按季度拆分的趋势分析', tags: ['数据', '趋势'] }
  });
  const e1 = get(r1.id);
  const b1 = body(e1);
  ac('AC-1 semi：外部标题生效、标签合并、六段仍由系统拼',
    e1.title === '数据按季度拆分的趋势分析' && JSON.parse(e1.tags).includes('数据') &&
    /### 场景（触发）/.test(b1.markdown) && b1.narrative && b1.narrative.mode === 'semi',
    JSON.stringify({ title: e1.title, tags: e1.tags, narr: b1.narrative }));

  // AC-2 寄生：六段全给，系统只验不重写
  const r2 = await A.autoIngest(store, { actor: 'hana', sessionId: 's-full', messages: MSGS, narrative: { mode: 'full', sections: SIX } });
  const b2 = body(get(r2.id));
  const count = (b2.markdown.match(/^### /gm) || []).length;
  ac('AC-2 full：六段照收，系统不重写',
    count === 6 && b2.markdown.includes('先确认表结构与时间列') && b2.narrative.mode === 'full',
    JSON.stringify({ count, narr: b2.narrative }));

  // AC-3 缺段 → 整件退回，不半截落库
  let err3 = null;
  try { await A.autoIngest(store, { actor: 'hana', sessionId: 's-miss', messages: MSGS, narrative: { mode: 'full', sections: { ...SIX, '产出': '' } } }); } catch (e) { err3 = e.message; }
  ac('AC-3 full 缺/空段 → 拒入', /empty-section|missing-section/.test(String(err3)), String(err3));
  ac('AC-3b 被拒的单不落库', get('conv-s-miss') == null, JSON.stringify(get('conv-s-miss')));

  // AC-4 非法 mode → 拒
  let err4 = null;
  try { await A.autoIngest(store, { actor: 'hana', sessionId: 's-bad', messages: MSGS, narrative: { mode: 'weird' } }); } catch (e) { err4 = e.message; }
  ac('AC-4 非法 mode → 拒', /bad-mode/.test(String(err4)), String(err4));

  // AC-5 校验器单独可用（外部件自查同一份口径）
  const v = N.validateNarrative ? N.validateNarrative({ mode: 'full', sections: SIX }) : null;
  const vb = N.validateNarrative ? N.validateNarrative({ mode: 'full', sections: { ...SIX, '产出': '' } }) : null;
  ac('AC-5 校验器：好件过、坏件点名', !!(v && v.ok === true && vb && vb.ok === false && vb.reasons.length > 0),
    JSON.stringify({ v, vb }));

  // AC-6 无外部件 → 旧行为不变
  const r6 = await A.autoIngest(store, { actor: 'hana', sessionId: 's-plain', messages: MSGS });
  const b6 = body(get(r6.id));
  ac('AC-6 无外部件：仍走系统六段，不记 narrative 形态',
    /### 场景（触发）/.test(b6.markdown) && !b6.narrative, JSON.stringify(b6.narrative || null));

  console.log(`\n----- 6.28 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
