'use strict';
// aing-v2 db-adapter.js —— 存储插排（SPEC-8 §一 / AC-8.1）
// 全仓唯一允许直接 require('sql.js') 的模块：上层只认 open*/exec/all/get/run/exportBytes/close。
// 引擎选择走 AING_DB_ENGINE（默认 sqljs）。未接的引擎显式报错，不静默回退——
// 换引擎失败要吵，不能悄悄跑成别的引擎（假绿比红更贵）。
// 接口约定（SPEC-8 §一）：
//   exec(sql)          DDL / 无结果语句
//   all(sql, params)   多行
//   get(sql, params)   单行或 null
//   run(sql, params)   写入
//   exportBytes()      原子写用的字节流
//   close()            关仓

const SUPPORTED = ['sqljs', 'nodesqlite'];
let SQL = null;

function engineName(name) {
  const n = String(name || process.env.AING_DB_ENGINE || 'nodesqlite').toLowerCase();
  // 别名：环境变量写 node:sqlite 也认（SPEC-8 配置项口径）
  const norm = n === 'node:sqlite' ? 'nodesqlite' : n;
  if (!SUPPORTED.includes(norm)) {
    throw new Error('db-adapter: 引擎未接 ' + n + '（支持：' + SUPPORTED.join(', ') + '）');
  }
  return norm;
}

function engineOk(name) { return engineName(name); }

async function _load(engine) {
  engineName(engine);
  if (!SQL) SQL = await require('sql.js')();
  return SQL;
}

// 把 sql.js 句柄包成插排接口；raw 只留给 knowledge-store 的落盘/迁移内部用
function _wrap(db) {
  const api = {
    raw: db,
    exec(sql) { db.run(sql); },
    all(sql, params = []) {
      const s = db.prepare(sql);
      try {
        if (params && params.length) s.bind(params);
        const out = [];
        while (s.step()) out.push(s.getAsObject());
        return out;
      } finally { s.free(); }
    },
    get(sql, params = []) { return api.all(sql, params)[0] || null; },
    run(sql, params = []) { db.run(sql, params || []); },
    exportBytes() { return Buffer.from(db.export()); },
    close() { try { db.close(); } catch (_) { /* 已关 */ } }
  };
  return api;
}

async function openEmpty(opts = {}) {
  const eng = engineName(opts.engine);
  if (eng === 'nodesqlite') return _openNodesqlite(':memory:');
  const S = await _load(eng);
  return _wrap(new S.Database());
}

async function openBytes(bytes, opts = {}) {
  const S = await _load(opts.engine);
  return _wrap(new S.Database(bytes));
}

async function openFile(filePath, opts = {}) {
  const fs = require('fs');
  const eng = engineName(opts.engine);
  // nodesqlite：文件库直接开（WAL），不把整个文件读进内存（SPEC-8 修订 A）
  if (eng === 'nodesqlite' && filePath) return _openNodesqlite(filePath);
  if (filePath && fs.existsSync(filePath)) return openBytes(fs.readFileSync(filePath), opts);
  return openEmpty({ ...opts, engine: eng });
}

// ── SPEC-8 修订 A：node:sqlite 引擎（文件库 + WAL + sql.js 句柄兼容层）──
// 上层 ~60 个组件经 store._getDb() 用 sql.js 的 prepare/bind/step/getAsObject/reset/free
// 面调句柄（160 处）；换引擎不改上层，靠这层兼容面。
function _compatStatement(stmt) {
  return {
    _rows: null,
    _i: 0,
    _pending: null,
    bind(params) { this._pending = Array.isArray(params) ? params : [params]; },
    step() {
      // sql.js 语义：每次 step 拉一行。兼容层：一次性拉回剩余行，再逐行返回。
      if (this._rows == null) {
        this._rows = this._pending ? stmt.all(...this._pending) : stmt.all();
        this._pending = null;
        this._i = 0;
      }
      return this._i < this._rows.length ? (this._i++, true) : false;
    },
    getAsObject() { return this._rows && this._rows.length ? this._rows[this._i - 1] ?? this._rows[0] : null; },
    // sql.js 语义：带参 run（INSERT/UPDATE/DELETE 直接执行）
    run(params = []) {
      const p = Array.isArray(params) ? params : [params];
      if (p.length) stmt.run(...p); else stmt.run();
    },
    reset() { this._rows = null; this._i = 0; this._pending = null; },
    free() { try { stmt.close(); } catch (_) { /* 已关 */ } }
  };
}

function _wrapNodesqlite(db) {
  // sql.js 形状：[{columns:[名称], values:[[单元值]]}]（部分组件/测试按呢个形状读 PRAGMA / SELECT）
  const _shape = (sql) => {
    const s = db.prepare(sql);
    try {
      const cols = s.columns().map((c) => c.name);
      const rows = s.all();
      return rows.length ? [{ columns: cols, values: rows.map((r) => cols.map((c) => r[c])) }] : [];
    } finally { try { s.close(); } catch (_) { /* 已关 */ } }
  };
  const raw = {
    prepare(sql) { return _compatStatement(db.prepare(sql)); },
    run(sql, params = []) {
      if (params && params.length) db.prepare(sql).run(...params);
      else db.exec(sql);
    },
    // 兼容层补口：sql.js 的 db.exec 对出结果的语句返 [{columns,values}]；node:sqlite 的 exec 不返东西
    exec(sql) {
      if (/^(select|pragma|with)\b/i.test(String(sql).trim())) return _shape(sql);
      db.exec(sql);
      return [];
    }
  };
  const api = {
    raw,
    fileBacked: true,
    exec(sql) { db.exec(sql); },
    all(sql, params = []) {
      const s = db.prepare(sql);
      try { return params && params.length ? s.all(...params) : s.all(); }
      finally { try { s.close(); } catch (_) { /* 已关 */ } }
    },
    get(sql, params = []) { return api.all(sql, params)[0] || null; },
    run(sql, params = []) {
      if (params && params.length) db.prepare(sql).run(...params);
      else db.exec(sql);
    },
    exportBytes() {
      // nodesqlite 没有 export()；用 VACUUM INTO 临时库读回字节（备份/移植用，不走热路径）
      const fsx = require('fs');
      const osx = require('os');
      const pth = require('path');
      const tmp = pth.join(osx.tmpdir(), `nsq-export-${process.pid}-${Date.now()}.db`);
      try {
        db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
        return fsx.readFileSync(tmp);
      } finally { try { fsx.unlinkSync(tmp); } catch (_) { /* 已删 */ } }
    },
    // SPEC-8 修订 B：关库前先收拢 WAL——否则 -wal 残留，换回 sql.js 只看到合并前的行（丢行会随 sql.js 整库覆写固化）
    checkpoint() { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (_) { /* 平台不支持则留给 close 处理 */ } },
    close() { try { api.checkpoint(); } catch (_) { /* 收拢失败仍要关 */ } try { db.close(); } catch (_) { /* 已关 */ } }
  };
  return api;
}

function _openNodesqlite(target) {
  const fs = require('fs');
  const { DatabaseSync } = require('node:sqlite');
  // sql.js 是内存库、不碰文件系统；nodesqlite 会真去开文件 → 父目录不存在直接报「unable to open database file」
  if (target !== ':memory:') {
    try { fs.mkdirSync(require('path').dirname(target), { recursive: true }); } catch (_) { /* 目录不可写时让后面开库报错 */ }
  }
  const db = new DatabaseSync(target);
  // SPEC-1.14 修订 O 夹具实证：默认 busy_timeout=0 → 另一个写者在场就直接抛 `database is locked`。
  // 给一个自愈窗口，短争用自己排上去，而不是把一个正常轮标成 failed。
  try { db.exec('PRAGMA busy_timeout = 5000'); } catch (_) { /* 平台不支持则留默认 */ }
  // SPEC-8 修订 A：WAL——提交 = 追加 WAL，不再每次写整库
  try { db.exec('PRAGMA journal_mode=WAL'); } catch (_) { /* 平台不支持则退回默认 */ }
  return _wrapNodesqlite(db);
}

module.exports = { engineName, engineOk, openEmpty, openBytes, openFile, SUPPORTED };
