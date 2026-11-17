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

const SUPPORTED = ['sqljs'];
let SQL = null;

function engineName(name) {
  const n = String(name || process.env.AING_DB_ENGINE || 'sqljs').toLowerCase();
  if (!SUPPORTED.includes(n)) {
    throw new Error('db-adapter: 引擎未接 ' + n + '（支持：' + SUPPORTED.join(', ') + '）');
  }
  return n;
}

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
  const S = await _load(opts.engine);
  return _wrap(new S.Database());
}

async function openBytes(bytes, opts = {}) {
  const S = await _load(opts.engine);
  return _wrap(new S.Database(bytes));
}

async function openFile(filePath, opts = {}) {
  const fs = require('fs');
  if (filePath && fs.existsSync(filePath)) return openBytes(fs.readFileSync(filePath), opts);
  return openEmpty(opts);
}

module.exports = { engineName, openEmpty, openBytes, openFile, SUPPORTED };
