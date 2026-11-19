'use strict';
// M6 任务 6.50 failing test —— meko-bridge（SPEC-6.50）
// 要修的病：旧院每天在用的物业回单面（差量信号 + 回单队列）在 v2 只剩边界重述、没有实现。
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-bridge-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let B = null;
try { B = require('../src/meko-bridge.js'); } catch (_) { B = null; }
const store = require('../src/knowledge-store.js');
const rows = (sql, binds = []) => { try { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; } catch (_) { return []; } };
const PUB = (sigs) => (B && typeof B.publishSignals === 'function' ? B.publishSignals(store, sigs) : null);
const SUB = (ret) => (B && typeof B.submitReturn === 'function' ? B.submitReturn(store, ret) : null);
const SUM = (opts) => (B && typeof B.summarize === 'function' ? B.summarize(store, opts) : null);
const VER = (fp, o) => (B && typeof B.verifyReturn === 'function' ? B.verifyReturn(store, fp, o) : null);

(async () => {
  const dbp = path.join(yard, 'k.db');
  await store.init(dbp);

  // ── AC-1 信号幂等 ──
  const sig = { face: 'kespi', code: 'kq-low', target: 'ent-a', round: 14 };
  const p1 = PUB([sig]);
  const p2 = PUB([sig]);
  const n1 = (rows('SELECT COUNT(*) c FROM bridge_signals')[0] || {}).c;
  ac('AC-1 同信号二发：sent 1 → skipped 1、表内 1 行',
    !!p1 && p1.sent === 1 && !!p2 && p2.sent === 0 && p2.skipped === 1 && n1 === 1,
    JSON.stringify({ p1, p2, n1 }));

  // ── AC-2 换 target / round 各落一行 ──
  const p3 = PUB([{ face: 'kespi', code: 'kq-low', target: 'ent-b', round: 14 }, { face: 'kespi', code: 'kq-low', target: 'ent-a', round: 15 }]);
  const n2 = (rows('SELECT COUNT(*) c FROM bridge_signals')[0] || {}).c;
  ac('AC-2 换 target / round 各落一行', !!p3 && p3.sent === 2 && n2 === 3, JSON.stringify({ p3, n2 }));

  // ── AC-3 回单落 pending-verify + 重复提交 ──
  const ret = { headId: 'head-feedback-loop', payload: { summary: '这是一条回单摘要，长度控制在一行之内。' }, returnedAt: '2026-11-19T10:00:00.000Z' };
  const s1 = SUB(ret);
  const s2 = SUB(ret);
  const rrow = rows('SELECT * FROM bridge_returns');
  ac('AC-3 回单 pending-verify + 同 fp 重复不重复入库',
    !!s1 && s1.ok === true && s1.status === 'pending-verify' && !!s2 && s2.duplicate === true &&
    rrow.length === 1 && rrow[0].status === 'pending-verify',
    JSON.stringify({ s1, s2, n: rrow.length }));

  // ── AC-4 纯读 ──
  const before = { m: fs.statSync(dbp).mtimeMs, s: fs.statSync(dbp).size };
  const sum1 = SUM({ now: Date.parse('2026-11-19T12:00:00.000Z') });
  const after = { m: fs.statSync(dbp).mtimeMs, s: fs.statSync(dbp).size };
  ac('AC-4 summarize 纯读：pending 不进 verified 列表、库 mtime/size 不变',
    !!sum1 && sum1.pending === 1 && sum1.verified.length === 0 &&
    before.m === after.m && before.s === after.s,
    JSON.stringify({ sum1, before, after }));

  // ── AC-5 核单 ──
  const v1 = VER((s1 && s1.fp) || 'no-such-fp', { ok: true });
  const sum2 = SUM({ now: Date.parse('2026-11-19T12:00:00.000Z') });
  const item = (sum2 && sum2.verified[0]) || {};
  ac('AC-5 核过进 verified：summary 截 60 字、层归 consciousness',
    !!v1 && v1.ok === true && v1.status === 'verified' && sum2.pending === 0 &&
    sum2.verified.length === 1 && item.layer === 'consciousness' && item.summary.length > 0 && item.summary.length <= 60,
    JSON.stringify({ v1, sum2 }));

  // ── AC-6 stalePending ──
  SUB({ headId: 'head-gap-detector', payload: { summary: '路由层回单' }, returnedAt: '2026-11-17T00:00:00.000Z' });
  const sum3 = SUM({ now: Date.parse('2026-11-19T12:00:00.000Z') });
  ac('AC-6 超时未核计 stalePending 并给出滞留小时数',
    !!sum3 && sum3.stalePending === 1 && sum3.staleHours >= 60,
    JSON.stringify({ stale: sum3 && sum3.stalePending, hours: sum3 && sum3.staleHours }));

  // ── AC-7 分层：own 只出当前截面 ──
  const sum4 = SUM({ now: Date.parse('2026-11-19T12:00:00.000Z'), ownLayer: 'consciousness' });
  ac('AC-7 分层：own 只出 consciousness，其他层有计数',
    !!sum4 && !!sum4.own && sum4.own.verified.length === 1 && sum4.own.pending === 0 &&
    !!sum4.layers && sum4.layers.routing && sum4.layers.routing.pending === 1,
    JSON.stringify({ own: sum4 && sum4.own, layers: sum4 && sum4.layers }));

  // ── AC-8 CLI ──
  const cli = path.join(__dirname, '..', 'tools', 'bridge.js');
  const st = spawnSync(process.execPath, [cli, 'status', '--db', dbp, '--json'], { encoding: 'utf8', timeout: 60000 });
  let j = null; try { j = JSON.parse(st.stdout); } catch (_) { j = null; }
  const bad = spawnSync(process.execPath, [cli], { encoding: 'utf8', timeout: 60000 });
  ac('AC-8 CLI：status --json 可解析；裸跑 exit 2',
    st.status === 0 && !!j && j.pending === 1 && bad.status === 2,
    JSON.stringify({ st: st.status, pending: j && j.pending, bad: bad.status, err: (st.stderr || '').slice(0, 160) }));

  console.log(`\n----- 6.50 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
