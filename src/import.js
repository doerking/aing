'use strict';
// aing-v2 import.js —— M1 任务 1.4 实现（SPEC-1.4 双链写入）
// spec-first：本文件是 SPEC-1.4 的代码结果，契约在 spec/SPEC-1.4-import双链写入.md。
// 双铰链定位：复制那一下——为每个 raw 链实体建 wiki 链镜像（wiki-<base>）+ 氢键弱键。
// 铁律：不覆盖已存在镜像（差异是互校输入）、退役源不镜像、两侧 last_access 永不碰、无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const REL_BOND = 'hydrogen-bond';

/** confidence → 9 段（SPEC-1.2 映射，空值落默认 5；<0.3 落背景带 1） */
function mapStrength(conf) {
  if (conf == null || conf === '' || !Number.isFinite(Number(conf))) return 5;
  const c = Number(conf);
  if (c >= 0.8) return 8;
  if (c >= 0.6) return 7;
  if (c >= 0.4) return 5;
  if (c >= 0.3) return 3;
  return 1;
}

function strandOf(id) {
  if (String(id).startsWith('wiki-')) return 'wiki';
  return 'raw';
}

function baseOf(id) {
  return String(id).startsWith('raw-') ? String(id).slice(4) : String(id);
}

async function importStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('import 需要 store 注入（SPEC-1.15 契约）');
  const stats = { scanned: 0, mirrored: 0, bonds: 0, skipped: 0, skippedRetired: 0, skippedProduct: 0 };
  const db = store._getDb();

  const selectStmt = db.prepare(
    `SELECT id, name, type, content, tags, status, confidence, tolaria_strength, invalid_at, strand, title
     FROM entities WHERE id NOT LIKE 'wiki-%'`
  );
  const insertStmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const linkExistsStmt = db.prepare('SELECT 1 AS one FROM links WHERE source_id = ? AND target_id = ? LIMIT 1');
  const insertLinkStmt = db.prepare(
    `INSERT INTO links (source_id, target_id, relation, confidence, strength, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  const raws = [];
  while (selectStmt.step()) raws.push(selectStmt.getAsObject());
  selectStmt.free();

  let dirty = false;

  for (const row of raws) {
    if (strandOf(row.id) !== 'raw') continue; // wiki- 已由 SQL 排除，此行为语义护栏
    const base = baseOf(row.id);
    if (!base) continue;
    const wikiId = 'wiki-' + base;
    if (wikiId === row.id) continue;

    stats.scanned++;

    if (row.invalid_at != null) { stats.skippedRetired++; continue; }
    // SPEC-1.4 修订 B：产物（strand=future）不是原料，不建镜像不连边——
    // 否则建边时撞「future→past 边禁止」（2026-11-18 真库失败轮留下的产物导致 import deadlock）。
    if (String(row.strand || '') === 'future') { stats.skippedProduct++; continue; }

    if (store.getEntity(wikiId) == null) {
      const strength = Number.isInteger(Number(row.tolaria_strength)) ? Number(row.tolaria_strength) : 5;
      // SPEC-7.1 AC-1：镜像骨架也带 title——继承源题头，缺了回落 name
      const skeletonTitle = (row.title != null && String(row.title).trim() !== '')
        ? String(row.title) : (row.name == null ? null : String(row.name));
      insertStmt.run([wikiId, row.name == null ? null : row.name, row.type == null ? null : row.type,
        row.content == null ? null : row.content, row.tags == null ? null : row.tags,
        row.status == null ? null : row.status,
        row.confidence == null ? null : Number(row.confidence), strength, skeletonTitle]);
      stats.mirrored++;
      dirty = true;
    } else {
      stats.skipped++;
    }

    linkExistsStmt.bind([row.id, wikiId]);
    const edgeExists = linkExistsStmt.step();
    linkExistsStmt.reset();
    if (!edgeExists) {
      insertLinkStmt.run([row.id, wikiId, REL_BOND,
        row.confidence == null ? null : Number(row.confidence), mapStrength(row.confidence)]);
      stats.bonds++;
      dirty = true;
    }
  }

  insertStmt.free();
  linkExistsStmt.free();
  insertLinkStmt.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { importStep, mapStrength, strandOf, baseOf, REL_BOND };
