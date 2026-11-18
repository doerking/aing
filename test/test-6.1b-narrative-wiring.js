'use strict';
// M6 任务 6.1b failing test —— 锁 SPEC-6.1 修订 A（六段叙事接线）
// 口径：autoIngest 按载荷形状分流——有 messages 走六段，否则走三源；
//       同号 conv-<sessionId> 先到先得；name=id、title 由话题/首句派生且不含时间戳；
//       身份闸与缺料拒入照旧。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-narrwire-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const A = require('../src/auto-ingest.js');
const N = require('../src/capability-narrative.js');

const MESSAGES = [
  { role: 'user', content: '跑一下文档投喂试用，看检索是否答非所问。' },
  {
    role: 'assistant', content: [
      { type: 'reasoning', text: '先复现再改：隔离库跑 compile→import→vector。' },
      { type: 'text', text: '先建隔离库，再量八条查询。' },
      { type: 'tool_use', id: 'call-1', name: 'Bash', input: { command: 'node trial.js' } },
      { type: 'tool_use', id: 'call-2', name: 'agent', input: { prompt: '并行查文档口径' } }
    ]
  },
  { role: 'tool', content: [{ type: 'tool_result', content: 'compile 18 实体 / vector 36 条' }] }
];

const CALIBS = [
  { time: 1, type: 'approval', summary: '审批通过 Bash', target: { callId: 'call-1', toolName: 'Bash' } },
  { time: 2, type: 'feedback', summary: '不要用真库试，隔离库跑' }
];

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));

  // AC-1 六段走真实入口入库
  let r1 = {};
  try { r1 = await A.autoIngest(store, { actor: 'hana', sessionId: 'nw1', topic: '文档投喂试用', messages: MESSAGES, calibrations: CALIBS }); }
  catch (e) { r1 = { error: e.message }; }
  const e1 = store.getEntity('conv-nw1');
  let c1 = {};
  try { const p1 = JSON.parse(e1 && e1.content); if (p1 && typeof p1 === 'object') c1 = p1; } catch (_) {}
  ac('AC-1 六段经 autoIngest 落库（route/format/六段齐）',
    r1.route === 'narrative' && r1.ingested === true && !!e1 && c1.format === N.FORMAT &&
      ['场景（触发）', '思维（能力内核）', '手段（工具执行）', '编排（子agent）', '产出', '会话级校准']
        .every((s) => String(c1.markdown || '').includes(s)),
    JSON.stringify({ route: r1.route, ingested: r1.ingested, format: c1.format }));

  // AC-2 身份面：name=id，title 派生且不裸露 sessionId/时间戳
  const title = String((e1 && e1.title) || '');
  ac('AC-2 name=id、title 派生且不含时间戳',
    e1 && e1.name === e1.id && title.trim() !== '' && !/conv-|nw1|\d{4}-\d{2}-\d{2}T/.test(title),
    JSON.stringify({ name: e1 && e1.name, id: e1 && e1.id, title }));

  // AC-3 同会话再来（六段）→ skipped
  let r2 = {};
  try { r2 = await A.autoIngest(store, { actor: 'hana', sessionId: 'nw1', messages: MESSAGES }); } catch (e) { r2 = { error: e.message }; }
  ac('AC-3 同会话六段重复投 → skipped', r2.skipped === true, JSON.stringify(r2));

  // AC-4 三源形状仍走旧路（回归）
  let r3 = {};
  try { r3 = await A.autoIngest(store, { actor: 'hana', sessionId: 'nw2', topic: '三源回归', reply: '这是回复', searchShown: ['检索展示'], rationale: '事由' }); } catch (e) { r3 = { error: e.message }; }
  const e3 = store.getEntity('conv-nw2');
  ac('AC-4 三源形状仍走旧路（route=three-source）',
    r3.route === 'three-source' && r3.ingested === true && !!e3,
    JSON.stringify({ route: r3.route, ingested: r3.ingested }));

  // AC-5 双形同号：先三源后六段 → 六段 skipped，不覆盖
  let r4 = {};
  try { r4 = await A.autoIngest(store, { actor: 'hana', sessionId: 'nw2', messages: MESSAGES }); } catch (e) { r4 = { error: e.message }; }
  let c4 = {};
  try { const e4 = store.getEntity('conv-nw2'); const p4 = JSON.parse(e4 && e4.content); if (p4 && typeof p4 === 'object') c4 = p4; } catch (_) {}
  ac('AC-5 双形同号先到先得（后到 skipped，内容不被覆盖）',
    r4.skipped === true && c4.format !== N.FORMAT,
    JSON.stringify({ skipped: r4.skipped, format: c4.format }));

  // AC-6 身份闸照旧
  let denied = '';
  try { await A.autoIngest(store, { actor: 'someone-else', sessionId: 'nw3', messages: MESSAGES }); }
  catch (e) { denied = e.message; }
  ac('AC-6 非 hana 写入被拒', /actor|forbidden|denied|identity-rejected/i.test(String(denied)), denied);

  // AC-7 缺料拒入（有 messages 但为空数组 → 落回三源并因缺 reply 拒）
  let empty = '';
  try { await A.autoIngest(store, { actor: 'hana', sessionId: 'nw4', messages: [] }); }
  catch (e) { empty = e.message; }
  ac('AC-7 空 messages 不当六段（回落三源，缺 reply 拒入）', /reply-required/.test(String(empty)), empty);

  console.log(`\n----- 6.1b pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
