'use strict';
// aing-v2 identity.js —— SPEC-7.1 §二：序列号身份 · 标题派生 · 内容指纹去重
// 铁律：
//   1) id 是序列号（e-YYYYMMDD-NNNN），只追加、不复用、不随标题变；
//   2) title 由正文派生，永不入键（检索词面见 retrieval.js §4.1）；
//   3) 同指纹再进 → 返回原号，不落新行；同号不同内容 → 拒。
// 本模块不直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const crypto = require('crypto');
const derive = require('./derive.js');

const MAX_TITLE = 40;

/** 内容指纹：去空白差异后 sha1（简繁不改写内容 → 不折叠，避免把两种原文判成同一份） */
function fingerprint(content) {
  const s = String(content == null ? '' : content).replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex');
}

function _pad4(n) { return String(n).padStart(4, '0'); }

function _today(date) {
  if (date) return String(date).replace(/\D/g, '').slice(0, 8);
  const d = new Date();
  return String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
}

/**
 * 分配下一个序列号（同日单调递增，含已失效行，绝不回收）。
 * @param store 注入的知识库
 * @param {{date?:string}} opts date='YYYYMMDD' 可注入，便于测试
 */
function nextSerial(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('identity 需要 store 注入（SPEC-1.15 契约）');
  const ymd = _today(opts.date);
  const prefix = 'e-' + ymd + '-';
  const db = store._getDb();
  // 号段账本：即使分配后没落行（幂等去重/事务回滚），号也不回收
  db.run('CREATE TABLE IF NOT EXISTS serial_ledger (ymd TEXT PRIMARY KEY, seq INTEGER NOT NULL)');
  const ls = db.prepare('SELECT seq FROM serial_ledger WHERE ymd = ?');
  ls.bind([ymd]);
  const ledger = ls.step() ? Number(ls.getAsObject().seq || 0) : 0;
  ls.free();
  const stmt = db.prepare('SELECT id FROM entities WHERE id LIKE ? ORDER BY id DESC LIMIT 1');
  stmt.bind([prefix + '%']);
  let last = null;
  if (stmt.step()) last = String(stmt.getAsObject().id || '');
  stmt.free();
  const fromRows = last ? Number(last.slice(prefix.length)) || 0 : 0;
  const seq = Math.max(ledger, fromRows) + 1;
  const up = db.prepare('INSERT OR REPLACE INTO serial_ledger (ymd, seq) VALUES (?, ?)');
  up.run([ymd, seq]);
  up.free();
  if (typeof store._persist === 'function') store._persist();
  return prefix + _pad4(seq);
}

/** 从正文派生标题：剥 JSON 外壳 / markdown 标记 / 空行，取首行，截 40 字 */
function titleOf(content, fallback = '未命名') {
  let s = String(content == null ? '' : content).trim();
  if (!s) return fallback;
  if (s[0] === '{' || s[0] === '[') {
    try {
      const o = JSON.parse(s);
      if (o && typeof o === 'object') {
        const cand = o.topic || o.title || o.name || (typeof o.reply === 'string' ? o.reply : '') || '';
        if (String(cand).trim()) s = String(cand).trim();
      }
    } catch (_) { /* 不是合法 JSON，按纯文本处理 */ }
  }
  const lines = s.split(/\r?\n/).map((x) => x.replace(/^\s*#{1,6}\s*/, '').replace(/^[\s>*\-+]+/, '').trim()).filter(Boolean);
  const first = lines.length ? lines[0] : s;
  const clean = first.replace(/\s+/g, ' ').trim();
  return (clean || fallback).slice(0, MAX_TITLE);
}

/**
 * 带身份与去重的入库：同指纹返回原号；否则分配序列号落新行。
 * @returns {{id:string, deduped:boolean, title:string}}
 */
function ingestEntity(store, payload = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('identity 需要 store 注入（SPEC-1.15 契约）');
  const content = String(payload.content == null ? '' : payload.content);
  const fp = fingerprint(content);
  const db = store._getDb();
  const stmt = db.prepare("SELECT id FROM entities WHERE fingerprint = ? AND invalid_at IS NULL ORDER BY created_at LIMIT 1");
  stmt.bind([fp]);
  let hit = null;
  if (stmt.step()) hit = String(stmt.getAsObject().id || '');
  stmt.free();
  const title = payload.title || titleOf(content);
  if (hit) return { id: hit, deduped: true, title };

  const id = payload.id || nextSerial(store);
  store.insertEntity({
    id,
    name: title,
    type: payload.type || 'Concept',
    content,
    tags: payload.tags || '[]',
    status: payload.status || 'active',
    confidence: payload.confidence,
    strand: payload.strand || 'past',
    fingerprint: fp
  });
  return { id, deduped: false, title };
}

/** 查询归一（转调派生器，保持单源） */
function normalize(text) { return derive.normalizeQuery(text); }

module.exports = { fingerprint, nextSerial, titleOf, ingestEntity, normalize, MAX_TITLE };
