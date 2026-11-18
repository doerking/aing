'use strict';
// M7 任务 7.1r 收口护栏 —— 锁 SPEC-7.1 AC-1（表头不加工）、AC-2（只追加）、§七（旧库迁移口径）
// 口径（2026-11-18 收口复核）：
//   旧档 id 原地充当该档序列号（别名语义，§七.1 的实现等价形态），不重写、不重排；
//   旧 name（题头）迁入 title——它是展示面，永不入键；
//   迁移后 title 不得为 NULL/空串，且重开库不许回退。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-idclose-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const M = require('../src/migrate.js');

function rows(db, sql) { const s = db.prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }

(async () => {
  const SQL = await require('sql.js')();
  const legacy = new SQL.Database();
  legacy.run('CREATE TABLE entities (id TEXT PRIMARY KEY, name TEXT, type TEXT, content, tags TEXT, status TEXT, confidence REAL, created_at DATETIME)');
  legacy.run('CREATE TABLE links (source_id TEXT, target_id TEXT, relation TEXT, confidence REAL, created_at DATETIME, strength INTEGER, invalid_at DATETIME)');
  // 旧库口径：name 是题头（人写标题），id 是 slug
  legacy.run("INSERT INTO entities VALUES ('memory-02-form','形式与内容的分层','Concept','形式是外壳，内容是分层结构','[]','active',0.6,'2020-01-01 00:00:00')");
  legacy.run("INSERT INTO entities VALUES ('raw-loose','未命名散档','Concept','没有题头之外的信息','[]','active',0.5,'2020-01-02 00:00:00')");
  const legacyPath = path.join(yard, 'legacy.db');
  fs.writeFileSync(legacyPath, Buffer.from(legacy.export()));

  const target = path.join(yard, 'target.db');
  await store.init(target);
  await M.migrateFrom(store, { sourcePath: legacyPath });

  const db = store._getDb();
  const all = rows(db, 'SELECT id, name, title, content FROM entities ORDER BY id');

  // AC-1a：旧题头迁入 title，title 不得为空
  ac('AC-1a 迁移把旧 name（题头）搬进 title，不留空',
    all.length === 2 && all.every((e) => e.title != null && String(e.title).trim() !== ''),
    JSON.stringify(all.map((e) => ({ id: e.id, name: e.name, title: e.title }))));

  // AC-2b（2026-11-18 收口裁定 M7-1）：存量旧档不重写 name——只追加原则优先；
  //        题头一律以 title 为准（展示面），旧 name 原值保留不动
  const form = all.find((e) => e.id === 'memory-02-form');
  ac('AC-2b 迁移不改写存量 name，题头以 title 为准',
    form && form.name === '形式与内容的分层' && form.title === '形式与内容的分层',
    JSON.stringify(form));

  // AC-2：只追加——id 不重写、不重排（links 端点才稳）
  const ids = all.map((e) => e.id).sort();
  ac('AC-2 迁移不重写 id（旧 slug 原地充当序列号）',
    JSON.stringify(ids) === JSON.stringify(['memory-02-form', 'raw-loose']), JSON.stringify(ids));

  // AC-8/§七.4：重开库幂等——title 不回退、不改写
  await store.init(target);
  const again = rows(store._getDb(), 'SELECT id, title FROM entities ORDER BY id');
  ac('AC-8 重开库后 title 不回退（幂等）',
    again.every((e) => e.title != null && String(e.title).trim() !== ''),
    JSON.stringify(again));

  // AC-1c：新入库仍走身份面（name=序列号、title 由正文派生），迁移不改这条
  const I = require('../src/identity.js');
  const got = I.ingestEntity(store, { content: '这一段正文的第一句话就是标题\n后面才是细节', type: 'Concept' });
  const fresh = store.getEntity(got.id);
  ac('AC-1c 新入库 name=序列号、title 由正文派生',
    fresh && fresh.name === fresh.id && /^e-\d{8}-\d{4}$/.test(fresh.id) && String(fresh.title).startsWith('这一段正文的第一句话'),
    JSON.stringify({ id: fresh && fresh.id, name: fresh && fresh.name, title: fresh && fresh.title }));

  // AC-1d：代谢产物面也要带 title——镜像不再裸露 slug
  const F = require('../src/meko-field.js');
  store.insertEntity({ id: 'raw-mirror-src', name: 'raw-mirror-src', type: 'Concept', title: '镜像源标题',
    content: '这是一条有题头的原文，讲镜像该继承什么', tags: '["a:7"]', status: 'active', confidence: 0.6, strand: 'past' });
  await F.reconcile(store, {});
  const twin = store.getEntity('wiki-mirror-src');
  ac('AC-1d 镜像产物继承源 title（不裸露 slug）',
    twin && String(twin.title || '').trim() !== '' && twin.title === '镜像源标题',
    JSON.stringify({ exists: !!twin, title: twin && twin.title }));

  // AC-1e：蒸馏产物 title 由正文派生
  const D = require('../src/distill.js');
  await D.distillStep(store, {});
  const prod = store.getEntity('wiki-distill-src');
  if (!prod) {
    store.insertEntity({ id: 'raw-distill-src', name: 'raw-distill-src', type: 'Concept', title: '蒸馏源标题',
      content: '蒸馏产物应当带着正文第一句做标题而不是空', tags: '["a:7"]', status: 'pending-distillation', confidence: 0.6, strand: 'past' });
    await D.distillStep(store, {});
  }
  const prod2 = store.getEntity('wiki-distill-src');
  ac('AC-1e 蒸馏产物 title 由正文派生（非空）',
    prod2 && String(prod2.title || '').trim() !== '',
    JSON.stringify({ id: 'wiki-distill-src', title: prod2 && prod2.title }));

  console.log(`\n----- 7.1r pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
