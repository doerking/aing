'use strict';
// aing-v2 session-ingest.js —— M3 任务 3.13 实现（SPEC-3.13 三源入库闭环）
// 三源：回复 / 搜索展示 / 事由分析。缺回复拒入（G1）；同会话幂等。
// 回喂：预案命中/落空 → Feedback 实体 + 证据边（G5），与场域共用一套证据。
// 铁律：唔碰 last_access；无物理 DELETE。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const SOURCES = ['reply', 'search', 'rationale'];

const TAG_HEAD = 'conv:9';
const SOURCE_TAGS = { reply: 'src:reply', search: 'src:search', rationale: 'src:rationale' };

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

async function ingestSession(store, payload = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('session-ingest 需要 store 注入（SPEC-3.13 契约）');
  const db = store._getDb();
  const sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) throw new Error('session-required');
  const reply = String(payload.reply == null ? '' : payload.reply).trim();
  if (!reply) throw new Error('reply-required: 回复必入库（G1）');

  const id = 'conv-' + sessionId;
  const existing = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [id]);
  if (existing) return { skipped: true, id };

  const searchShown = Array.isArray(payload.searchShown) ? payload.searchShown.map(String) : [];
  const rationale = String(payload.rationale == null ? '' : payload.rationale);
  const content = JSON.stringify({
    topic: payload.topic || null,
    at: payload.at || new Date().toISOString(),
    reply,
    searchShown,
    rationale,
    outcome: payload.outcome == null ? 'open' : payload.outcome
  });
  const tags = JSON.stringify([TAG_HEAD, SOURCE_TAGS.reply, SOURCE_TAGS.search, SOURCE_TAGS.rationale]);

  const stmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, created_at, updated_at)
     VALUES (?, ?, 'Conversation', ?, ?, 'active', 0.6, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  stmt.run([id, (payload.topic || ('会话 ' + sessionId)).slice(0, 60), content, tags]);
  stmt.free();
  store._persist();
  return { ingested: true, id, sources: SOURCES.slice() };
}

async function recordPlanFeedback(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('session-ingest 需要 store 注入（SPEC-3.13 契约）');
  const planId = String(opts.planId || '').trim();
  if (!planId) throw new Error('plan-required');
  const db = store._getDb();
  const id = 'fb-' + planId;
  const existing = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [id]);
  if (existing) return { skipped: true, id, edges: 0 };

  const hit = !!opts.hit;
  const tags = JSON.stringify([hit ? 'plan-hit' : 'plan-miss', 'feedback:9']);
  const content = JSON.stringify({ planId, hit, at: new Date().toISOString(), basisIds: opts.basisIds || [] });
  const ins = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, created_at, updated_at)
     VALUES (?, ?, 'Feedback', ?, ?, 'active', 0.7, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  ins.run([id, (hit ? '命中·' : '落空·') + planId, content, tags]);
  ins.free();

  let edges = 0;
  const edge = db.prepare(
    `INSERT INTO links (source_id, target_id, relation, confidence, strength, created_at)
     VALUES (?, ?, 'feedback-evidence', 0.7, 6, CURRENT_TIMESTAMP)`
  );
  for (const b of (opts.basisIds || [])) {
    const srcId = String(b).startsWith('conv-') ? String(b) : 'conv-' + b;
    const src = _scalar(db, 'SELECT id FROM entities WHERE id = ?', [srcId]);
    if (!src || !src.id) continue;
    try { edge.run([srcId, id]); edges++; } catch (_) { /* 已存在不重复插 */ }
  }
  edge.free();
  store._persist();
  return { recorded: true, id, hit, edges };
}

module.exports = { SOURCES, ingestSession, recordPlanFeedback };
