'use strict';
// M8 任务 8.1 failing test —— 锁 SPEC-8 AC-8.1（存储插排收口）
// 口径：src/ 内只有插排自己可以 require('sql.js')；插排接口 open/exec/all/get/run/export/close 能独立撑起读写；
//       引擎选择走 AING_DB_ENGINE，未接引擎显式报错；knowledge-store 行为不变（换引擎不改上层）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-adapter-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let A = null;
try { A = require('../src/db-adapter.js'); } catch (e) { A = null; }

(async () => {
  // AC-8.1a 源码扫描：只有插排模块可以直接碰 sql.js
  const srcDir = path.join(__dirname, '..', 'src');
  const offenders = [];
  for (const f of fs.readdirSync(srcDir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(srcDir, f), 'utf8');
    if (/require\(\s*['"]sql\.js['"]\s*\)/.test(src)) offenders.push(f);
  }
  ac('AC-8.1a 只有插排允许 require sql.js',
    offenders.length === 1 && offenders[0] === 'db-adapter.js',
    JSON.stringify(offenders));

  if (!A) {
    ['AC-8.1b 插排接口可独立读写', 'AC-8.1c 未接引擎显式报错', 'AC-8.1d 换引擎不改上层'].forEach((n) => ac(n, false, 'src/db-adapter.js 未实现'));
    console.log(`\n----- 8.1 pass=${pass} fail=${fail} -----`);
    process.exit(1);
  }

  // AC-8.1b 插排接口独立读写：DDL → 写 → 读 → export → 从字节重新打开
  const api = ['exec', 'all', 'get', 'run', 'exportBytes', 'close'];
  const shapes = api.every((k) => typeof A.openEmpty === 'function') && typeof A.openBytes === 'function';
  const a1 = await A.openEmpty();
  const missing = api.filter((k) => typeof a1[k] !== 'function');
  a1.exec('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)');
  a1.run('INSERT INTO t (id, v) VALUES (?, ?)', ['x', '甲']);
  const got = a1.get('SELECT v FROM t WHERE id = ?', ['x']);
  const all = a1.all('SELECT * FROM t');
  const bytes = a1.exportBytes();
  a1.close();
  const a2 = await A.openBytes(bytes);
  const got2 = a2.get('SELECT v FROM t WHERE id = ?', ['x']);
  a2.close();
  ac('AC-8.1b 插排接口可独立读写',
    shapes && missing.length === 0 && got && got.v === '甲' && all.length === 1 &&
    bytes && bytes.length > 0 && got2 && got2.v === '甲',
    JSON.stringify({ shapes, missing, got, n: all.length, size: bytes && bytes.length, got2 }));

  // AC-8.1c 未接引擎显式报错（不静默回退 sqljs）。样本用 better-sqlite3（SPEC-8 配置表里仍未接）；
  // node:sqlite 已于 SPEC-8 修订 A 接入（nodesqlite 别名），不再当样本。
  let threw = null;
  try { await A.openEmpty({ engine: 'better-sqlite3' }); } catch (e) { threw = e.message; }
  let deflt = null;
  try { deflt = A.engineName(); } catch (_) { deflt = null; }
  ac('AC-8.1c 未接引擎显式报错',
    !!threw && /引擎未接/.test(threw) && deflt === 'nodesqlite' && Array.isArray(A.SUPPORTED) && A.SUPPORTED.includes('nodesqlite'),
    JSON.stringify({ threw, deflt, supported: A.SUPPORTED }));

  // AC-8.1d 换引擎不改上层：knowledge-store 全走插排，读写/落盘/重开行为不变
  delete require.cache[require.resolve('../src/knowledge-store.js')];
  const store = require('../src/knowledge-store.js');
  const p = path.join(yard, 'k.db');
  await store.init(p);
  store.insertEntity({ id: 'e-20261117-9001', name: 'e-20261117-9001', type: 'Concept', content: '插排收口样本', tags: '[]', status: 'active', confidence: 0.5 });
  const e1 = store.getEntity('e-20261117-9001');
  delete require.cache[require.resolve('../src/knowledge-store.js')];
  const store2 = require('../src/knowledge-store.js');
  await store2.init(p);
  const e2 = store2.getEntity('e-20261117-9001');
  ac('AC-8.1d 换引擎不改上层（store 行为不变）',
    !!e1 && !!e2 && e2.content === '插排收口样本' && typeof store2._getDb === 'function',
    JSON.stringify({ e1: !!e1, e2: e2 && e2.content }));

  console.log(`\n----- 8.1 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
