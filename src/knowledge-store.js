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
    kespi_source TEXT,            -- kespi_scores / placeholder（SPEC-6.9b）
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
  `CREATE TABLE IF NOT EXISTS distill_points (
    base_id TEXT PRIMARY KEY,
    digest TEXT NOT NULL,
    raw_count INTEGER NOT NULL,
    line_count INTEGER NOT NULL,
    points_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS task_trajectories (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    route TEXT DEFAULT '[]',
    tools TEXT DEFAULT '[]',
    step_sequence TEXT DEFAULT '[]',
    success INTEGER DEFAULT 0,
    retries INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    score_soft REAL DEFAULT 0,
    score_hard INTEGER DEFAULT 0,
    evidence TEXT DEFAULT '{}',
    source TEXT DEFAULT 'unknown',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_traj_type ON task_trajectories(task_type)`,
  `CREATE INDEX IF NOT EXISTS idx_traj_success ON task_trajectories(success)`,
  `CREATE INDEX IF NOT EXISTS idx_traj_source ON task_trajectories(source)`,
  `CREATE TABLE IF NOT EXISTS access_hits (
    entity_id TEXT NOT NULL,      -- 只追加事实：内容被真正消费时记一条
    hit_at DATETIME NOT NULL,
    source TEXT DEFAULT 'unknown'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_access_entity ON access_hits(entity_id, hit_at)`,
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
  )`,
  `CREATE TABLE IF NOT EXISTS opt_tickets (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,     -- 病灶实体
    dim TEXT NOT NULL,           -- kq/kg/ka/km/kd/kc/kr/kb/overall
    kind TEXT NOT NULL,          -- kc-low / kd-low / ...
    action TEXT NOT NULL,        -- reconcile / rebond / demote / memo-card
    score REAL,                  -- 触发时该维读数
    zone TEXT,                   -- red / yellow
    status TEXT DEFAULT 'open',  -- open / dispatched / proposed / verified / rejected / graduated
    attempts INTEGER DEFAULT 0,
    evidence_json TEXT,
    cycle_id TEXT,
    created_at DATETIME,
    updated_at DATETIME
  )`,
  `CREATE INDEX IF NOT EXISTS idx_opt_tickets_open ON opt_tickets(status, dim, entity_id)`,
  `CREATE TABLE IF NOT EXISTS gate_records (
    id TEXT PRIMARY KEY,
    subject TEXT,
    kind TEXT,                    -- promote / threshold / gene
    passed INTEGER DEFAULT 0,
    gates_json TEXT,              -- canary/holdout/acceptance 三闸逐闸结论
    evidence_json TEXT,
    baseline_json TEXT,
    cycle_id TEXT,
    created_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS approval_queue (
    id TEXT PRIMARY KEY,
    kind TEXT,                    -- threshold / band-rule / budget / user-surface
    payload_json TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME,
    decided_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS kernel_state (
    id TEXT PRIMARY KEY,
    state TEXT,
    attention REAL,
    stagnation_count INTEGER DEFAULT 0,
    breaker_json TEXT,
    last_cycle_id TEXT,
    updated_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value_json TEXT,
    updated_at DATETIME
  )`
,
  `CREATE TABLE IF NOT EXISTS tombstones (
    id TEXT PRIMARY KEY,
    type TEXT,
    name TEXT,
    digest TEXT,
    archive_ref TEXT,
    deleted_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    type TEXT NOT NULL,
    target TEXT,
    payload_json TEXT,
    created_at DATETIME
  )`
];

let SQL = null;      // sql.js 模块
let db = null;       // 当前连接
let dbPath = null;   // 当前库文件
let lastStat = null; // 上次落盘后的 {mtimeMs, size}（SPEC-6.12 外部改写检测）

// SPEC-6.12 落盘安全：原子写 / 单写者锁 / 容量上限。proot 杀进程是常态，半写即坏库。
const CAP_DEFAULT = 10 * 1024 * 1024;
const LOCK_STALE_DEFAULT = 120000;

function _capBytes() {
  const v = Number(process.env.AING_DB_CAP_BYTES);
  return Number.isFinite(v) && v > 0 ? v : CAP_DEFAULT;
}

function _lockStaleMs() {
  const v = Number(process.env.AING_DB_LOCK_STALE_MS);
  return Number.isFinite(v) && v > 0 ? v : LOCK_STALE_DEFAULT;
}

// 进程存活判定（POSIX/Windows 通用）：signal 0 只探存在；EPERM = 存在但无权。
function _pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

// 陈旧 tmp 清理：进程死在 write 与 rename 之间时，tmp.<pid> 会永久残留。
// 归属 pid 已死 → 孤儿，立即清；pid 活着（可能是慢写者）→ 只按时间阈值清。
// 锁的 staging 文件同理。
function _cleanStaleTmp(fp) {
  const dir = path.dirname(fp);
  const base = path.basename(fp);
  const prefixes = [base + '.tmp.', base + '.lock.staging.'];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return; }
  for (const name of names) {
    const prefix = prefixes.find((p) => name.startsWith(p));
    if (!prefix) continue;
    const p = path.join(dir, name);
    const pid = Number(name.slice(prefix.length));
    const orphan = Number.isInteger(pid) && pid > 0 && !_pidAlive(pid);
    try {
      const st = fs.statSync(p);
      if (orphan || Date.now() - st.mtimeMs > _lockStaleMs()) fs.unlinkSync(p);
    } catch (_) { /* 清理尽力而为，不阻 init */ }
  }
}

// 建锁必须原子：先完整写 staging，再 link 成锁。锁文件一旦出现，内容必定完整，
// 不会出现「空锁 = 无 pid 可查」的死角（proot 下被杀的常见形态）。
function _tryCreateLock(lockPath) {
  const content = JSON.stringify({ pid: process.pid, at: Date.now() });
  const staging = `${lockPath}.staging.${process.pid}`;
  fs.writeFileSync(staging, content);
  try {
    fs.linkSync(staging, lockPath);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    if (e.code === 'EPERM' || e.code === 'ENOSYS' || e.code === 'EXDEV' || e.code === 'EACCES') {
      // 文件系统不支持硬链接（如手机外置 FAT32）：退回 wx 直写
      try { fs.writeFileSync(lockPath, content, { flag: 'wx' }); return true; }
      catch (e2) { if (e2.code === 'EEXIST') return false; throw e2; }
    }
    throw e;
  } finally {
    try { fs.unlinkSync(staging); } catch (_) { /* staging 清不掉不遮主错 */ }
  }
}

/** 开库时顺手清死写者留下的锁（只清死 pid / 过期空锁，活锁一律不动） */
function _cleanDeadLock(lockPath) {
  let st = null;
  try { st = fs.statSync(lockPath); } catch (_) { return false; }
  let dead = false;
  try {
    const obj = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (Number.isInteger(obj.pid) && obj.pid > 0 && obj.pid !== process.pid && !_pidAlive(obj.pid)) dead = true;
  } catch (_) {
    dead = Date.now() - st.mtimeMs >= EMPTY_LOCK_GRACE_MS;
  }
  if (dead) { try { fs.unlinkSync(lockPath); return true; } catch (_) {} }
  return false;
}

const EMPTY_LOCK_GRACE_MS = 50; // 只在无硬链接的回退路径上用：空锁视为「写了一半被打断」

function _acquireLock(lockPath) {
  if (_tryCreateLock(lockPath)) return true;
  let st = null;
  try { st = fs.statSync(lockPath); } catch (_) { return _acquireLock(lockPath); }
  const age = Date.now() - st.mtimeMs;
  let deadOwner = false;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const obj = JSON.parse(raw);
    if (Number.isInteger(obj.pid) && obj.pid > 0 && obj.pid !== process.pid && !_pidAlive(obj.pid)) deadOwner = true;
  } catch (_) {
    // 内容为空/半写：回退路径下只可能是建锁中途被杀；给 50ms 宽限再判死
    if (age >= EMPTY_LOCK_GRACE_MS) deadOwner = true;
  }
  if (deadOwner || age > _lockStaleMs()) {
    try { fs.unlinkSync(lockPath); } catch (_) { /* 被抢先，重试 */ }
    return _acquireLock(lockPath);
  }
  return false;
}

function persist(opts = {}) {
  if (!db || !dbPath) return;
  const bytes = Buffer.from(db.export());
  const cap = _capBytes();
  if (!opts.skipCap && bytes.length > cap && process.env.AING_DB_CAP_ALLOW !== '1') {
    throw new Error(`db-over-cap: 库 ${bytes.length}B 超上限 ${cap}B（AING_DB_CAP_BYTES 可调，AING_DB_CAP_ALLOW=1 放行）`);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const lockPath = dbPath + '.lock';
  if (!_acquireLock(lockPath)) {
    throw new Error('db-locked: 另一写者持有锁（AING_DB_LOCK_STALE_MS 后可接管）');
  }
  try {
    if (lastStat) {
      let st = null;
      try { st = fs.statSync(dbPath); } catch (_) { /* 文件不见了，按新写处理 */ }
      if (st && (Math.abs(st.mtimeMs - lastStat.mtimeMs) > 1 || st.size !== lastStat.size)) {
        throw new Error('db-stale: 库文件在加载后被外部改写，拒绝覆盖');
      }
    }
    const tmp = `${dbPath}.tmp.${process.pid}`;
    let fd = null;
    try {
      fd = fs.openSync(tmp, 'w');
      fs.writeSync(fd, bytes);
      try { fs.fsyncSync(fd); } catch (_) { /* 平台不支持则略过 */ }
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(tmp, dbPath);
    } catch (err) {
      try { if (fd != null) fs.closeSync(fd); } catch (_) { /* 已关 */ }
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* 清理失败不遮主错 */ }
      throw new Error('db-write-failed: ' + err.message);
    }
    const st = fs.statSync(dbPath);
    lastStat = { mtimeMs: st.mtimeMs, size: st.size };
  } finally {
    try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) { /* 放锁失败不遮主错 */ }
  }
}

async function init(dbFilePath) {
  if (!SQL) SQL = await initSqlJs();
  dbPath = dbFilePath;
  _cleanStaleTmp(dbFilePath);
  _cleanDeadLock(dbFilePath + '.lock');
  if (fs.existsSync(dbFilePath)) {
    db = new SQL.Database(fs.readFileSync(dbFilePath));
    const st = fs.statSync(dbFilePath);
    lastStat = { mtimeMs: st.mtimeMs, size: st.size };
  } else {
    db = new SQL.Database();
    lastStat = null;
  }
  // 幂等：IF NOT EXISTS，连跑不炸（AC-2）
  const migrationBefore = {
    missingFile: lastStat == null,
    objects: Number((db.exec('SELECT COUNT(*) FROM sqlite_master')[0] || { values: [[0]] }).values[0][0] || 0)
  };
  for (const stmt of DDL) db.run(stmt);
  // 列迁移（SPEC-6.9b）：老库 meko_cycles 无 kespi_source，先查后补
  let migrated = false;
  if (!columns('meko_cycles').includes('kespi_source')) {
    db.run('ALTER TABLE meko_cycles ADD COLUMN kespi_source TEXT');
    migrated = true;
  }
  // FK 完整性（AC-6）：sql.js 每连接设 ON
  db.run('PRAGMA foreign_keys = ON');
  // 只在真有变化时落盘：纯读命令开库不改文件 mtime（否则会干扰 db-stale 检测、白耗 f2fs 写入）
  const objectsNow = Number((db.exec('SELECT COUNT(*) FROM sqlite_master')[0] || { values: [[0]] }).values[0][0] || 0);
  if (migrationBefore.missingFile || migrated || objectsNow !== migrationBefore.objects) persist({ skipCap: true });
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
