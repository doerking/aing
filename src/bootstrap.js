'use strict';
// aing-v2 bootstrap.js —— M6 任务 6.47 实现（SPEC-6.47 冷启动初始化）
// 只增不删、幂等；root 必须已存在（不编造路径）；store 由调用方注入（arch-lint C5）。

const fs = require('fs');
const path = require('path');

// 目录清单：相对 root；顺序即建序（父在前）
const DIRS = ['raw', 'raw/inbox', 'data', 'archive'];

function _rel(root, abs) {
  return path.relative(root, abs).replace(/\\/g, '/');
}

/**
 * 初始化工作区目录与库位置。
 * @param {{root:string, dbPath?:string, store:object}} opts
 * @returns {{ok:boolean, root:string, dirs:object, created:string[], existing:string[], db:{path:string,tables:number}}}
 */
function initWorkspace(opts = {}) {
  const store = opts.store;
  if (!store || typeof store.listTables !== 'function') {
    throw new Error('bootstrap 需要 store 注入（SPEC-6.47 契约）');
  }
  if (!opts.root) throw new Error('root-missing: 必须显式给 root');

  const root = path.resolve(opts.root);
  if (!fs.existsSync(root)) throw new Error('root-missing: ' + root);
  if (!fs.statSync(root).isDirectory()) throw new Error('root-not-dir: ' + root);

  const dbPath = path.resolve(opts.dbPath || path.join(root, 'data', 'knowledge.db'));
  const created = [];
  const existing = [];

  for (const d of DIRS) {
    const abs = path.join(root, d);
    if (fs.existsSync(abs)) existing.push(d + '/');
    else { fs.mkdirSync(abs, { recursive: true }); created.push(d + '/'); }
  }
  // dbPath 父目录（可能落在 data 之外）
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  // 库文件本身只登记、不创建：开库归调用方（CLI 层）
  const relDb = _rel(root, dbPath);
  if (fs.existsSync(dbPath)) { if (!existing.includes(relDb)) existing.push(relDb); }
  else created.push(relDb);

  return {
    ok: true,
    root,
    dirs: {
      raw: path.join(root, 'raw'),
      inbox: path.join(root, 'raw', 'inbox'),
      data: path.join(root, 'data'),
      archive: path.join(root, 'archive')
    },
    created,
    existing,
    db: { path: dbPath, tables: store.listTables().length }
  };
}

module.exports = { initWorkspace, DIRS };
