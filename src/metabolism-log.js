#!/usr/bin/env node
/**
 * metabolism-log.js — 代谢运行日志落库（训练反馈信号）
 *
 * 每次 run-metabolism 完整流水线结束后，把 10 步的 status/duration 连同
 * kespi_before / kespi_after（全库平均 KESPI）写入 metabolism_log 表。
 * 该表是 SkillOpt Gate 评分的反馈信号源（训练三件套之三）。
 *
 * 用法（作为模块）：
 *   const { logMetabolismRun } = require('./metabolism-log');
 *   await logMetabolismRun({ runId, steps: state.steps });
 *
 * 独立补录历史（可选）：
 *   node metabolism-log.js --ensure-table
 */

const KnowledgeStore = require('./knowledge-store');

const DB_PATH = require('path').join(__dirname, '..', 'knowledge.db');

async function ensureTable(store) {
  store.run(`CREATE TABLE IF NOT EXISTS metabolism_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    kespi_before REAL,
    kespi_after REAL,
    details TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function avgKespi(store) {
  const row = store.get('SELECT AVG(kespi_score) AS avg FROM entity_metadata');
  return row && row.avg != null ? Number(row.avg.toFixed(4)) : null;
}

/**
 * 把一次完整代谢写入 metabolism_log。
 * steps 结构同 run-metabolism 的 state.steps：{ [stepName]: { status, duration, error? } }
 */
async function logMetabolismRun({ runId = null, steps = {} }) {
  const store = new KnowledgeStore(DB_PATH);
  await store.init();
  try {
    await ensureTable(store);
    const kespiAfter = await avgKespi(store);
    // kespi_before 取本 run_id 上一条记录的 after；没有则取当前（首次运行）
    const prev = store.get(
      'SELECT kespi_after FROM metabolism_log WHERE run_id = ? ORDER BY id DESC LIMIT 1',
      [runId]
    );
    const kespiBefore = prev ? prev.kespi_after : kespiAfter;

    const names = Object.keys(steps);
    for (const step of names) {
      const s = steps[step];
      store.run(
        `INSERT INTO metabolism_log (run_id, step, status, duration_ms, kespi_before, kespi_after, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [runId, step, s.status || 'unknown', s.duration || 0, kespiBefore, kespiAfter,
         JSON.stringify({ error: s.error || null })]
      );
    }
    return { logged: names.length, kespiBefore, kespiAfter };
  } finally {
    store.close();
  }
}

// CLI: --ensure-table 幂等建表
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--ensure-table')) {
    (async () => {
      const store = new KnowledgeStore(DB_PATH);
      await store.init();
      try { await ensureTable(store); console.log('✅ metabolism_log 表就绪'); }
      finally { store.close(); }
    })();
  } else {
    console.log('用法: node metabolism-log.js --ensure-table');
    console.log('（正常运行时由 run-metabolism.js 自动调用 logMetabolismRun）');
  }
}

module.exports = { logMetabolismRun, ensureTable, avgKespi };
