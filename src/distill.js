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
  const stats = { scanned: 0, distilled: 0, skipped: 0, created: 0, conflicts: 0 };
  const db = store._getDb();

  const selectStmt = db.prepare(
    `SELECT id, name, type, content, tags, confidence, status, title
     FROM entities
     WHERE status = '${PENDING}' AND invalid_at IS NULL AND id NOT LIKE 'wiki-%'
       AND COALESCE(strand, 'past') <> 'future'`
  );
  // AC-19：镜像（加工产物）落 future 档；旧行只翻工作状态，不重写产物
  const insertStmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, strand, fingerprint, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '${ACTIVE}', ?, 'future', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const rawActiveStmt = db.prepare(
    `UPDATE entities SET status = '${ACTIVE}', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  // SPEC-6.54：镜像状态收口——只翻 pending-distillation，避免蒸馏债虚高、镜像永久挂账
  const wikiActiveStmt = db.prepare(
    `UPDATE entities SET status = '${ACTIVE}', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = '${PENDING}'`
  );
  // AC-19：past → future 加工边（这条产物出自哪条原文）
  const edgeExists = db.prepare('SELECT 1 AS one FROM links WHERE source_id = ? AND target_id = ? LIMIT 1');
  const edgeInsert = db.prepare(
    'INSERT INTO links (source_id, target_id, relation, confidence, strength, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
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

    const existing = store.getEntity(wikiId);
    if (existing == null) {
      // SPEC-7.1 AC-1：产物带 title——源有题头就继承，没有才由正文派生
      const srcTitle = (row.title != null && String(row.title).trim() !== '')
        ? String(row.title) : require('./identity.js').titleOf(content, name == null ? '未命名' : String(name));
      insertStmt.run([wikiId, name, type, content, tags, confidence, require('./identity.js').fingerprint(content), srcTitle]);
      stats.created++;
      dirty = true;
      // 保真校验：写后读回，逐字相等（含空白/换行）
      const written = store.getEntity(wikiId);
      if (!written || written.content !== content) {
        throw new Error('fidelity-violation: ' + wikiId + ' 复制内容与源不一致');
      }
    } else {
      // AC-19：产物行只读——镜像已存在就不重写；内容不符记为冲突，留给新序列号重算
      if (existing.content !== content) stats.conflicts++;
    }

    // AC-19：past → future 加工边；已有则不重复建（幂等）
    edgeExists.bind([row.id, wikiId]);
    const hasEdge = edgeExists.step();
    edgeExists.reset();
    if (!hasEdge) {
      edgeInsert.run([row.id, wikiId, 'derived', confidence == null ? null : Number(confidence),
        confidence == null ? 5 : (Number(confidence) >= 0.7 ? 7 : 5)]);
      dirty = true;
    }

    // SPEC-6.54：镜像（新建或既有）收口到 active
    wikiActiveStmt.run([wikiId]);
    rawActiveStmt.run([row.id]);
    stats.distilled++;
    dirty = true;
  }

  insertStmt.free();
  wikiActiveStmt.free();
  rawActiveStmt.free();
  edgeExists.free();
  edgeInsert.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { distillStep };
