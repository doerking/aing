'use strict';
// aing-v2 api-gate.js —— M3 任务 3.6 实现（SPEC-3.6 身份闸 + 标签闸）
// 写面只认 hana；客户端自报 status/confidence/tags 一律忽略（C10i / G2）。
// 自报标签只作「Agent 提议（未核验）」入正文，唔入 tags 列。
// 铁律：唔碰 last_access；无物理 DELETE。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

// 写面白名单：默认空（deny-by-default，未配就不认任何 actor、拒所有写）。
// 用 AING_ALLOWED_ACTORS（逗号分隔）显式配置，例：AING_ALLOWED_ACTORS=hana,hakimi
// 开源不烧死任何个人代号——唔配就拒写，配了先放行。
function _readAllowedActors() {
  const raw = process.env.AING_ALLOWED_ACTORS;
  if (raw == null || String(raw).trim() === '') return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}
const ALLOWED_ACTORS = _readAllowedActors();
const PROPOSAL_SEGMENT = 'Agent 提议（未核验）';

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function assertActor(actor) {
  if (!ALLOWED_ACTORS.length) throw new Error('identity-rejected: 写面未配 AING_ALLOWED_ACTORS，默认拒所有写（deny-by-default）');
  if (!ALLOWED_ACTORS.includes(actor)) throw new Error('identity-rejected: 写面只认 ' + ALLOWED_ACTORS.join('/'));
  return true;
}

async function gateWrite(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('api-gate 需要 store 注入（SPEC-3.6 契约）');
  assertActor(opts.actor);

  const p = opts.payload || {};
  const id = String(p.id || '').trim();
  if (!id) throw new Error('id-required');
  const db = store._getDb();

  const existing = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [id]);
  if (existing) return { accepted: false, exists: true, id };

  const clientTags = Array.isArray(p.tags) ? p.tags.map(String)
    : (typeof p.tags === 'string' && p.tags.trim() ? [p.tags.trim()] : []);

  let content = String(p.content == null ? '' : p.content);
  if (clientTags.length) {
    content += `\n\n## ${PROPOSAL_SEGMENT}\n` + clientTags.join('\n');
  }

  const stmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 'pending-distillation', NULL, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  stmt.run([id, p.name == null ? id : String(p.name), p.type == null ? 'Concept' : String(p.type), content]);
  stmt.free();
  store._persist();
  return {
    accepted: true,
    id,
    // 闸的回执：明确告诉写入方哪些字段被忽略
    ignored: ['status', 'confidence', 'tags'],
    proposalSegment: clientTags.length ? PROPOSAL_SEGMENT : null
  };
}

module.exports = { ALLOWED_ACTORS, PROPOSAL_SEGMENT, assertActor, gateWrite };
