'use strict';
// aing-v2 pollinate.js —— M1 任务 1.10 实现（SPEC-1.10 授粉）
// spec-first：本文件是 SPEC-1.10 的代码结果，契约在 spec/SPEC-1.10-pollinate授粉.md。
// 双铰链定位：跨域授粉——不同类型实体之间按跨域证据产候选边（场域带 4–6 段）。
// 与 sprout 分工：同域发芽 / 跨域授粉；跨域本身算第一类证据，防万物互联式滥发。
// 铁律：同类型不授粉、空类型不参与、已有边跳过、幂等、不碰 last_access/invalid_at、无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const { keywords, parseTags } = require('./sprout.js');

const REL = 'pollinate-candidate';
const MAX_ENTITIES = 200;

async function pollinateStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('pollinate 需要 store 注入（SPEC-1.15 契约）');
  const floor = Number.isInteger(opts.floor) ? opts.floor : 2;
  const cap = Number.isInteger(opts.cap) ? opts.cap : 4;
  const stats = { scanned: 0, pairs: 0, seeded: 0, skipped: 0 };
  const db = store._getDb();

  const ents = [];
  const es = db.prepare(
    "SELECT id, type, content, tags FROM entities WHERE invalid_at IS NULL AND (strand IS NULL OR strand != 'future') AND type IS NOT NULL AND type != '' ORDER BY updated_at DESC, id LIMIT " + MAX_ENTITIES
  );
  while (es.step()) ents.push(es.getAsObject());
  es.free();
  stats.scanned = ents.length;

  const hasEdge = new Set();
  // SPEC-1.10 修订 A：边表 PK 与 invalid_at 无关——退役边仍占位，须按「已存在」跳过，
  // 否则重跑会撞 UNIQUE constraint（2026-11-18 真库重跑事故）。
  const ls = db.prepare('SELECT source_id, target_id FROM links');
  while (ls.step()) {
    const l = ls.getAsObject();
    hasEdge.add(l.source_id + '\u0000' + l.target_id);
    hasEdge.add(l.target_id + '\u0000' + l.source_id);
  }
  ls.free();

  const meta = new Map();
  for (const e of ents) meta.set(e.id, { type: e.type, tags: new Set(parseTags(e.tags)), kw: keywords(e.content) });

  const candidates = [];
  for (let i = 0; i < ents.length; i++) {
    for (let j = i + 1; j < ents.length; j++) {
      const a = ents[i].id, b = ents[j].id;
      const ma = meta.get(a), mb = meta.get(b);
      if (ma.type === mb.type) continue;              // 同域归 sprout
      if (hasEdge.has(a + '\u0000' + b)) continue;
      stats.pairs++;
      const evidence = [{ kind: 'cross', detail: [ma.type, mb.type] }];
      const sharedTags = [...ma.tags].filter(t => mb.tags.has(t));
      if (sharedTags.length) evidence.push({ kind: 'tag', detail: sharedTags.slice(0, 5) });
      const sharedKw = [...ma.kw].filter(k => mb.kw.has(k));
      if (sharedKw.length >= 2) evidence.push({ kind: 'kw', detail: sharedKw.slice(0, 5) });
      if (evidence.length >= 2) candidates.push({ a, b, kinds: evidence.length, evidence });
    }
  }

  candidates.sort((x, y) => y.kinds - x.kinds || (x.a + x.b).localeCompare(y.a + y.b));
  const take = candidates.slice(0, cap);
  const insert = db.prepare(
    `INSERT INTO links (source_id, target_id, relation, confidence, strength, evidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  for (const c of take) {
    insert.run([c.a, c.b, REL, 0.5, c.kinds >= 3 ? 6 : 4, JSON.stringify(c.evidence)]);
    stats.seeded++;
  }
  insert.free();
  if (stats.seeded) store._persist();
  stats.skipped = candidates.length - stats.seeded;
  return stats;
}

module.exports = { pollinateStep };
