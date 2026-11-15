'use strict';
// aing-v2 knowledge-store.js —— M1 任务 1.1 实现（SPEC-0.1 数据模型）
// spec-first：本文件是 SPEC-0.1 的代码结果，schema 契约在 spec/，勿在此改结构（改 spec 再回填）。
// 驱动：sql.js（无需编译，替代 better-sqlite3）。落盘：每次写后 export 全库覆写文件。
// 三轴列建表时内建（强度/时效/类型），不走旧库 ALTER 轨道。

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// SPEC-0.1 §二 三表 DDL（spec 即契约）
const DDL = [
  `CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    content TEXT,
    tags TEXT,
    status TEXT,
    confidence REAL,
    tolaria_strength INTEGER DEFAULT 5,
    last_access DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    invalid_at DATETIME,
    invalid_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS links (
    source_id TEXT,
    target_id TEXT,
    relation TEXT,
    confidence REAL,
    strength INTEGER DEFAULT 5,
    evidence TEXT,
    invalid_reason TEXT,
    invalid_at DATETIME,
    created_at DATETIME,
    PRIMARY KEY (source_id, target_id)
  )`,
  `CREATE TABLE IF NOT EXISTS meko_cycles (
    id TEXT PRIMARY KEY,
    cycle_type TEXT,
    helix_strand TEXT,
    scheduled_at DATETIME,
    executed_at DATETIME,
    status TEXT,
    kespi_snapshot REAL,
    growth INTEGER,
    pruned INTEGER,
    conservation_ratio REAL
  )`,
  `CREATE TABLE IF NOT EXISTS compressed_seeds (
    entity_id TEXT PRIMARY KEY,
    content_hash TEXT,
    last_access_at DATETIME,
    active INTEGER DEFAULT 1,
    recycled INTEGER DEFAULT 0,
    compressed_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS kespi_scores (
    entity_id TEXT PRIMARY KEY,
    kq REAL, kg REAL, ka REAL, km REAL,
    kd REAL, kc REAL, kr REAL, kb REAL,
    overall REAL,
    computed_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS entity_vectors (
    entity_id TEXT PRIMARY KEY,
    dim INTEGER,
    model TEXT,
    vector TEXT,
    checksum TEXT,
    updated_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS field_actions (
    id TEXT PRIMARY KEY,
    action TEXT,                  -- rebond/unwind/reconcile/demote/promote
    target TEXT,                  -- 实体 id 或 src->dst
    before_json TEXT,
    after_json TEXT,
    cycle_id TEXT,
    reversible INTEGER DEFAULT 1,
    reversed_at DATETIME,
    created_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS genes (
    id TEXT PRIMARY KEY,
    name TEXT,
    score REAL DEFAULT 0.5,
    uses INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    failures INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    lineage TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    archived_at DATETIME
  )`
];

let SQL = null;      // sql.js 模块
let db = null;       // 当前连接
let dbPath = null;   // 当前库文件

function persist() {
  if (!db || !dbPath) return;
  const bytes = Buffer.from(db.export());
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, bytes);
}

async function init(dbFilePath) {
  if (!SQL) SQL = await initSqlJs();
  dbPath = dbFilePath;
  if (fs.existsSync(dbFilePath)) {
    db = new SQL.Database(fs.readFileSync(dbFilePath));
  } else {
    db = new SQL.Database();
  }
  // 幂等：IF NOT EXISTS，连跑不炸（AC-2）
  for (const stmt of DDL) db.run(stmt);
  // FK 完整性（AC-6）：sql.js 每连接设 ON
  db.run('PRAGMA foreign_keys = ON');
  persist();
}

function listTables() {
  const out = [];
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  while (stmt.step()) out.push(stmt.getAsObject().name);
  stmt.free();
  return out;
}

function columns(table) {
  const out = [];
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  while (stmt.step()) out.push(stmt.getAsObject().name);
  stmt.free();
  return out;
}

function insertEntity(e) {
  const stmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  stmt.run([e.id, e.name || null, e.type || null, e.content || null, e.tags || null, e.status || null, e.confidence == null ? null : e.confidence]);
  stmt.free();
  persist();
  return e.id;
}

function getEntity(id) {
  const stmt = db.prepare('SELECT * FROM entities WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function insertLink(l) {
  // PK (source_id, target_id) 重复插抛冲突（AC-5）：默认 INSERT 语句，不用 OR IGNORE/REPLACE
  const stmt = db.prepare(
    `INSERT INTO links (source_id, target_id, relation, confidence, created_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  stmt.run([l.source_id, l.target_id, l.relation || null, l.confidence == null ? null : l.confidence]);
  stmt.free();
  persist();
  return { source_id: l.source_id, target_id: l.target_id };
}

function foreignKeysOn() {
  const stmt = db.prepare('PRAGMA foreign_keys');
  let on = false;
  if (stmt.step()) on = stmt.getAsObject().foreign_keys === 1;
  stmt.free();
  return on;
}

module.exports = { init, listTables, columns, insertEntity, getEntity, insertLink, foreignKeysOn, _getDb: () => db, _persist: persist };
