'use strict';
// aing-v2 round-ledger.js —— M1 任务 1.16 实现（SPEC-1.16 轮账与逐条存活）
// 每轮给在场实体留一行快照；本轮新边打 cycle_id；账本按轮次有界保留。
// 铁律：只写 entity_rounds / links.cycle_id；不反写实体、不碰 last_access、不物理删实体。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const DAY = 86400000;
const ROUND_KEEP = 30;          // 实测 320 实体约 69KB/轮：30 轮≈2.1MB，60 轮≈4.2MB 会顶到手机端 10MB 上限
const ACCESS_HOT_DAYS = 7;      // 与 KESPI KA「热」阈值同口径

function parseTs(v) {
  if (v == null || v === '') return null;
  const raw = String(v).trim();
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  const t = Date.parse(zoned);
  return Number.isFinite(t) ? t : null;
}

/** 统一成 SQLite CURRENT_TIMESTAMP 口径：UTC、YYYY-MM-DD HH:MM:SS */
function sqlTs(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  s.bind(binds);
  let v = null;
  if (s.step()) v = s.getAsObject();
  s.free();
  return v;
}

/**
 * 记一本轮的账：实体快照 + 新边归属 + 上限裁剪。
 * @returns {{entities:number, edges:number, pruned:number, cycleId:string|null}}
 */
function recordRound(store, cycleId, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('round-ledger 需要 store 注入（SPEC-1.15 契约）');
  const id = cycleId == null ? '' : String(cycleId);
  if (!id) return { entities: 0, edges: 0, pruned: 0, cycleId: null };
  const db = store._getDb();
  const keep = Number.isInteger(opts.keepRounds) && opts.keepRounds > 0 ? opts.keepRounds : ROUND_KEEP;
  const now = Number.isInteger(opts.now) ? opts.now : Date.now();

  // 度数：有效边双向计数（与 KESPI KD 同口径）
  const deg = new Map();
  const ls = db.prepare('SELECT source_id, target_id FROM links WHERE invalid_at IS NULL');
  while (ls.step()) {
    const l = ls.getAsObject();
    deg.set(String(l.source_id), (deg.get(String(l.source_id)) || 0) + 1);
    deg.set(String(l.target_id), (deg.get(String(l.target_id)) || 0) + 1);
  }
  ls.free();

  // 访问证据：只剩最近一次命中，够判「近 7 天热不热」
  const hit = new Map();
  const hs = db.prepare('SELECT entity_id, MAX(hit_at) AS at FROM access_hits GROUP BY entity_id');
  while (hs.step()) {
    const r = hs.getAsObject();
    if (r.at != null) hit.set(String(r.entity_id), String(r.at));
  }
  hs.free();

  const ins = db.prepare(
    `INSERT OR IGNORE INTO entity_rounds
       (entity_id, cycle_id, alive, accessed, degree, content_len, strand, recorded_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  let entities = 0;
  const es = db.prepare('SELECT id, content, last_access, strand FROM entities WHERE invalid_at IS NULL');
  while (es.step()) {
    const e = es.getAsObject();
    const eid = String(e.id);
    const laDays = (() => { const t = parseTs(e.last_access); return t == null ? null : Math.floor((now - t) / DAY); })();
    const hitDays = (() => { const t = parseTs(hit.get(eid)); return t == null ? null : Math.floor((now - t) / DAY); })();
    const near = [laDays, hitDays].filter((v) => v != null).sort((a, b) => a - b)[0];
    const accessed = near != null && near <= ACCESS_HOT_DAYS ? 1 : 0;
    ins.run([eid, id, accessed, Number(deg.get(eid) || 0), String(e.content == null ? '' : e.content).length,
      e.strand == null ? null : String(e.strand)]);
    entities++;
  }
  es.free();
  ins.free();

  // 边归属：上一轮之后创建的未归属边归本轮；没有上一轮则不动（历史边保持记账前）
  let edges = 0;
  const prev = _scalar(db,
    'SELECT MAX(executed_at) AS at FROM meko_cycles WHERE id <> ? AND executed_at IS NOT NULL', [id]);
  if (prev && prev.at != null) {
    const t = parseTs(prev.at);
    if (t != null) {
      const upd = db.prepare('UPDATE links SET cycle_id = ? WHERE cycle_id IS NULL AND created_at >= ?');
      upd.run([id, sqlTs(t)]);
      upd.free();
      const c = _scalar(db, 'SELECT COUNT(*) AS n FROM links WHERE cycle_id = ?', [id]);
      edges = Number(c && c.n ? c.n : 0);
    }
  }

  // 上限：按轮次保留最近 keep 轮（用 rowid 排序，避免同一秒内多轮 recorded_at 相同）
  let pruned = 0;
  const old = [];
  const os = db.prepare(
    'SELECT cycle_id FROM entity_rounds GROUP BY cycle_id ORDER BY MAX(rowid) DESC LIMIT -1 OFFSET ?');
  os.bind([keep]);
  while (os.step()) old.push(String(os.getAsObject().cycle_id));
  os.free();
  if (old.length) {
    const del = db.prepare('DELETE FROM entity_rounds WHERE cycle_id = ?');
    for (const cid of old) {
      del.run([cid]);
      pruned++;
    }
    del.free();
  }

  if (typeof store._persist === 'function') store._persist();
  return { entities, edges, pruned, cycleId: id };
}

module.exports = { recordRound, ROUND_KEEP, ACCESS_HOT_DAYS };
