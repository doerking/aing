'use strict';
// aing-v2 compile.js —— M1 任务 1.1 实现（SPEC-1.1 compile 编译步）
// spec-first：本文件是 SPEC-1.1 的代码结果，契约在 spec/SPEC-1.1-compile编译步.md，勿在此改语义（改 spec 再回填）。
// 双铰链定位：raw 链解旋-复制——扫 raw/*.md → 实体 upsert 入 entities 表（wiki 链以 entities 表为真源）。
// P0 换锚铁律（图纸 line85 / SPEC-0.4 AC-6）：last_access 检索命中写，compile 永不碰；invalid_at/created_at/tolaria_strength 同样不碰。

const fs = require('fs');
const path = require('path');
// SPEC-0.6/1.15 铁律：本组件唔直连 knowledge-store，store 由编排器注入（arch-lint C5 守）。

// ---------- 解旋：frontmatter 解析（平铺 key: value + 行内数组；完整 YAML 面见 spec Non-Goals） ----------

function stripQuotes(v) {
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseYamlFlat(block) {
  const meta = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim();
      meta[key] = inner === '' ? [] : inner.split(',').map(s => stripQuotes(s.trim())).filter(s => s !== '');
    } else {
      meta[key] = stripQuotes(val);
    }
  }
  return meta;
}

function parseFrontmatter(text) {
  // 真实数据形状兜底（坑22）：BOM / CRLF 归一后再定界
  const content = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content };
  return { metadata: parseYamlFlat(match[1]), content: match[2].trim() };
}

// ---------- id 锚定：声明 id 原样用；无声明按相对路径推导（分隔符统一，Windows 反斜杠不算数） ----------

function deriveEntityId(rawDir, filePath) {
  const rel = path.relative(rawDir, filePath).replace(/\\/g, '/');
  return rel.replace(/\.md$/i, '').replace(/\//g, '-');
}

// ---------- 复制：实体 upsert ----------

// 路径信号（只看目录名，保守推断；不从正文猜）。显式 frontmatter type 永远优先。
const TYPE_BY_DIR = {
  conversations: 'Conversation', conversation: 'Conversation', chats: 'Conversation', sessions: 'Conversation',
  todos: 'Todo', todo: 'Todo', tasks: 'Todo',
  papers: 'Paper', paper: 'Paper',
  concepts: 'Concept', concept: 'Concept',
  meta: 'MetaKnowledge', 'meta-knowledge': 'MetaKnowledge', metaknowledge: 'MetaKnowledge',
  insights: 'Insight', insight: 'Insight',
  originals: 'RawDocument', origin: 'RawDocument', inbox: 'RawDocument'
};

function inferType(relPath, metadata) {
  const explicit = metadata && metadata.type != null ? String(metadata.type).trim() : '';
  if (explicit) return explicit;
  const rel = String(relPath || '').replace(/\\/g, '/');
  const dirs = rel.split('/').slice(0, -1).map((d) => d.toLowerCase());
  for (const d of dirs) {
    if (TYPE_BY_DIR[d]) return TYPE_BY_DIR[d];
  }
  return null;
}

function toContentRow(metadata, body, relPath, sink = null) {
  const confRaw = metadata.confidence;
  const confidence = confRaw == null || confRaw === '' ? null : (Number.isFinite(Number(confRaw)) ? Number(confRaw) : null);
  // SPEC-6.42：写入前按标签形状净化（只丢弃不发明），丢弃数计入 stats.tagsDropped
  let tags = null;
  if (metadata.tags != null) {
    const norm = require('./tag-hygiene.js').normalizeTags(metadata.tags);
    tags = JSON.stringify(norm.tags);
    if (sink && norm.dropped.length) sink.tagsDropped = (sink.tagsDropped || 0) + norm.dropped.length;
  }
  return {
    name: metadata.name == null || metadata.name === '' ? null : metadata.name,
    type: inferType(relPath, metadata),
    content: body,
    tags,
    status: metadata.status == null || metadata.status === '' ? 'active' : metadata.status,
    confidence
  };
}

function rowEquals(existing, row) {
  const norm = v => (v == null ? null : v);
  return (
    norm(existing.name) === norm(row.name) &&
    norm(existing.type) === norm(row.type) &&
    norm(existing.content) === norm(row.content) &&
    norm(existing.tags) === norm(row.tags) &&
    norm(existing.status) === norm(row.status) &&
    norm(existing.confidence) === norm(row.confidence)
  );
}

function walkMarkdown(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue; // 隐藏目录/文件跳过
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walkMarkdown(full, out);
    } else if (name.toLowerCase().endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

// ---------- 主步：compile(rawDir) ----------

async function compile(rawDir, store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('compile 需要 store 注入（SPEC-1.14 契约）');
  const stats = { scanned: 0, created: 0, updated: 0, skipped: 0, rejected: 0, tagsDropped: 0, rejectedReasons: [] };
  // SPEC-6.43 编译前闸：L0 完整性默认开；L1 质量按 opts.quality；L2 KESPI 只在有分数时防降级
  const quality = opts.quality === true;
  const minContent = Number.isFinite(Number(opts.minContent)) ? Number(opts.minContent) : 200;
  const minKq = Number.isFinite(Number(opts.minKq)) ? Number(opts.minKq) : 0.40;
  if (!fs.existsSync(rawDir)) return stats;

  const files = Array.isArray(opts.files)
    ? opts.files.filter(f => String(f).toLowerCase().endsWith('.md') && fs.existsSync(f))
    : walkMarkdown(rawDir, []);
  const db = store._getDb();
  let dirty = false;

  const insertStmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const updateStmt = db.prepare(
    `UPDATE entities SET name = ?, type = ?, content = ?, tags = ?, status = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  for (const filePath of files) {
    stats.scanned++;
    const text = fs.readFileSync(filePath, 'utf8');
    const { metadata, content } = parseFrontmatter(text);
    const id = (metadata.id != null && String(metadata.id).trim() !== '') ? String(metadata.id).trim() : deriveEntityId(rawDir, filePath);
    const row = toContentRow(metadata, content, path.relative(rawDir, filePath), stats);
    const existing = store.getEntity(id);
    // 推断不出时不清空既有类型（迁移/旧编译已定的 type 不能被降级）
    if (row.type == null && existing && existing.type != null) row.type = existing.type;

    // ── 闸：逐级判，命中即拒，本轮不写库 ──────────────────
    const reasons = [];
    const body = String(content == null ? '' : content).trim();
    if (!body) reasons.push('empty-content');
    if (!id || /\s/.test(String(id))) reasons.push('bad-id');
    if (quality) {
      let tags = [];
      try { tags = JSON.parse(row.tags || '[]'); } catch (_) { tags = []; }
      if (!Array.isArray(tags) || tags.length === 0) reasons.push('no-tags');
      if (body.length < minContent) reasons.push('short-content');
    }
    if (!reasons.length && existing && row.content != null) {
      const kqRow = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?');
      kqRow.bind([id]);
      const kq = kqRow.step() ? Number(kqRow.getAsObject().kq) : null;
      kqRow.free();
      const oldLen = String(existing.content == null ? '' : existing.content).trim().length;
      const newLen = String(row.content == null ? '' : row.content).trim().length;
      if (kq != null && Number.isFinite(kq) && kq < minKq && newLen <= oldLen) reasons.push('kespi-downgrade');
    }
    if (reasons.length) {
      stats.rejected++;
      stats.rejectedReasons.push({ id, reasons });
      continue;
    }

    if (!existing) {
      insertStmt.run([id, row.name, row.type, row.content, row.tags, row.status, row.confidence]);
      stats.created++;
      dirty = true;
    } else if (!rowEquals(existing, row)) {
      updateStmt.run([row.name, row.type, row.content, row.tags, row.status, row.confidence, id]);
      stats.updated++;
      dirty = true;
    } else {
      stats.skipped++;
    }
  }

  insertStmt.free();
  updateStmt.free();
  // 审计：每轮一行，只追加（SPEC-6.43 §1.2）
  try {
    db.run('INSERT INTO compile_audit (scanned, created, updated, skipped, rejected, rejected_json, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [stats.scanned, stats.created, stats.updated, stats.skipped, stats.rejected, JSON.stringify(stats.rejectedReasons)]);
    const s = db.prepare('SELECT MAX(id) AS id FROM compile_audit');
    stats.auditId = s.step() ? s.getAsObject().id : null;
    s.free();
    dirty = true;
  } catch (e) { stats.auditError = e.message; }
  if (dirty) store._persist();
  return stats;
}

module.exports = { compile, parseFrontmatter, deriveEntityId, inferType, TYPE_BY_DIR, walkMarkdown };
