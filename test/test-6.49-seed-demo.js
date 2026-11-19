'use strict';
// M6 任务 6.49 failing test —— 演示语料播种与拆除（SPEC-6.49）
// 要修的病：新部署库里空空如也，给人看没东西；旧院 seed-demo / unseed-demo 在 v2 没有对应物。
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-demo-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let D = null;
try { D = require('../src/demo-seed.js'); } catch (_) { D = null; }
const store = require('../src/knowledge-store.js');
const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };

function makeWs(name) {
  const ws = path.join(yard, name);
  for (const d of ['raw', 'raw/inbox', 'data', 'archive']) fs.mkdirSync(path.join(ws, d), { recursive: true });
  return ws;
}

(async () => {
  const ws = makeWs('ws');
  const dbp = path.join(ws, 'data', 'knowledge.db');
  await store.init(dbp);

  // ── AC-1 播种 ──
  const s1 = D && typeof D.seedDemo === 'function' ? await D.seedDemo(store, { root: ws }) : null;
  const marker1 = (() => { try { return JSON.parse(fs.readFileSync(path.join(ws, 'data', 'demo-seed.json'), 'utf8')); } catch (_) { return null; } })();
  ac('AC-1 播种：原稿在位、实体入库、标记档列全 id',
    !!s1 && s1.ok === true && fs.existsSync(path.join(ws, 'raw', 'demo')) &&
    Array.isArray(s1.ids) && s1.ids.length >= 4 &&
    s1.ids.every(id => store.getEntity(id) != null) &&
    !!marker1 && s1.ids.every(id => marker1.entities && marker1.entities[id]),
    JSON.stringify({ s1, marker: marker1 && Object.keys(marker1.entities || {}) }));

  // ── AC-2 幂等播种 ──
  const n2 = rows('SELECT COUNT(*) c FROM entities')[0].c;
  const s2 = D ? await D.seedDemo(store, { root: ws }) : null;
  const n2b = rows('SELECT COUNT(*) c FROM entities')[0].c;
  ac('AC-2 幂等播种：不新增实体', !!s2 && s2.ok === true && s2.created === 0 && n2 === n2b, JSON.stringify({ s2, n2, n2b }));

  // ── AC-6 只拆标记档内 id：手工插一条带 demo 标签的实体 ──
  store.insertEntity({ id: 'demo-outsider', name: '外人', type: 'Concept', content: '不是本次播种的。', tags: '["demo"]' });

  // ── AC-4 改过的档不拆 ──
  const ids = (s1 && Array.isArray(s1.ids) && s1.ids.length) ? s1.ids : ['demo-concept'];
  const victim = ids[0];
  store._getDb().run('UPDATE entities SET content = ? WHERE id = ?', ['用户亲手改过这一条。', victim]);
  store._persist();

  // ── AC-3 / AC-8 拆除 ──
  const u1 = D && typeof D.unseedDemo === 'function' ? await D.unseedDemo(store, { root: ws }) : null;
  const left = ids.filter(id => id !== victim).map(id => store.getEntity(id));
  const vectors = rows('SELECT COUNT(*) c FROM entity_vectors WHERE entity_id LIKE ?', ['demo-%'])[0].c;
  const kespi = rows('SELECT COUNT(*) c FROM kespi_scores WHERE entity_id LIKE ?', ['demo-%'])[0].c;
  const links = rows("SELECT COUNT(*) c FROM links WHERE source_id LIKE 'demo-%' OR target_id LIKE 'demo-%'")[0].c;
  ac('AC-3 拆除：实体/边/向量/分数清干净、原稿与标记档已删',
    !!u1 && u1.ok === true && left.every(x => x == null) && vectors === 0 && kespi === 0 && links === 0 &&
    !fs.existsSync(path.join(ws, 'raw', 'demo')) && !fs.existsSync(path.join(ws, 'data', 'demo-seed.json')),
    JSON.stringify({ u1, left: left.map(x => !!x), vectors, kespi, links }));

  ac('AC-4 改过的档不拆且记 modified',
    !!u1 && Array.isArray(u1.skipped) && u1.skipped.some(s => s.id === victim && s.why === 'modified') &&
    store.getEntity(victim) != null,
    JSON.stringify(u1 && u1.skipped));

  const tombs = rows("SELECT id, archive_ref FROM tombstones WHERE archive_ref = 'demo-seed'");
  ac('AC-8 拆除留墓碑（archive_ref=demo-seed）',
    tombs.length > 0 && tombs.length === ids.filter(id => id !== victim).length &&
    ids.filter(id => id !== victim).every(id => tombs.some(t => t.id === id)),
    JSON.stringify(tombs));

  ac('AC-6 只拆标记档内 id：带 demo 标签的外人仍在',
    !!u1 && store.getEntity('demo-outsider') != null, JSON.stringify(!!store.getEntity('demo-outsider')));

  // ── AC-5 拆两次 ──
  const u2 = D ? await D.unseedDemo(store, { root: ws }) : null;
  ac('AC-5 拆两次：no-marker 且 ok 不抛', !!u2 && u2.ok === true && u2.reason === 'no-marker', JSON.stringify(u2));

  // ── AC-7 CLI ──
  const ws2 = makeWs('cli');
  const seedCli = path.join(__dirname, '..', 'tools', 'seed-demo.js');
  const unseedCli = path.join(__dirname, '..', 'tools', 'unseed-demo.js');
  const c1 = spawnSync(process.execPath, [seedCli, '--root', ws2, '--json'], { encoding: 'utf8', timeout: 60000 });
  const c2 = spawnSync(process.execPath, [unseedCli, '--root', ws2, '--json'], { encoding: 'utf8', timeout: 60000 });
  const c3 = spawnSync(process.execPath, [seedCli, '--json'], { encoding: 'utf8', timeout: 60000 });
  let j1 = null; try { j1 = JSON.parse(c1.stdout); } catch (_) {}
  let j2 = null; try { j2 = JSON.parse(c2.stdout); } catch (_) {}
  ac('AC-7 CLI：seed/unseed exit 0 且 JSON 可解析；无 --root exit 2',
    c1.status === 0 && !!j1 && j1.ok === true && c2.status === 0 && !!j2 && j2.ok === true && c3.status === 2,
    JSON.stringify({ c1: c1.status, c2: c2.status, c3: c3.status, err: (c2.stderr || '').slice(0, 200) }));

  console.log(`\n----- 6.49 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
