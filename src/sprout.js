'use strict';
// aing-v2 sprout.js —— M1 任务 1.9 实现（SPEC-1.9 发芽）
// spec-first：本文件是 SPEC-1.9 的代码结果，契约在 spec/SPEC-1.9-sprout发芽.md。
// 双铰链定位：在场域带 4–6 段产候选边，每粒带证据；每轮 2–4 粒（sproutFloor），供守恒闸计量。
// 铁律：≥2 类独立证据才成种；已有边不发种；幂等；不碰 last_access/invalid_at；无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const { DEFAULTS, getKnob } = require('./config-runtime.js');
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
  const cap = Number.isInteger(opts.cap) ? opts.cap : DEFAULTS.sprout.cap;
  const stats = { scanned: 0, pairs: 0, seeded: 0, skipped: 0 };
  const db = store._getDb();

  const ents = [];
  const es = db.prepare('SELECT id, content, tags FROM entities WHERE invalid_at IS NULL ORDER BY updated_at DESC, id LIMIT ' + MAX_ENTITIES);
  while (es.step()) ents.push(es.getAsObject());
  es.free();
  stats.scanned = ents.length;

  const links = [];
  // SPEC-1.9 修订 A：边表 PK 与 invalid_at 无关——退役边仍占位（2026-11-18 真库重跑撞 UNIQUE）
  const ls = db.prepare('SELECT source_id, target_id FROM links');
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

  // SPEC-1.9 修订 B：关键词文档频次阈值。keywords() 每实体产中位 186 词，其中 76.8% 唔具
  // 选择性，top 词系 2026/json/status 呢啲日期与 JSON 字段名（docs/Engineering/SPOUT-HOTSPOT-*）。
  // 剔除出现在 ≥ dfMax % 扫描实体嘅词，保留 docFreq 低于该线嘅低频共享词（kw 证据需 ≥2 共享）。
  // dfMax = 0 → 关闭（恢复全量）。
  // 绝对下限 3：kw 证据需 ≥2 个共享词，共享词本身 docFreq ≥2——cutoff ≤2 会剔晒所有共享词、
  // 等于杀死 kw 证据。3 系唔会杀死 kw 证据嘅最小 cutoff（真库 N=200 时 5% = 10，唔触下限）。
  const dfMax = Number.isFinite(opts.docFreqPctMax) ? Number(opts.docFreqPctMax)
    : getKnob(store, 'sprout.docFreqPctMax');
  if (dfMax > 0) {
    const df = new Map();
    for (const m of meta.values()) for (const w of m.kw) df.set(w, (df.get(w) || 0) + 1);
    const cutoff = Math.max(3, ents.length * dfMax / 100);
    for (const m of meta.values()) m.kw = new Set([...m.kw].filter(w => (df.get(w) || 0) < cutoff));
    stats.droppedKw = true;
  }

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
