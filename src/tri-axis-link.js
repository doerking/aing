'use strict';
// aing-v2 tri-axis-link.js —— M1 任务 1.2 实现（SPEC-1.2 link 同步步）
// spec-first：本文件是 SPEC-1.2 的代码结果。
// 建边：confidence→strength 段位映射（SPEC-0.1 §五），三轴判定夹出（复用 tri-axis-gate）。
// 退役：invalid_at 逻辑退役（可逆，非物理 DELETE）。compile/link 永不碰 last_access（P0 铁律）。
// 幂等：重复建边 INSERT OR IGNORE 不炸。

function confidenceToStrength(confidence) {
  if (confidence >= 0.8) return 8;
  if (confidence >= 0.6) return 7;
  if (confidence >= 0.4) return 5;
  if (confidence >= 0.3) return 3;
  return 1; // <0.3 归最低段（噪声，不进入口）
}

function _getEntityTypes(store, sourceId, targetId) {
  const src = store.getEntity(sourceId);
  const tgt = store.getEntity(targetId);
  return { source_type: src ? src.type : null, target_type: tgt ? tgt.type : null };
}

// 建边：三轴夹出判定，合法→入表返回 entered:true，非法→不入表返回 entered:false
async function buildEdge(store, { source_id, target_id, relation, confidence }) {
  const strength = confidenceToStrength(confidence);
  const { source_type, target_type } = _getEntityTypes(store, source_id, target_id);
  // 类型轴：fail-closed 复用 tri-axis-gate 判定
  const gate = require('./tri-axis-gate.js');
  if (!gate.isTypePairingLegal(source_type, target_type)) return { entered: false, reason: 'pairing-illegal' };
  // 强度轴：strength<7 不入表（不进检索入口级；<7 但≥3 留在调度层）
  if (strength < gate.STRENGTH_THRESHOLD) return { entered: false, reason: 'strength-below-threshold', strength };
  // 幂等写入：OR IGNORE（PK 冲突跳过不抛）
  const db = store._getDb();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO links (source_id, target_id, relation, confidence, strength, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  stmt.run([source_id, target_id, relation || null, confidence, strength]);
  stmt.free();
  store._persist();
  return { entered: true, strength };
}

// 退役：打 invalid_at 戳（可逆）
function retireEdge(store, sourceId, targetId) {
  const db = store._getDb();
  const stmt = db.prepare('UPDATE links SET invalid_at = CURRENT_TIMESTAMP WHERE source_id = ? AND target_id = ?');
  stmt.run([sourceId, targetId]);
  stmt.free();
  store._persist();
}

// 复活：清 invalid_at 戳
function reviveEdge(store, sourceId, targetId) {
  const db = store._getDb();
  const stmt = db.prepare('UPDATE links SET invalid_at = NULL WHERE source_id = ? AND target_id = ?');
  stmt.run([sourceId, targetId]);
  stmt.free();
  store._persist();
}

// 查有效边（invalid_at IS NULL）
function listActiveEdges(store) {
  const db = store._getDb();
  const rows = [];
  const stmt = db.prepare('SELECT * FROM links WHERE invalid_at IS NULL');
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = { confidenceToStrength, buildEdge, retireEdge, reviveEdge, listActiveEdges };
