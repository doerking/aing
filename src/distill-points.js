'use strict';
// aing-v2 distill-points.js —— M6 任务 6.2 实现（SPEC-6.2 能力叙事消费与蒸馏点）
// 缺口来源：docs/Engineering/CONSUMER-AUDIT-2026-11-16.md 缺口 1。
// 定位：后半区消费侧——读活跃实体正文，机械抽原话（能力单元区间捕获 + 节白名单），
//       产确定性蒸馏点落 distill_points；不改写正文，不破 distill 的逐字保真契约。
// 口径来自旧院 aing/src/distill.js:103 extractCapabilityRaw（层级鲁棒 + 双语起锚 + 中文止锚）。
// 铁律：不碰 last_access / tolaria_strength / invalid_at；无物理删；store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');

const RAW_SECTIONS = ['原始消息', '用户提问', 'Agent 回复', 'Agent 分析', '收集资料'];
const START_RE = /^#{1,6}\s*(?:能力单元|Capability Unit)/i;
const STOP_RE = /^#{1,6}\s*(?:提取实体|标签|蒸馏摘要)/;
const FORMAT = 'distill-points-v1';
const POINTS_MAX = 5;
const MIN_SENTENCE = 4;

// ── helpers ────────────────────────────────────────────────
function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

/** 6.1 的叙事实体 content 是 JSON（含 markdown）；其余按原文处理 */
function textOf(content) {
  if (typeof content !== 'string') return '';
  const t = content.trim();
  if (!t.startsWith('{')) return content;
  try {
    const o = JSON.parse(t);
    if (o && typeof o.markdown === 'string') return o.markdown;
  } catch (_) { /* 非 JSON，按原文 */ }
  return content;
}

/** 行算不算原话：标题/空行/省略/引用/注释不算 */
function isRawLine(t) {
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return false;
  if (t === '...' || t === '…' || t === '---') return false;
  if (t.startsWith('>') || t.startsWith('（')) return false;
  return true;
}

/** 能力单元区间捕获：h1–h6 鲁棒；起端中英双语（/i）；止端只认中文 */
function extractCapabilityRaw(text, out = []) {
  const lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
  const seen = new Set(out);
  let inRegion = false;
  for (const line of lines) {
    const t = line.trim();
    if (START_RE.test(t)) { inRegion = true; continue; }
    if (inRegion && STOP_RE.test(t)) { inRegion = false; continue; }
    if (!inRegion || !isRawLine(t) || seen.has(t)) continue;
    seen.add(t); out.push(t);
  }
  return out;
}

/** 节白名单捕获（普通档）：进入白名单节后按同一套过滤收行 */
function extractSectionRaw(text, out = []) {
  const lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
  const seen = new Set(out);
  let inSection = false;
  for (const line of lines) {
    const t = line.trim();
    const h = t.match(/^#{1,6}\s*(.*)$/);
    if (h) {
      inSection = RAW_SECTIONS.some((s) => h[1].startsWith(s));
      continue;
    }
    if (!inSection || !isRawLine(t) || seen.has(t)) continue;
    seen.add(t); out.push(t);
  }
  return out;
}

/** 原话抽取总入口：白名单先、区间后，合并去重 */
function extractRawMessages(content) {
  const body = textOf(content);
  const out = [];
  extractSectionRaw(body, out);
  extractCapabilityRaw(body, out);
  return out;
}

/** 机械蒸馏点：句切 + 长度门槛 + 取最长 5 句（同长按出现序），输出按出现序 */
function buildPoints(items) {
  const lines = [];
  for (const msg of Array.isArray(items) ? items : []) {
    for (const sent of String(msg).split(/(?<=[。！？.!?])\s*/)) {
      const t = sent.trim();
      if (t.length >= MIN_SENTENCE) lines.push(t);
    }
  }
  const points = lines
    .map((s, i) => ({ s, i, len: s.length }))
    .sort((a, b) => b.len - a.len || a.i - b.i)
    .slice(0, POINTS_MAX)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  return { points, lineCount: lines.length };
}

function digestOf(items) {
  return crypto.createHash('sha256').update(items.join('\n')).digest('hex').slice(0, 16);
}

// ── 入口：一轮抽取（幂等；退役源跳过；抽不到不写空行）────────
async function extractStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('distill-points 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const stats = { scanned: 0, extracted: 0, skipped: 0, noRaw: 0 };
  const rows = _rows(
    db,
    `SELECT id, content FROM entities
     WHERE status = 'active' AND invalid_at IS NULL
     ORDER BY id`
  );
  let dirty = false;
  for (const row of rows) {
    stats.scanned++;
    const items = extractRawMessages(row.content);
    if (!items.length) { stats.noRaw++; continue; }
    const { points, lineCount } = buildPoints(items);
    const digest = digestOf(items);
    const existing = _scalar(db, 'SELECT digest FROM distill_points WHERE base_id = ?', [row.id]);
    if (existing && existing.digest === digest) { stats.skipped++; continue; }
    const pointsJson = JSON.stringify(points);
    if (existing) {
      const up = db.prepare(
        'UPDATE distill_points SET digest = ?, raw_count = ?, line_count = ?, points_json = ?, updated_at = CURRENT_TIMESTAMP WHERE base_id = ?'
      );
      up.run([digest, items.length, lineCount, pointsJson, row.id]);
      up.free();
    } else {
      const ins = db.prepare(
        'INSERT INTO distill_points (base_id, digest, raw_count, line_count, points_json, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
      );
      ins.run([row.id, digest, items.length, lineCount, pointsJson]);
      ins.free();
    }
    stats.extracted++;
    dirty = true;
  }
  if (dirty) store._persist();
  return stats;
}

module.exports = {
  RAW_SECTIONS, START_RE, STOP_RE, FORMAT, POINTS_MAX, MIN_SENTENCE,
  textOf, isRawLine, extractCapabilityRaw, extractSectionRaw, extractRawMessages,
  buildPoints, digestOf, extractStep
};
