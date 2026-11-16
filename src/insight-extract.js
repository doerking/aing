'use strict';
// aing-v2 insight-extract.js —— 任务 6.5 洞察抽取（只写候选实体）
// 契约见 spec/SPEC-6.5-成长观察四件.md §2.4：轮级条件+动作 → KESPI 快照变化，
// 落 raw 链候选实体（pending-distillation、confidence 0、type MetaKnowledge），走蒸馏门。
// 铁律：不改已有实体、不碰 last_access、无物理删除、不直连 knowledge-store。

const crypto = require('crypto');

const CYCLE_WINDOW = 8;   // 回看周期数
const INSIGHT_MAX = 3;    // 最多落几条洞察候选

function round4(x) { return Math.round(Number(x) * 1e4) / 1e4; }

function rowsOf(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function conditionOf(c) {
  const growth = Number(c.growth) || 0;
  const pruned = Number(c.pruned) || 0;
  if (growth > 0 && pruned > 0) return 'balanced';
  if (growth > 0) return 'growth-only';
  if (pruned > 0) return 'prune-only';
  return 'idle';
}

function topAction(db, cycleId) {
  const rows = rowsOf(db,
    `SELECT action, COUNT(*) AS n FROM field_actions
     WHERE cycle_id = ? GROUP BY action ORDER BY n DESC, action ASC LIMIT 1`, [cycleId]);
  return rows.length ? String(rows[0].action) : 'none';
}

function insightId(condition, action) {
  return 'raw-insight-' + crypto.createHash('sha1')
    .update(condition + '\u0000' + action).digest('hex').slice(0, 8);
}

function contentOf(condition, action, effect, samples) {
  const sign = effect >= 0 ? '+' : '';
  return [
    `条件：${condition}（该轮生长/修剪状态）`,
    `动作：${action}（该轮主动作）`,
    `效果：KESPI 快照均值 ${sign}${effect.toFixed(4)}（轮级差分）`,
    `样本量：${samples} 轮`,
    '统计相关，不作因果；confidence 0 待蒸馏。'
  ].join('\n');
}

async function extractInsights(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('insight-extract 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const windowN = Number.isInteger(opts.window) && opts.window > 0 ? opts.window : CYCLE_WINDOW;
  const max = Number.isInteger(opts.max) && opts.max > 0 ? opts.max : INSIGHT_MAX;

  const cycles = rowsOf(db,
    `SELECT id, growth, pruned, kespi_snapshot FROM meko_cycles
     ORDER BY rowid ASC`);
  const recent = cycles.slice(-windowN);

  if (recent.length < 2) {
    return { scanned: recent.length, extracted: 0, skipped: 0, insufficient: true, ids: [] };
  }

  const groups = new Map();
  for (let i = 0; i < recent.length - 1; i++) {
    const cur = recent[i], next = recent[i + 1];
    const k0 = Number(cur.kespi_snapshot), k1 = Number(next.kespi_snapshot);
    if (!Number.isFinite(k0) || !Number.isFinite(k1)) continue;
    const condition = conditionOf(cur);
    const action = topAction(db, cur.id);
    const key = condition + '\u0000' + action;
    const g = groups.get(key) || { condition, action, sum: 0, samples: 0 };
    g.sum += k1 - k0;
    g.samples++;
    groups.set(key, g);
  }

  const ranked = [...groups.values()]
    .map(g => ({ ...g, effect: round4(g.sum / g.samples) }))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) || a.condition.localeCompare(b.condition))
    .slice(0, max);

  const ids = []; let extracted = 0; let skipped = 0;
  const exists = db.prepare('SELECT 1 AS one FROM entities WHERE id = ?');
  for (const g of ranked) {
    const id = insightId(g.condition, g.action);
    exists.bind([id]);
    const dup = exists.step();
    exists.reset();
    if (dup) { skipped++; continue; }
    store.insertEntity({
      id,
      name: `洞察候选：${g.condition} → ${g.action}`,
      type: 'MetaKnowledge',
      content: contentOf(g.condition, g.action, g.effect, g.samples),
      tags: '["insight"]',
      status: 'pending-distillation',
      confidence: 0
    });
    ids.push(id); extracted++;
  }
  exists.free();
  if (extracted) store._persist();

  return { scanned: recent.length, extracted, skipped, insufficient: false, ids };
}

module.exports = { CYCLE_WINDOW, INSIGHT_MAX, conditionOf, insightId, extractInsights };
