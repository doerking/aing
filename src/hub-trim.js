'use strict';
// aing-v2 hub-trim.js —— M2 任务 2.11 实现（SPEC-2.11 存量 hub 裁剪）
// 准入侧 applyDegreeCap 只管检索取数；本件管存量：超额高度节点的**弱边**让位，裁到 cap。
// 只剪 strength < weakBelow 的边，强边一律唔动；可逆（原因码 hub-trim 可原样恢复）；无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const { DEFAULTS } = require('./config-runtime.js');
const REASON = 'hub-trim';

function _activeEdges(db) {
  const out = [];
  const s = db.prepare(
    `SELECT source_id, target_id, strength, confidence, created_at
     FROM links WHERE invalid_at IS NULL`
  );
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _degreeMap(edges) {
  const d = new Map();
  for (const e of edges) {
    d.set(e.source_id, (d.get(e.source_id) || 0) + 1);
    d.set(e.target_id, (d.get(e.target_id) || 0) + 1);
  }
  return d;
}

async function trimHubs(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('hub-trim 需要 store 注入（SPEC-2.11 契约）');
  const degreeCap = Number.isInteger(opts.degreeCap) && opts.degreeCap > 0 ? opts.degreeCap : DEFAULTS.hubTrim.degreeCap;
  const weakBelow = Number.isInteger(opts.weakBelow) ? opts.weakBelow : DEFAULTS.hubTrim.weakBelow;
  const db = store._getDb();

  const edges = _activeEdges(db);
  const deg = _degreeMap(edges);
  const stats = { hubs: 0, trimmed: 0, skippedNeeded: 0 };

  // 超额节点：按超额从大到小（同额按 id 稳定序，保确定性）
  const over = [...deg.entries()]
    .filter(([, n]) => n > degreeCap)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

  const trimmedSet = new Set();
  const keyOf = (e) => e.source_id + '\u0000' + e.target_id;

  for (const [node] of over) {
    stats.hubs++;
    // 候选：该节点所有有效、未裁、且属弱边的边，从最弱起
    const candidates = edges
      .filter(e => !trimmedSet.has(keyOf(e)) &&
        (e.source_id === node || e.target_id === node) &&
        Number(e.strength) < weakBelow)
      .sort((a, b) => (Number(a.strength) - Number(b.strength)) ||
        String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
        keyOf(a).localeCompare(keyOf(b)));

    for (const e of candidates) {
      if ((deg.get(node) || 0) <= degreeCap) break;
      const other = e.source_id === node ? e.target_id : e.source_id;
      // 对端问一句：对端本身超 cap → 交对端自己裁（唔抢名额、唔双重削减）
      if ((deg.get(other) || 0) > degreeCap) { stats.skippedNeeded++; continue; }
      deg.set(node, deg.get(node) - 1);
      deg.set(other, deg.get(other) - 1);
      trimmedSet.add(keyOf(e));
      stats.trimmed++;
    }
  }

  if (stats.trimmed > 0) {
    const stmt = db.prepare(
      `UPDATE links SET invalid_at = CURRENT_TIMESTAMP, invalid_reason = ?
       WHERE source_id = ? AND target_id = ? AND invalid_at IS NULL`
    );
    for (const k of trimmedSet) {
      const [src, dst] = k.split('\u0000');
      stmt.run([REASON, src, dst]);
    }
    stmt.free();
    store._persist();
  }
  return stats;
}

async function restoreHubTrim(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('hub-trim 需要 store 注入（SPEC-2.11 契约）');
  const db = store._getDb();
  const countBefore = (() => {
    const s = db.prepare(`SELECT COUNT(*) AS n FROM links WHERE invalid_reason = ? AND invalid_at IS NOT NULL`);
    s.bind([REASON]); s.step(); const n = Number(s.getAsObject().n); s.free(); return n;
  })();
  if (countBefore === 0) return { restored: 0 };
  const stmt = db.prepare(
    `UPDATE links SET invalid_at = NULL, invalid_reason = NULL
     WHERE invalid_reason = ? AND invalid_at IS NOT NULL`
  );
  stmt.run([REASON]);
  stmt.free();
  store._persist();
  return { restored: countBefore };
}

module.exports = { trimHubs, restoreHubTrim, REASON };
