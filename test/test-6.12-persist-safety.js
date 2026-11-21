'use strict';
// M6 任务 6.12 failing test —— 锁 SPEC-6.12 落盘安全 AC-1~6
// 本件测嘅系 sqljs persist 专属语义（AC-1 原子 tmp→rename、AC-4 外部改写 db-stale）——
// 文件库（nodesqlite）下呢两个机制「属设计而非缺口」（SPEC-8 修订 A 补充），故强制 sqljs。
process.env.AING_DB_ENGINE = 'sqljs';
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawn, spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-wal-'));
process.on('exit', () => {
  delete process.env.AING_DB_CAP_BYTES; delete process.env.AING_DB_CAP_ALLOW; delete process.env.AING_DB_LOCK_STALE_MS;
  try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
});
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const DB = path.join(yard, 'knowledge.db');
const LOCK = DB + '.lock';
const tmps = () => fs.readdirSync(yard).filter(f => f.includes('.tmp'));
const err = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const rows = (db, sql) => { const s = db.prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(DB);
  store.insertEntity({ id: 'e1', name: '一', type: 'Concept', content: '正文一' });

  // AC-6 正常路径
  const bytes = fs.readFileSync(DB);
  await store.init(DB);
  const s = store._getDb().prepare('SELECT COUNT(*) AS n FROM entities'); s.step(); const n = s.getAsObject().n; s.free();
  ac('AC-6 正常路径', Number(n) === 1 && bytes.length > 0 && tmps().length === 0 && !fs.existsSync(LOCK),
    JSON.stringify({ n, tmps: tmps(), lock: fs.existsSync(LOCK) }));

  // AC-1 原子写：rename 失败 → 原库不变、无 tmp
  const before = fs.readFileSync(DB);
  const realRename = fs.renameSync;
  fs.renameSync = () => { throw new Error('boom'); };
  const e1 = err(() => store.insertEntity({ id: 'e2', name: '二', type: 'Concept', content: '正文二' }));
  fs.renameSync = realRename;
  const after = fs.readFileSync(DB);
  ac('AC-1 原子写', /boom|db-write-failed/.test(String(e1)) && before.equals(after) && tmps().length === 0,
    JSON.stringify({ e1, same: before.equals(after), tmps: tmps() }));

  // AC-2 单写者锁：活写者（真子进程）持锁 → db-locked，不写
  const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 20000)'], { stdio: 'ignore' });
  await new Promise((res) => setTimeout(res, 200));
  fs.writeFileSync(LOCK, JSON.stringify({ pid: holder.pid, at: Date.now() }));
  const before2 = fs.readFileSync(DB);
  const e2 = err(() => store.insertEntity({ id: 'e3', name: '三', type: 'Concept', content: '正文三' }));
  const after2 = fs.readFileSync(DB);
  ac('AC-2 单写者锁', /db-locked/.test(String(e2)) && before2.equals(after2) && fs.existsSync(LOCK),
    JSON.stringify({ e2, same: before2.equals(after2) }));
  try { holder.kill(); } catch (_) {}

  // AC-3 陈旧锁接管：锁超时 → 写入成功、锁释放
  const old = new Date(Date.now() - 10 * 60000);
  fs.utimesSync(LOCK, old, old);
  const e3 = err(() => store.insertEntity({ id: 'e4', name: '四', type: 'Concept', content: '正文四' }));
  ac('AC-3 陈旧锁接管', e3 === null && !fs.existsSync(LOCK) && fs.readFileSync(DB).length > 0,
    JSON.stringify({ e3, lock: fs.existsSync(LOCK) }));

  // AC-4 外部改写：加载后文件被 touch → db-stale
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(DB, future, future);
  const e4 = err(() => store.insertEntity({ id: 'e5', name: '五', type: 'Concept', content: '正文五' }));
  ac('AC-4 外部改写', /db-stale/.test(String(e4)), String(e4));

  // 恢复：重开取最新 stat
  await store.init(DB);

  // AC-5 容量上限
  process.env.AING_DB_CAP_BYTES = '100';
  const before5 = fs.readFileSync(DB);
  const e5 = err(() => store.insertEntity({ id: 'e6', name: '六', type: 'Concept', content: '正文六' }));
  const after5 = fs.readFileSync(DB);
  delete process.env.AING_DB_CAP_BYTES;
  ac('AC-5 容量上限', /db-over-cap/.test(String(e5)) && before5.equals(after5),
    JSON.stringify({ e5, same: before5.equals(after5) }));

  // AC-7 陈旧 tmp 清理：死 pid 的孤儿 tmp 清掉；活 pid 的 tmp（活写者）保留
  const liveW = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 20000)'], { stdio: 'ignore' });
  await new Promise((res) => setTimeout(res, 150));
  const staleTmp = path.join(yard, 'knowledge.db.tmp.99999');
  const freshTmp = path.join(yard, `knowledge.db.tmp.${liveW.pid}`);
  fs.writeFileSync(staleTmp, 'x');
  fs.writeFileSync(freshTmp, 'x');
  const oldTmp = new Date(Date.now() - 10 * 60000);
  fs.utimesSync(staleTmp, oldTmp, oldTmp);
  await store.init(DB);
  ac('AC-7 陈旧 tmp 清理', !fs.existsSync(staleTmp) && fs.existsSync(freshTmp),
    JSON.stringify(fs.readdirSync(yard)));
  try { liveW.kill(); } catch (_) {}

  // AC-8~10 崩溃自愈：真子进程反复写，随机点硬杀；锁与 tmp 按 pid 存活自动接管
  const CHILD = path.join(yard, 'soak-child.js');
  fs.writeFileSync(CHILD, [
    `const store = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'knowledge-store.js'))});`,
    'const fs = require("fs");',
    '(async () => {',
    '  await store.init(process.argv[2]);',
    '  const payload = "x".repeat(60 * 1024);',
    '  let i = 0;',
    '  for (;;) {',
    '    i++;',
    '    store.insertEntity({ id: "soak-" + process.pid + "-" + i, name: "s", type: "Conversation", content: payload });',
    '    try { fs.writeFileSync(process.argv[3], String(i)); } catch (_) {}',
    '  }',
    '})();'
  ].join('\n'));
  store.insertEntity({ id: 'soak-base', name: 'base', type: 'Concept', content: 'base' });

  // 确定性：死 pid 的锁与孤儿 tmp 不需要人工清理
  const dead = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const deadPid = dead.pid;
  fs.writeFileSync(LOCK, JSON.stringify({ pid: deadPid, at: Date.now() }));
  const orphanTmp = path.join(yard, `knowledge.db.tmp.${deadPid}`);
  fs.writeFileSync(orphanTmp, 'x');
  let deadErr = null;
  try { await store.init(DB); } catch (e) { deadErr = e.message; }
  ac('AC-8 死 pid 锁/孤儿 tmp 自动接管', deadErr === null && !fs.existsSync(LOCK) && !fs.existsSync(orphanTmp),
    JSON.stringify({ deadErr, lock: fs.existsSync(LOCK), orphan: fs.existsSync(orphanTmp) }));

  // 随机硬杀：每轮重开都要成功、库完整、能继续写
  const ROUNDS = 6;
  const badInit = [], badInteg = [], badWrite = [];
  for (let r = 0; r < ROUNDS; r++) {
    const marker = path.join(yard, 'marker-' + r);
    const child = spawn(process.execPath, [CHILD, DB, marker], { stdio: 'ignore' });
    const exited = new Promise((res) => child.once('exit', res));
    const t0 = Date.now();
    while (!fs.existsSync(marker) && Date.now() - t0 < 8000) await new Promise((res) => setTimeout(res, 20));
    await new Promise((res) => setTimeout(res, 10 + Math.floor(Math.random() * 40)));
    try { child.kill(); } catch (_) {}
    const t1 = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 3000);
    await exited; clearTimeout(t1);

    let initErr = null;
    try { await store.init(DB); } catch (e) { initErr = e.message; }
    if (initErr) badInit.push(r + ':' + initErr);
    if (!initErr) {
      const db2 = store._getDb();
      const integ = rows(db2, 'PRAGMA integrity_check')[0].integrity_check;
      const base = Number(rows(db2, "SELECT COUNT(*) AS n FROM entities WHERE id='soak-base'")[0].n);
      if (integ !== 'ok' || base !== 1) badInteg.push(r + ':' + integ + '/' + base);
    }
    let writeErr = null;
    try { store.insertEntity({ id: 'after-' + r, name: 'a', type: 'Concept', content: 'after' }); } catch (e) { writeErr = e.message; }
    if (writeErr) badWrite.push(r + ':' + writeErr);
  }
  ac('AC-9 硬杀后每次重开成功', badInit.length === 0, JSON.stringify(badInit));
  ac('AC-10 硬杀后库完整且可继续写', badInteg.length === 0 && badWrite.length === 0,
    JSON.stringify({ badInteg, badWrite }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
