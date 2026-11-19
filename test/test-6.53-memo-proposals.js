'use strict';
// M6 任务 6.53 failing test —— 提案单进 memo 视野（SPEC-6.53）
// 要修的病：memo 只把在途工单数成一个 backlog 数字，20 张提案单指向谁、要什么，主驾看不到。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-memo-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const { buildMemo } = require('../src/memo.js');

(async () => {
  const dbp = path.join(yard, 'k.db');
  await store.init(dbp);
  const db = store._getDb();

  // 提案单 3 张 + 其他状态各 1 张
  const mk = (id, status, score, dim, target, demand) => {
    const ev = demand == null ? '{}' : JSON.stringify({ reason: 'proposal-only', demand });
    db.run(`INSERT INTO opt_tickets (id, entity_id, dim, kind, action, score, status, evidence_json, created_at)
            VALUES (?, ?, ?, 'kespi', 'memo-card', ?, ?, ?, CURRENT_TIMESTAMP)`, [id, target, dim, score, status, ev]);
  };
  mk('t1', 'proposed', 0.20, 'kq', 'ent-a', { want: '补足正文与标签', ttlRounds: 3 });
  mk('t2', 'proposed', 0.10, 'ka', 'ent-b', { want: '重新激活或体面退场', ttlRounds: 3 });
  mk('t3', 'proposed', 0.30, 'kd', 'ent-c', null);          // 无 demand → want null
  mk('t4', 'open', 0.05, 'kq', 'ent-d', { want: '未路由的' });
  mk('t5', 'dispatched', 0.05, 'kd', 'ent-e', { want: '已派' });
  mk('t6', 'verified', 0.05, 'kq', 'ent-f', { want: '已验收' });
  store._persist();

  const before = { m: fs.statSync(dbp).mtimeMs, s: fs.statSync(dbp).size };

  // ── AC-1 ──
  const m1 = await buildMemo(store, {});
  const props = (m1 && m1.user && m1.user.proposals) || null;
  ac('AC-1 3 张 proposed → proposals 3 条且字段齐',
    Array.isArray(props) && props.length === 3 &&
    props.every(p => p.id && p.dim && p.target != null && 'want' in p && p.score != null),
    JSON.stringify(props));

  // ── AC-2 ──
  const t3 = (props || []).find(p => p.id === 't3');
  const t1 = (props || []).find(p => p.id === 't1');
  ac('AC-2 want 来自 demand.want，无 demand 为 null',
    !!t1 && t1.want === '补足正文与标签' && !!t3 && t3.want === null,
    JSON.stringify({ t1, t3 }));

  // ── AC-3 ──
  const ids = new Set((props || []).map(p => p.id));
  ac('AC-3 只出 proposed（open/dispatched/verified 不列）',
    !ids.has('t4') && !ids.has('t5') && !ids.has('t6'), JSON.stringify([...ids]));

  // ── AC-4 ──
  const m2 = await buildMemo(store, { proposalsLimit: 2 });
  const props2 = (m2 && m2.user && m2.user.proposals) || [];
  ac('AC-4 proposalsLimit 生效（2 条，最差分数先）',
    props2.length === 2 && props2[0].id === 't2', JSON.stringify(props2.map(p => p.id)));

  // ── AC-5 纯读 ──
  const after = { m: fs.statSync(dbp).mtimeMs, s: fs.statSync(dbp).size };
  ac('AC-5 纯读：库 mtime/size 不变',
    before.m === after.m && before.s === after.s, JSON.stringify({ before, after }));

  // ── AC-6 无提案 ──
  db.run("UPDATE opt_tickets SET status = 'verified' WHERE status = 'proposed'");
  store._persist();
  const m3 = await buildMemo(store, {});
  const props3 = (m3 && m3.user && m3.user.proposals) || null;
  ac('AC-6 无提案 → []（不伪造占位）', Array.isArray(props3) && props3.length === 0, JSON.stringify(props3));

  console.log(`\n----- 6.53 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
