'use strict';
// aing-v2 link-sync.js —— M1 任务 1.7 实现（SPEC-1.7 双链边一致）
// spec-first：本文件是 SPEC-1.7 的代码结果，契约在 spec/SPEC-1.7-link-sync双链边一致.md。
// 双铰链定位：把 raw 链内部的有效边镜像到 wiki 链，令双链拓扑同构（互校的前提）。
// 铁律：缺端点不建幽灵边、退役边不同步、不碰 last_access、无物理删、幂等。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const { baseOf } = require('./import.js');

function isWiki(id) { return String(id).startsWith('wiki-'); }

async function linkSyncStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('link-sync 需要 store 注入（SPEC-1.15 契约）');
  const stats = { scanned: 0, synced: 0, skipped: 0, skippedNoMirror: 0 };
  const db = store._getDb();

  const selectStmt = db.prepare(
    `SELECT source_id, target_id, relation, confidence, strength
     FROM links WHERE invalid_at IS NULL`
  );
  const insertStmt = db.prepare(
    `INSERT INTO links (source_id, target_id, relation, confidence, strength, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  const existsStmt = db.prepare('SELECT 1 AS one FROM links WHERE source_id = ? AND target_id = ? LIMIT 1');

  const edges = [];
  while (selectStmt.step()) edges.push(selectStmt.getAsObject());
  selectStmt.free();

  let dirty = false;

  for (const e of edges) {
    if (isWiki(e.source_id) || isWiki(e.target_id)) continue; // 只镜像 raw 内部边
    stats.scanned++;
    const srcMirror = 'wiki-' + baseOf(e.source_id);
    const dstMirror = 'wiki-' + baseOf(e.target_id);
    if (srcMirror === e.source_id || dstMirror === e.target_id) { stats.skipped++; continue; }
    if (store.getEntity(srcMirror) == null || store.getEntity(dstMirror) == null) {
      stats.skippedNoMirror++;
      continue;
    }

    existsStmt.bind([srcMirror, dstMirror]);
    const exists = existsStmt.step();
    existsStmt.reset();
    if (exists) { stats.skipped++; continue; }

    insertStmt.run([srcMirror, dstMirror, e.relation == null ? null : e.relation,
      e.confidence == null ? null : Number(e.confidence), e.strength == null ? 5 : Number(e.strength)]);
    stats.synced++;
    dirty = true;
  }

  insertStmt.free();
  existsStmt.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { linkSyncStep };
