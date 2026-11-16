'use strict';
// aing-v2 trajectory.js —— M6 任务 6.4 实现（SPEC-6.4 任务轨迹消费）
// 缺口来源：docs/Engineering/CONSUMER-AUDIT-2026-11-16.md 缺口 3 第一件。
// 表口径沿用旧院 aing/src/trajectory-store.js：同 13 列 + 三索引。
// 本件先接两条写入链：会话（6.1 六段 / 3.13 三源）与代谢轮；episode/rollout 留后续。
// 铁律：不改实体正文、不碰 last_access；轨迹只追加（同 id 跳过）；store 由调用方注入。

const { parseBody, readableTopic } = require('./conv-text.js');

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function _body(entity) {
  try {
    const o = JSON.parse((entity && entity.content) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (_) { return {}; }
}

/** 一条会话实体的轨迹（六段或三源两种 content 形状） */
function buildSessionTrajectory(entity) {
  if (!entity || !entity.id) return null;
  const b = _body(entity);
  const route = [readableTopic(entity.name, b) || entity.id];
  const isNarrative = b.format === 'capability-narrative-v1' || Array.isArray(b.turns);

  if (isNarrative) {
    const turns = Array.isArray(b.turns) ? b.turns : [];
    const tools = [];
    const stepSequence = [];
    for (const t of turns) {
      if (String(t.scene || '').trim()) stepSequence.push('场景');
      if (String(t.thinking || '').trim()) stepSequence.push('思维');
      const ts = Array.isArray(t.tools) ? t.tools : [];
      for (const x of ts) {
        if (x && x.name && !tools.includes(x.name)) tools.push(x.name);
      }
      if (ts.some((x) => x && x.isSub)) stepSequence.push('编排');
      if (ts.some((x) => x && !x.isSub)) stepSequence.push('手段');
      if (String(t.output || '').trim()) stepSequence.push('产出');
    }
    const success = turns.some((t) => String(t.output || '').trim());
    const stats = b.stats || {};
    return {
      id: 'traj-' + entity.id,
      task_type: 'session',
      route,
      tools,
      step_sequence: stepSequence,
      success: success ? 1 : 0,
      evidence: {
        convId: entity.id,
        format: b.format || 'capability-narrative-v1',
        trigger: b.trigger || null,
        toolCalls: Number(stats.toolCalls || 0),
        turnCount: Number(stats.turnCount || turns.length),
        bodyChars: Number(stats.bodyChars || 0),
        calibrations: Array.isArray(b.calibrations) ? b.calibrations.length : 0
      },
      source: 'session-narrative'
    };
  }

  if (typeof b.reply === 'string' && b.reply.trim()) {
    const stepSequence = [];
    stepSequence.push('回复');
    if (Array.isArray(b.searchShown) && b.searchShown.length) stepSequence.push('搜索展示');
    if (String(b.rationale || '').trim()) stepSequence.push('事由分析');
    return {
      id: 'traj-' + entity.id,
      task_type: 'session',
      route,
      tools: [],
      step_sequence: stepSequence,
      success: 1,
      evidence: {
        convId: entity.id,
        format: 'session-three-source',
        outcome: b.outcome || 'open',
        searchShown: Array.isArray(b.searchShown) ? b.searchShown.length : 0
      },
      source: 'session-three-source'
    };
  }

  return buildMarkdownTrajectory(entity) || null;
}

/** 非 JSON 的 Conversation 正文：按二级以下小节落轨迹（SPEC-6.4b） */
function buildMarkdownTrajectory(entity) {
  const raw = entity && entity.content != null ? String(entity.content) : '';
  const text = raw.trim();
  if (!text) return null;
  // 能解析成 JSON 的（含不认识的怪对象）不按 markdown 回填，避免把 JSON 原文当正文
  try { JSON.parse(text); return null; } catch (_) { /* 非 JSON，继续 */ }

  const lines = text.split(/\r?\n/);
  const sections = [];
  for (const line of lines) {
    const m = /^#{2,6}\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const s = m[1].trim();
    if (s && !sections.includes(s)) sections.push(s);
  }
  const title = (lines.find(l => /^#\s+/.test(l)) || '').replace(/^#\s+/, '').trim();

  return {
    id: 'traj-' + entity.id,
    task_type: 'session',
    route: [readableTopic(entity.name, parseBody(entity)) || title || entity.id],
    tools: [],
    step_sequence: sections.length ? sections : ['正文'],
    success: 1,
    evidence: {
      convId: entity.id,
      format: 'markdown-conversation',
      bodyChars: text.length,
      sectionCount: sections.length,
      sections
    },
    source: 'session-markdown'
  };
}

/** 只追加：同 id 已存在即跳过 */
function logTrajectory(store, input = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('trajectory 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const id = String(input.id || ('traj-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)));
  const existing = _scalar(db, 'SELECT id FROM task_trajectories WHERE id = ?', [id]);
  if (existing) return { id, skipped: true };
  const stmt = db.prepare(
    `INSERT INTO task_trajectories
     (id, task_type, route, tools, step_sequence, success, retries, duration_ms, score_soft, score_hard, evidence, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run([
    id,
    String(input.task_type || input.taskType || 'unknown'),
    JSON.stringify(input.route || []),
    JSON.stringify(input.tools || []),
    JSON.stringify(input.step_sequence || input.stepSequence || []),
    Number(input.success) ? 1 : 0,
    Number(input.retries || 0),
    Number(input.duration_ms || input.durationMs || 0),
    Number(input.score_soft || input.scoreSoft || 0),
    Number(input.score_hard == null ? (input.scoreHard == null ? 0 : input.scoreHard) : input.score_hard),
    JSON.stringify(input.evidence || {}),
    String(input.source || 'unknown')
  ]);
  stmt.free();
  store._persist();
  return { id, logged: true };
}

/** 批量同步有效 Conversation 实体 */
async function syncSessions(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('trajectory 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const rows = _rows(
    db,
    `SELECT * FROM entities
     WHERE type = 'Conversation' AND status = 'active' AND invalid_at IS NULL
     ORDER BY id`
  );
  const stats = { scanned: 0, logged: 0, skipped: 0, noBody: 0 };
  for (const e of rows) {
    stats.scanned++;
    const t = buildSessionTrajectory(e);
    if (!t) { stats.noBody++; continue; }
    const r = logTrajectory(store, t);
    if (r.skipped) stats.skipped++; else stats.logged++;
  }
  return stats;
}

/** 每轮编排一条（best-effort，调用方包 try/catch） */
async function logCycle(store, info = {}) {
  const results = Array.isArray(info.results) ? info.results : [];
  const seq = [];
  for (const r of results) {
    if (r && r.id && !seq.includes(r.id)) seq.push(r.id);
  }
  return logTrajectory(store, {
    id: 'traj-cycle-' + (info.cycleId || Date.now()),
    task_type: 'metabolism',
    route: seq.slice(),
    step_sequence: seq,
    success: info.ok ? 1 : 0,
    duration_ms: Number(info.elapsedMs || 0),
    evidence: {
      cycleId: info.cycleId || null,
      rounds: Number(info.rounds || 0),
      failedStep: info.failedStep || null,
      resultCount: results.length
    },
    source: 'meko-orchestrator'
  });
}

/** 旧院 growth-loop episodes → 轨迹（episode 链）。同 id 幂等。 */
function logFromGrowthLoop(store, episodes = []) {
  let imported = 0, skipped = 0;
  for (const ep of Array.isArray(episodes) ? episodes : []) {
    if (!ep || !ep.id) { skipped++; continue; }
    const route = Array.isArray(ep.route) ? ep.route.map(String) : [];
    const r = logTrajectory(store, {
      id: String(ep.id),
      task_type: ep.taskType || ep.task_type || 'unknown',
      route,
      step_sequence: route,
      success: ep.success ? 1 : 0,
      retries: ep.retries || 0,
      duration_ms: ep.durationMs || ep.duration_ms || 0,
      evidence: { lesson: ep.lesson || null, evidence: ep.evidence || null, patternKey: ep.patternKey || null },
      source: 'growth-loop'
    });
    if (r.skipped) skipped++; else imported++;
  }
  return { imported, skipped };
}

/** 旧院代谢决策因果链 → 轨迹（每步一条，缺 step 跳过）。同 step+timestamp 幂等。 */
function logFromLineage(store, rows = []) {
  let imported = 0, skipped = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.step) { skipped++; continue; }
    const ok = String(r.outcome || '').toLowerCase() === 'success';
    const ev = r.evidence && typeof r.evidence === 'object' ? r.evidence : {};
    const res = logTrajectory(store, {
      id: `metabolism-${r.step}-${r.timestamp || 0}`,
      task_type: 'metabolism',
      route: [String(r.step)],
      step_sequence: [String(r.step)],
      success: ok ? 1 : 0,
      duration_ms: Number(ev.durationMs || ev.duration || 0) || 0,
      score_hard: ok ? 1 : 0,
      evidence: {
        action: r.action || null,
        target: r.target || null,
        reason: r.reason || null,
        alternatives: r.alternatives || null,
        causalChain: r.causalChain || null
      },
      source: 'metabolism-decision-lineage'
    });
    if (res.skipped) skipped++; else imported++;
  }
  return { imported, skipped };
}

async function listTrajectories(store, opts = {}) {
  const db = store._getDb();
  let sql = 'SELECT * FROM task_trajectories';
  const binds = [];
  if (opts.taskType) { sql += ' WHERE task_type = ?'; binds.push(String(opts.taskType)); }
  sql += ' ORDER BY created_at DESC, rowid DESC';
  if (Number.isInteger(opts.limit) && opts.limit > 0) { sql += ' LIMIT ?'; binds.push(opts.limit); }
  return _rows(db, sql, binds);
}

async function stats(store) {
  const db = store._getDb();
  const rows = _rows(db, 'SELECT task_type, success, COUNT(*) AS n FROM task_trajectories GROUP BY task_type, success');
  const byType = {};
  let total = 0, success = 0;
  for (const r of rows) {
    const n = Number(r.n);
    byType[r.task_type] = (byType[r.task_type] || 0) + n;
    total += n;
    if (Number(r.success) === 1) success += n;
  }
  return { total, success, byType };
}

module.exports = {
  buildSessionTrajectory, buildMarkdownTrajectory, logTrajectory, syncSessions, logCycle, logFromGrowthLoop, logFromLineage, listTrajectories, stats
};
