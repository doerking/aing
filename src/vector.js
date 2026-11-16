'use strict';
// aing-v2 vector.js —— M1 任务 1.8 实现（SPEC-1.8 强度加权检索）
// spec-first：本文件是 SPEC-1.8 的代码结果，契约在 spec/SPEC-1.8-vector强度加权.md。
// 双铰链定位：给 wiki 链建可检索的语义面；强度首次参与排序（9 段 → 权重）。
// 无外部模型依赖：确定性哈希向量，可复现、可测；语义模型留作升级位。
// 铁律：只写 entity_vectors，不反写 entities；不碰 last_access/strength/invalid_at；无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。
//
// M5 任务 5.1（SPEC-5.1）：后端可插拔 + 只供测试的开关 + 混用防护。
// 默认仍是 hash-64；换后端只能用 opts.backend 或环境变量 AING_VECTOR_BACKEND（测试/评测用）。
// 不同后端的向量永不互比——检索按 model + dim 过滤，结论按自己语料复核，不按测试集排名。

const crypto = require('crypto');

const DIM = 64;
const MODEL = 'hash-64';
const BUILTIN = 'hash-64';

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
    if (/[一-鿿]/.test(ch)) {
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

function hashEmbed(text) {
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

// ── 后端注册表（SPEC-5.1 §2.1）────────────────────────────────
const backends = new Map();
backends.set(BUILTIN, { name: BUILTIN, dim: DIM, model: MODEL, embed: hashEmbed, builtin: true });

const warned = new Set();

/** 注册自定义后端（评测/测试注入；不能覆盖内置 hash-64） */
function registerBackend(backend) {
  if (!backend || typeof backend !== 'object') throw new Error('后端必须是对象');
  const name = String(backend.name == null ? '' : backend.name).trim();
  if (!name) throw new Error('后端缺 name');
  if (name === BUILTIN) throw new Error(`内置后端 ${BUILTIN} 不可覆盖`);
  const dim = Number(backend.dim);
  if (!Number.isInteger(dim) || dim <= 0) throw new Error(`后端 ${name} 的 dim 非法：${backend.dim}`);
  if (typeof backend.embed !== 'function') throw new Error(`后端 ${name} 缺 embed 函数`);
  const model = String(backend.model == null || backend.model === '' ? name : backend.model);
  backends.set(name, { name, dim, model, embed: backend.embed, builtin: false });
  return { name, dim, model };
}

/** 解析后端：显式名 > 环境变量 > hash-64；未知名回退并警告一次 */
function resolveBackend(name) {
  const requested = name == null || name === ''
    ? String(process.env.AING_VECTOR_BACKEND || BUILTIN)
    : String(name);
  const hit = backends.get(requested);
  if (hit) return { ...hit, requested, fallback: false };
  if (!warned.has(requested)) {
    warned.add(requested);
    console.warn(`[vector] 未知后端 ${requested}，回退 ${BUILTIN}`);
  }
  return { ...backends.get(BUILTIN), requested, fallback: true };
}

function listBackends() {
  return [...backends.values()].map(b => ({ name: b.name, dim: b.dim, model: b.model, builtin: !!b.builtin }));
}

/** 把 opts.backend（名 / 对象 / 缺省）归一成后端对象 */
function pickBackend(spec) {
  if (spec == null || spec === '') return resolveBackend();
  if (typeof spec === 'string') return resolveBackend(spec);
  if (typeof spec === 'object' && typeof spec.embed === 'function') {
    const dim = Number(spec.dim);
    if (!Number.isInteger(dim) || dim <= 0) throw new Error('后端 dim 非法');
    const name = String(spec.name == null ? '' : spec.name) || 'inline';
    return { name, dim, model: String(spec.model == null || spec.model === '' ? name : spec.model), embed: spec.embed, requested: name, fallback: false };
  }
  throw new Error('backend 参数非法：需后端名或 { dim, model, embed }');
}

function vectorOf(text, opts = {}) {
  const backend = pickBackend(opts.backend);
  const out = backend.embed(String(text == null ? '' : text));
  if (!Array.isArray(out)) throw new Error(`后端 ${backend.name} 返回非数组`);
  if (out.length !== backend.dim) throw new Error(`后端 ${backend.name} 维度不符：${out.length} ≠ ${backend.dim}`);
  const v = new Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const x = Number(out[i]);
    if (!Number.isFinite(x)) throw new Error(`后端 ${backend.name} 返回非有限数（第 ${i} 位）`);
    v[i] = x;
  }
  return v;
}

function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // 两边已归一
}

function checksum(row) {
  return crypto.createHash('sha1')
    .update(String(row.name == null ? '' : row.name) + '\u0000' + String(row.content == null ? '' : row.content) + '\u0000' + String(row.tags == null ? '' : row.tags))
    .digest('hex');
}

async function vectorStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('vector 需要 store 注入（SPEC-1.15 契约）');
  const backend = pickBackend(opts.backend);
  const stats = { scanned: 0, indexed: 0, rebuilt: 0, skipped: 0 };
  const db = store._getDb();

  const selectStmt = db.prepare(
    'SELECT id, name, content, tags FROM entities WHERE invalid_at IS NULL'
  );
  const getVecStmt = db.prepare('SELECT checksum, dim, model FROM entity_vectors WHERE entity_id = ?');
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
    // 指纹同 + 后端同才跳过；换后端必须重建，旧后端向量不得冒充（SPEC-5.1 §2.4）
    if (existing && existing.checksum === sum && existing.model === backend.model && Number(existing.dim) === backend.dim) {
      stats.skipped++;
      continue;
    }
    const vec = vectorOf(`${row.name || ''}\n${row.content || ''}`, { backend });
    putStmt.run([row.id, backend.dim, backend.model, JSON.stringify(vec), sum]);
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
  const backend = pickBackend(opts.backend);
  const db = store._getDb();
  const qv = vectorOf(query, { backend });
  // 混用防护：只比对同 model 同 dim 的向量（SPEC-5.1 §2.5）
  const stmt = db.prepare(
    `SELECT e.id, e.name, e.tolaria_strength, v.vector
     FROM entity_vectors v JOIN entities e ON e.id = v.entity_id
     WHERE e.invalid_at IS NULL AND v.model = ? AND v.dim = ?`
  );
  stmt.bind([backend.model, backend.dim]);
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

module.exports = {
  vectorStep, search, vectorOf, tokens, DIM, MODEL,
  registerBackend, resolveBackend, listBackends
};
