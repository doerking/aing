#!/usr/bin/env node
/**
 * setup-db.js — 数据库初始化 / 重置工具
 * 
 * 功能：
 *   1. 创建新的 knowledge.db（如果不存在）
 *   2. 重置现有数据库（删除所有数据，保留表结构）
 *   3. 验证数据库完整性
 * 
 * 使用：
 *   node src/setup-db.js              # 初始化（如果不存在则创建）
 *   node src/setup-db.js --reset      # 重置（删除所有数据）
 *   node src/setup-db.js --verify     # 验证数据库完整性
 *   node src/setup-db.js --backup     # 备份当前数据库
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', 'knowledge.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

/**
 * 建表 SQL（与 knowledge-store.js 保持一致）
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active',
  confidence REAL DEFAULT 0.0,
  source_file TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, target_id),
  FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS type_index (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id),
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entity_metadata (
  entity_id TEXT PRIMARY KEY,
  originality REAL DEFAULT 0.0,
  relevance REAL DEFAULT 0.0,
  consistency REAL DEFAULT 0.0,
  provability REAL DEFAULT 0.0,
  utility REAL DEFAULT 0.0,
  kespi_score REAL DEFAULT 0.0,
  last_checked_at DATETIME,
  metadata TEXT DEFAULT '{}',
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entity_embeddings (
  entity_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  dimension INTEGER NOT NULL,
  model TEXT DEFAULT 'char-ngram-hash-64',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_code INTEGER NOT NULL,
  error_type TEXT NOT NULL,
  entity_id TEXT,
  message TEXT NOT NULL,
  context TEXT DEFAULT '{}',
  retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

CREATE TABLE IF NOT EXISTS kespi_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  overall_score REAL NOT NULL,
  dimension_scores TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  kespi_avg REAL,
  details TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
CREATE INDEX IF NOT EXISTS idx_error_log_status ON error_log(status);
CREATE INDEX IF NOT EXISTS idx_kespi_history_entity ON kespi_history(entity_id);
`;

/**
 * 创建新数据库
 */
async function createDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  // 执行建表 SQL
  db.run(SCHEMA_SQL);
  
  // 保存到文件
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  db.close();
  
  console.log(`✅ 数据库已创建: ${DB_PATH}`);
  console.log(`   大小: ${(buffer.length / 1024).toFixed(1)} KB`);
}

/**
 * 重置数据库（删除所有数据，保留表结构）
 */
async function resetDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('ℹ️ 数据库不存在，将创建新库');
    await createDatabase();
    return;
  }
  
  // 备份
  await backupDatabase();
  
  // 删除并重建
  fs.unlinkSync(DB_PATH);
  await createDatabase();
  console.log('✅ 数据库已重置（原数据已备份）');
}

/**
 * 验证数据库完整性
 */
async function verifyDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ 数据库不存在');
    return false;
  }
  
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);
  
  // 检查所有表是否存在（与 knowledge-store._initTables 保持一致）
  const tables = ['entities', 'links', 'type_index', 'entity_metadata', 'entity_embeddings', 'error_log', 'kespi_history', 'system_log'];
  let allOk = true;
  
  console.log('\n🔍 数据库完整性检查:\n');
  
  for (const table of tables) {
    const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
    const exists = result.length > 0 && result[0].values.length > 0;
    console.log(`   ${exists ? '✅' : '❌'} ${table}`);
    if (!exists) allOk = false;
  }
  
  // 统计
  console.log('\n📊 数据统计:');
  for (const table of tables) {
    try {
      const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
      const count = result.length > 0 ? result[0].values[0][0] : 0;
      console.log(`   ${table}: ${count} 条`);
    } catch (e) {
      console.log(`   ${table}: 查询失败`);
    }
  }
  
  // 完整性检查
  try {
    const integrity = db.exec('PRAGMA integrity_check');
    const ok = integrity.length > 0 && integrity[0].values[0][0] === 'ok';
    console.log(`\n   ${ok ? '✅' : '❌'} 完整性: ${ok ? '通过' : '失败'}`);
    if (!ok) allOk = false;
  } catch (e) {
    console.log(`\n   ❌ 完整性检查失败: ${e.message}`);
    allOk = false;
  }
  
  db.close();
  
  console.log(`\n${allOk ? '✅ 数据库状态正常' : '❌ 数据库存在问题'}`);
  return allOk;
}

/**
 * 备份数据库
 */
async function backupDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('ℹ️ 数据库不存在，无需备份');
    return;
  }
  
  // 确保备份目录存在
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  // 生成备份文件名（带时间戳）
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `knowledge-${timestamp}.db`);
  
  // 复制文件
  fs.copyFileSync(DB_PATH, backupPath);
  
  const stats = fs.statSync(backupPath);
  console.log(`✅ 备份完成: ${backupPath}`);
  console.log(`   大小: ${(stats.size / 1024).toFixed(1)} KB`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  console.log('🗄️  aing 数据库管理工具\n');
  
  if (args.includes('--reset')) {
    await resetDatabase();
  } else if (args.includes('--verify')) {
    await verifyDatabase();
  } else if (args.includes('--backup')) {
    await backupDatabase();
  } else {
    // 默认：初始化
    if (fs.existsSync(DB_PATH)) {
      console.log('ℹ️ 数据库已存在');
      await verifyDatabase();
    } else {
      await createDatabase();
    }
  }
}

main().catch(err => {
  console.error('❌ 操作失败:', err.message);
  process.exit(1);
});
