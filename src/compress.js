'use strict';
// aing-v2 compress.js —— M1 任务 1.11 实现（SPEC-1.11 换锚）
// spec-first：本文件是 SPEC-1.11 的代码结果，契约在 spec/SPEC-1.11-compress换锚.md。
// 换锚：活跃度以 last_access 为准（唯一写者是检索命中）；长期未访问 + 内容够长 → 压成籽。
// 可逆：重新访问即 active=0（解压），籽行永不物理删。
// 铁律：不碰 entities 任何列；无物理删；幂等。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const crypto = require('crypto');
const { DEFAULTS } = require('./config-runtime.js');

async function compressStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('compress 需要 store 注入（SPEC-1.15 契约）');
  const inactiveDays = Number.isInteger(opts.inactiveDays) ? opts.inactiveDays : DEFAULTS.compress.inactiveDays;
  const minLength = Number.isInteger(opts.minLength) ? opts.minLength : DEFAULTS.compress.minLength;
  const stats = { scanned: 0, seeded: 0, revived: 0, skipped: 0 };
  const db = store._getDb();

  const cutoffRow = (() => {
    const s = db.prepare(`SELECT datetime('now', ?) AS cutoff`);
    s.bind(['-' + inactiveDays + ' days']);
    s.step();
    const v = s.getAsObject().cutoff;
    s.free();
    return v;
  })();

  const ents = [];
  const es = db.prepare(
    `SELECT id, content, last_access FROM entities
     WHERE invalid_at IS NULL AND content IS NOT NULL AND last_access IS NOT NULL`
  );
  while (es.step()) ents.push(es.getAsObject());
  es.free();

  const seeds = new Map();
  const ss = db.prepare('SELECT entity_id, active FROM compressed_seeds');
  while (ss.step()) { const r = ss.getAsObject(); seeds.set(r.entity_id, Number(r.active)); }
  ss.free();

  const upsertSeed = db.prepare(
    `INSERT OR REPLACE INTO compressed_seeds (entity_id, content_hash, last_access_at, active, compressed_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`
  );
  const deactivate = db.prepare('UPDATE compressed_seeds SET active = 0 WHERE entity_id = ?');

  let dirty = false;
  for (const e of ents) {
    stats.scanned++;
    const longEnough = String(e.content).length >= minLength;
    const stale = String(e.last_access) < cutoffRow;
    const eligible = longEnough && stale;
    const state = seeds.has(e.id) ? seeds.get(e.id) : null;

    if (eligible && state !== 1) {
      upsertSeed.run([e.id, crypto.createHash('sha1').update(String(e.content)).digest('hex'), String(e.last_access)]);
      stats.seeded++;
      dirty = true;
    } else if (!eligible && state === 1) {
      deactivate.run([e.id]);
      stats.revived++;
      dirty = true;
    } else {
      stats.skipped++;
    }
  }

  upsertSeed.free();
  deactivate.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { compressStep };
