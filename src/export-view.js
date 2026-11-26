'use strict';
// aing-v2 export-view.js —— 自查投影面（agent-first introspection view）
// 定位：把库内真源单向投影成机器可 grep/diff 的 view/，服务 agent 下一次判断；人读得明只是副作用。
// 三产物：view/entities/<id>.md · view/_health.md · view/_anomalies.md
// 铁律：
//   1. 单向只读——全程 SELECT，不写任何表、不回读入库（防 v0.9.1 wiki 与库漂移血证）
//   2. 幂等——先清空 view/ 再全写，零增量合并；同库连导两次全文件 hash 一致
//   3. fail-open——view 不可写时返回 {ok:false}，唔抛穿（代谢系命，投影系眼）
//   4. 数字同源——健康读数复用 memo 同一套函数（vector/conservation/pulse/maintenance），承接门禁 C10b
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const fs = require('fs');
const path = require('path');

const CONTENT_MAX_BYTES = 4096;

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}
function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

// 去前缀（wiki-/raw-/conv-）后比较——同源自指边的判定口径
function _strip(id) { return String(id == null ? '' : id).replace(/^(wiki|raw|conv)-/, ''); }

// 实体前缀分类
function _prefixOf(id) {
  const s = String(id || '');
  if (s.startsWith('wiki-')) return 'wiki';
  if (s.startsWith('raw-')) return 'raw';
  if (s.startsWith('conv-')) return 'conv';
  return 'other';
}

// tags 存储可能是 JSON 数组 / 逗号串 / null——统一成数组
function _parseTags(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) { try { const a = JSON.parse(s); return Array.isArray(a) ? a.map(String) : []; } catch (_) { /* fallthrough */ } }
  return s.split(/[,;]+/).map(x => x.trim()).filter(Boolean);
}

// 正文截断：按字节，超限加 …[truncated]
function _clipBody(content) {
  const text = content == null ? '' : String(content);
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= CONTENT_MAX_BYTES) return text;
  return buf.slice(0, CONTENT_MAX_BYTES).toString('utf8') + '…[truncated]';
}

// ISO 时间（无则字面 null）
function _iso(v) {
  if (v == null || String(v).trim() === '') return 'null';
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d.getTime()) ? String(v) : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ── 核心投影 ──────────────────────────────────────────────
async function exportView(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('export-view 需要 store 注入（arch-lint C5）');
  const db = store._getDb();
  const outDir = String(opts.outDir || path.join(process.cwd(), 'view'));
  const all = opts.all === true;

  // ── 1. 全量读库（纯 SELECT）────────────────────────────
  const entities = _rows(db, `SELECT * FROM entities WHERE invalid_at IS NULL ORDER BY id`);
  const links = _rows(db, `SELECT source_id, target_id, relation, strength, confidence FROM links WHERE invalid_at IS NULL ORDER BY source_id, target_id, relation`);
  const vecRows = _rows(db, `SELECT entity_id, model, dim, checksum FROM entity_vectors`);
  const vecByEnt = new Map(vecRows.map(v => [String(v.entity_id), v]));
  const kespiRows = _rows(db, `SELECT entity_id, overall, computed_at FROM kespi_scores`);
  const kespiByEnt = new Map(kespiRows.map(k => [String(k.entity_id), k]));

  // 出边 / 入边索引
  const outEdges = new Map(); // id -> [edge]
  const inDeg = new Map();    // id -> count
  for (const e of entities) { outEdges.set(String(e.id), []); inDeg.set(String(e.id), 0); }
  for (const l of links) {
    const s = String(l.source_id), t = String(l.target_id);
    if (outEdges.has(s)) outEdges.get(s).push(l);
    if (inDeg.has(t)) inDeg.set(t, inDeg.get(t) + 1);
  }

  // 自指边（去前缀后两端同名）
  const selfEdges = [];
  const dupFlags = new Map(); // id -> Set(peer id)
  for (const l of links) {
    if (_strip(l.source_id) !== '' && _strip(l.source_id) === _strip(l.target_id)) {
      selfEdges.push(l);
      if (!dupFlags.has(String(l.source_id))) dupFlags.set(String(l.source_id), new Set());
      dupFlags.get(String(l.source_id)).add(String(l.target_id));
      if (!dupFlags.has(String(l.target_id))) dupFlags.set(String(l.target_id), new Set());
      dupFlags.get(String(l.target_id)).add(String(l.source_id));
    }
  }

  // type null
  const typeNullIds = entities.filter(e => e.type == null || String(e.type).trim() === '').map(e => String(e.id));

  // 孤儿（无任何边）
  const orphanIds = entities.filter(e => outEdges.get(String(e.id)).length === 0 && inDeg.get(String(e.id)) === 0).map(e => String(e.id));
  // 有边但无向量
  const noVecIds = entities.filter(e => (outEdges.get(String(e.id)).length + inDeg.get(String(e.id))) > 0 && !vecByEnt.has(String(e.id))).map(e => String(e.id));

  // ── 2. 健康读数（同源 memo）────────────────────────────
  const V = require('./vector.js');
  const backend = V.resolveBackend();
  const active = entities.length;
  const indexed = [...vecByEnt.keys()].filter(id => entities.some(e => String(e.id) === id)).length;
  const vecPct = active === 0 ? 100 : Math.round((indexed / active) * 100);
  let cons = { ratio: 1, inBand: true, verdict: 'balanced', edge: { growth: 0, pruned: 0 }, entity: { backlog: 0 } };
  try { cons = require('./conservation.js').measureConservation(store, {}); } catch (_) { /* 默认 */ }
  const pendingDistill = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE status = 'pending-distillation' AND invalid_at IS NULL`).n || 0);
  const seeds = Number(_scalar(db, `SELECT COUNT(*) AS n FROM compressed_seeds WHERE active = 1`).n || 0);
  const cycles = Number(_scalar(db, `SELECT COUNT(*) AS n FROM meko_cycles`).n || 0);
  let gapTotal = 0;
  try { gapTotal = Number(require('./maintenance-report.js').buildReport(store).internal.gaps.total || 0); } catch (_) { gapTotal = 0; }
  const edge = cons.edge || { growth: cons.growth, pruned: cons.pruned };
  const backlog = (cons.entity && Number.isFinite(cons.entity.backlog)) ? cons.entity.backlog : 0;

  const entByPrefix = { wiki: 0, raw: 0, conv: 0, other: 0 };
  for (const e of entities) entByPrefix[_prefixOf(e.id)]++;
  const relCounts = new Map();
  for (const l of links) relCounts.set(String(l.relation), (relCounts.get(String(l.relation)) || 0) + 1);
  const selfPct = links.length ? Math.round(selfEdges.length / links.length * 1000) / 10 : 0;
  const typeNullPct = active ? Math.round(typeNullIds.length / active * 1000) / 10 : 0;

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // ── 3. 产物 ─────────────────────────────────────────────
  const files = [];
  const mk = (rel, content) => { files.push({ path: rel, content }); };

  // ① per-entity
  // 导出范围：--all 全量；默认=有异常 + 近 7 日 touch
  const anomIds = new Set([...typeNullIds, ...orphanIds, ...noVecIds, ...dupFlags.keys()]);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentIds = new Set(entities.filter(e => {
    const t = Date.parse(String(e.updated_at || e.last_access || '').replace(' ', 'T'));
    return !isNaN(t) && t >= weekAgo;
  }).map(e => String(e.id)));
  const scope = entities.filter(e => all || anomIds.has(String(e.id)) || recentIds.has(String(e.id)));

  for (const e of scope) {
    const id = String(e.id);
    const typeVal = (e.type == null || String(e.type).trim() === '') ? 'null' : String(e.type);
    const tags = _parseTags(e.tags);
    const k = kespiByEnt.get(id);
    const kespi = k && k.overall != null ? Math.round(Number(k.overall)) : 0;
    const v = vecByEnt.get(id);
    const vector = v ? `${v.model}/${String(v.checksum || '').slice(0, 5) || 'null'}` : 'null';
    const flags = [];
    if (typeVal === 'null') flags.push('type-null');
    for (const peer of (dupFlags.get(id) || [])) flags.push('dup-of:' + peer);

    const lines = [];
    lines.push('---');
    lines.push(`id: ${id}`);
    lines.push(`type: ${typeVal}`);
    lines.push(`tags: [${tags.join(', ')}]`);
    lines.push(`strength: ${e.tolaria_strength == null ? 'null' : Number(e.tolaria_strength)}`);
    lines.push(`kespi: ${kespi}`);
    lines.push(`vector: ${vector}`);
    lines.push(`flags: [${flags.join(', ')}]`);
    lines.push(`updated: ${_iso(e.updated_at)}`);
    lines.push('generated: true');
    lines.push('---');
    lines.push('');
    lines.push(_clipBody(e.content));
    // 出边
    const outs = outEdges.get(id) || [];
    if (outs.length) {
      lines.push('');
      lines.push('## 出边');
      for (const l of outs) {
        const isSelf = _strip(l.source_id) === _strip(l.target_id) && _strip(l.source_id) !== '';
        lines.push(`- → ${l.target_id} · ${l.relation} · ${l.strength == null ? 'null' : Number(l.strength)}${isSelf ? ' · SELF' : ''}`);
      }
    }
    mk(`entities/${_safeName(id)}.md`, lines.join('\n') + '\n');
  }

  // ② _health.md（数字与 cli memo 同源）
  const relTxt = [...relCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(' / ') || '无';
  const h = [];
  h.push(`实体 ${active}（wiki ${entByPrefix.wiki} / raw ${entByPrefix.raw} / conv ${entByPrefix.conv} / 其它 ${entByPrefix.other}）`);
  h.push(`边 ${links.length}（${relTxt}）· 自指 ${selfEdges.length} = ${selfPct}%${selfEdges.length ? ' ⚠' : ''}`);
  h.push(`type null ${typeNullIds.length} = ${typeNullPct}%${typeNullIds.length ? ' ⚠' : ''} · 向量 ${indexed} = ${vecPct}%`);
  h.push(`蒸馏债 ${pendingDistill} · 缺口 ${gapTotal} · 守恒 ${edge.growth}:${edge.pruned}${backlog > 0 ? ' 待退' + backlog : ''} · 代谢轮 ${cycles} · 籽 ${seeds}`);
  h.push(`backend ${backend.name}`);
  // 注：唔落「生成于」时间戳——硬约束4 幂等要求同库连导两次全文件 hash 一致，
  // 时间戳系唯一非确定源（已实测），故移到 export stdout 回执，产物保持可 diff。
  mk('_health.md', h.join('\n') + '\n');

  // ③ _anomalies.md（按类分组、可 grep、带计数）
  const a = [];
  a.push(`## 自指边 ${selfEdges.length}`);
  for (const l of selfEdges.slice(0, 200)) {
    a.push(`- ${l.source_id} ↔ ${l.target_id}（${l.relation} · strength ${l.strength == null ? 'null' : Number(l.strength)}）`);
  }
  a.push('');
  a.push(`## type 空 ${typeNullIds.length}`);
  for (const id of typeNullIds.slice(0, 200)) a.push(`- ${id}`);
  a.push('');
  a.push(`## 无边（孤儿）${orphanIds.length}`);
  for (const id of orphanIds.slice(0, 200)) a.push(`- ${id}`);
  a.push('');
  a.push(`## 有边但无向量 ${noVecIds.length}`);
  for (const id of noVecIds.slice(0, 200)) a.push(`- ${id}`);
  mk('_anomalies.md', a.join('\n') + '\n');

  // ── 4. 落盘：先清空 view/ 再全写（幂等）─────────────────
  try {
    _resetDir(outDir);
    for (const f of files) {
      const p = path.join(outDir, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      // 无 BOM 写入（Windows PowerShell 5.1 会带 BOM，这里显式用 UTF-8 无 BOM）
      fs.writeFileSync(p, f.content, { encoding: 'utf8' });
    }
    return { ok: true, outDir, generatedAt: now, files: files.map(f => f.path), entities: scope.length, selfEdges: selfEdges.length, typeNull: typeNullIds.length };
  } catch (e) {
    return { ok: false, outDir, error: String(e.message || e), files: [] };
  }
}

function _safeName(id) {
  // 文件名安全：替换路径分隔与非法字符（Windows）
  return String(id).replace(/[\\/:*?"<>|]/g, '_');
}

// 清空目录（保留目录本身），唔存在则建
function _resetDir(dir) {
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
      else fs.rmSync(p, { force: true });
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = { exportView, CONTENT_MAX_BYTES, _strip, _prefixOf, _parseTags };
