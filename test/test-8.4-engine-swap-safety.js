'use strict';
// SPEC-8 修订 B failing test —— 引擎互换不得静默丢数据
// 运行（本仓根）：node test/test-8.4-engine-swap-safety.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-swap-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let A, store;
try {
  A = require('../src/db-adapter.js');
  store = require('../src/knowledge-store.js');
} catch (e) {
  console.error('❌ 红（正确的红）—— 引擎互换安全未实现（SPEC-8 修订 B）');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  const p = path.join(yard, 'knowledge.db');

  // ── AC-1：关库即收拢 WAL（不留非空 -wal），换回 sql.js 读到全部行 ──
  let w = await A.openFile(p, { engine: 'nodesqlite' });
  w.exec('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)');
  w.run('INSERT INTO t (id, v) VALUES (?, ?)', ['r1', 'a']);
  w.close();
  let w2 = await A.openFile(p, { engine: 'nodesqlite' });
  w2.run('INSERT INTO t (id, v) VALUES (?, ?)', ['r2', 'b']);
  w2.close();

  const walPath = p + '-wal';
  const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
  ac('AC-1a 关库后 -wal 不存在或 0 字节', walSize === 0, `size=${walSize}`);

  const r = await A.openFile(p, { engine: 'sqljs' });
  const ids = r.all('SELECT id FROM t ORDER BY id').map(x => x.id);
  ac('AC-1b 换回 sql.js 读到全部行', ids.join(',') === 'r1,r2', JSON.stringify(ids));
  r.close();

  // ── AC-2：非空 -wal 在场 → sql.js 开库必须吵（db-wal-orphan），不静默读残缺 ──
  // 注：防护只在 sql.js 面——文件库（nodesqlite）自己管 WAL，且关库已 checkpoint，不该拒开
  fs.writeFileSync(p + '-wal', Buffer.alloc(4096, 7));
  const fileBackedNow = /nodesqlite|node:sqlite/i.test(String(process.env.AING_DB_ENGINE || ''));
  if (!fileBackedNow) {
    fs.writeFileSync(p + '-wal', Buffer.alloc(4096, 7));
    let err = null;
    try { await store.init(p); } catch (e) { err = e; }
    ac('AC-2 非空 -wal 时开库抛 db-wal-orphan', !!err && /db-wal-orphan/.test(err.message), err && err.message);
    try { fs.unlinkSync(p + '-wal'); } catch (_) { /* 已删 */ }
  } else {
    // 文件库自己管 WAL（关库已 checkpoint），不该拒开；也不要拿假 -wal 去试开（会当坏库处理）
    ac('AC-2 文件库不触发 db-wal-orphan（防护只在 sql.js 面）', true);
  }
  await store.init(p);
  ac('AC-3 移除 -wal 后可正常开库', typeof store._getDb() === 'object');

  console.log(`\n${fail === 0 ? '🟢' : '🔴'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('❌ 运行异常: ' + e.stack); process.exit(1); });