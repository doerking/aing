'use strict';
// M1 任务 1.7 failing test —— 锁 SPEC-1.7 link-sync 双链边一致六条 AC
// 运行（本仓根）：node test/test-1.7-link-sync.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-linksync-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let linkSyncStep, store;
try {
  linkSyncStep = require('../src/link-sync.js').linkSyncStep;
  store = require('../src/knowledge-store.js');
  if (typeof linkSyncStep !== 'function') throw new Error('linkSyncStep 未导出');
} catch (e) {
  console.error('❌ 红（正确的红）—— src/link-sync.js 未实现 SPEC-1.7');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}
const rows = (sql) => { const s = store._getDb().prepare(sql); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const ins = (id, content) => store.insertEntity({ id, name: id, type: 'Concept', content: content || ('c-' + id), status: 'active', confidence: 0.6 });
  // 成对端点（raw + 镜像）
  ins('raw-a'); ins('wiki-a'); ins('raw-b'); ins('wiki-b');
  // 只有 raw，无镜像
  ins('raw-orphan');
  const db = store._getDb();
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00' WHERE id IN ('raw-a','wiki-a','raw-b','wiki-b','raw-orphan')");

  // 源边：合法 raw→raw；退役 raw→raw；缺镜像 raw→raw
  store.insertLink({ source_id: 'raw-a', target_id: 'raw-b', relation: 'derives', confidence: 0.7 });
  store.insertLink({ source_id: 'raw-a', target_id: 'raw-orphan', relation: 'mentions', confidence: 0.4 });
  store.insertLink({ source_id: 'raw-b', target_id: 'raw-a', relation: 'retired-edge', confidence: 0.5 });
  db.run("UPDATE links SET strength=7 WHERE source_id='raw-a' AND target_id='raw-b'");
  db.run("UPDATE links SET invalid_at='2026-01-01 00:00:00' WHERE source_id='raw-b' AND target_id='raw-a'");
  store._persist();

  const r1 = await linkSyncStep(store, {});
  const mirror = rows("SELECT * FROM links WHERE source_id='wiki-a' AND target_id='wiki-b'");
  ac('AC-1 raw 内部边镜像（relation/strength/confidence 一致）',
    mirror.length === 1 && mirror[0].relation === 'derives' && Number(mirror[0].strength) === 7 && Number(mirror[0].confidence) === 0.7,
    JSON.stringify(mirror[0] || null));

  ac('AC-2 缺镜像不建幽灵边 + 计数',
    rows("SELECT * FROM links WHERE target_id='wiki-orphan'").length === 0 && Number(r1.skippedNoMirror) >= 1,
    'skippedNoMirror=' + r1.skippedNoMirror);

  ac('AC-3 跨链/wiki 边不动',
    rows("SELECT * FROM links WHERE source_id LIKE 'wiki-%' AND target_id NOT LIKE 'wiki-%'").length === 0);

  ac('AC-4 退役边不同步',
    rows("SELECT * FROM links WHERE source_id='wiki-b' AND target_id='wiki-a'").length === 0);

  const n = rows('SELECT COUNT(*) AS n FROM links')[0].n;
  const r2 = await linkSyncStep(store, {});
  ac('AC-5 幂等', r2.synced === 0 && rows('SELECT COUNT(*) AS n FROM links')[0].n === n, JSON.stringify(r2));

  const la = rows("SELECT id, last_access FROM entities").map(r => String(r.last_access));
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'link-sync.js'), 'utf8');
  ac('AC-6 无物理删 + last_access 不变',
    !/DELETE\s+FROM/i.test(src) && la.every(v => v === '2021-06-01 00:00:00'),
    JSON.stringify(la));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
