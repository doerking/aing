'use strict';
// M6 任务 6.47 failing test —— 冷启动初始化（SPEC-6.47）
// 要修的病：新机器部署没有建目录工具，compile 找不到 raw/ 就静默扫 0 档，没人报错。
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-init-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let B = null;
try { B = require('../src/bootstrap.js'); } catch (_) { B = null; }
const store = require('../src/knowledge-store.js');
const call = (root, dbPath) => (B && typeof B.initWorkspace === 'function' ? B.initWorkspace({ root, dbPath, store }) : null);

(async () => {
  // ── AC-1 空目录初跑 ──
  const r1 = path.join(yard, 'ws1');
  fs.mkdirSync(r1, { recursive: true });
  await store.init(path.join(r1, 'data', 'knowledge.db'));
  const rep1 = await call(r1);
  const dirs1 = ['raw', 'raw/inbox', 'data', 'archive'].map(d => fs.existsSync(path.join(r1, d)));
  const tables1 = store.listTables().length;
  const seen1 = new Set([...(rep1 && rep1.created) || [], ...(rep1 && rep1.existing) || []]);
  ac('AC-1 空目录初跑：四目录齐 + 库建表 ≥20 + 报告含四项',
    !!rep1 && rep1.ok === true && dirs1.every(Boolean) && tables1 >= 20 &&
    ['raw/', 'raw/inbox/', 'data/', 'archive/'].every(d => seen1.has(d)),
    JSON.stringify({ rep1, dirs1, tables1 }));

  // ── AC-2 幂等 ──
  const rep2 = await call(r1);
  ac('AC-2 幂等：二跑 created 空、existing 齐、表数不变',
    !!rep2 && Array.isArray(rep2.created) && rep2.created.length === 0 &&
    ['raw/', 'data/', 'archive/'].every(d => rep2.existing.includes(d)) &&
    store.listTables().length === tables1,
    JSON.stringify({ rep2, tables2: store.listTables().length }));

  // ── AC-3 既有文件不动 ──
  const notePath = path.join(r1, 'raw', 'note.md');
  const noteText = '# 既有原稿\n\n逐字不动。\n';
  fs.mkdirSync(path.dirname(notePath), { recursive: true });
  fs.writeFileSync(notePath, noteText);
  await call(r1);
  ac('AC-3 既有文件逐字不变', fs.readFileSync(notePath, 'utf8') === noteText, 'file changed');

  // ── AC-4 root 不存在 → root-missing，事后仍不存在 ──
  const ghost = path.join(yard, 'no-such-root');
  let e4 = null; try { await call(ghost); } catch (e) { e4 = e; }
  ac('AC-4 root 不存在抛 root-missing 且不建目录',
    !!e4 && /^root-missing/.test(e4.message) && !fs.existsSync(ghost), e4 && e4.message);

  // ── AC-5 root 是文件 → root-not-dir ──
  const fileRoot = path.join(yard, 'a-file');
  fs.writeFileSync(fileRoot, 'x');
  let e5 = null; try { await call(fileRoot); } catch (e) { e5 = e; }
  ac('AC-5 root 是文件抛 root-not-dir', !!e5 && /^root-not-dir/.test(e5.message), e5 && e5.message);

  // ── AC-6 dbPath 覆盖到不存在的子目录 ──
  const r6 = path.join(yard, 'ws6');
  fs.mkdirSync(r6, { recursive: true });
  const db6 = path.join(r6, 'nested', 'deep', 'k.db');
  await store.init(db6);
  const rep6 = await call(r6, db6);
  ac('AC-6 dbPath 覆盖：父目录建齐、库在位',
    !!rep6 && fs.existsSync(db6) && fs.existsSync(path.join(r6, 'nested', 'deep')) &&
    rep6.db && path.resolve(rep6.db.path) === path.resolve(db6),
    JSON.stringify({ rep6, exists: fs.existsSync(db6) }));

  // ── AC-7 CLI ──
  const r7 = path.join(yard, 'ws7'); fs.mkdirSync(r7, { recursive: true });
  const cli = path.join(__dirname, '..', 'tools', 'init-kb.js');
  const a7 = spawnSync(process.execPath, [cli, '--root', r7, '--json'], { encoding: 'utf8', timeout: 60000 });
  let j7 = null; try { j7 = JSON.parse(a7.stdout); } catch (_) { j7 = null; }
  const b7 = spawnSync(process.execPath, [cli, '--json'], { encoding: 'utf8', timeout: 60000 });
  ac('AC-7 CLI：--root 出 JSON exit 0；无 --root exit 2',
    a7.status === 0 && !!j7 && j7.ok === true && fs.existsSync(path.join(r7, 'raw')) && b7.status === 2,
    JSON.stringify({ a: a7.status, json: !!j7, b: b7.status, err: (a7.stderr || '').slice(0, 200) }));

  console.log(`\n----- 6.47 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
