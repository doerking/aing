'use strict';
// 自查投影面 failing test —— 锁 export-view 五条硬约束（幂等/只读/数字真/grep/fail-open）
// 口径：不依赖具体库快照数字（87/57 那种），判「_health 读数 == 直接查库读数」同源对账。
const fs = require('fs'); const os = require('os'); const path = require('path');
const crypto = require('crypto');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-exportview-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

process.env.AING_ALLOWED_ACTORS = 'hana'; // 写面默认拒写，测试档显式配
const store = require('../src/knowledge-store.js');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const dirHash = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).replace(/\\/g, '/') + '=' + sha(fs.readFileSync(p)));
    }
  };
  walk(dir);
  return out.join('\n');
};

(async () => {
  const EV = require('../src/export-view.js');
  if (typeof EV.exportView !== 'function') { console.error('❌ 红（正确的红）—— export-view 未实现'); process.exit(1); }

  // 造受控小库：2 实体 wiki-X / raw-X 自指一对（1 条 SELF 边），1 个 type-null，1 个孤儿
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  const db = store._getDb();
  db.run(`INSERT INTO entities (id,name,type,content,tags,status,tolaria_strength,created_at,updated_at)
    VALUES ('wiki-X','X','Concept','wiki 正文','["t1"]','active',5,'2026-01-01 00:00:00','2026-01-02 00:00:00')`);
  db.run(`INSERT INTO entities (id,name,type,content,tags,status,tolaria_strength,created_at,updated_at)
    VALUES ('raw-X','X',NULL,'raw 正文',NULL,'active',5,'2026-01-01 00:00:00','2026-01-02 00:00:00')`);
  db.run(`INSERT INTO entities (id,name,type,content,tags,status,tolaria_strength,created_at,updated_at)
    VALUES ('orphan-Y','Y','Concept','孤儿',NULL,'active',5,'2026-01-01 00:00:00','2026-01-02 00:00:00')`);
  db.run(`INSERT INTO links (source_id,target_id,relation,strength,created_at)
    VALUES ('wiki-X','raw-X','hydrogen-bond',5,'2026-01-03 00:00:00')`);
  store._persist();

  const viewDir = path.join(yard, 'view');

  // ── 判据4 只读：导出前后 DB sha256 不变 ──
  const dbBefore = sha(fs.readFileSync(dbPath));
  const r1 = await EV.exportView(store, { outDir: viewDir, all: true });
  const dbAfter1 = sha(fs.readFileSync(dbPath));
  ac('判据4 不写库：导出前后 DB sha256 不变', dbBefore === dbAfter1 && r1.ok === true, 'before=' + dbBefore.slice(0, 8) + ' after=' + dbAfter1.slice(0, 8) + ' ok=' + r1.ok);

  // ── 判据1 幂等：连导两次 dir hash 一致 ──
  const h1 = dirHash(viewDir);
  const r2 = await EV.exportView(store, { outDir: viewDir, all: true });
  const h2 = dirHash(viewDir);
  ac('判据1 幂等：连导两次全文件 hash 一致', h1 === h2 && r2.ok === true, 'files=' + (r2.files || []).length);

  // ── 判据2 数字真：_health 自指 / type-null 与直接查库一致 ──
  const health = fs.readFileSync(path.join(viewDir, '_health.md'), 'utf8');
  // 库真值：实体 3、边 1、自指 1（wiki-X→raw-X 去前缀同名）、type-null 1（raw-X）
  const hl = health.split('\n'); // 逐行锚定；数字后紧跟全角括号（U+FF08），唔系空格
  ac('判据2 数字真：实体/边/自指/type-null 与库一致',
    /^实体 3\uFF08/.test(hl[0]) && /^边 1\uFF08/.test(hl[1]) && /自指 1 = 100%/.test(hl[1]) && /^type null 1 = 33\.3%/.test(hl[2]),
    hl.slice(0, 4).join(' | '));

  // ── 判据3 可 grep：SELF 在文件里可数（这里 1 条）──
  let selfHits = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) selfHits += (fs.readFileSync(p, 'utf8').match(/· SELF/g) || []).length; } };
  walk(viewDir);
  ac('判据3 可 grep：SELF 标记可数（受控库=1）', selfHits === 1, 'hits=' + selfHits);

  // ── 同源自指：flags 带 dup-of、边带 SELF ──
  const wikiFile = fs.readFileSync(path.join(viewDir, 'entities', 'wiki-X.md'), 'utf8');
  ac('自指边打 SELF + flags dup-of',
    /· SELF/.test(wikiFile) && /dup-of:raw-X/.test(wikiFile),
    wikiFile.split('\n').filter(l => /SELF|dup-of/.test(l)).join(' | '));
  // type-null：flags 带 type-null、frontmatter type: null
  const rawFile = fs.readFileSync(path.join(viewDir, 'entities', 'raw-X.md'), 'utf8');
  ac('type null：frontmatter 写字面 null + flags type-null',
    /^type: null$/m.test(rawFile) && /type-null/.test(rawFile),
    rawFile.split('\n').filter(l => /^type:|type-null/.test(l)).join(' | '));
  // 孤儿进 _anomalies
  const anom = fs.readFileSync(path.join(viewDir, '_anomalies.md'), 'utf8');
  ac('孤儿（无任何边）进 _anomalies 且可 grep', /## 无边\uFF08孤儿\uFF09\uFF08共 1\uFF09/.test(anom) && /orphan-Y/.test(anom),
    anom.split('\n').filter(l => /孤儿|orphan-Y/.test(l)).join(' | '));

  // ── 判据5 fail-open：view 不可写时 exportView 返回 ok:false（orchestrate 侧另测）──
  // Windows admin 对 chmod 只读目录仍有写权，改用「无效 outDir」（指向一个文件的内部）触发导出失败
  const blockFile = path.join(yard, 'blockfile');
  fs.writeFileSync(blockFile, 'x');
  const badOut = path.join(blockFile, 'view'); // blockFile 是文件，其下建不了目录 → 写失败
  let roOk = null, roErr = null;
  try { const rr = await EV.exportView(store, { outDir: badOut, all: true }); roOk = rr.ok; roErr = rr.error; }
  catch (e) { roErr = 'threw:' + e.message; }
  ac('判据5 fail-open：view 不可写时 exportView ok:false（不抛穿）', roOk === false, 'ok=' + roOk + ' err=' + roErr);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
