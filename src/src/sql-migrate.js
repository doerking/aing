#!/usr/bin/env node
/**
 * sql-migrate.js — SQLite 迁移脚本（sql.js 版）
 *
 * 功能：
 * 1. 加载 migrations/*.sql 按版本号顺序执行
 * 2. 版本追踪（schema_migrations 表）
 * 3. 幂等：已应用的迁移自动跳过
 *
 * 说明：与 knowledge-store.js 保持同一驱动（sql.js WASM），
 * 避免 better-sqlite3(WAL) 与 sql.js(文件快照) 双驱动读写同一文件的
 * 数据一致性风险。
 *
 * 使用：
 *   node src/sql-migrate.js            # 执行所有未应用的迁移
 *   node src/sql-migrate.js --status   # 查看当前版本
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const DB_PATH = path.join(__dirname, '..', 'knowledge.db');

/**
 * 列出所有迁移文件（按版本号升序）
 */
function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => ({
      version: parseFloat(path.basename(f, '.sql')),
      file: f,
      path: path.join(MIGRATIONS_DIR, f)
    }))
    .filter(m => !isNaN(m.version))
    .sort((a, b) => a.version - b.version);
}

async function main() {
  const args = process.argv.slice(2);
  const statusOnly = args.includes('--status');

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    console.error(`❌ 数据库不存在: ${DB_PATH}（先运行 node src/setup-db.js）`);
    process.exit(1);
  }

  // 版本追踪表
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const migrations = listMigrations();
  const appliedRows = [];
  const stmt = db.prepare('SELECT version FROM schema_migrations');
  while (stmt.step()) appliedRows.push(String(stmt.get()[0]));
  stmt.free();

  if (statusOnly || args.length === 0 && migrations.length === 0) {
    console.log(`📋 迁移状态:`);
    console.log(`   迁移目录: ${MIGRATIONS_DIR} (${migrations.length} 个迁移)`);
    console.log(`   已应用版本: ${appliedRows.length ? appliedRows.join(', ') : '无'}`);
    const dirty = fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    return;
  }

  let applied = 0, skipped = 0;
  for (const m of migrations) {
    const vStr = String(m.version);
    if (appliedRows.includes(vStr)) {
      skipped++;
      continue;
    }
    console.log(`📦 应用迁移 v${vStr} (${m.file})`);
    try {
      db.exec(fs.readFileSync(m.path, 'utf8'));
      db.run('INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)', [vStr]);
      applied++;
      console.log(`✅ 迁移 v${vStr} 完成`);
    } catch (err) {
      console.error(`❌ 迁移 v${vStr} 失败: ${err.message}`);
      break; // 失败即停，保持库与已记录版本一致
    }
  }

  console.log(`\n📊 结果: ${applied} 应用, ${skipped} 跳过`);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('💾 数据库已持久化');
}

main().catch(err => {
  console.error('❌ 迁移失败:', err.message);
  process.exit(1);
});
