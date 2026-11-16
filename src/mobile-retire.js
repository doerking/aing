'use strict';
// aing-v2 mobile-retire.js —— M6 任务 6.11b（SPEC-6.11 §六 + 修订 A）
// 手机端只出「退役请求」：列出到期候选、给桌面端归档校对用；不删行、不写表、不写墓碑。
// 物理删与归档校验仍归 tools/archive.js 的桌面模式（applyAllowed=false 在此模式恒成立）。

const crypto = require('crypto');
const { planRetention, MOBILE_WINDOW_DAYS } = require('./retention.js');

// 稳定序列化：键名排序，保证同库同快照两次摘要一致（请求包可验签）
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

/**
 * 只读生成退役请求。
 * @returns {{version:number, mode:string, generatedAt:string, windowDays:number, maxHot:number,
 *   counts:object, overCap:number, candidates:Array<{id,type,name,updatedAt,ageDays}>, sha256:string}}
 */
function buildRetireRequest(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('mobile-retire 需要 store 注入（SPEC-6.11 契约）');
  const plan = planRetention(store, Object.assign({}, opts, { mode: 'mobile-retire' }));
  const db = store._getDb();
  const candidates = plan.candidates
    .map((c) => {
      const r = _rows(db, 'SELECT updated_at FROM entities WHERE id = ?', [c.id])[0];
      return { id: c.id, type: c.type, name: c.name, topic: c.topic || null, updatedAt: r ? r.updated_at : null, ageDays: c.ageDays };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const payload = {
    version: 1,
    mode: 'mobile-retire',
    generatedAt: plan.now,
    windowDays: plan.windowDays,
    maxHot: plan.maxHot,
    counts: plan.counts,
    overCap: plan.overCap,
    candidates
  };
  const sha256 = crypto.createHash('sha256').update(canonical(payload)).digest('hex');
  return Object.assign({}, payload, { sha256 });
}

module.exports = { buildRetireRequest, canonical, MOBILE_WINDOW_DAYS };
