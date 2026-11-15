'use strict';
// aing-v2 vector.js —— M1 任务 1.8 实现（SPEC-1.8 强度加权检索）
// spec-first：本文件是 SPEC-1.8 的代码结果，契约在 spec/SPEC-1.8-vector强度加权.md。
// 双铰链定位：给 wiki 链建可检索的语义面；强度首次参与排序（9 段 → 权重）。
// 无外部模型依赖：确定性哈希向量，可复现、可测；语义模型留作升级位。
// 铁律：只写 entity_vectors，不反写 entities；不碰 last_access/strength/invalid_at；无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');

const DIM = 64;
const MODEL = 'hash-64';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** CJK 单字 + CJK 双字 + 拉丁词 */
function tokens(text) {
  const s = String(text == null ? '' : text).toLowerCase();
  const out = [];
  const cjk = [];
  let latin = '';
  for (const ch of s) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      out.push(ch);
      cjk.push(ch);
      if (latin) { out.push(latin); latin = ''; }
    } else if (/[a-z0-9]/.test(ch)) {
      latin += ch;
    } else if (latin) { out.push(latin); latin = ''; }
  }
  if (latin) out.push(latin);
  for (let i = 0; i + 1 < cjk.length; i++) out.push(cjk[i] + cjk[i + 1]);
  return out;
}

function vectorOf(text) {
  const v = new Array(DIM).fill(0);
  for (const t of tokens(text)) {
    const h = fnv1a(t);
    const idx = h % DIM;
    const sign = ((h >>> 8) & 1) ? 1 : -1;
    v[idx] += sign;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < DIM; i++) dot += a[i] * b[i];
  return dot; // 两边已归一
}

function checksum(row) {
  return crypto.createHash('sha1')
    .update(String(row.name == null ? '' : row.name) + '\u0000' + String(row.content == null ? '' : row.content) + '\u0000' + String(row.tags == null ? '' : row.tags))
    .digest('hex');
}

async function vectorStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('vector 需要 store 注入（SPEC-1.15 契约）');
  const stats = { scanned: 0, indexed: 0, rebuilt: 0, skipped: 0 };
  const db = store._getDb();

  const selectStmt = db.prepare(
    'SELECT id, name, content, tags FROM entities WHERE invalid_at IS NULL'
  );
  const getVecStmt = db.prepare('SELECT checksum FROM entity_vectors WHERE entity_id = ?');
  const putStmt = db.prepare(
    `INSERT OR REPLACE INTO entity_vectors (entity_id, dim, model, vector, checksum, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  const rows = [];
  while (selectStmt.step()) rows.push(selectStmt.getAsObject());
  selectStmt.free();

  let dirty = false;
  for (const row of rows) {
    stats.scanned++;
    const sum = checksum(row);
    getVecStmt.bind([row.id]);
    const existing = getVecStmt.step() ? getVecStmt.getAsObject() : null;
    getVecStmt.reset();
    if (existing && existing.checksum === sum) { stats.skipped++; continue; }
    putStmt.run([row.id, DIM, MODEL, JSON.stringify(vectorOf(`${row.name || ''}\n${row.content || ''}`)), sum]);
    if (existing) stats.rebuilt++; else stats.indexed++;
    dirty = true;
  }

  selectStmt.free();
  getVecStmt.free();
  putStmt.free();
  if (dirty) store._persist();
  return stats;
}

async function search(store, query, opts = {}) {
  const k = Number.isInteger(opts.k) && opts.k > 0 ? opts.k : 5;
  const db = store._getDb();
  const qv = vectorOf(query);
  const stmt = db.prepare(
    `SELECT e.id, e.name, e.tolaria_strength, v.vector
     FROM entity_vectors v JOIN entities e ON e.id = v.entity_id
     WHERE e.invalid_at IS NULL`
  );
  const hits = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    let vec;
    try { vec = JSON.parse(r.vector); } catch (_) { continue; }
    const sim = cosine(qv, vec);
    if (sim <= 0) continue;
    const strength = Number(r.tolaria_strength == null ? 5 : r.tolaria_strength);
    hits.push({ id: r.id, name: r.name, score: sim * (0.5 + 0.5 * Math.min(9, Math.max(1, strength)) / 9), similarity: sim, strength });
  }
  stmt.free();
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

module.exports = { vectorStep, search, vectorOf, tokens, DIM, MODEL };
