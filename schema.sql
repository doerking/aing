-- aing schema (idempotent, safe to re-run)
-- NOTE: This schema matches knowledge-store.js (sql.js in-memory SQLite).
-- Most aing scripts use fs-based storage (wiki/entities/*.md, wiki/links/*.md).
-- Only knowledge-store.js uses SQLite.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Core entities
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

-- Links between entities
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

-- Type index for fast entity-type lookups
CREATE TABLE IF NOT EXISTS type_index (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id),
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Entity metadata: KESPI scores (5-dim: originality/relevance/consistency/provability/utility)
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

-- Entity embeddings (64-dim char n-gram hash via vector-search.js)
CREATE TABLE IF NOT EXISTS entity_embeddings (
  entity_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  dimension INTEGER NOT NULL,
  model TEXT DEFAULT 'char-ngram-hash-64',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Error log for self-growth error handling
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

-- KESPI history: 8-dim scores per check (KQ/KG/KA/KM/KD/KC/KR/KB)
CREATE TABLE IF NOT EXISTS kespi_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  overall_score REAL NOT NULL,
  dimension_scores TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Metabolism log: per-step run records with KESPI feedback (training signal)
CREATE TABLE IF NOT EXISTS metabolism_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  kespi_before REAL,
  kespi_after REAL,
  details TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
CREATE INDEX IF NOT EXISTS idx_error_log_status ON error_log(status);
CREATE INDEX IF NOT EXISTS idx_kespi_history_entity ON kespi_history(entity_id);
