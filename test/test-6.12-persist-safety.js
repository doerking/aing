'use strict';
// M6 任务 6.12 failing test —— 锁 SPEC-6.12 落盘安全 AC-1~6
const fs = require('fs'); const os = require('os'); const path = require('path');
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

  // AC-2 单写者锁：活锁 → db-locked，不写
  fs.writeFileSync(LOCK, JSON.stringify({ pid: 9999, at: Date.now() }));
  const before2 = fs.readFileSync(DB);
  const e2 = err(() => store.insertEntity({ id: 'e3', name: '三', type: 'Concept', content: '正文三' }));
  const after2 = fs.readFileSync(DB);
  ac('AC-2 单写者锁', /db-locked/.test(String(e2)) && before2.equals(after2) && fs.existsSync(LOCK),
    JSON.stringify({ e2, same: before2.equals(after2) }));

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

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
