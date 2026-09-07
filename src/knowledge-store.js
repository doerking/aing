#!/usr/bin/env node
/**
 * knowledge-store.js — SQLite 知识库存储层（纯 JS 版本）
 * 
 * 使用 sql.js 替代 better-sqlite3（无需编译）
 * 
 * 功能：
 * 1. 实体 CRUD
 * 2. 链接管理
 * 3. 类型索引
 * 4. 向量存储
 * 5. 错误日志
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

class KnowledgeStore {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '..', 'knowledge.db');
    this.db = null;
  }

  /**
   * 初始化数据库
   */
  async init() {
    const SQL = await initSqlJs();
    
    // 加载或创建数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    
    this._initTables();
    this._save();
    console.log(`📦 数据库已加载: ${this.dbPath}`);
  }

  /**
   * 创建表结构
   */
  _initTables() {
    this.db.run(`
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
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS links (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        confidence REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (source_id, target_id),
        FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS type_index (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entity_type, entity_id),
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
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
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS entity_embeddings (
        entity_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        dimension INTEGER NOT NULL,
        model TEXT DEFAULT 'char-ngram-hash-64',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
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
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS kespi_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        overall_score REAL NOT NULL,
        dimension_scores TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS system_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        action TEXT NOT NULL,
        kespi_avg REAL,
        details TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_error_log_status ON error_log(status)`);
  }

  /**
   * 保存数据库到文件
   */
  _save() {
    // 原子写：先写临时文件再 rename，避免进程崩溃在写入中途产生截断的损坏库文件
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const tmpPath = `${this.dbPath}.tmp`;
    try {
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, this.dbPath);
    } catch (err) {
      // rename 失败时回退为直接写（Windows 上 rename 覆盖已存在文件通常没问题）
      try { fs.writeFileSync(this.dbPath, buffer); } catch (_) {}
      throw err;
    }
  }

  /**
   * 执行 SQL（非查询）
   */
  run(sql, params = []) {
    this.db.run(sql, params);
    this._save();
  }

  /**
   * 查询单条结果
   */
  get(sql, params = []) {
    const result = this.exec(sql, params);
    if (result.length === 0) {
      return null;
    }
    return result[0];
  }

  /**
   * 查询多条结果
   */
  all(sql, params = []) {
    return this.exec(sql, params);
  }

  /**
   * 执行 SQL 并返回结果
   */
  exec(sql, params = []) {
    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    const values = result[0].values;
    const rows = [];
    
    for (let i = 0; i < values.length; i++) {
      const row = {};
      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = values[i][j];
      }
      rows.push(row);
    }
    
    return rows;
  }

  /**
   * 保存实体
   */
  saveEntity(entity) {
    const { id, name, type, content, tags = [], status = 'active', confidence = 0.0, source_file = null } = entity;
    
    // UPSERT：已存在则更新内容与元数据（而非抛 UNIQUE 异常）
    this.run(`
      INSERT INTO entities (id, name, type, content, tags, status, confidence, source_file, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        content = excluded.content,
        tags = excluded.tags,
        status = excluded.status,
        confidence = excluded.confidence,
        source_file = excluded.source_file,
        updated_at = datetime('now')
    `, [id, name, type, content, JSON.stringify(tags), status, confidence, source_file]);
    
    // 类型变更时清理旧索引，避免同一实体在 type_index 残留多条
    this.run(`
      DELETE FROM type_index WHERE entity_id = ? AND entity_type != ?
    `, [id, type]);
    this.run(`
      INSERT OR REPLACE INTO type_index (entity_type, entity_id)
      VALUES (?, ?)
    `, [type, id]);
    
    console.log(`  ✅ 实体已保存: ${id}`);
  }

  /**
   * 获取实体
   */
  getEntity(id) {
    return this.get(`
      SELECT e.*, m.*
      FROM entities e
      LEFT JOIN entity_metadata m ON e.id = m.entity_id
      WHERE e.id = ?
    `, [id]);
  }

  /**
   * 获取所有实体
   */
  getEntities(filters = {}) {
    let sql = 'SELECT e.*, m.* FROM entities e LEFT JOIN entity_metadata m ON e.id = m.entity_id';
    const params = [];
    const conditions = [];

    if (filters.type) {
      conditions.push('e.type = ?');
      params.push(filters.type);
    }
    if (filters.status) {
      conditions.push('e.status = ?');
      params.push(filters.status);
    }
    if (filters.minKespi !== undefined) {
      conditions.push('(m.kespi_score >= ? OR m.kespi_score IS NULL)');
      params.push(filters.minKespi);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY e.updated_at DESC';
    return this.all(sql, params);
  }

  /**
   * 保存链接
   */
  saveLink(sourceId, targetId, relation, confidence = 0.0) {
    this.run(`
      INSERT OR REPLACE INTO links (source_id, target_id, relation, confidence)
      VALUES (?, ?, ?, ?)
    `, [sourceId, targetId, relation, confidence]);
  }

  /**
   * 获取实体链接
   */
  getLinks(entityId) {
    return this.all(`
      SELECT l.*, target.name as target_name, target.type as target_type
      FROM links l
      JOIN entities target ON l.target_id = target.id
      WHERE l.source_id = ? OR l.target_id = ?
    `, [entityId, entityId]);
  }

  /**
   * 保存 KESPI 评分（5维兼容）
   */
  saveKespiScore(entityId, scores) {
    const { originality, relevance, consistency, provability, utility } = scores;
    const kespiScore = (originality + relevance + consistency + provability + utility) / 5;

    this.run(`
      INSERT INTO entity_metadata (entity_id, originality, relevance, consistency, provability, utility, kespi_score, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(entity_id) DO UPDATE SET
        originality = excluded.originality,
        relevance = excluded.relevance,
        consistency = excluded.consistency,
        provability = excluded.provability,
        utility = excluded.utility,
        kespi_score = excluded.kespi_score,
        last_checked_at = datetime('now')
    `, [entityId, originality, relevance, consistency, provability, utility, kespiScore]);
  }

  /**
   * 保存 KESPI 历史（8维）
   */
  saveKespiHistory(entityId, overallScore, dimensionScores) {
    this.run(`
      INSERT INTO kespi_history (entity_id, overall_score, dimension_scores)
      VALUES (?, ?, ?)
    `, [entityId, overallScore, JSON.stringify(dimensionScores)]);
  }

  /**
   * 获取实体最新 KESPI 历史
   */
  getLatestKespi(entityId) {
    return this.get(`
      SELECT dimension_scores, overall_score
      FROM kespi_history
      WHERE entity_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [entityId]);
  }

  /**
   * 获取所有实体的最新 KESPI 历史
   */
  getAllLatestKespi() {
    return this.all(`
      SELECT kh.entity_id, kh.dimension_scores, kh.overall_score
      FROM kespi_history kh
      INNER JOIN (
        SELECT entity_id, MAX(created_at) as max_created
        FROM kespi_history
        GROUP BY entity_id
      ) latest ON kh.entity_id = latest.entity_id AND kh.created_at = latest.max_created
    `);
  }

  /**
   * 记录错误
   */
  logError(error) {
    this.run(`
      INSERT INTO error_log (error_code, error_type, entity_id, message, context, retries, max_retries)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      error.code,
      error.type,
      error.entityId || null,
      error.message,
      JSON.stringify(error.context || {}),
      error.retries || 0,
      error.maxRetries || 3
    ]);
  }

  /**
   * 获取待处理错误
   */
  getPendingErrors(limit = 10) {
    return this.all(`
      SELECT * FROM error_log
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * 标记错误已解决
   */
  resolveError(errorId) {
    this.run(`
      UPDATE error_log SET status = 'resolved', resolved_at = datetime('now')
      WHERE id = ?
    `, [errorId]);
  }

  /**
   * 保存向量
   */
  saveEmbedding(entityId, embedding) {
    // 浮点向量必须用 Float32Array 编码（每分量4字节）；
    // 直接 Buffer.from(float数组) 会把 0~1 值截断成整数0，读取端 readFloatLE 完全对不上
    const float32 = new Float32Array(embedding);
    const buffer = Buffer.from(float32.buffer);
    this.run(`
      INSERT OR REPLACE INTO entity_embeddings (entity_id, embedding, dimension, model)
      VALUES (?, ?, ?, ?)
    `, [entityId, buffer, embedding.length, 'char-ngram-hash-64']);
  }

  /**
   * 获取向量
   */
  getEmbedding(entityId) {
    return this.get(`
      SELECT * FROM entity_embeddings WHERE entity_id = ?
    `, [entityId]);
  }

  /**
   * 统计信息
   */
  getStats() {
    const entityCount = this.get('SELECT COUNT(*) as count FROM entities');
    const linkCount = this.get('SELECT COUNT(*) as count FROM links');
    const avgKespi = this.get('SELECT AVG(kespi_score) as avg FROM entity_metadata');
    const pendingErrors = this.get("SELECT COUNT(*) as count FROM error_log WHERE status = 'pending'");

    return {
      entities: entityCount ? entityCount.count : 0,
      links: linkCount ? linkCount.count : 0,
      avgKespi: avgKespi ? (avgKespi.avg || 0) : 0,
      pendingErrors: pendingErrors ? pendingErrors.count : 0
    };
  }

  /**
   * 关闭连接
   */
  close() {
    this._save();
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = KnowledgeStore;
