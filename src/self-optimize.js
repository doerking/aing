'use strict';
// aing-v2 self-optimize.js —— M6 任务 6.8 实现（SPEC-6.8 自优化闭环）
// KESPI 误差 → opt_tickets 工单 → 场域动作（2.12/2.13）→ T2 复核 → gene。
// 判定与执行分离：本件只出工单与路由；真写入仍由 meko-field / field-promote 做。
// 训练技能本地化：六阶段（rollout/reflect/aggregate/select/update/gate）不依赖外部 SkillOpt。
// 铁律：唔碰 last_access；无物理删；工单只增（状态推进，唔改历史读数）。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');

// SPEC-1.12 修订 A：五维绝对值整体下移（真库五维实测 p25 0.46 / p50 0.51 / p90 0.71），分区随之下调
const ZONES = { red: 0.45, green: 0.60 };
const MAX_TICKETS = 20;
const VERIFY_ATTEMPTS = 2;
const { heartbeatOf, CHASE_REASON, ESCALATE_REASON } = require('./ticket-followup.js');

// 每维一条工单规则：below = 触发线；action = 场域动作或 memo-card（提案，不写场域）
// SPEC-1.12 修订 A：KG/KM/KB 退役（不再有列值）；KD 改为催化率——零催化是常态，
// 只有「被引用却不向外催化」（入向强边 ≥2）才值得回炉，其余不开单。
const DIM_RULES = {
  kq: { below: 0.50, kind: 'kq-low', action: 'memo-card' },
  ka: { below: 0.30, kind: 'ka-low', action: 'memo-card' },
  kc: { below: 0.40, kind: 'kc-low', action: 'reconcile' },
  kr: { below: 0.30, kind: 'kr-low', action: 'memo-card' },
  kd: { below: 0.30, kind: 'kd-low', action: 'rebond', requireInStrong: 2 }
};
const DIM_NAMES = Object.keys(DIM_RULES);
const ACTION_ORDER = { reconcile: 0, rebond: 1, demote: 2, 'memo-card': 3 };
const FIELD_ACTIONS = ['reconcile', 'rebond', 'demote'];

// 训练六阶段：本地映射，唔引入外部运行器
const TRAINER_STAGES = ['rollout', 'reflect', 'aggregate', 'select', 'update', 'gate'];

const OPEN_STATES = ['open', 'dispatched', 'proposed'];

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

function _requireStore(store, who) {
  if (!store || typeof store._getDb !== 'function') throw new Error(who + ' 需要 store 注入（SPEC-1.15 契约）');
}

function _latestScores(db) {
  // kespi_scores 每实体一行（UPSERT），直接当最新读数
  return _rows(db,
    `SELECT k.* FROM kespi_scores k
     JOIN entities e ON e.id = k.entity_id
     WHERE e.invalid_at IS NULL`);
}

function _openKeys(db) {
  const set = new Set();
  for (const r of _rows(db,
    `SELECT entity_id, dim FROM opt_tickets WHERE status IN ('open','dispatched','proposed')`)) {
    set.add(String(r.entity_id) + '\u0000' + String(r.dim));
  }
  return set;
}

/**
 * 扫描 KESPI 误差，开工单。幂等：同一 (entity_id, dim) 在途时不重复开。
 * @returns {{created:number, skipped:number, tickets:Array}}
 */
function scanTickets(store, opts = {}) {
  _requireStore(store, 'self-optimize.scanTickets');
  const db = store._getDb();
  const persist = opts.persist !== false;
  const max = Number.isInteger(opts.maxTickets) && opts.maxTickets > 0 ? opts.maxTickets : MAX_TICKETS;
  const scores = _latestScores(db);
  const open = _openKeys(db);
  const cands = [];
  // SPEC-1.12 修订 A：KD 催化率的 rebond 单只给「入向强边 ≥2」的实体
  const inStrong = new Map();
  for (const r of _rows(db, "SELECT target_id, COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND strength >= 7 AND relation NOT IN ('sprout-candidate','pollinate-candidate') GROUP BY target_id")) {
    inStrong.set(String(r.target_id), Number(r.n || 0));
  }
  // SPEC-6.17：kd 单的作用域要看 rebond 真能修谁——raw 母件、有活跃镜像、缺键
  const wikiActive = new Set(_rows(db, "SELECT id FROM entities WHERE invalid_at IS NULL AND id LIKE 'wiki-%'").map(r => String(r.id)));
  // SPEC-6.17：未来档实体不得落过去边（库层硬闸会 ABORT），别为它们开 rebond 单
  const futureIds = new Set(_rows(db, "SELECT id FROM entities WHERE invalid_at IS NULL AND strand = 'future'").map(r => String(r.id)));
  // 已有任何有效边的对，rebond 也插不进去（links 主键只看 source+target）
  const anyPair = new Set(_rows(db, "SELECT source_id, target_id FROM links WHERE invalid_at IS NULL")
    .map(r => String(r.source_id) + '\u0000' + String(r.target_id)));

  for (const s of scores) {
    const entityId = String(s.entity_id);
    for (const dim of DIM_NAMES) {
      const rule = DIM_RULES[dim];
      const v = s[dim] == null ? null : Number(s[dim]);
      if (v == null || !Number.isFinite(v) || v >= rule.below) continue;
      // SPEC-6.17：kd 分两路——能自愈的（raw 缺键）派真动作，不能自愈的（被引用却不催化）只出提案
      if (dim === 'kd') {
        if (open.has(entityId + '\u0000' + dim)) continue;
        const twinId = 'wiki-' + entityId.replace(/^raw-/, '');
        if (entityId.startsWith('raw-') && !futureIds.has(entityId) && wikiActive.has(twinId) && !anyPair.has(entityId + '\u0000' + twinId)) {
          cands.push({ entity_id: entityId, dim, kind: rule.kind, action: 'rebond', score: Math.round(v * 10000) / 10000, zone: v < ZONES.red ? 'red' : 'yellow' });
          continue;
        }
        if ((inStrong.get(entityId) || 0) < rule.requireInStrong) continue;
        cands.push({ entity_id: entityId, dim, kind: 'kd-cited', action: 'memo-card', score: Math.round(v * 10000) / 10000, zone: v < ZONES.red ? 'red' : 'yellow' });
        continue;
      }
      if (rule.requireInStrong != null && (inStrong.get(entityId) || 0) < rule.requireInStrong) continue;
      if (open.has(entityId + '\u0000' + dim)) continue;
      cands.push({
        entity_id: entityId, dim, kind: rule.kind, action: rule.action,
        score: Math.round(v * 10000) / 10000,
        zone: v < ZONES.red ? 'red' : 'yellow'
      });
    }
    const ov = s.overall == null ? null : Number(s.overall);
    if (ov != null && Number.isFinite(ov) && ov < ZONES.red && !open.has(entityId + '\u0000overall')) {
      cands.push({
        entity_id: entityId, dim: 'overall', kind: 'overall-red', action: 'memo-card',
        score: Math.round(ov * 10000) / 10000, zone: 'red'
      });
    }
  }

  cands.sort((a, b) => a.score - b.score || a.entity_id.localeCompare(b.entity_id) || a.dim.localeCompare(b.dim));
  const picked = cands.slice(0, max);
  const tickets = [];

  if (persist && picked.length) {
    const ins = db.prepare(
      `INSERT INTO opt_tickets (id, entity_id, dim, kind, action, score, zone, status, attempts, evidence_json, cycle_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    for (const c of picked) {
      const id = _id('ticket');
      const demand = require('./ticket-demand.js').demandFor(c.kind);
      const evidence = JSON.stringify({ score: c.score, zone: c.zone, source: 'kespi', ...(demand ? { demand } : {}) });
      ins.run([id, c.entity_id, c.dim, c.kind, c.action, c.score, c.zone, evidence, opts.cycleId || null]);
      tickets.push({ id, ...c, status: 'open' });
    }
    ins.free();
    store._persist();
  } else {
    for (const c of picked) tickets.push({ id: null, ...c, status: 'open' });
  }

  return { created: persist ? tickets.length : 0, skipped: cands.length - picked.length, tickets };
}

function _mark(db, id, status, evidence, cycleId, opts = {}) {
  const cur = _scalar(db, 'SELECT evidence_json FROM opt_tickets WHERE id = ?', [id]);
  let merged = {};
  try { merged = JSON.parse((cur && cur.evidence_json) || '{}'); } catch (_) { merged = {}; }
  Object.assign(merged, evidence || {});
  // SPEC-6.15 律一：追单不是失败——bump:false 时 attempts 不动
  const bump = opts.bump === false ? 0 : 1;
  const stmt = db.prepare(
    `UPDATE opt_tickets SET status = ?, attempts = attempts + ${bump}, evidence_json = ?,
       cycle_id = COALESCE(?, cycle_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  stmt.run([status, JSON.stringify(merged), cycleId || null, id]);
  stmt.free();
}

function _acted(action, r) {
  if (!r) return false;
  if (action === 'reconcile') return Number(r.reconciled || 0) > 0;
  if (action === 'rebond') return Number(r.bonded || 0) > 0;
  if (action === 'demote') return Array.isArray(r.demoted) && r.demoted.length > 0;
  return false;
}

/**
 * 把在途工单路由到场域动作。reconcile 先于 rebond（先补双链，再补键）。
 * @returns {{dispatched:Array, proposed:Array, rejected:Array}}
 */
async function dispatchTickets(store, opts = {}) {
  _requireStore(store, 'self-optimize.dispatchTickets');
  const db = store._getDb();
  const tickets = _rows(db, `SELECT * FROM opt_tickets WHERE status = 'open' ORDER BY created_at, id`);
  tickets.sort((a, b) =>
    (ACTION_ORDER[a.action] == null ? 9 : ACTION_ORDER[a.action]) -
    (ACTION_ORDER[b.action] == null ? 9 : ACTION_ORDER[b.action]) ||
    Number(a.score) - Number(b.score));

  const out = { dispatched: [], proposed: [], rejected: [] };
  const field = require('./meko-field.js');

  for (const t of tickets) {
    const cycleId = opts.cycleId || t.cycle_id || null;
    if (t.action === 'memo-card') {
      _mark(db, t.id, 'proposed', { reason: 'proposal-only', source: 'self-optimize' }, cycleId);
      out.proposed.push({ id: t.id, entity_id: t.entity_id, dim: t.dim, kind: t.kind });
      continue;
    }
    if (!FIELD_ACTIONS.includes(t.action)) {
      _mark(db, t.id, 'rejected', { reason: 'unknown-action' }, cycleId);
      out.rejected.push({ id: t.id, reason: 'unknown-action' });
      continue;
    }
    // SPEC-6.17 护栏：rebond 只作用于 raw 母件。派到别处必然 scanned=0，
    // 与其派了再报 no-effect，不如当场判越界（原因可查、不浪费一轮）。
    if (t.action === 'rebond' && !String(t.entity_id).startsWith('raw-')) {
      _mark(db, t.id, 'rejected', { reason: 'out-of-scope', action: 'rebond', entity_id: t.entity_id }, cycleId);
      out.rejected.push({ id: t.id, entity_id: t.entity_id, reason: 'out-of-scope' });
      continue;
    }
    try {
      const r = t.action === 'reconcile'
        ? await field.reconcile(store, { entityId: t.entity_id, cycleId })
        : t.action === 'rebond'
          ? await field.rebond(store, { entityId: t.entity_id, cycleId })
          : await field.demote(store, { entityId: t.entity_id, cycleId });
      if (_acted(t.action, r)) {
        _mark(db, t.id, 'dispatched', { reason: 'acted', action: t.action }, cycleId);
        out.dispatched.push({ id: t.id, entity_id: t.entity_id, dim: t.dim, action: t.action, stats: r });
      } else {
        _mark(db, t.id, 'rejected', { reason: 'no-effect', action: t.action, stats: r }, cycleId);
        out.rejected.push({ id: t.id, entity_id: t.entity_id, action: t.action, reason: 'no-effect' });
      }
    } catch (e) {
      _mark(db, t.id, 'rejected', { reason: 'error', message: e.message }, cycleId);
      out.rejected.push({ id: t.id, reason: 'error', message: e.message });
    }
  }
  if (tickets.length) store._persist();
  return out;
}

/**
 * 复核已下药工单：该维读数上升即 verified；连续两次无改善即 rejected。
 * 需调用方先跑 KESPI，或由 selfOptimizeStep 代跑。
 */
function verifyTickets(store, opts = {}) {
  _requireStore(store, 'self-optimize.verifyTickets');
  const db = store._getDb();
  const tickets = _rows(db,
    `SELECT * FROM opt_tickets WHERE status IN ('dispatched', 'proposed') ORDER BY created_at, id`);
  const out = { verified: [], stillOpen: [], rejected: [], escalated: [] };

  for (const t of tickets) {
    const cycleId = opts.cycleId || t.cycle_id || null;
    let ev = {};
    try { ev = JSON.parse(t.evidence_json || '{}'); } catch (_) { ev = {}; }

    // 能力叙事工单（6.9）：消费证据 = distill_points 出现该实体；提案单不毕业。
    if (t.dim === 'cap') {
      const consumed = _scalar(db, 'SELECT base_id FROM distill_points WHERE base_id = ?', [t.entity_id]);
      if (consumed && consumed.base_id) {
        _mark(db, t.id, 'verified', { reason: 'consumed', delta: 1 }, cycleId);
        out.verified.push({ id: t.id, entity_id: t.entity_id, dim: 'cap', before: null, after: null, delta: 1 });
      } else if (Number(t.attempts) >= VERIFY_ATTEMPTS) {
        _mark(db, t.id, 'rejected', { reason: 'no-consumption' }, cycleId);
        out.rejected.push({ id: t.id, reason: 'no-consumption' });
      } else {
        _mark(db, t.id, 'proposed', { reason: 'waiting-consumption' }, cycleId);
        out.stillOpen.push({ id: t.id, reason: 'waiting-consumption' });
      }
      continue;
    }

    // KESPI 提案单（memo-card）：只出提案，不参与读数复核；但要有期限——
    // 没人接的提案不能永久占名额（SPEC-6.18 §1.4）。心跳复用 6.15 律三。
    if (t.status === 'proposed') {
      const dm = (ev.demand && typeof ev.demand === 'object') ? ev.demand : {};
      const ttl = Number.isFinite(Number(dm.ttlRounds)) ? Number(dm.ttlRounds) : require('./ticket-demand.js').DEFAULT_TTL;
      const beat = heartbeatOf(ev, { at: opts.at });
      if (Number(beat.followup.beats) > ttl) {
        _mark(db, t.id, 'rejected', { ...beat, reason: 'proposal-expired' }, cycleId, { bump: false });
        out.rejected.push({ id: t.id, entity_id: t.entity_id, dim: t.dim, reason: 'proposal-expired' });
        continue;
      }
      _mark(db, t.id, 'proposed', { ...beat, reason: 'proposal-only' }, cycleId, { bump: false });
      out.stillOpen.push({ id: t.id, reason: 'proposal-only', beats: beat.followup.beats, ttl });
      continue;
    }

    if (!DIM_RULES[t.dim]) {
      _mark(db, t.id, 'rejected', { reason: 'unknown-dim' }, cycleId);
      out.rejected.push({ id: t.id, reason: 'unknown-dim' });
      continue;
    }
    const cur = _scalar(db, `SELECT ${t.dim} AS v FROM kespi_scores WHERE entity_id = ?`, [t.entity_id]);
    const after = cur && cur.v != null ? Number(cur.v) : null;

    // SPEC-6.14 修订 A：回单在时先过内容闸（膜 → 粒度 → 发布门），不过即拒，不看读数。
    // 理由：「无自评不发布」是硬红线，读数上升也不能抵消。
    if (ev && ev.result && typeof ev.result === 'object') {
      const { admit } = require('./ticket-gate.js');
      const verdict = admit(ev.result, { membrane: opts.membrane || 'semi' });
      if (!verdict.admitted) {
        const reason = 'gate:' + verdict.stage + ':' + (verdict.reasons || []).join('+');
        _mark(db, t.id, 'rejected', { reason, gate: verdict }, cycleId);
        out.rejected.push({ id: t.id, entity_id: t.entity_id, dim: t.dim, reason,
          stage: verdict.stage, reasons: verdict.reasons || [] });
        continue;
      }
    }

    const before = ev.score == null ? Number(t.score) : Number(ev.score);
    if (after == null) {
      _mark(db, t.id, 'dispatched', { reason: 'no-score' }, cycleId);
      out.stillOpen.push({ id: t.id, reason: 'no-score' });
      continue;
    }
    if (after > before + 1e-9) {
      _mark(db, t.id, 'verified', { before, after, delta: Math.round((after - before) * 10000) / 10000 }, cycleId);
      out.verified.push({ id: t.id, entity_id: t.entity_id, dim: t.dim, before, after, delta: after - before });
    } else if (!(ev && ev.result)) {
      // 律一 追单不补位：还没回单就别判失败——只追单、只打心跳，attempts 不动
      _mark(db, t.id, 'dispatched',
        { ...heartbeatOf(ev, { at: opts.at }), reason: CHASE_REASON, before, after }, cycleId, { bump: false });
      out.stillOpen.push({ id: t.id, entity_id: t.entity_id, dim: t.dim, reason: CHASE_REASON, before, after });
    } else if (Number(t.attempts) >= VERIFY_ATTEMPTS) {
      // 律二 失败≥2 改派：回单来了但不达标且已试过两次 → 交深工
      _mark(db, t.id, 'rejected',
        { ...heartbeatOf(ev, { at: opts.at }), reason: ESCALATE_REASON, before, after }, cycleId);
      out.rejected.push({ id: t.id, reason: ESCALATE_REASON, before, after });
      out.escalated.push({ id: t.id, entity_id: t.entity_id, dim: t.dim, reason: ESCALATE_REASON, before, after });
    } else {
      _mark(db, t.id, 'dispatched',
        { ...heartbeatOf(ev, { at: opts.at }), reason: 'waiting-next-cycle', before, after }, cycleId);
      out.stillOpen.push({ id: t.id, reason: 'waiting-next-cycle', before, after });
    }
  }
  if (tickets.length) store._persist();
  return out;
}

/**
 * 已验证工单 → gene：先过 omni-gate 三闸（I8），再落 genes；工单标 graduated 防重复。
 */
async function graduateToGene(store, opts = {}) {
  _requireStore(store, 'self-optimize.graduateToGene');
  const db = store._getDb();
  const tickets = _rows(db, `SELECT * FROM opt_tickets WHERE status = 'verified' ORDER BY created_at, id`);
  const out = { graduated: [], quarantined: [], skipped: [] };

  for (const t of tickets) {
    // 能力提案单（dim='cap'）只作 memo 待办，不毕业成 gene（SPEC-6.9 §2.4）。
    if (t.dim === 'cap') {
      out.skipped.push({ id: t.id, entity_id: t.entity_id, reason: 'proposal-only' });
      continue;
    }
    const name = `opt:${t.kind}:${t.action}`;
    let ev = {};
    try { ev = JSON.parse(t.evidence_json || '{}'); } catch (_) { ev = {}; }
    const delta = Math.max(0, Math.min(1, Number(ev.delta || 0)));
    const gate = await require('./omni-gate.js').runGates(store, {
      subject: name,
      kind: 'gene',
      evidence: ['kespi-delta', 'field-action'],
      candidateScore: delta,
      baseline: { score: 0 },
      cycleId: opts.cycleId || t.cycle_id || null
    });
    const status = gate.passed ? 'active' : 'quarantined';
    const existing = _scalar(db, 'SELECT * FROM genes WHERE name = ?', [name]);
    let geneId;
    if (existing && existing.id) {
      geneId = existing.id;
      const score = Math.round(((Number(existing.score || 0) + delta) / 2) * 1e6) / 1e6;
      const upd = db.prepare(
        `UPDATE genes SET score = ?, uses = uses + 1, wins = wins + 1, status = ?,
           lineage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      );
      upd.run([score, status, JSON.stringify({ before: ev.before, after: ev.after, delta, gate: gate.recordId }), geneId]);
      upd.free();
    } else {
      geneId = _id('gene');
      const ins = db.prepare(
        `INSERT INTO genes (id, name, score, uses, wins, failures, status, lineage, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );
      ins.run([geneId, name, delta, status,
        JSON.stringify({ kind: t.kind, action: t.action, before: ev.before, after: ev.after, delta, gate: gate.recordId })]);
      ins.free();
    }
    _mark(db, t.id, 'graduated', { geneId, geneName: name, gate: gate.recordId }, opts.cycleId || t.cycle_id);
    if (gate.passed) out.graduated.push({ id: t.id, geneId, name, delta });
    else out.quarantined.push({ id: t.id, geneId, name, failed: gate.failed });
  }
  if (tickets.length) store._persist();
  return out;
}

/**
 * 一轮自优化：开单 → 下药 → 重算 KESPI → 复核 → gene。
 * 默认 rescore=true；在代谢链上跑时 kespi 已在前一步，可传 rescore:false。
 */
async function selfOptimizeStep(store, opts = {}) {
  _requireStore(store, 'self-optimize.selfOptimizeStep');
  const cycleId = opts.cycleId || null;
  const scan = scanTickets(store, { ...opts, cycleId, persist: true });
  const dispatch = await dispatchTickets(store, { ...opts, cycleId });
  if (opts.rescore !== false) await require('./kespi.js').kespiStep(store, opts);
  const verify = verifyTickets(store, { ...opts, cycleId });
  const genes = await graduateToGene(store, { ...opts, cycleId });
  return {
    ok: true,
    actions: {
      scanned: scan.created,
      dispatched: dispatch.dispatched.length,
      proposed: dispatch.proposed.length,
      rejected: dispatch.rejected.length,
      verified: verify.verified.length,
      genes: genes.graduated.length
    },
    scan, dispatch, verify, genes
  };
}

module.exports = {
  ZONES, MAX_TICKETS, VERIFY_ATTEMPTS, DIM_RULES, DIM_NAMES, ACTION_ORDER, FIELD_ACTIONS, TRAINER_STAGES,
  scanTickets, dispatchTickets, verifyTickets, graduateToGene, selfOptimizeStep
};
