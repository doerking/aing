'use strict';
// SPEC-8 修订 A failing test —— node:sqlite 引擎 + WAL + 句柄兼容层
// 运行（本仓根）：node test/test-8.3-nodesqlite-engine.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-nsq-'));
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
  console.error('❌ 红（正确的红）—— node:sqlite 引擎未实现（SPEC-8 修订 A）');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');

  // ── 引擎可用 ──
  ac('AC-a nodesqlite 是受支持的引擎名', (() => { try { A.engineOk('nodesqlite'); return true; } catch (_) { return false; } })());

  // ── AC-b：文件库 + WAL ──
  const api = await A.openFile(dbPath, { engine: 'nodesqlite' });
  ac('AC-b1 openFile(nodesqlite) 返回插排接口', !!api && typeof api.run === 'function');
  api.exec('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)');
  api.run('INSERT INTO t (id, v) VALUES (?, ?)', ['a', '1']);
  const got = api.get('SELECT v FROM t WHERE id = ?', ['a']);
  ac('AC-b2 写读回路', !!got && got.v === '1', JSON.stringify(got));
  const journal = api.get('PRAGMA journal_mode');
  ac('AC-b3 journal_mode = wal', !!journal && String(journal.journal_mode).toLowerCase() === 'wal', JSON.stringify(journal));
  // 夹具实证（SPEC-1.14 修订 O）：默认 busy_timeout=0 → 另一个写者在场就直接抛 `database is locked`，短争用不会自愈
  const bt = api.get('PRAGMA busy_timeout');
  const btVal = Number((bt && (bt.busy_timeout != null ? bt.busy_timeout : bt.timeout)) || 0);
  ac('AC-b4 busy_timeout > 0（并发写者下短争用自愈）', btVal > 0, JSON.stringify(bt));

  // ── AC-c：句柄兼容层（sql.js 面的 step/getAsObject）──
  const raw = api.raw;
  const s = raw.prepare('SELECT id, v FROM t WHERE id = ?');
  s.bind(['a']);
  const hasNext = s.step();
  const row = s.getAsObject();
  s.free();
  ac('AC-c1 句柄兼容层 step/getAsObject', hasNext && row && row.v === '1', JSON.stringify(row));
  const s2 = raw.prepare('INSERT INTO t (id, v) VALUES (?, ?)');
  s2.run(['b', '2']);
  s2.free();
  ac('AC-c2 句柄兼容层 run 带参', api.get('SELECT v FROM t WHERE id = ?', ['b']).v === '2');
  ac('AC-c3 raw.run 整语句', (() => { raw.run("INSERT INTO t (id, v) VALUES ('c', '3')"); return api.get("SELECT v FROM t WHERE id='c'").v === '3'; })());

  // ── AC-d：持久性——关掉重开，数据还在 ──
  api.close();
  const api2 = await A.openFile(dbPath, { engine: 'nodesqlite' });
  const n = api2.get('SELECT COUNT(*) AS n FROM t');
  ac('AC-d1 关闭重开数据在（n=3）', !!n && n.n === 3, JSON.stringify(n));
  api2.close();

  // ── AC-e：knowledge-store 全链路（默认库结构建表 + persist 不再整库导出）──
  process.env.AING_DB_ENGINE = 'nodesqlite';
  try {
    const s = require('../src/knowledge-store.js');
    await s.init(dbPath);
    s.insertEntity({ id: 'e1', name: '实体', type: 'MetaKnowledge', content: '# a\n正文'.padEnd(80, '字'), tags: '["x"]', confidence: 0.8 });
    // 模拟「写者直接走 persist」：文件库分支不得抛错
    s._persist();
    const e = s.getEntity('e1');
    ac('AC-e1 knowledge-store 全链路（建表+插入+读取）', !!e && e.id === 'e1', JSON.stringify(e && e.id));
  } finally {
    delete process.env.AING_DB_ENGINE;
  }

  console.log(`\n${fail === 0 ? '🟢' : '🔴'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
