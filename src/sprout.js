'use strict';
// aing-v2 sprout.js —— M1 任务 1.9 实现（SPEC-1.9 发芽）
// spec-first：本文件是 SPEC-1.9 的代码结果，契约在 spec/SPEC-1.9-sprout发芽.md。
// 双铰链定位：在场域带 4–6 段产候选边，每粒带证据；每轮 2–4 粒（sproutFloor），供守恒闸计量。
// 铁律：≥2 类独立证据才成种；已有边不发种；幂等；不碰 last_access/invalid_at；无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const REL = 'sprout-candidate';
const MAX_ENTITIES = 200;

function stripStrength(tag) { return String(tag).replace(/:\d+$/, ''); }

function parseTags(tags) {
  try { const a = JSON.parse(tags || '[]'); return Array.isArray(a) ? a.map(stripStrength) : []; }
  catch (_) { return []; }
}

/** 关键词：CJK 双字 + 拉丁词（长度 ≥2） */
function keywords(text) {
  const s = String(text == null ? '' : text);
  const out = new Set();
  const cjk = [];
  let latin = '';
  for (const ch of s) {
    if (/[\u4e00-\u9fff]/.test(ch)) { cjk.push(ch); if (latin) { if (latin.length >= 2) out.add(latin); latin = ''; } }
    else if (/[a-z0-9]/i.test(ch)) latin += ch;
    else if (latin) { if (latin.length >= 2) out.add(latin); latin = ''; }
  }
  if (latin.length >= 2) out.add(latin);
  for (let i = 0; i + 1 < cjk.length; i++) out.add(cjk[i] + cjk[i + 1]);
  return out;
}

async function sproutStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('sprout 需要 store 注入（SPEC-1.15 契约）');
  const floor = Number.isInteger(opts.floor) ? opts.floor : 2;
  const cap = Number.isInteger(opts.cap) ? opts.cap : 4;
  const stats = { scanned: 0, pairs: 0, seeded: 0, skipped: 0 };
  const db = store._getDb();

  const ents = [];
  const es = db.prepare('SELECT id, content, tags FROM entities WHERE invalid_at IS NULL ORDER BY updated_at DESC, id LIMIT ' + MAX_ENTITIES);
  while (es.step()) ents.push(es.getAsObject());
  es.free();
  stats.scanned = ents.length;

  const links = [];
  const ls = db.prepare('SELECT source_id, target_id FROM links WHERE invalid_at IS NULL');
  while (ls.step()) links.push(ls.getAsObject());
  ls.free();

  const hasEdge = new Set();
  const neighbors = new Map();
  const addN = (a, b) => { if (!neighbors.has(a)) neighbors.set(a, new Set()); neighbors.get(a).add(b); };
  for (const l of links) {
    hasEdge.add(l.source_id + '\u0000' + l.target_id);
    hasEdge.add(l.target_id + '\u0000' + l.source_id);
    addN(l.source_id, l.target_id);
    addN(l.target_id, l.source_id);
  }

  const meta = new Map();
  for (const e of ents) meta.set(e.id, { tags: new Set(parseTags(e.tags)), kw: keywords(e.content) });

  const candidates = [];
  for (let i = 0; i < ents.length; i++) {
    for (let j = i + 1; j < ents.length; j++) {
      const a = ents[i].id, b = ents[j].id;
      if (hasEdge.has(a + '\u0000' + b)) continue;
      stats.pairs++;
      const ma = meta.get(a), mb = meta.get(b);
      const evidence = [];
      const sharedTags = [...ma.tags].filter(t => mb.tags.has(t));
      if (sharedTags.length) evidence.push({ kind: 'tag', detail: sharedTags.slice(0, 5) });
      const sharedKw = [...ma.kw].filter(k => mb.kw.has(k));
      if (sharedKw.length >= 2) evidence.push({ kind: 'kw', detail: sharedKw.slice(0, 5) });
      const na = neighbors.get(a) || new Set();
      const nb = neighbors.get(b) || new Set();
      const sharedN = [...na].filter(n => nb.has(n));
      if (sharedN.length >= 2) evidence.push({ kind: 'neighbor', detail: sharedN.slice(0, 5) });
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
    const strength = c.kinds >= 3 ? 6 : 4;
    insert.run([c.a, c.b, REL, 0.5, strength, JSON.stringify(c.evidence)]);
    stats.seeded++;
  }
  insert.free();
  if (stats.seeded) store._persist();
  stats.skipped = candidates.length - stats.seeded;
  return stats;
}

module.exports = { sproutStep, keywords, parseTags };
