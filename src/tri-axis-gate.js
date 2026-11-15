'use strict';
// aing-v2 tri-axis-gate.js —— M1 任务 1.4 实现（SPEC-0.4 三轴夹出加载判定）
// spec-first：本文件是 SPEC-0.4 的代码结果。单旋钮、多重约束取交集：
//   边进检索入口 = 强度轴 AND 类型专一轴 AND 时效轴。
// 配对矩阵 fail-closed（未列入白名单默认拒）。degreeCap 值 M1 任务 1.6 用数据复评后定，此处只锁机制（可配）。
// compile 永不碰 last_access（P0 换锚铁律）——本模块只提供检索命中写回 touchLastAccess。

// SPEC-0.4 §三 类型配对合法表（DNA 专一配对启发：A-T / C-G，唔係两两乱连）
// 合法 = true；未列类型默认 false（fail-closed，对齐 tag-gate 白名单哲学）
const PAIRING_LEGAL = {
  Concept:       { Concept: true, Conversation: true, Todo: false, MetaKnowledge: true },
  Conversation:  { Concept: true, Conversation: true, Todo: true,  MetaKnowledge: true },
  Todo:          { Concept: false, Conversation: true, Todo: true, MetaKnowledge: false },
  MetaKnowledge: { Concept: true, Conversation: true, Todo: false, MetaKnowledge: true }
};

// 强度轴：边进检索入口门槛（SPEC-0.4 §二）
const STRENGTH_THRESHOLD = 7;

function isTypePairingLegal(source_type, target_type) {
  const row = PAIRING_LEGAL[source_type];
  if (!row) return false;          // 未列入 source → fail-closed
  return row[target_type] === true; // 未列入 target 或显式 false → 拒
}

function shouldEnterRetrieval(edge) {
  return (
    Number(edge.strength) >= STRENGTH_THRESHOLD &&  // 强度轴
    isTypePairingLegal(edge.source_type, edge.target_type) && // 类型专一轴
    (edge.invalid_at === null || edge.invalid_at === undefined) // 时效轴：NULL=有效
  );
}

// AC-6 命中写回：检索命中刷新 last_access。compile 永不调用本函数。
// store 由调用方注入（SPEC-1.15 契约；本模块唔直连 knowledge-store）。
function touchLastAccess(store, entityId) {
  if (!store || typeof store._getDb !== 'function') {
    throw new Error('touchLastAccess 需要 store 注入（SPEC-1.15 契约）');
  }
  const db = store._getDb();
  const stmt = db.prepare('UPDATE entities SET last_access = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run([entityId]);
  stmt.free();
  store._persist ? store._persist() : null;
}

// AC-7 度上限：有效边按强度降序取 top cap 条（机制，cap 值 M1 任务 1.6 定）
function applyDegreeCap(edges, degreeCap) {
  return edges
    .filter(e => shouldEnterRetrieval(e))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, degreeCap);
}

module.exports = { shouldEnterRetrieval, isTypePairingLegal, touchLastAccess, applyDegreeCap, STRENGTH_THRESHOLD };
