#!/usr/bin/env node
/**
 * trajectory-store.js — 层 4 轨迹表（M4 数据前提）
 *
 * SQLite 表: task_trajectories
 * 字段: id / task_type / route(JSON) / tools(JSON) / step_sequence(JSON) /
 *       success(0/1) / retries / duration_ms / score_soft / score_hard /
 *       evidence(JSON) / source / created_at
 *
 * 写入链路:
 *   1. growth-loop.recordEpisode() → trajectory-store.logEpisode()
 *   2. SkillOpt adapter rollout → trajectory-store.logRollout()
 *   3. tri-path-orchestrator execute() → trajectory-store.logTriPath()
 *   4. 代谢管线 run-metabolism → trajectory-store.logMetabolism()
 *
 * 用法:
 *   node trajectory-store.js --init          # 建表
 *   node trajectory-store.js --count         # 统计
 *   node trajectory-store.js --sample 5       # 抽样
 *   node trajectory-store.js --by-type        # 按类型统计
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

const DB_PATH = path.join(__dirname, '..', 'knowledge.db');

class TrajectoryStore {
  constructor(dbPath) {
    this.store = new KnowledgeStore(dbPath || DB_PATH);
    this.db = null;
  }

  async init() {
    await this.store.init();
    this.db = this.store.db;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.run(`CREATE TABLE IF NOT EXISTS task_trajectories (
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
    )`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_traj_type ON task_trajectories(task_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_traj_success ON task_trajectories(success)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_traj_source ON task_trajectories(source)`);
  }

  /**
   * 记录一条任务轨迹
   */
  log(input) {
    const id = input.id || `traj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.run(
      `INSERT OR REPLACE INTO task_trajectories
       (id, task_type, route, tools, step_sequence, success, retries, duration_ms, score_soft, score_hard, evidence, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(input.task_type || input.taskType || 'unknown'),
        JSON.stringify(input.route || []),
        JSON.stringify(input.tools || []),
        JSON.stringify(input.step_sequence || input.stepSequence || []),
        input.success ? 1 : 0,
        Number(input.retries || 0),
        Number(input.duration_ms || input.durationMs || 0),
        Number(input.score_soft || input.scoreSoft || 0),
        Number(input.score_hard ?? input.scoreHard ?? 0),
        JSON.stringify(input.evidence || {}),
        String(input.source || 'unknown'),
      ]
    );
    this.store._save();
    return { id, logged: true };
  }

  /**
   * 批量记录（从 growth-loop episodes 导入）
   */
  logFromGrowthLoop(episodes) {
    let count = 0;
    for (const ep of episodes) {
      this.log({
        id: ep.id,
        task_type: ep.taskType,
        route: ep.route,
        step_sequence: ep.route,
        success: ep.success,
        retries: ep.retries,
        duration_ms: ep.durationMs,
        evidence: { lesson: ep.lesson, evidence: ep.evidence, patternKey: ep.patternKey },
        source: 'growth-loop',
      });
      count++;
    }
    return { imported: count };
  }

  /**
   * 从代谢日志导入
   */
  logFromMetabolism(steps) {
    let count = 0;
    for (const [name, step] of Object.entries(steps)) {
      this.log({
        id: `metabolism-${name}-${step.timestamp}`,
        task_type: 'metabolism',
        route: [name],
        step_sequence: [name],
        success: step.status === 'success' ? 1 : 0,
        duration_ms: step.duration || 0,
        score_hard: step.status === 'success' ? 1 : 0,
        evidence: { error: step.error || null },
        source: 'run-metabolism',
      });
      count++;
    }
    return { imported: count };
  }

  count() {
    const row = this.db.exec('SELECT COUNT(*) AS n FROM task_trajectories');
    return row.length ? row[0].values[0][0] : 0;
  }

  byType() {
    const rows = this.db.exec(
      `SELECT task_type, COUNT(*) AS n, SUM(success) AS success_count, AVG(duration_ms) AS avg_ms
       FROM task_trajectories GROUP BY task_type ORDER BY n DESC`
    );
    if (!rows.length) return [];
    const cols = rows[0].columns;
    return rows[0].values.map(v => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = v[i]);
      return obj;
    });
  }

  sample(n = 5) {
    const rows = this.db.exec(
      `SELECT * FROM task_trajectories ORDER BY created_at DESC LIMIT ${Number(n)}`
    );
    if (!rows.length) return [];
    const cols = rows[0].columns;
    return rows[0].values.map(v => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = v[i]);
      // 解析 JSON 字段
      for (const f of ['route', 'tools', 'step_sequence', 'evidence']) {
        try { obj[f] = JSON.parse(obj[f] || '{}'); } catch (e) {}
      }
      return obj;
    });
  }

  close() {
    try { this.store.close(); } catch (e) {}
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const ts = new TrajectoryStore();
  await ts.init();

  if (args.includes('--init')) {
    console.log('✅ task_trajectories 表就绪');
  } else if (args.includes('--count')) {
    console.log(`轨迹总数: ${ts.count()}`);
  } else if (args.includes('--by-type')) {
    console.table(ts.byType());
  } else if (args.includes('--sample')) {
    const n = parseInt(args[args.indexOf('--sample') + 1]) || 5;
    const samples = ts.sample(n);
    for (const s of samples) {
      console.log(`\n${s.id} | type=${s.task_type} success=${s.success} ${s.duration_ms}ms source=${s.source}`);
      console.log(`  route: ${JSON.stringify(s.route)}`);
      console.log(`  evidence: ${JSON.stringify(s.evidence).slice(0, 120)}`);
    }
  } else if (args.includes('--import-growth-loop')) {
    const GrowthLoop = require('./growth-loop');
    const loop = new GrowthLoop();
    const result = ts.logFromGrowthLoop(loop.state.episodes);
    console.log(`从 growth-loop 导入: ${result.imported} 条轨迹`);
  } else if (args.includes('--import-metabolism')) {
    const lastRun = path.join(__dirname, '..', 'logs', 'metabolism-last-run.json');
    if (fs.existsSync(lastRun)) {
      const data = JSON.parse(fs.readFileSync(lastRun, 'utf8'));
      const result = ts.logFromMetabolism(data.steps || {});
      console.log(`从代谢日志导入: ${result.imported} 条轨迹`);
    } else {
      console.log('未找到代谢日志');
    }
  } else {
    console.log('用法:');
    console.log('  --init                # 建表');
    console.log('  --count               # 统计');
    console.log('  --by-type             # 按类型统计');
    console.log('  --sample [n]          # 抽样 n 条');
    console.log('  --import-growth-loop   # 从 growth-loop 导入');
    console.log('  --import-metabolism    # 从代谢日志导入');
  }

  ts.close();
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = TrajectoryStore;
