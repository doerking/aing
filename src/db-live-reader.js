/**
 * db-live-reader.js — 意识层/导链的 DB 活读（同步只读）
 *
 * 背景（2026-11-05 修单 B1）：neural-guide-chain.js / consciousness-layer.js 六+二处
 * 直接从 wiki/links/index.md（人读投影）读邻居/连密度/活力，投影落后 44 天而全绿，
 * 且无门禁可见。现改为读库真值（links 表 / entities 表），index.md 降级为纯投影
 * （可落后、可重建、仅供人看），机器判据一律走本模块。
 *
 * 实现：优先用 Node 内建 node:sqlite（>=22.5，同步零依赖）。老 Node（18/20）无此模块时，
 * 优雅降级回 available:false，调用方走旧静态默认值路径（等价 index.md 缺失分支，不会更糟）。
 *  - 只读：DatabaseSync readOnly 连接，读完即关；失败一律降级，不抛、不阻断。
 *  - 读一次全量 links + entities(+kespi)，调用方在内存里查，不逐条开库。
 */

const fs = require('fs');
const path = require('path');

function _openSync(dbPath) {
  try {
    // node:sqlite（Node >= 22.5）；老 Node 走 require 失败 → 降级
    const { DatabaseSync } = require('node:sqlite');
    if (!fs.existsSync(dbPath)) return null;
    return new DatabaseSync(dbPath, { readOnly: true, enableForeignKeyConstraints: false });
  } catch (e) {
    return null; // 模块不存在 / 库打不开 → 降级
  }
}

/**
 * 读库活态（一次性取全意识层/导链需要的真值，调用方缓存）：
 * 返回 { available, linkCount, links, entities:{id:{vitality,updatedMs}}, neighbors:{id:Set} }
 * available=false 时调用方走旧默认值路径（与 index.md 缺失等价，不静默更糟）。
 */
function readLive(dbPath) {
  const db = _openSync(dbPath);
  if (!db) return { available: false, linkCount: 0, links: [], entities: {}, neighbors: {} };

  try {
    const linkRows = db.prepare('SELECT source_id, target_id FROM links').all();
    const entRows = db.prepare(
      `SELECT e.id, e.updated_at, m.kespi_score
       FROM entities e LEFT JOIN entity_metadata m ON m.entity_id = e.id`
    ).all();

    const neighbors = {};
    for (const r of linkRows) {
      (neighbors[r.source_id] = neighbors[r.source_id] || new Set()).add(r.target_id);
      (neighbors[r.target_id] = neighbors[r.target_id] || new Set()).add(r.source_id);
    }
    const entities = {};
    for (const r of entRows) {
      // KESPI 活力真源 = entity_metadata.kespi_score；无 metadata 行 → 旧 _getVitality 默认 0.5
      const vitality = r.kespi_score ? Number(r.kespi_score) : 0.5;
      // updated_at 是 SQLite 的 'YYYY-MM-DD HH:MM:SS'（空格 UTC，坑 22 同形）→ 补 T/Z 再解析
      let updatedMs = 0;
      if (r.updated_at) {
        const t = Date.parse(String(r.updated_at).replace(' ', 'T') + 'Z');
        if (!Number.isNaN(t)) updatedMs = t;
      }
      entities[r.id] = { vitality, updatedMs };
    }
    return { available: true, linkCount: linkRows.length, links: linkRows, entities, neighbors };
  } catch (e) {
    return { available: false, linkCount: 0, links: [], entities: {}, neighbors: {} };
  } finally {
    try { db.close(); } catch (e) {}
  }
}

module.exports = { readLive };
