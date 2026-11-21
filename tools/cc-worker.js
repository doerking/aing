'use strict';
// tools/cc-worker.js —— 并发夹具的写者进程（被 tools/concurrency-probe.js spawn）
// 用法：node tools/cc-worker.js <label> <dbPath> <iterations> <outJson> <yard>
//
// 带屏障：先开库（谁都还没写），写 ready 标记，等父进程落 go 文件，
// 然后所有写者**同时**开写——不制造重叠的并发夹具只是在测串行。
const fs = require('fs');
const path = require('path');
const label = process.argv[2];
const dbPath = process.argv[3];
const iters = Math.max(1, Number(process.argv[4]) || 8);
const out = process.argv[5];
const yard = process.argv[6];

const store = require(path.join(__dirname, '..', 'src', 'knowledge-store.js'));
const log = [];

function finish(ok, fatal) {
  fs.writeFileSync(out, JSON.stringify({
    label, engine: process.env.AING_DB_ENGINE || 'sqljs', log, ok, fatal,
    // 自报区间：从「收到 go」到「最后一轮结束」，父进程用它算真重叠（不能从库里残留行推——丢行会让它失真）
    lo: startMs, hi: Date.now()
  }, null, 1));
}

let startMs = 0;
(async () => {
  try {
    await store.init(dbPath);
    const db = store._getDb();
    try { db.run('CREATE TABLE IF NOT EXISTS probe_writers (w TEXT, n INTEGER, ms INTEGER, at DATETIME)'); } catch (_) { /* 已有 */ }

    fs.writeFileSync(path.join(yard, `ready-${label}`), '1');
    await waitFor(path.join(yard, 'go'), 20000);
    startMs = Date.now();

    for (let i = 1; i <= iters; i++) {
      try {
        const token = store.claimWriter(0);
        db.run('INSERT INTO probe_writers (w, n, ms, at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [label, i, Date.now()]);
        store._persist({ skipCap: true, epoch: token });
        log.push({ i, token, ok: true });
      } catch (e) {
        log.push({ i, ok: false, err: e.message.split('\n')[0] });
      }
    }
    store._persist({ skipCap: true });
    finish(true);
  } catch (e) { finish(false, e.message.split('\n')[0]); }
})();

function waitFor(file, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (fs.existsSync(file)) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); resolve(); }
    }, 5);
  });
}