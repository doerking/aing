'use strict';
// aing-v2 tools/archive.js —— SPEC-6.11 到期归档工具（退役 → 归档 → 校验 → 删热库 → 墓碑）
// 默认 dry-run：只出计划与归档包，不删一行。--apply 必须过校验才删。
// 真库纪律：先在副本上跑；本工具不负责备份，--db 指哪里就动哪里。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseBody, readableTopic } = require('../src/conv-text.js');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const digestOf = (content) => crypto.createHash('sha256').update(String(content == null ? '' : content)).digest('hex').slice(0, 16);

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function exportMonth(store, opts = {}) {
  const db = store._getDb();
  const month = String(opts.month || new Date().toISOString().slice(0, 7));
  const outDir = opts.outDir || path.join(__dirname, '..', 'archive');
  const plan = opts.plan;
  if (!plan || !Array.isArray(plan.candidates)) throw new Error('exportMonth 需要 plan（retention.planRetention 结果）');
  if (!plan.candidates.length) return { ok: true, empty: true, month, count: 0 };

  fs.mkdirSync(outDir, { recursive: true });
  const ndjsonPath = path.join(outDir, `${month}.ndjson`);
  const mdPath = path.join(outDir, `${month}.md`);
  const manifestPath = path.join(outDir, `${month}.manifest.json`);

  const ids = plan.candidates.map(c => c.id);
  const lines = [];
  const digestMap = {};
  const meta = [];
  for (const id of ids) {
    const e = _rows(db, 'SELECT * FROM entities WHERE id = ?', [id])[0];
    if (!e) continue;
    const links = _rows(db, 'SELECT * FROM links WHERE source_id = ? OR target_id = ?', [id, id]);
    const d = digestOf(e.content);
    digestMap[id] = d;
    meta.push({ id, type: e.type || '', topic: String(readableTopic(e.name, parseBody(e))).replace(/\|/g, '/') });
    lines.push(JSON.stringify({ ...e, digest: d, links }));
  }
  const ndjson = lines.join('\n') + '\n';
  const md = ['# 归档 ' + month, '', `实体 ${lines.length} 条`, '', '| id | type | 话题 |', '|---|---|---|']
    .concat(meta.map(m => `| ${m.id} | ${m.type} | ${m.topic} |`))
    .join('\n') + '\n';

  fs.writeFileSync(ndjsonPath, ndjson, 'utf8');
  fs.writeFileSync(mdPath, md, 'utf8');
  const manifest = {
    month,
    generated_at: new Date().toISOString(),
    count: lines.length,
    archive_ref: path.basename(ndjsonPath),
    files: {
      ndjson: { bytes: Buffer.byteLength(ndjson), sha256: sha256(ndjson) },
      md: { bytes: Buffer.byteLength(md), sha256: sha256(md) }
    },
    entities: digestMap
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { ok: true, empty: false, month, count: lines.length, ndjsonPath, mdPath, manifestPath, manifest };
}

/** 干跑还原：重读 ndjson，逐条重算摘要并与 manifest 对齐 */
function verifyArchive(outDir, month) {
  const ndjsonPath = path.join(outDir, `${month}.ndjson`);
  const manifestPath = path.join(outDir, `${month}.manifest.json`);
  const problems = [];
  if (!fs.existsSync(ndjsonPath)) return { ok: false, problems: ['ndjson-missing'] };
  if (!fs.existsSync(manifestPath)) return { ok: false, problems: ['manifest-missing'] };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const raw = fs.readFileSync(ndjsonPath, 'utf8');
  if (sha256(raw) !== manifest.files.ndjson.sha256) problems.push('ndjson-sha-mismatch');
  if (Buffer.byteLength(raw) !== manifest.files.ndjson.bytes) problems.push('ndjson-bytes-mismatch');
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length !== manifest.count) problems.push('count-mismatch');
  const seen = new Set();
  for (const l of lines) {
    let o;
    try { o = JSON.parse(l); } catch (_) { problems.push('bad-json'); continue; }
    seen.add(o.id);
    const expect = manifest.entities[o.id];
    if (expect == null) problems.push('unknown-id:' + o.id);
    else if (digestOf(o.content) !== expect || o.digest !== expect) problems.push('digest-mismatch:' + o.id);
  }
  for (const id of Object.keys(manifest.entities)) if (!seen.has(id)) problems.push('missing-id:' + id);
  return { ok: problems.length === 0, problems, count: lines.length, manifest };
}

/** 删热库：前置 = 校验通过。墓碑先写；写失败整批中止 */
function applyRetention(store, { plan, outDir, month, manifest } = {}) {
  if (!plan || !Array.isArray(plan.candidates)) throw new Error('applyRetention 需要 plan');
  if (plan.applyAllowed === false) return { ok: false, reason: 'mode-not-allowed' };
  const v = verifyArchive(outDir, month);
  if (!v.ok) return { ok: false, reason: 'archive-unverified', problems: v.problems };

  const db = store._getDb();
  const ids = Object.keys(manifest.entities);
  const done = [];
  try {
    for (const id of ids) {
      const e = _rows(db, 'SELECT id, type, name FROM entities WHERE id = ?', [id])[0];
      if (!e) continue;
      db.run('INSERT OR REPLACE INTO tombstones (id, type, name, digest, archive_ref, deleted_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',
        [id, e.type, e.name, manifest.entities[id], manifest.archive_ref]);
      db.run('DELETE FROM links WHERE source_id = ? OR target_id = ?', [id, id]);
      db.run('DELETE FROM entity_vectors WHERE entity_id = ?', [id]);
      db.run('DELETE FROM kespi_scores WHERE entity_id = ?', [id]);
      db.run('DELETE FROM distill_points WHERE base_id = ?', [id]);
      db.run('DELETE FROM access_hits WHERE entity_id = ?', [id]);
      db.run('DELETE FROM entities WHERE id = ?', [id]);
      done.push(id);
    }
  } catch (err) {
    return { ok: false, reason: 'delete-failed', error: err.message, deleted: done.length };
  }
  store._persist();
  return { ok: true, deleted: done.length, tombstones: done.length };
}

module.exports = { exportMonth, verifyArchive, applyRetention, digestOf, sha256 };

// ── CLI ────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const get = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
    const has = (k) => args.includes('--' + k);
    const dbPath = get('db') || process.env.AING_DB || path.join(__dirname, '..', 'data', 'knowledge.db');
    const outDir = get('out') || path.join(__dirname, '..', 'archive');
    const month = get('month') || new Date().toISOString().slice(0, 7);
    const store = require('../src/knowledge-store.js');
    const { planRetention } = require('../src/retention.js');
    await store.init(dbPath);
    const plan = planRetention(store, {
      windowDays: get('window-days') ? Number(get('window-days')) : undefined,
      maxHot: get('max-hot') ? Number(get('max-hot')) : undefined,
      mode: get('mode') || 'desktop'
    });
    console.log(`分层：总 ${plan.counts.total}（原稿 ${plan.counts.origin} / 短料 ${plan.counts.short} / 知识 ${plan.counts.knowledge}）；超限 ${plan.overCap}；候选 ${plan.candidates.length}`);
    if (plan.mode === 'mobile-retire') {
      // SPEC-6.11 §六：手机端只出退役请求，归档案由桌面端落盘校验后回传；手机端不执行物理删
      const { buildRetireRequest } = require('../src/mobile-retire.js');
      const req = buildRetireRequest(store, {
        windowDays: get('window-days') ? Number(get('window-days')) : undefined,
        maxHot: get('max-hot') ? Number(get('max-hot')) : undefined
      });
      fs.mkdirSync(outDir, { recursive: true });
      const reqPath = path.join(outDir, 'retire-request.json');
      fs.writeFileSync(reqPath, JSON.stringify(req, null, 2) + String.fromCharCode(10), 'utf8');
      console.log(`退役请求 ${req.candidates.length} 条 → ${reqPath}（sha256 ${req.sha256.slice(0, 12)}）`);
      if (has('apply')) {
        console.error('手机端不执行物理删（SPEC-6.11 §六）：把退役请求交桌面端归档、校验、回传结果。');
        process.exitCode = 5;
      }
      return;
    }
    if (!plan.candidates.length) { console.log('无候选，不生成归档。'); return; }
    const exp = exportMonth(store, { month, outDir, plan });
    const v = verifyArchive(outDir, month);
    console.log(`归档 ${exp.count} 条 → ${exp.ndjsonPath}`);
    console.log(`干跑还原：${v.ok ? '通过' : '失败 ' + v.problems.join(',')}`);
    if (has('apply')) {
      if (!v.ok) { console.error('校验未过，拒绝删除。'); process.exitCode = 3; return; }
      const r = applyRetention(store, { plan, outDir, month, manifest: exp.manifest });
      console.log(`删除：${r.ok ? r.deleted + ' 条 + 墓碑 ' + r.tombstones : '失败 ' + r.reason}`);
      process.exitCode = r.ok ? 0 : 4;
    } else {
      console.log('dry-run：未删任何行（加 --apply 才删）。');
    }
  })().catch(e => { console.error('error: ' + e.message); process.exitCode = 1; });
}
