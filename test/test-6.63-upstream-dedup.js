'use strict';
// SPEC-6.63 上游归一 · 线 2：三个约定-id 入口写 fingerprint + 一次性修复指纹缺口
//   distill.js（蒸馏产物）/ import.js（镜像骨架）/ compile.js（编译产物）
// 线 1（查重复用）系语义问题（bare 主实体 vs raw/wiki 镜像系分层镜像设计），另立 spec。
// 运行（本仓根）：node test/test-6.63-upstream-dedup.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dedup63-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let store, distillStep, importStep, compile, identity;
try {
  store = require('../src/knowledge-store.js');
  distillStep = require('../src/distill.js').distillStep;
  importStep = require('../src/import.js').importStep;
  compile = require('../src/compile.js').compile;
  identity = require('../src/identity.js');
  if (typeof distillStep !== 'function' || typeof importStep !== 'function' || typeof compile !== 'function') throw new Error('契约未齐');
} catch (e) {
  console.error('❌ 红（正确的红）—— SPEC-6.63 依赖未齐');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

const dbPath = path.join(yard, 'knowledge.db');

(async () => {
  await store.init(dbPath);
  const db = store._getDb();

  // ---------- AC-1：distill 产物写 fingerprint ----------
  const bodyZ = '蒸馏正文 Z——线 2 验 fingerprint 列。\n\n第二段。';
  store.insertEntity({ id: 'raw-z', name: 'Z', type: 'Concept', content: bodyZ, tags: '["a:7"]', status: 'pending-distillation', confidence: 0.5 });
  store._persist();
  await distillStep(store, {});
  const wikiZ = store.getEntity('wiki-z');
  ac('AC-1 distill 产物 fingerprint = fingerprint(content)',
    wikiZ != null && wikiZ.fingerprint === identity.fingerprint(bodyZ),
    JSON.stringify({ fp: wikiZ && wikiZ.fingerprint, want: identity.fingerprint(bodyZ) }));

  // ---------- AC-2：一次性修复指纹缺口（同 ALTER 块口径，唔每次开库写盘） ----------
  store.insertEntity({ id: 'raw-nullfp', name: 'N', type: 'Concept', content: '回填补齐正文', tags: '[]', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET fingerprint = NULL WHERE id = 'raw-nullfp'");
  store.insertEntity({ id: 'raw-emptyfp', name: 'E', type: 'Concept', content: '空指纹补齐正文', tags: '[]', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET fingerprint = '' WHERE id = 'raw-emptyfp'");
  store._persist();
  // 一次性修复（migrate 口径）：逐行补齐，唔在开库路径
  const _miss = db.prepare("SELECT id, content FROM entities WHERE fingerprint IS NULL OR fingerprint = ''");
  const _fix = db.prepare('UPDATE entities SET fingerprint = ? WHERE id = ?');
  const _mr = [];
  { const s = _miss; while (s.step()) _mr.push(s.getAsObject()); s.free(); }
  for (const r of _mr) _fix.run([identity.fingerprint(r.content), r.id]);
  _fix.free();
  const readFp = (id) => { const s = db.prepare('SELECT fingerprint FROM entities WHERE id = ?'); s.bind([id]); s.step(); const r = s.getAsObject(); s.free(); return r ? r.fingerprint : undefined; };
  ac('AC-2 一次性修复指纹缺口（NULL 与空串）',
    readFp('raw-nullfp') === identity.fingerprint('回填补齐正文') &&
    readFp('raw-emptyfp') === identity.fingerprint('空指纹补齐正文'),
    JSON.stringify({ null: readFp('raw-nullfp'), empty: readFp('raw-emptyfp') }));

  // ---------- AC-3：compile 产物写 fingerprint ----------
  const rawDir = path.join(yard, 'src');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 't1.md'),
    '---\nid: todo-t1\nname: T1\ntype: Concept\ntags: ["a:7"]\nstatus: active\nconfidence: 0.5\n---\n\n编译产物正文 T1。');
  const cstat = await compile(rawDir, store, {});
  const t1 = store.getEntity('todo-t1');
  ac('AC-3 compile 产物 fingerprint = fingerprint(content)',
    cstat.created >= 1 && t1 != null && t1.fingerprint === identity.fingerprint('编译产物正文 T1。'),
    JSON.stringify({ created: cstat.created, fp: t1 && t1.fingerprint }));

  // ---------- AC-4：import 镜像写 fingerprint ----------
  store.insertEntity({ id: 'raw-imp', name: 'IMP', type: 'Concept', content: '导入镜像正文 IMP', tags: '[]', status: 'active', confidence: 0.6 });
  store._persist();
  const istat = await importStep(store, {});
  const wikiImp = store.getEntity('wiki-imp');
  ac('AC-4 import 镜像 fingerprint = fingerprint(content)',
    istat.mirrored >= 1 && wikiImp != null && wikiImp.fingerprint === identity.fingerprint('导入镜像正文 IMP'),
    JSON.stringify({ mirrored: istat.mirrored, fp: wikiImp && wikiImp.fingerprint }));

  console.log(`\n----- ${pass} 绿 / ${fail} 红 -----`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 崩（可能 setup 而非锁定）—— ' + e.message.split('\n')[0]); process.exit(2); });
