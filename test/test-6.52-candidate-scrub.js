'use strict';
// M6 任务 6.52 failing test —— 旧候选边清账（SPEC-6.52）
// 要修的病：evidence 为 NULL 的旧候选边永远达不到提升门槛、也永不退役，卡在发芽面占位。
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cand-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let C = null;
try { C = require('../src/candidate-scrub.js'); } catch (_) { C = null; }
const store = require('../src/knowledge-store.js');
const rows = (sql, binds = []) => { try { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; } catch (_) { return []; } };
const run = (apply) => (C && typeof C.scrubCandidates === 'function' ? C.scrubCandidates(store, { apply }) : null);

(async () => {
  const dbp = path.join(yard, 'k.db');
  await store.init(dbp);
  const db = store._getDb();
  for (const id of ['a', 'b', 'c', 'd', 'e']) store.insertEntity({ id, name: id, type: 'Concept', content: '正文 ' + id, tags: '["t:7"]' });
  const mk = (s, t, rel, ev) => db.run('INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence) VALUES (?,?,?,0.5,4,?)', [s, t, rel, ev]);
  mk('a', 'b', 'sprout-candidate', null);             // 空证据 → 退役
  mk('b', 'c', 'pollinate-candidate', '');            // 空串 → 退役
  mk('c', 'd', 'sprout-candidate', '[]');             // 空数组 → 退役
  mk('d', 'e', 'pollinate-candidate', '[{"kind":"tag"}]');       // 1 类 → 不动
  mk('e', 'a', 'sprout-candidate', '[{"kind":"tag"},{"kind":"sentence"}]'); // 2 类 → 不动
  mk('a', 'c', 'related', null);                      // 非候选 → 不动
  mk('a', 'd', 'hydrogen-bond', null);                // 非候选 → 不动

  // ── AC-1 干跑 ──
  const d1 = run(false);
  const stillOpen = rows("SELECT COUNT(*) c FROM links WHERE invalid_at IS NULL AND relation LIKE '%-candidate'")[0].c;
  ac('AC-1 干跑：报 3 条、库内 invalid_at 仍空',
    !!d1 && d1.wouldRetire === 3 && stillOpen === 5 && Array.isArray(d1.retired),
    JSON.stringify({ d1, stillOpen }));

  // ── AC-2 apply ──
  const a1 = run(true);
  const retired = rows("SELECT * FROM links WHERE invalid_at IS NOT NULL AND relation LIKE '%-candidate'");
  const rowCount = rows("SELECT COUNT(*) c FROM links")[0].c;
  ac('AC-2 apply：3 条退役、原因登记、行未删',
    !!a1 && a1.wouldRetire === 3 && retired.length === 3 &&
    retired.every(r => r.invalid_reason === 'legacy-no-evidence') && rowCount === 7,
    JSON.stringify({ a1, n: retired.length, reasons: retired.map(r => r.invalid_reason), rowCount }));

  // ── AC-3 幂等 ──
  const a2 = run(true);
  ac('AC-3 幂等：二跑 wouldRetire=0', !!a2 && a2.wouldRetire === 0, JSON.stringify(a2));

  // ── AC-4 有证据不动 ──
  const kept = rows("SELECT source_id,target_id,evidence FROM links WHERE invalid_at IS NULL AND relation LIKE '%-candidate'");
  ac('AC-4 有证据的候选边（1 类/2 类）不动',
    kept.length === 2 && kept.every(k => k.evidence && k.evidence.length > 2),
    JSON.stringify(kept));

  // ── AC-5 非候选不动 ──
  const other = rows("SELECT relation, invalid_at FROM links WHERE relation IN ('related','hydrogen-bond')");
  ac('AC-5 非候选关系不动', other.length === 2 && other.every(o => o.invalid_at == null), JSON.stringify(other));

  // ── AC-6 CLI ──
  const cli = path.join(__dirname, '..', 'tools', 'candidate-scrub.js');
  const dbp2 = path.join(yard, 'cli.db');
  await store.init(dbp2);
  const db2 = store._getDb();
  for (const id of ['x', 'y']) store.insertEntity({ id, name: id, type: 'Concept', content: '正文 ' + id, tags: '["t:7"]' });
  db2.run("INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence) VALUES ('x','y','sprout-candidate',0.5,4,NULL)");
  store._persist();
  const ok = spawnSync(process.execPath, [cli, '--db', dbp2, '--json'], { encoding: 'utf8', timeout: 60000 });
  let j = null; try { j = JSON.parse(ok.stdout); } catch (_) { j = null; }
  const real = path.join(__dirname, '..', 'data', 'knowledge.db');
  const bad = spawnSync(process.execPath, [cli, '--db', real, '--json'], { encoding: 'utf8', timeout: 60000 });
  ac('AC-6 CLI：副本干跑 exit 0 JSON 可解析；真库 exit 3',
    ok.status === 0 && !!j && j.wouldRetire === 1 && bad.status === 3,
    JSON.stringify({ ok: ok.status, j: j && j.wouldRetire, bad: bad.status, err: (ok.stderr || '').slice(0, 160) }));

  console.log(`\n----- 6.52 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
