'use strict';
// aing-v2 candidate-scrub.js —— M6 任务 6.52 实现（SPEC-6.52 旧候选边清账）
// 只退役「空证据」候选边：invalid_at + invalid_reason='legacy-no-evidence'，不物理删、不改证据。
// 组件不直连 knowledge-store：store 由调用方注入（arch-lint C5）。

const CANDIDATE_RELATIONS = ['sprout-candidate', 'pollinate-candidate'];
const REASON = 'legacy-no-evidence';

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

/** 证据是否为空：NULL / '' / '[]' / 解析失败 都算空 */
function isEmptyEvidence(raw) {
  if (raw == null) return true;
  const text = String(raw).trim();
  if (!text) return true;
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.length === 0 : false;
  } catch (_) { return false; } // 坏 JSON 不当空（宁可留着，别误杀有证据的）
}

/**
 * 清账：空证据候选边退役。
 * @returns {{scanned:number, wouldRetire:number, retired:object[]}}
 */
function scrubCandidates(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('candidate-scrub 需要 store 注入（SPEC-6.52 契约）');
  const apply = opts.apply === true;
  const db = store._getDb();
  const cands = _rows(db,
    `SELECT source_id, target_id, relation, strength, evidence FROM links
     WHERE invalid_at IS NULL AND relation IN (?, ?)`, CANDIDATE_RELATIONS);
  const stale = cands.filter(c => isEmptyEvidence(c.evidence));
  const retired = stale.map(c => ({ source_id: c.source_id, target_id: c.target_id, relation: c.relation, strength: c.strength }));

  if (apply && retired.length) {
    const upd = db.prepare('UPDATE links SET invalid_at = CURRENT_TIMESTAMP, invalid_reason = ? WHERE source_id = ? AND target_id = ?');
    for (const c of retired) upd.run([REASON, c.source_id, c.target_id]);
    upd.free();
    store._persist();
  }
  return { scanned: cands.length, wouldRetire: retired.length, retired };
}

module.exports = { scrubCandidates, isEmptyEvidence, CANDIDATE_RELATIONS, REASON };
