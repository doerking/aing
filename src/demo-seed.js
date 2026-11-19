'use strict';
// aing-v2 demo-seed.js —— M6 任务 6.49 实现（SPEC-6.49 演示语料播种与拆除）
// 播种 = 写原稿 + compile 入库 + 记账（data/demo-seed.json）。
// 拆除 = 只拆账上那些 id；改过的档不拆；墓碑留档；幂等。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MARKER = path.join('data', 'demo-seed.json');
const RAW_SUB = path.join('raw', 'demo');

const DEMO_FILES = [
  {
    file: 'concept.md', id: 'demo-concept', type: 'Concept', tags: ['demo'],
    body: [
      '# 演示概念：双铰链',
      '',
      '双铰链指知识库同时维护「结构链」与「语义链」：结构链管实体与边的关系是否自洽，语义链管内容是否经得起检索。',
      '两条链都不许单独扩张——结构涨了语义没跟上，检索就会给出对不上题的答案。',
      ''
    ].join('\n')
  },
  {
    file: 'session.md', id: 'demo-session', type: 'Session', tags: ['demo'],
    body: [
      '# 演示会话：一次部署复盘',
      '',
      '## 场景（触发）',
      '新机器上第一次跑 aing-v2，跑完发现编译扫描 0 档，原因是缺少 raw 目录。',
      '',
      '## 思维（能力内核）',
      '先判「缺什么」，再判「缺的东西是谁的责任」——目录是部署物，不是引擎产物。',
      '',
      '## 产出',
      '补了建库工具与开机自检，部署从「靠记忆」变成「靠命令」。',
      ''
    ].join('\n')
  },
  {
    file: 'link-src.md', id: 'demo-link-src', type: 'Concept', tags: ['demo'],
    body: [
      '# 演示边·源：编译',
      '',
      '编译把原稿变成实体：解析前注、核验完整性、净化标签，然后一张一张落库。',
      '编译不解释内容，只保证「进来的和出去的是同一份」。',
      ''
    ].join('\n')
  },
  {
    file: 'link-dst.md', id: 'demo-link-dst', type: 'Concept', tags: ['demo'],
    body: [
      '# 演示边·目标：检索',
      '',
      '检索从库里取回与问题相关的实体，靠的是语义向量与图谱邻接的结合。',
      '取回的东西必须能指回原文，否则读者无法自己复核。',
      ''
    ].join('\n')
  }
];

function _digest(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex').slice(0, 16);
}

function _resolveRoot(opts) {
  if (!opts || !opts.root) throw new Error('root-missing: 必须显式给 root');
  const root = path.resolve(opts.root);
  if (!fs.existsSync(root)) throw new Error('root-missing: ' + root);
  if (!fs.statSync(root).isDirectory()) throw new Error('root-not-dir: ' + root);
  return root;
}

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

/**
 * 播种演示语料。
 * @returns {Promise<{ok:boolean, files:string[], ids:string[], created:number, updated:number, marker:string}>}
 */
async function seedDemo(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('demo-seed 需要 store 注入（SPEC-6.49 契约）');
  const root = _resolveRoot(opts);
  const rawDir = path.join(root, RAW_SUB);
  fs.mkdirSync(rawDir, { recursive: true });

  const files = [];
  for (const d of DEMO_FILES) {
    const fp = path.join(rawDir, d.file);
    const text = ['---', `id: ${d.id}`, `type: ${d.type}`, `tags: [${d.tags.join(', ')}]`, '---', '', d.body].join('\n');
    fs.writeFileSync(fp, text);
    files.push(path.relative(root, fp).replace(/\\/g, '/'));
  }

  const compile = require('./compile.js');
  const stats = await compile.compile(rawDir, store, { quality: false });

  // 演示边：源 → 目标（已存在则不动）
  const db = store._getDb();
  const src = store.getEntity('demo-link-src');
  const dst = store.getEntity('demo-link-dst');
  if (src && dst) {
    const has = _rows(db, 'SELECT 1 x FROM links WHERE source_id = ? AND target_id = ?', ['demo-link-src', 'demo-link-dst']);
    if (!has.length) store.insertLink({ source_id: 'demo-link-src', target_id: 'demo-link-dst', relation: 'supports', strength: 5, evidence: 'demo-seed' });
  }

  const ids = DEMO_FILES.map(d => d.id).filter(id => store.getEntity(id) != null);
  const entities = {};
  for (const id of ids) entities[id] = _digest(store.getEntity(id).content);

  const markerPath = path.join(root, MARKER);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files, entities }, null, 2));

  return { ok: true, files, ids, created: stats.created, updated: stats.updated, marker: markerPath };
}

/**
 * 拆除演示语料：只拆账上的 id，改过的不拆。
 * @returns {Promise<{ok:boolean, deleted:string[], skipped:object[], removedFiles:string[], reason?:string}>}
 */
async function unseedDemo(store, opts = {}) {
  const root = _resolveRoot(opts);
  const markerPath = path.join(root, MARKER);
  if (!fs.existsSync(markerPath)) {
    return { ok: true, reason: 'no-marker', deleted: [], skipped: [], removedFiles: [] };
  }
  if (!store || typeof store._getDb !== 'function') throw new Error('demo-seed 需要 store 注入（SPEC-6.49 契约）');

  let marker = null;
  try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch (_) { marker = null; }
  if (!marker || typeof marker !== 'object' || !marker.entities) {
    return { ok: false, reason: 'bad-marker', deleted: [], skipped: [], removedFiles: [] };
  }

  const db = store._getDb();
  const deleted = [];
  const skipped = [];
  for (const id of Object.keys(marker.entities)) {
    const row = store.getEntity(id);
    if (!row) { skipped.push({ id, why: 'missing' }); continue; }
    if (_digest(row.content) !== marker.entities[id]) { skipped.push({ id, why: 'modified' }); continue; }
    db.run('INSERT OR REPLACE INTO tombstones (id, type, name, digest, archive_ref, deleted_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',
      [id, row.type, row.name, marker.entities[id], 'demo-seed']);
    db.run('DELETE FROM links WHERE source_id = ? OR target_id = ?', [id, id]);
    db.run('DELETE FROM entity_vectors WHERE entity_id = ?', [id]);
    db.run('DELETE FROM kespi_scores WHERE entity_id = ?', [id]);
    db.run('DELETE FROM distill_points WHERE base_id = ?', [id]);
    db.run('DELETE FROM access_hits WHERE entity_id = ?', [id]);
    db.run('DELETE FROM entities WHERE id = ?', [id]);
    deleted.push(id);
  }
  store._persist();

  // 原稿目录与标记档：拆干净才删
  const removedFiles = [];
  const rawDir = path.join(root, RAW_SUB);
  if (fs.existsSync(rawDir) && deleted.length) { fs.rmSync(rawDir, { recursive: true, force: true }); removedFiles.push(path.relative(root, rawDir).replace(/\\/g, '/')); }
  fs.rmSync(markerPath, { force: true });
  removedFiles.push(MARKER.replace(/\\/g, '/'));

  return { ok: true, deleted, skipped, removedFiles };
}

module.exports = { seedDemo, unseedDemo, DEMO_FILES, MARKER, RAW_SUB };
