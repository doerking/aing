'use strict';
// aing-v2 distill.js —— M1 任务 1.5 实现（SPEC-1.5 复制链保真）
// spec-first：本文件是 SPEC-1.5 的代码结果，契约在 spec/SPEC-1.5-distill复制链保真.md。
// 双铰链定位：复制链——pending-distillation 的 raw 实体转身 active，原文**逐字保真**复制入 wiki 镜像。
// 与 import 的分工：import 只建骨架、不覆盖；distill 是唯一允许覆盖镜像的步，故必须校验保真。
// 铁律：不碰 last_access / invalid_at / tolaria_strength；无物理删；已 active 不动。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const { baseOf, strandOf } = require('./import.js');

const PENDING = 'pending-distillation';
const ACTIVE = 'active';

async function distillStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('distill 需要 store 注入（SPEC-1.15 契约）');
  const stats = { scanned: 0, distilled: 0, skipped: 0, created: 0 };
  const db = store._getDb();

  const selectStmt = db.prepare(
    `SELECT id, name, type, content, tags, confidence, status
     FROM entities
     WHERE status = '${PENDING}' AND invalid_at IS NULL AND id NOT LIKE 'wiki-%'
       AND NOT (COALESCE(strand, 'past') = 'future' AND metabolized_at IS NOT NULL)`
  );
  const insertStmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '${ACTIVE}', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const updateStmt = db.prepare(
    `UPDATE entities SET name = ?, type = ?, content = ?, tags = ?, status = '${ACTIVE}', confidence = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );
  const rawActiveStmt = db.prepare(
    `UPDATE entities SET status = '${ACTIVE}', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );

  const rows = [];
  while (selectStmt.step()) rows.push(selectStmt.getAsObject());
  selectStmt.free();

  let dirty = false;

  for (const row of rows) {
    if (strandOf(row.id) !== 'raw') continue;
    stats.scanned++;
    const base = baseOf(row.id);
    if (!base) { stats.skipped++; continue; }
    const wikiId = 'wiki-' + base;
    if (wikiId === row.id) { stats.skipped++; continue; }

    const name = row.name == null ? null : row.name;
    const type = row.type == null ? null : row.type;
    const content = row.content == null ? null : row.content;
    const tags = row.tags == null ? null : row.tags;
    const confidence = row.confidence == null ? null : Number(row.confidence);

    if (store.getEntity(wikiId) == null) {
      insertStmt.run([wikiId, name, type, content, tags, confidence]);
      stats.created++;
      dirty = true;
    } else {
      updateStmt.run([name, type, content, tags, confidence, wikiId]);
      dirty = true;
    }

    // 保真校验：写后读回，逐字相等（含空白/换行）
    const written = store.getEntity(wikiId);
    if (!written || written.content !== content) {
      throw new Error('fidelity-violation: ' + wikiId + ' 复制内容与源不一致');
    }

    rawActiveStmt.run([row.id]);
    stats.distilled++;
    dirty = true;
  }

  insertStmt.free();
  updateStmt.free();
  rawActiveStmt.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { distillStep };
