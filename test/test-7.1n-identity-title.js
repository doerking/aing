'use strict';
// M7 任务 7.1n failing test —— 锁 SPEC-7.1 AC-1/AC-2 的落地口径
// 契约（SPEC-7.1 §2.1/§2.2）：
//   身份 id=序列号，永不变；name 列语义降为「序列号副本」；title 独立成列、由正文派生、永不入键；
//   同内容重投返原号；改正文＝新序列号 + 旧档 invalid_at/invalid_reason 指新号，不覆盖不物理删。
// 另锁一条显示口径：会话卡的展示标题取正文/话题，不裸露时间戳或 sessionId。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-idtitle-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const ID = require('../src/identity.js');

(async () => {
  const DB = path.join(yard, 'knowledge.db');
  await store.init(DB);
  const cols = store.columns('entities');

  ac('AC-1 title 独立成列', cols.includes('title'), JSON.stringify(cols.slice(0, 20)));

  // AC-2 新入库：name = 序列号副本（等于 id），title = 正文派生
  const body = '三三制攻防学说草案 v0 落档：三面合拢，三轴判定不变。';
  const r1 = ID.ingestEntity(store, { content: body, type: 'Concept' });
  const e1 = store.getEntity(r1.id);
  ac('AC-2 新入库 name=序列号、title 由正文派生',
    /^e-\d{8}-\d{4}$/.test(r1.id) && e1.name === r1.id &&
    typeof e1.title === 'string' && e1.title.length > 0 && body.startsWith(e1.title.slice(0, 10)),
    JSON.stringify({ id: r1.id, name: e1.name, title: e1.title }));

  // AC-3 同内容重投：返原号，不落新行，不新开序列
  const before = store.getEntity(r1.id);
  const r2 = ID.ingestEntity(store, { content: body, type: 'Concept' });
  const after = store.getEntity(r1.id);
  ac('AC-3 同内容重投返原号',
    r2.id === r1.id && r2.deduped === true &&
    before.title === after.title && before.name === after.name,
    JSON.stringify({ r2, title: after.title }));

  // AC-4 修订：新序列号 + 旧档 invalid_at 与 invalid_reason 指新号；新行 title 随内容变
  const newBody = '三三制攻防学说草案 v1 落档：合并三面，轴判定改两态。';
  let rev = null;
  try { rev = ID.reviseEntity(store, { id: r1.id, content: newBody, reason: 'v1 定稿' }); } catch (e) { rev = { error: e.message }; }
  const oldRow = store.getEntity(r1.id);
  const newRow = rev && rev.id ? store.getEntity(rev.id) : null;
  ac('AC-4 修订走新序列号、旧档作废（不覆盖不物理删）',
    !!rev && !rev.error && /^e-\d{8}-\d{4}$/.test(rev.id) && rev.id !== r1.id &&
    !!oldRow && oldRow.invalid_at != null && String(oldRow.invalid_reason || '').includes(rev.id) &&
    oldRow.content === body &&
    !!newRow && newRow.content === newBody && newRow.name === rev.id &&
    typeof newRow.title === 'string' && /v1/.test(newRow.title),
    JSON.stringify({ rev, old: oldRow && { invalid_at: oldRow.invalid_at, reason: oldRow.invalid_reason, content: oldRow.content.slice(0, 12) }, neu: newRow && { name: newRow.name, title: newRow.title } }));

  // AC-5 修订同内容：不新开号（先按指纹判）
  let again = null;
  try { again = ID.reviseEntity(store, { id: rev.id, content: newBody }); } catch (e) { again = { error: e.message }; }
  ac('AC-5 修订但内容未变 → 不新开号',
    again && again.deduped === true && again.id === rev.id,
    JSON.stringify(again));

  // AC-6 显示口径：会话卡标题取话题/正文，不裸露 sessionId 或时间戳
  const S = require('../src/session-ingest.js');
  const sid = '2026-11-05T20-57-03Z-abc123';
  const s1 = await S.ingestSession(store, { sessionId: sid, reply: '意识神经缺口工单已就绪，W1-W12 全部落档。', at: '2026-11-05T20:57:03Z' });
  const c1 = store.getEntity(s1.id);
  ac('AC-6 会话卡 name=序列号、title 取自正文且不含时间戳/sessionId',
    c1.name === s1.id && typeof c1.title === 'string' && c1.title.length > 0 &&
    !/\d{4}-\d{2}-\d{2}/.test(c1.title) && !c1.title.includes(sid) && !c1.title.startsWith('会话 '),
    JSON.stringify({ id: s1.id, name: c1.name, title: c1.title }));

  console.log(`\n----- 7.1n pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
