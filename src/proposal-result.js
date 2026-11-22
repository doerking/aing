'use strict';
// aing-v2 proposal-result.js —— M6 任务 6.56 实现（SPEC-6.56 回单落地）
// P6 位点声明 writeBack = entities(按需求改动) + opt_tickets.evidence_json.result；
// 本件补上前半截：回单过闸后按需求白名单写回实体，并留可审计的账。
// 铁律：绝不碰 last_access / status / confidence / invalid_at / strand；
// 写回不是访问事件，不能靠它抬 ka。判定权仍归 verifyTickets（P7 不外派）。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const crypto = require('crypto');

const MIN_CONTENT_CHARS = 400;
const MIN_TAGS = 3;
// 按需求白名单：只有「写一段正文就能修」的维在这里落地；其余走场域动作或候选边过闸
const WRITE_BACK = {
  'kq-low': ['content', 'tags'],
  'kq-low-narrative': ['content', 'tags'],
  // SPEC-6.60：kd-cited（被引用唔催化）——修法是建出向边，走 P3 候选边过闸
  'kd-cited': ['edges']
};
// 候选边统一口径（与 src/pollinate.js 同源）：relation 候选型、confidence 0.5、
// strength 由证据数定（≥3 种证据给 6，否则 4）——超过 3 的候选边唔该自带强边强度，提升系 promoteEdges 的职权。
const CANDIDATE_REL = 'pollinate-candidate';
const CANDIDATE_CONF = 0.5;
const EDGE_MIN_KINDS = 2;          // 修订 A：与 sprout 成种 / promoteEdges 提升闸同口径
const EDGE_MIN_KINDS_STRONG = 3;   // ≥3 类 → strength 6；否则 4
const EDGE_STRENGTH_WEAK = 4;
const EDGE_STRENGTH_STRONG = 6;
const PROPOSAL_ACTIONS = ['slot', 'memo-card'];
const OPEN_STATUS = ['proposed', 'dispatched'];

function _requireStore(store, who) {
  if (!store || typeof store._getDb !== 'function') throw new Error(who + ' 需要 store 注入（SPEC-1.15 契约）');
}

function _digest(s) {
  return crypto.createHash('sha1').update(String(s == null ? '' : s), 'utf8').digest('hex').slice(0, 12);
}

function _len(s) { return String(s == null ? '' : s).replace(/\s+/g, '').length; }

function _one(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function _ticket(db, id) {
  return _one(db, 'SELECT * FROM opt_tickets WHERE id = ?', [id]);
}

/** 合并 evidence 并按需推进状态（attempts 不动：落地不是失败也不是追单） */
function _patch(db, id, patch, status) {
  const cur = _ticket(db, id);
  let ev = {};
  try { ev = JSON.parse((cur && cur.evidence_json) || '{}'); } catch (_) { ev = {}; }
  Object.assign(ev, patch || {});
  const stmt = status
    ? db.prepare(`UPDATE opt_tickets SET status = ?, evidence_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    : db.prepare(`UPDATE opt_tickets SET evidence_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  if (status) stmt.run([status, JSON.stringify(ev), id]);
  else stmt.run([JSON.stringify(ev), id]);
  stmt.free();
}

function _tagsOf(tags) {
  try { const t = JSON.parse(tags || '[]'); return Array.isArray(t) ? t : []; } catch (_) { return []; }
}

/**
 * SPEC-6.60：kd-cited 回单 → 落候选边（P3 写回点：links 候选关系 → 过闸提升）。
 * 校验系 P3 的 refuse 三件 + 幂等；唔接受自报 relation / strength（自报会把候选边变强边刷 kd）。
 * 返回 { ok, reason, applied, soft }：soft 真系幂等 skip，票唔标 rejected。
 */
function _applyEdges(db, t, result) {
  const edges = Array.isArray(result.edges) ? result.edges : null;
  if (!edges || edges.length === 0) return { ok: false, reason: 'no-edges', applied: [] };
  const src = _one(db, 'SELECT id, strand FROM entities WHERE id = ?', [t.entity_id]);
  if (!src) return { ok: false, reason: 'entity-not-found', applied: [] };
  const applied = [];
  for (const raw of edges) {
    const edge = raw && typeof raw === 'object' ? raw : {};
    // 修订 A：证据去重后才数——与「≥2 类独立证据才成种」（sprout）与提升闸
    // （promoteEdges 的 distinct.length >= 2）同口径。唔然 1 条证据就建边，
    // 建的边永远提唔升，闭环喺呢度断。
    const evid = Array.isArray(edge.evidence) ? edge.evidence : [];
    const ev = [...new Set(evid.map((x) => String(x == null ? '' : x).trim()).filter(Boolean))];
    if (ev.length < EDGE_MIN_KINDS) return { ok: false, reason: 'no-evidence', applied: [] };
    const target = String(edge.target == null ? '' : edge.target).trim();
    if (!target) return { ok: false, reason: 'no-evidence', applied: [] };
    const dst = _one(db, 'SELECT id, strand FROM entities WHERE id = ?', [target]);
    if (!dst) return { ok: false, reason: 'target-not-found', applied: [] };
    if (target === String(src.id)) return { ok: false, reason: 'self-edge', applied: [] };
    const srcStrand = String(src.strand == null ? 'past' : src.strand);
    const dstStrand = String(dst.strand == null ? 'past' : dst.strand);
    if (srcStrand === 'future' && dstStrand === 'past') return { ok: false, reason: 'future-to-past', applied: [] };
    const dup = _one(db,
      'SELECT 1 AS x FROM links WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)',
      [src.id, target, target, src.id]);
    if (dup) return { ok: false, reason: 'edge-exists', applied: [], soft: true };
    // strength 按 distinct 类数定（重复堆条数唔得假强）
    const strength = ev.length >= EDGE_MIN_KINDS_STRONG ? EDGE_STRENGTH_STRONG : EDGE_STRENGTH_WEAK;
    const ins = db.prepare(
      `INSERT INTO links (source_id, target_id, relation, confidence, strength, evidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
    ins.run([src.id, target, CANDIDATE_REL, CANDIDATE_CONF, strength, JSON.stringify(ev)]);
    ins.free();
    applied.push({
      field: 'links', target, relation: CANDIDATE_REL, strength, evidenceCount: ev.length,
      digest: _digest(src.id + '\u0000' + target + '\u0000' + CANDIDATE_REL)
    });
  }
  return { ok: true, reason: 'applied-edges', applied };
}

/**
 * 外部件交回单 → 过闸 → 按需求白名单写回实体。
 * @param {object} store
 * @param {string} ticketId
 * @param {{result:object, membrane?:string}} opts
 * @returns {{ok:boolean, reason:string, applied:Array}}
 */
function applyProposalResult(store, ticketId, opts = {}) {
  _requireStore(store, 'proposal-result.applyProposalResult');
  const db = store._getDb();
  const id = String(ticketId == null ? '' : ticketId);
  const t = _ticket(db, id);
  if (!t) return { ok: false, reason: 'ticket-not-found', applied: [] };
  if (!PROPOSAL_ACTIONS.includes(String(t.action))) return { ok: false, reason: 'not-proposable', applied: [] };
  if (!OPEN_STATUS.includes(String(t.status))) return { ok: false, reason: 'terminal-state', applied: [] };

  let ev = {};
  try { ev = JSON.parse(t.evidence_json || '{}'); } catch (_) { ev = {}; }
  const demand = ev.demand && typeof ev.demand === 'object' ? ev.demand : null;
  if (!demand) return { ok: false, reason: 'no-demand', applied: [] };

  const result = opts.result;
  if (!result || typeof result !== 'object') return { ok: false, reason: 'no-result', applied: [] };

  // 一、过闸：膜 → 粒度 → 发布门（与 verifyTickets 同一把尺）
  const { admit } = require('./ticket-gate.js');
  const membrane = opts.membrane || 'semi';
  const verdict = admit(result, { membrane });
  if (!verdict.admitted) {
    const reason = 'gate:' + verdict.stage + ':' + (verdict.reasons || []).join('+');
    _patch(db, id, { gate: verdict, reason }, 'rejected');
    store._persist();
    return { ok: false, reason, applied: [] };
  }

  // 二、按需求白名单决定写不写实体
  const fields = WRITE_BACK[String(t.kind)] || null;
  if (!fields) {
    _patch(db, id, { result, applied: [], appliedAt: new Date().toISOString() });
    store._persist();
    return { ok: true, reason: 'record-only', applied: [] };
  }

  // 2a、SPEC-6.60：kd-cited → 落候选边（不写正文；kd 靠 links，正文修唔到）
  if (String(fields[0]) === 'edges') {
    const r = _applyEdges(db, t, result);
    if (!r.ok) {
      // soft（edge-exists）系幂等 skip：票保持 proposed 唔标 rejected，留待下轮真有新边可建
      _patch(db, id, { result, reason: r.reason }, r.soft ? null : 'rejected');
      store._persist();
      return { ok: false, reason: r.reason, applied: [] };
    }
    _patch(db, id, { result, applied: r.applied, appliedAt: new Date().toISOString() });
    store._persist();
    return { ok: true, reason: r.reason, applied: r.applied };
  }

  const ent = _one(db, 'SELECT id, content, tags FROM entities WHERE id = ?', [t.entity_id]);
  if (!ent) return { ok: false, reason: 'entity-not-found', applied: [] };

  const newContent = result.content == null ? '' : String(result.content);
  if (_len(newContent) < MIN_CONTENT_CHARS) {
    _patch(db, id, { reason: 'content-too-short', contentLen: _len(newContent) }, 'rejected');
    store._persist();
    return { ok: false, reason: 'content-too-short', applied: [] };
  }
  if (String(newContent) === String(ent.content == null ? '' : ent.content)) {
    // 逐字相同 = 空转；票不动，留给下一次真改动
    return { ok: false, reason: 'no-change', applied: [] };
  }

  let newTags = ent.tags;
  if (result.tags != null) {
    const given = Array.isArray(result.tags) ? result.tags : null;
    const clean = given ? given.filter(x => x != null && String(x).trim() !== '').map(x => String(x).trim()) : [];
    if (!given || clean.length < MIN_TAGS) {
      _patch(db, id, { reason: 'bad-tags', tagCount: clean.length }, 'rejected');
      store._persist();
      return { ok: false, reason: 'bad-tags', applied: [] };
    }
    newTags = JSON.stringify([...new Set(clean)]);
  }

  // 三、写回：只动 content / tags / updated_at，其余列一字不改
  const upd = db.prepare('UPDATE entities SET content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  upd.run([newContent, newTags, t.entity_id]);
  upd.free();

  const applied = [
    { field: 'content', beforeLen: _len(ent.content), afterLen: _len(newContent), digest: _digest(newContent) },
    { field: 'tags', beforeLen: _tagsOf(ent.tags).length, afterLen: _tagsOf(newTags).length, digest: _digest(newTags) }
  ];
  _patch(db, id, { result, applied, appliedAt: new Date().toISOString() });
  store._persist();
  return { ok: true, reason: 'applied', applied };
}

module.exports = { MIN_CONTENT_CHARS, MIN_TAGS, WRITE_BACK, CANDIDATE_REL, CANDIDATE_CONF, EDGE_MIN_KINDS, applyProposalResult };
