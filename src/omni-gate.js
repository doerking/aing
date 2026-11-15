'use strict';
// aing-v2 omni-gate.js —— M2 任务 2.16 实现（SPEC-2.16 闸东真接）
// 三闸：canary（不输基线）/ holdout（独立证据 ≥2）/ acceptance（入口带需 doubleLock）。
// 真接：promote 主路径必跑三闸并留痕；冇闸记录一律拒（I8）。
// 审批边界：改可见阈值等一律入 W2 队列，唔代执行；memo 只收只读提案卡片（I10）。
// 铁律：闸表与队列只增；唔碰 last_access；无物理 DELETE。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');

const THRESHOLD_KINDS = ['threshold', 'band-rule', 'budget', 'user-surface'];

function _id(prefix) { return prefix + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'); }

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _kinds(evidence) {
  const raw = Array.isArray(evidence) ? evidence
    : (evidence && Array.isArray(evidence.kinds) ? evidence.kinds : []);
  return [...new Set(raw.map(String))];
}

/**
 * 三闸判定 + 留痕。
 * @returns {{passed:boolean, failed:string[], gates:object, recordId:string}}
 */
async function runGates(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('omni-gate 需要 store 注入（SPEC-2.16 契约）');
  const db = store._getDb();
  const subject = String(opts.subject || 'unknown');
  const kind = String(opts.kind || 'promote');
  const kinds = _kinds(opts.evidence);
  const targetStrength = Number.isInteger(opts.targetStrength) ? opts.targetStrength : null;
  const baselineScore = opts.baseline && opts.baseline.score != null ? Number(opts.baseline.score) : null;
  const candidateScore = opts.candidateScore != null ? Number(opts.candidateScore) : Math.round((kinds.length / 4) * 100) / 100;

  const canary = baselineScore == null ? kinds.length > 0 : candidateScore >= baselineScore;
  const holdout = kinds.length >= 2;
  const needsDoubleLock = targetStrength != null && targetStrength >= 7;
  const doubleLock = needsDoubleLock ? (canary && holdout) : true;
  const acceptance = targetStrength == null || targetStrength <= 6 ? true : doubleLock;

  const failed = [];
  if (!canary) failed.push('canary');
  if (!holdout) failed.push('holdout');
  if (!acceptance) failed.push('acceptance');

  const gates = {
    canary: { ok: canary, baseline: baselineScore, candidate: candidateScore },
    holdout: { ok: holdout, kinds },
    acceptance: { ok: acceptance, targetStrength, needsDoubleLock, doubleLock }
  };
  const passed = failed.length === 0;

  const id = _id('gate');
  const stmt = db.prepare(
    `INSERT INTO gate_records (id, subject, kind, passed, gates_json, evidence_json, baseline_json, cycle_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  stmt.run([id, subject, kind, passed ? 1 : 0, JSON.stringify(gates), JSON.stringify(kinds),
    JSON.stringify(opts.baseline || null), opts.cycleId || null]);
  stmt.free();
  store._persist();
  return { passed, failed, gates, recordId: id };
}

function hasPassingGate(store, subject, kind = 'promote') {
  const db = store._getDb();
  const r = _scalar(db, `SELECT COUNT(*) AS n FROM gate_records WHERE subject = ? AND kind = ? AND passed = 1`, [subject, kind]);
  return Number(r.n || 0) > 0;
}

function requireGate(store, subject, kind = 'promote') {
  if (!hasPassingGate(store, subject, kind)) throw new Error(`gate-required: ${subject}/${kind} 无闸记录`);
  const db = store._getDb();
  return _scalar(db, `SELECT * FROM gate_records WHERE subject = ? AND kind = ? AND passed = 1 ORDER BY created_at DESC LIMIT 1`, [subject, kind]);
}

/** 醒目改动入 W2 队列（唔代执行） */
async function proposeChange(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('omni-gate 需要 store 注入（SPEC-2.16 契约）');
  const kind = String(opts.kind || '');
  if (!THRESHOLD_KINDS.includes(kind)) throw new Error(`proposeChange 未支持 kind: ${kind}`);
  const db = store._getDb();
  const id = _id('w2');
  const stmt = db.prepare(
    `INSERT INTO approval_queue (id, kind, payload_json, reason, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
  );
  stmt.run([id, kind, JSON.stringify(opts.payload || null), opts.reason || null]);
  stmt.free();
  store._persist();
  return { queued: true, id };
}

async function decideChange(store, id, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('omni-gate 需要 store 注入（SPEC-2.16 契约）');
  const db = store._getDb();
  const row = _scalar(db, 'SELECT * FROM approval_queue WHERE id = ?', [id]);
  if (!row) return { decided: false, reason: 'not-found' };
  if (row.status !== 'pending') return { decided: false, reason: 'already-decided' };
  const status = opts.approve ? 'approved' : 'rejected';
  const stmt = db.prepare('UPDATE approval_queue SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run([status, id]);
  stmt.free();
  store._persist();
  return { decided: true, id, status };
}

/** memo 提案卡片（只读；I10：只出提案/评分/建议） */
function proposalCards(store) {
  if (!store || typeof store._getDb !== 'function') throw new Error('omni-gate 需要 store 注入（SPEC-2.16 契约）');
  const db = store._getDb();
  const pending = _rows(db, `SELECT id, kind, reason, payload_json FROM approval_queue WHERE status = 'pending' ORDER BY created_at`);
  const cands = _rows(db,
    `SELECT source_id, target_id, relation, strength FROM links
     WHERE invalid_at IS NULL AND relation IN ('sprout-candidate','pollinate-candidate') ORDER BY strength DESC LIMIT 10`);
  const last = _scalar(db, `SELECT * FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 1`);

  const cards = [];
  if (pending.length) {
    cards.push({
      title: '待拍板：阈值／规则改动',
      body: `W2 队列有 ${pending.length} 项待决；按现行边界，成员只可提案，唔代执行。`,
      items: pending.map(p => ({ id: p.id, kind: p.kind, reason: p.reason }))
    });
  }
  if (cands.length) {
    cards.push({
      title: '待消化：候选边',
      body: `本轮有 ${cands.length} 条候选边待复核提升或退役。`,
      items: cands.map(c => ({ edge: c.source_id + '->' + c.target_id, relation: c.relation, strength: c.strength }))
    });
  }
  cards.push({
    title: '本轮定焦建议',
    body: last ? `上一轮 ${last.cycle_type} 状态 ${last.status}；守恒比 ${last.conservation_ratio}。` : '尚无代谢轮记录，建议先供料。',
    items: last ? [{ growth: last.growth, pruned: last.pruned, ratio: last.conservation_ratio }] : []
  });
  return cards;
}

module.exports = { runGates, hasPassingGate, requireGate, proposeChange, decideChange, proposalCards, THRESHOLD_KINDS };
