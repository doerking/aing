'use strict';
// aing-v2 boot-check.js —— M6 任务 6.48 实现（SPEC-6.48 开机自检）
// 纯读：不建目录、不写库、不开写探针；只报结论。发现缺东西只报不补（补归 6.47）。

const fs = require('fs');
const path = require('path');

const DIRS_CRITICAL = ['raw', 'data', 'archive'];
const DIRS_OPTIONAL = ['raw/inbox'];
const REQUIRED_TABLES = ['entities', 'links', 'config', 'kespi_scores', 'meko_cycles'];

function _count(db, sql) {
  try {
    const r = db.exec(sql);
    if (!r || !r.length) return null;
    return Number(r[0].values[0][0]);
  } catch (_) { return null; }
}

function _countMarkdown(dir) {
  let n = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return 0; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += _countMarkdown(p);
    else if (/\.md$/i.test(e.name)) n++;
  }
  return n;
}

function _push(checks, id, level, detail) { checks.push({ id, level, detail }); }

/**
 * 开机自检。
 * @param {{root:string, dbPath?:string, store:object}} opts
 * @returns {{ok:boolean, verdict:'ok'|'degraded'|'broken', checks:object[]}}
 */
function bootCheck(opts = {}) {
  const store = opts.store;
  if (!store || typeof store.listTables !== 'function') {
    throw new Error('boot-check 需要 store 注入（SPEC-6.48 契约）');
  }
  const checks = [];
  const root = opts.root ? path.resolve(opts.root) : null;

  // 1. root
  if (!root || !fs.existsSync(root)) { _push(checks, 'root', 'fail', 'root 不存在：' + (root || '(未给)')); }
  else if (!fs.statSync(root).isDirectory()) { _push(checks, 'root', 'fail', 'root 不是目录'); }
  else _push(checks, 'root', 'ok', root);

  // 2. dirs
  if (root && fs.existsSync(root)) {
    const missing = DIRS_CRITICAL.filter(d => !fs.existsSync(path.join(root, d)));
    const missingOpt = DIRS_OPTIONAL.filter(d => !fs.existsSync(path.join(root, d)));
    if (missing.length) _push(checks, 'dirs', 'warn', '缺目录：' + missing.join('、') + '（跑 tools/init-kb.js 补）');
    else if (missingOpt.length) _push(checks, 'dirs', 'warn', '缺目录：' + missingOpt.join('、'));
    else _push(checks, 'dirs', 'ok', '四目录齐');
  } else {
    _push(checks, 'dirs', 'fail', 'root 不可达，无法查目录');
  }

  // 3. db 文件
  const dbPath = opts.dbPath ? path.resolve(opts.dbPath) : (root ? path.join(root, 'data', 'knowledge.db') : null);
  const dbExists = !!dbPath && fs.existsSync(dbPath);
  if (!dbExists) _push(checks, 'db', 'fail', '库文件不存在：' + (dbPath || '(未给)'));
  else _push(checks, 'db', 'ok', dbPath);

  // 4. schema
  if (!dbExists) {
    _push(checks, 'schema', 'fail', '库未开，跳过表检查');
  } else {
    let tables = [];
    try { tables = store.listTables(); } catch (e) { tables = []; }
    const missing = REQUIRED_TABLES.filter(t => !tables.includes(t));
    if (missing.length) _push(checks, 'schema', 'fail', '缺表：' + missing.join('、'));
    else _push(checks, 'schema', 'ok', `必需表齐（共 ${tables.length} 表）`);
  }

  // 5. writable（只查权限位，不落文件）
  if (root && fs.existsSync(path.join(root, 'data'))) {
    try { fs.accessSync(path.join(root, 'data'), fs.constants.W_OK); _push(checks, 'writable', 'ok', 'data/ 可写'); }
    catch (_) { _push(checks, 'writable', 'fail', 'data/ 不可写'); }
  } else {
    _push(checks, 'writable', 'fail', 'data/ 不存在，无法判可写');
  }

  // 6. content（只报）
  let ent = null; let lk = null;
  try { const db = store._getDb(); ent = _count(db, 'SELECT COUNT(*) FROM entities'); lk = _count(db, 'SELECT COUNT(*) FROM links'); } catch (_) {}
  _push(checks, 'content', 'ok', ent == null ? '实体数不可读' : `实体 ${ent} / 边 ${lk == null ? '?' : lk}`);

  // 7. raw-pending（只报）
  const pending = root ? _countMarkdown(path.join(root, 'raw')) : 0;
  _push(checks, 'raw-pending', 'ok', `raw/ 下 ${pending} 份 .md 待编译`);

  const broken = checks.some(c => c.level === 'fail');
  const warn = checks.some(c => c.level === 'warn');
  const verdict = broken ? 'broken' : (warn ? 'degraded' : 'ok');
  return { ok: verdict !== 'broken', verdict, checks };
}

module.exports = { bootCheck, REQUIRED_TABLES, DIRS_CRITICAL };
