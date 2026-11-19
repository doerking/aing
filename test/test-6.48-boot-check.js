'use strict';
// M6 任务 6.48 failing test —— 开机自检（SPEC-6.48）
// 要修的病：部署完没有一条命令能回答「这台机器上 aing-v2 活没活」。
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-boot-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let B = null;
try { B = require('../src/boot-check.js'); } catch (_) { B = null; }
const store = require('../src/knowledge-store.js');
const check = (root, dbPath, s) => (B && typeof B.bootCheck === 'function' ? B.bootCheck({ root, dbPath, store: s || store }) : null);
const lv = (rep, id) => (rep && Array.isArray(rep.checks) ? (rep.checks.find(c => c.id === id) || {}).level : undefined);

(async () => {
  // 造一个健康工作区
  const ws = path.join(yard, 'healthy');
  for (const d of ['raw', 'raw/inbox', 'data', 'archive']) fs.mkdirSync(path.join(ws, d), { recursive: true });
  const dbp = path.join(ws, 'data', 'knowledge.db');
  await store.init(dbp);

  // ── AC-1 健康 ──
  const r1 = check(ws, dbp);
  ac('AC-1 健康工作区：verdict ok，四项全 ok',
    !!r1 && r1.verdict === 'ok' && r1.ok === true &&
    ['root', 'dirs', 'db', 'schema', 'writable'].every(id => lv(r1, id) === 'ok'),
    JSON.stringify(r1));

  // ── AC-2 缺 raw/ → degraded ──
  const ws2 = path.join(yard, 'no-raw');
  for (const d of ['data', 'archive']) fs.mkdirSync(path.join(ws2, d), { recursive: true });
  await store.init(path.join(ws2, 'data', 'knowledge.db'));
  const r2 = check(ws2, path.join(ws2, 'data', 'knowledge.db'));
  ac('AC-2 缺 raw/ → dirs warn、verdict degraded、ok true',
    !!r2 && lv(r2, 'dirs') === 'warn' && r2.verdict === 'degraded' && r2.ok === true,
    JSON.stringify(r2));

  // ── AC-3 库文件不存在 → broken ──
  const ws3 = path.join(yard, 'no-db');
  for (const d of ['raw', 'raw/inbox', 'data', 'archive']) fs.mkdirSync(path.join(ws3, d), { recursive: true });
  const r3 = check(ws3, path.join(ws3, 'data', 'knowledge.db'));
  ac('AC-3 库不存在 → db fail、verdict broken、ok false',
    !!r3 && lv(r3, 'db') === 'fail' && r3.verdict === 'broken' && r3.ok === false,
    JSON.stringify(r3));

  // ── AC-4 纯读 ──
  const before = { mtime: fs.statSync(dbp).mtimeMs, size: fs.statSync(dbp).size, listing: fs.readdirSync(ws).sort().join(',') };
  check(ws, dbp); check(ws, dbp);
  const after = { mtime: fs.statSync(dbp).mtimeMs, size: fs.statSync(dbp).size, listing: fs.readdirSync(ws).sort().join(',') };
  ac('AC-4 纯读：库 mtime/size 与目录清单不变',
    before.mtime === after.mtime && before.size === after.size && before.listing === after.listing,
    JSON.stringify({ before, after }));

  // ── AC-5 缺表 → schema fail ──
  const fake = { listTables: () => ['entities'], _getDb: () => store._getDb() };
  const r5 = check(ws, dbp, fake);
  const d5 = (r5 && (r5.checks || []).find(c => c.id === 'schema') || {}).detail || '';
  ac('AC-5 缺表 → schema fail 且列出缺表名',
    !!r5 && lv(r5, 'schema') === 'fail' && /links/.test(d5) && /config/.test(d5),
    JSON.stringify({ r5, d5 }));

  // ── AC-6 CLI ──
  const cli = path.join(__dirname, '..', 'tools', 'boot-check.js');
  const a6 = spawnSync(process.execPath, [cli, '--root', ws, '--db', dbp, '--json'], { encoding: 'utf8', timeout: 60000 });
  let j6 = null; try { j6 = JSON.parse(a6.stdout); } catch (_) { j6 = null; }
  const b6 = spawnSync(process.execPath, [cli, '--root', path.join(yard, 'ghost'), '--json'], { encoding: 'utf8', timeout: 60000 });
  ac('AC-6 CLI：健康 exit 0 JSON 可解析；坏 root exit 4',
    a6.status === 0 && !!j6 && j6.verdict === 'ok' && b6.status === 4,
    JSON.stringify({ a: a6.status, j: !!j6, b: b6.status, err: (a6.stderr || '').slice(0, 160) }));

  // ── AC-7 七项齐 ──
  const ids = new Set(((r1 && r1.checks) || []).map(c => c.id));
  ac('AC-7 七项体检 id 齐',
    ['root', 'dirs', 'db', 'schema', 'writable', 'content', 'raw-pending'].every(id => ids.has(id)),
    JSON.stringify([...ids]));

  console.log(`\n----- 6.48 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
