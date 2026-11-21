'use strict';
// tools/concurrency-probe.js —— 并发夹具（测量工具，不是门禁）
//
// 目的：量出「围栏/单写者锁/lost update」到底谁在起作用，而不是为证明我们正确。
// 用法（本仓根）：node tools/concurrency-probe.js [写者数] [每写者轮数]
//
// 每个引擎各跑一次：起 N 个写者进程，开同一个库文件，各自「领写 → 写行 → 带令牌落盘」。
// 输出三件事：① 每个写者成功/被拒几次  ② 最终文件里各写者留了几行  ③ 结论（谁在挡、谁在漏）。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');   // 不写死盘符（C8 redaction gate）
const N = Math.max(1, Number(process.argv[2]) || 2);
const ITERS = Math.max(1, Number(process.argv[3]) || 4);

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-probe-'));
const dbPath = path.join(yard, 'knowledge.db');
const seed = path.join(yard, 'seed.db');

function seedDb(engine) {
  const store = require(path.join(root, 'src/knowledge-store.js'));
  return (async () => {
    process.env.AING_DB_ENGINE = engine;
    // 用一个新库当起点（每个引擎各自造，避免引擎形态互相污染）
    try { fs.unlinkSync(dbPath); } catch (_) { /* 未建 */ }
    await store.init(dbPath);
    store._close();
  })();
}

async function runWriters(engine, n) {
  // 屏障并发：先让所有写者都开完库（谁都还没写），再一起放行——不制造重叠的夹具只是在测串行
  for (const f of fs.readdirSync(yard)) {
    if (/^(ready-|go$)/.test(f)) { try { fs.unlinkSync(path.join(yard, f)); } catch (_) { /* 已删 */ } }
  }
  const ws = [];
  for (let k = 0; k < n; k++) {
    const label = String.fromCharCode(65 + k);
    const out = path.join(yard, `w-${engine}-${label}.json`);
    const env = { ...process.env, AING_DB_ENGINE: engine };
    const child = spawn(process.execPath, [path.join(root, 'tools', 'cc-worker.js'), label, dbPath, String(ITERS), out, yard], {
      stdio: ['ignore', 'pipe', 'pipe'], env, cwd: root
    });
    const rec = { label, out, child, stderr: '' };
    child.stderr.on('data', d => { rec.stderr += d; });
    ws.push(rec);
  }
  await waitFor(() => ws.every(w => fs.existsSync(path.join(yard, `ready-${w.label}`))), 20000);
  fs.writeFileSync(path.join(yard, 'go'), '1');   // 发令：同时开写
  await Promise.all(ws.map(w => new Promise((r) => {
    const t = setTimeout(() => { try { w.child.kill('SIGKILL'); } catch (_) { /* 已死 */ } }, 30000);
    w.child.on('close', () => { clearTimeout(t); r(); });
  })));
  return ws;
}

function waitFor(pred, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let ok = false;
      try { ok = pred(); } catch (_) { ok = false; }
      if (ok || Date.now() - t0 > ms) { clearInterval(iv); resolve(ok); }
    }, 5);
  });
}

function readFinal(engine) {
  const A = require(path.join(root, 'src/db-adapter.js'));
  return (async () => {
    const api = await A.openFile(dbPath, { engine });
    const rows = api.all('SELECT w, COUNT(*) AS n, MIN(ms) AS lo, MAX(ms) AS hi FROM probe_writers GROUP BY w ORDER BY w');
    api.close();
    return rows;
  })();
}

(async () => {
  for (const engine of ['sqljs', 'nodesqlite']) {
    await seedDb(engine);
    const ws = await runWriters(engine, N);
    const per = [];
    for (const w of ws) {
      let o = null;
      try { o = JSON.parse(fs.readFileSync(w.out, 'utf8')); } catch (_) { o = { fatal: '无输出' + (w.stderr ? ' | ' + w.stderr.split('\n').slice(-2).join(' ') : '') }; }
      const ok = (o.log || []).filter(x => x.ok).length;
      const rej = (o.log || []).filter(x => !x.ok).map(x => x.err || o.fatal);
      per.push({ label: w.label, ok, rej, iv: { lo: o.lo, hi: o.hi } });
    }
    const final = await readFinal(engine);
    const counts = Object.fromEntries(final.map(r => [r.w, r.n]));
    // 重叠窗口：各写者自报的「收到 go → 收尾」区间取交集。为正 = 真并发
    const iv = per.map(p => p.iv).filter(v => v && v.hi > v.lo);
    const overlap = iv.length > 1 ? Math.min(...iv.map(v => v.hi)) - Math.max(...iv.map(v => v.lo)) : 0;
    console.log(`  重叠窗口：${overlap > 0 ? overlap + 'ms（真并发，本轮测量有效）' : '0ms（未重叠，本轮测不出并发，需重跑）'}`);

    console.log(`\n━━ 引擎 ${engine}（${N} 写者 × ${ITERS} 轮，同一库文件）━━`);
    for (const p of per) {
      console.log(`  写者 ${p.label}：成功 ${p.ok} 轮；被拒 ${p.rej.length} 次${p.rej.length ? ' → ' + [...new Set(p.rej)].join(' / ') : ''}`);
    }
    console.log(`  最终库里留的行：${JSON.stringify(counts)}`);
    const lost = per.filter(p => p.ok > 0 && !(counts[p.label] > 0));
    const guarded = per.some(p => p.rej.some(r => /stale-writer/.test(r)));
    const locked = per.some(p => p.rej.some(r => /db-locked|db-stale/.test(r)));
    console.log(`  判定：${lost.length ? '⚠ 丢失更新 → 写者 ' + lost.map(p => p.label).join(',') : '无丢失更新'}｜${guarded ? '围栏生效（stale-writer）' : '围栏未触发'}｜${locked ? '单写者锁/外部改写检测生效' : '锁未触发'}`);
  }
  console.log(`\n夹具目录：${yard}`);
})().catch(e => { console.error('夹具异常:', e.stack); process.exit(1); });