'use strict';
// aing-v2 recycle.js —— M2 任务 2.9 实现（SPEC-2.9 回炉接线）
// 回炉：已压缩、未回炉的籽 → MetaKnowledge 微粒实体（mz-<id>），带 recycled-from 血统。
// 每粒只回炉一次（recycled=1）；籽行永不物理删；不碰 last_access；幂等。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');
const { parseBody, readableTopic } = require('./conv-text.js');

const MAX_CONTENT = 200;

async function recycleStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('recycle 需要 store 注入（SPEC-2.9 契约）');
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : Infinity;
  const stats = { scanned: 0, recycled: 0, skipped: 0 };
  const db = store._getDb();

  const seeds = [];
  const sel = db.prepare(
    `SELECT cs.entity_id, e.name, e.content
     FROM compressed_seeds cs
     JOIN entities e ON e.id = cs.entity_id
     WHERE cs.active = 1 AND cs.recycled = 0 AND e.invalid_at IS NULL`
  );
  while (sel.step()) seeds.push(sel.getAsObject());
  sel.free();

  const exists = db.prepare('SELECT 1 AS hit FROM entities WHERE id = ?');
  const insertMz = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, created_at, updated_at)
     VALUES (?, ?, 'MetaKnowledge', ?, ?, 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const markRecycled = db.prepare('UPDATE compressed_seeds SET recycled = 1 WHERE entity_id = ?');

  let dirty = false;
  for (const s of seeds) {
    if (stats.recycled >= limit) break;
    stats.scanned++;
    const mzId = 'mz-' + s.entity_id;
    // 微粒已存在（同 id 复跑/重复籽）→ 只落标记，不重插
    exists.bind([mzId]);
    const already = exists.step();
    exists.reset();
    if (already) { markRecycled.run([s.entity_id]); stats.skipped++; dirty = true; continue; }

    const body = String(s.content == null ? '' : s.content).slice(0, MAX_CONTENT) +
      '\n\n[recycled-from:' + s.entity_id + ']';
    // 回炉名取可读话题（SPEC-2.9 修订 A）：markdown 会话原名是时间戳，不能直接当微粒名
    insertMz.run([mzId, '回炉·' + readableTopic(s.name, parseBody({ content: s.content })), body, '["recycled:5"]']);
    markRecycled.run([s.entity_id]);
    stats.recycled++;
    dirty = true;
  }

  exists.free(); insertMz.free(); markRecycled.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { recycleStep, MAX_CONTENT, metaIdOf: (id) => 'mz-' + id };
