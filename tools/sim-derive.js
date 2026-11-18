'use strict';
// tools/sim-derive.js —— 派生链模拟（SPEC-6.18 §二 料与模拟）
// 用法：node tools/sim-derive.js --db <库副本> --file <成文.md> [--id raw-sim-x] [--confidence 0.9]
// 做三件事：把一篇真料落成 pending-distillation 原料 → 跑 distill → 重算 KESPI，看产物、派生边与 kd。
// 铁律：只对副本跑；--db 缺省取 data/knowledge.db 但会拒绝在无 --allow-real 时动它。

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };

const dbPath = flag('db', path.join(__dirname, '..', 'data', 'knowledge.db'));
const file = flag('file', null);
const confidence = Number(flag('confidence', '0.9'));
const allowReal = args.includes('--allow-real');

if (!file) { console.error('用法: node tools/sim-derive.js --db <副本> --file <成文.md> [--id raw-sim-x]'); process.exit(2); }
if (!fs.existsSync(file)) { console.error('料不存在: ' + file); process.exit(2); }

const real = path.join(__dirname, '..', 'data', 'knowledge.db');
if (path.resolve(dbPath) === path.resolve(real) && !allowReal) {
  console.error('拒在真库上跑（先 cp 一份副本，或显式 --allow-real）');
  process.exit(3);
}

const store = require('../src/knowledge-store.js');

(async () => {
  const content = fs.readFileSync(file, 'utf8');
  const slug = flag('id', 'raw-sim-' + path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').slice(0, 40));
  const wikiId = 'wiki-' + slug.replace(/^raw-/, '');

  await store.init(dbPath);
  const db = store._getDb();
  const one = (sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
  const all = (sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

  // 1) 落料：原料（past / pending-distillation）
  const exist = one('SELECT id FROM entities WHERE id = ?', [slug]);
  if (!exist) {
    db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,strand,created_at,updated_at) VALUES (?,?,?,?,?,'pending-distillation',?,5,'past',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
      [slug, path.basename(file), 'Article', content, JSON.stringify(['sim', 'article']), confidence]);
    store._persist();
  }
  const before = one('SELECT kd FROM kespi_scores WHERE entity_id = ?', [slug]);

  // 2) 蒸馏（P2 位）
  const d = await require('../src/distill.js').distillStep(store, {});
  const product = one('SELECT id, strand, LENGTH(content) AS L FROM entities WHERE id = ?', [wikiId]);
  const edge = one("SELECT relation, strength FROM links WHERE source_id = ? AND target_id = ?", [slug, wikiId]);

  // 3) 重算 KESPI
  await require('../src/kespi.js').kespiStep(store, {});
  const after = one('SELECT kd, kq, overall FROM kespi_scores WHERE entity_id = ?', [slug]);

  console.log(JSON.stringify({
    material: { file: path.basename(file), chars: content.length, id: slug },
    distill: d,
    product: product ? { id: product.id, strand: product.strand, chars: product.L } : null,
    derivedEdge: edge || null,
    kd: { before: before ? before.kd : null, after: after ? after.kd : null },
    readings: after || null
  }, null, 2));
})().catch((e) => { console.error('sim-derive 失败: ' + e.message); process.exit(1); });
