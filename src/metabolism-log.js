#!/usr/bin/env node
/**
 * metabolism-log.js — 代谢运行日志落库（训练反馈信号）
 *
 * 每次 run-metabolism 完整流水线结束后，把 11 步的 status/duration 连同
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
    // W6 (2026-11-03)：kespi_before 改跨 run 口径。runId 每轮由 run-metabolism.js main 重新生成
    // （new Date().toISOString()），旧查询 WHERE run_id = ? 在插入本 run 前恒空 → prev 永远 null →
    // before 永远回退到 after → SkillOpt Gate 的反馈信号恒零差（前差永远是 0）。
    // 现排除本 runId 取代谢日志历史最近一条的 after（代谢持库锁保证串行：上一轮 after = 本轮 before）。
    // 红线：只改查询口径，不动表结构、不写历史行；首次运行无历史时 before=after（分数真没变过，非 bug）。
    const prev = runId
      ? store.get('SELECT kespi_after FROM metabolism_log WHERE run_id != ? ORDER BY id DESC LIMIT 1', [runId])
      : store.get('SELECT kespi_after FROM metabolism_log ORDER BY id DESC LIMIT 1');
    const kespiBefore = (prev && prev.kespi_after != null) ? prev.kespi_after : kespiAfter;

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
