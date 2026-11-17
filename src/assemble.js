'use strict';
// SPEC-7.1 §4.3/§4.4 —— 抽库装配：一句用户表达 → 源头 / 派生 / 关联 / 链 四件
// 铁律：纯读（不写库、不写 last_access）；时间序 = 源头按 entities.created_at、链按 links.created_at；
//       关联只收 strength>=7 或三类候选关系（泛 related 只作背景，不进链）。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const derive = require('./derive.js');
const R = require('./retrieval.js');

const QUALIFIED_RELATIONS = new Set(['derived', 'sprout-candidate', 'pollinate-candidate', 'hydrogen-bond']);
const STRONG = 7;
const MAX_SRC = 12;
const MAX_LINKS = 40;

function _rows(db, sql, binds = []) {
  const stmt = db.prepare(sql);
  if (binds.length) stmt.bind(binds);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function _ts(v) { return v == null ? '' : String(v); }

function _qualifies(link) {
  return Number(link.strength || 0) >= STRONG || QUALIFIED_RELATIONS.has(String(link.relation || ''));
}

/**
 * @param store  注入的知识库（需 getEntity + _getDb）
 * @param message 用户表达
 * @returns {{query, forms, source, derived, links, chain}}
 */
async function assemble(store, message, opts = {}) {
  const query = String(message == null ? '' : message);
  const forms = derive.normalizeQuery(query).forms;

  // 1) 命中面：三路检索（纯读），再按关键词 LIKE 补漏
  const res = query.trim() ? await R.search(store, query, { limit: opts.limit || 20 }) : { candidates: [] };
  const hits = Array.isArray(res) ? res : (res.candidates || []);
  const ids = new Set(hits.map((h) => h.id).filter(Boolean));
  const kws = [...derive.keywordsOf(query)].slice(0, 8);
  const db = store._getDb();
  if (kws.length) {
    const like = kws.map(() => '(content LIKE ? OR name LIKE ? OR tags LIKE ?)').join(' OR ');
    const binds = kws.flatMap((k) => [`%${k}%`, `%${k}%`, `%${k}%`]);
    for (const row of _rows(db, `SELECT id FROM entities WHERE invalid_at IS NULL AND (${like}) LIMIT 30`, binds)) ids.add(row.id);
  }
  const rows = [...ids].map((id) => store.getEntity(id)).filter((r) => r && !r.invalid_at);

  // 2) 关联面：命中集 1 跳内合格边（强边或三类候选关系）；把端点也并入，保证产物可见
  let linkRows = [];
  if (ids.size) {
    const list = [...ids];
    const ph = list.map(() => '?').join(',');
    linkRows = _rows(db,
      `SELECT source_id, target_id, relation, strength, evidence, created_at FROM links
       WHERE invalid_at IS NULL AND (source_id IN (${ph}) OR target_id IN (${ph}))`,
      [...list, ...list]).filter(_qualifies);
    for (const l of linkRows) { if (!ids.has(l.source_id)) ids.add(l.source_id); if (!ids.has(l.target_id)) ids.add(l.target_id); }
  }
  const allRows = [...ids].map((id) => store.getEntity(id)).filter((r) => r && !r.invalid_at);
  const byId = new Map(allRows.map((r) => [r.id, r]));

  // 3) 源头：只取 past，按原始时间升序
  const source = allRows
    .filter((r) => (r.strand || 'past') === 'past')
    .sort((a, b) => _ts(a.created_at).localeCompare(_ts(b.created_at)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, MAX_SRC)
    .map((r) => ({ id: r.id, strand: 'past', type: r.type || null, createdAt: r.created_at || null, text: String(r.content || '').slice(0, 80) }));

  // 4) 派生：查询 + 命中正文的繁简/粤拆/粤普，去重保序
  const variants = derive.variants(query);
  const tokens = [];
  const glosses = [];
  const segQ = derive.segment(query);
  tokens.push(...segQ.tokens.filter((t) => t.length >= 2 || /[一-鿿]/.test(t)));
  glosses.push(...segQ.mandarin);
  for (const r of allRows.slice(0, 6)) {
    const seg = derive.segment(String(r.content || '').slice(0, 200));
    glosses.push(...seg.mandarin);
  }
  const derived = {
    forms: variants.all,
    traditional: variants.traditional,
    simplified: variants.simplified,
    tokens: [...new Set(tokens)].slice(0, 20),
    glosses: [...new Set(glosses)].slice(0, 20)
  };

  // 5) 链：合格边按 links.created_at 升序（同刻按端点定序，保证可复现）
  const links = linkRows
    .map((l) => ({
      from: l.source_id, to: l.target_id, relation: l.relation || null,
      strength: l.strength == null ? null : Number(l.strength),
      evidence: l.evidence || null, at: l.created_at || null
    }))
    .sort((a, b) => _ts(a.at).localeCompare(_ts(b.at))
      || String(a.from).localeCompare(String(b.from))
      || String(a.to).localeCompare(String(b.to)))
    .slice(0, MAX_LINKS);

  return {
    query,
    forms,
    counts: { source: source.length, links: links.length, entities: allRows.length },
    source,
    derived,
    links,
    chain: links.map((l) => ({
      at: l.at,
      from: l.from, fromStrand: (byId.get(l.from) || {}).strand || 'past',
      to: l.to, toStrand: (byId.get(l.to) || {}).strand || 'past',
      relation: l.relation, strength: l.strength
    }))
  };
}

module.exports = { assemble, QUALIFIED_RELATIONS, STRONG };
