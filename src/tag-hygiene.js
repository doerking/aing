'use strict';
// aing-v2 tag-hygiene.js —— M6 任务 6.42 实现（SPEC-6.42 标签白名单与存量洗消）
// 口径：标签直接参与检索词面分（TAG_WEIGHT=0.6），脏标签一旦进 tags 列就长期污染召回。
// 合法形状只有两种：name 或 name:1..9；name 1..24 字符、无空白、无冒号。
// 只丢弃、不发明；合法标签原样保留、不改顺序、不改大小写。纯函数 + 副本洗消，唔碰真库。

const MAX_TAGS = 24;
const MAX_NAME = 24;
const FULLWIDTH_COLON = /：/g;
const STRENGTH_RE = /^([^:]+):([0-9]+)$/;
// 已登记的命名空间前缀（SPEC-6.42 §1.1）：值为短词而非强度，如 src:narrative / src:calibration
const NAMESPACES = new Set(['src']);
const NAMESPACE_VALUE = /^[A-Za-z][A-Za-z0-9_-]{0,15}$/;

/** 单条净化：返回 {tag} 或 {drop: 理由码} */
function normalizeTag(raw) {
  let t = String(raw == null ? '' : raw).replace(FULLWIDTH_COLON, ':').trim();
  if (t === '') return { drop: 'empty' };
  if (/\s/.test(t)) return { drop: 'whitespace' };
  const m = STRENGTH_RE.exec(t);
  if (m) {
    const name = m[1];
    if (name === '' || name.length > MAX_NAME) return { drop: 'too-long' };
    if (!/^[1-9]$/.test(m[2])) return { drop: 'bad-strength' };
    return { tag: t };
  }
  if (t.includes(':')) {
    const idx = t.indexOf(':');
    const prefix = t.slice(0, idx);
    const value = t.slice(idx + 1);
    if (!NAMESPACES.has(prefix)) return { drop: 'bad-strength' };
    if (!NAMESPACE_VALUE.test(value)) return { drop: 'bad-strength' };
    if (prefix.length > MAX_NAME) return { drop: 'too-long' };
    return { tag: t };
  }
  if (t.length > MAX_NAME) return { drop: 'too-long' };
  return { tag: t };
}

/**
 * 净化一份 tags（数组或 JSON 字符串）。
 * @returns {{tags: string[], dropped: Array<{tag:*, why:string}>}}
 */
function normalizeTags(input) {
  let arr = input;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch (_) { arr = null; }
  }
  if (!Array.isArray(arr)) return { tags: [], dropped: [{ tag: input, why: 'non-array' }] };
  const tags = [];
  const seen = new Set();
  const dropped = [];
  for (const raw of arr) {
    const r = normalizeTag(raw);
    if (r.drop) { dropped.push({ tag: raw, why: r.drop }); continue; }
    if (seen.has(r.tag)) { dropped.push({ tag: raw, why: 'duplicate' }); continue; }
    if (tags.length >= MAX_TAGS) { dropped.push({ tag: raw, why: 'over-limit' }); continue; }
    seen.add(r.tag);
    tags.push(r.tag);
  }
  return { tags, dropped };
}

/**
 * 存量洗消：只扫活跃实体（invalid_at IS NULL）。
 * dry（默认）只报命中；apply 只改 tags 列，其他列原样。
 * @returns {{scanned:number, hits:Array, applied:number}}
 */
function scrubStore(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('scrubStore 需要 store 注入');
  const db = store._getDb();
  const apply = opts.apply === true;
  const out = { scanned: 0, hits: [], applied: 0 };
  const s = db.prepare('SELECT id, tags FROM entities WHERE invalid_at IS NULL');
  const rows = [];
  while (s.step()) rows.push(s.getAsObject());
  s.free();
  for (const row of rows) {
    out.scanned++;
    const r = normalizeTags(row.tags);
    if (!r.dropped.length) continue;
    out.hits.push({ id: String(row.id), before: row.tags, after: JSON.stringify(r.tags), dropped: r.dropped });
    if (apply) {
      db.run('UPDATE entities SET tags = ? WHERE id = ?', [JSON.stringify(r.tags), row.id]);
      out.applied++;
    }
  }
  if (apply && out.applied > 0 && typeof store._persist === 'function') store._persist();
  return out;
}

module.exports = { normalizeTag, normalizeTags, scrubStore, MAX_TAGS, MAX_NAME, NAMESPACES };
