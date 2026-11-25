'use strict';
// M7 任务 7.1f failing test —— 锁 SPEC-7.1 AC-7（发芽度报告）
// 口径：sprout(kw) = 经 strength≥7 的三类候选关系边可触达实体数（泛 related 不算）；
//       variants(kw) = 该词派生的其它写法数；知识链长度看 sprout 分布，不看实体总数。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-sproutdeg-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let SR = null;
try { SR = require('../src/sprout-report.js'); } catch (_) { SR = null; }

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, tags, content, type = 'Concept') =>
    store.insertEntity({ id, name: id, type, content, tags: JSON.stringify(tags), status: 'active' });

  put('e1', ['三分编组:9'], '三分编组攻防学说草案');
  put('e2', [], '三分编组派工节奏');
  put('n1', [], '单元编队');
  put('n2', [], '班长分工');
  put('n3', [], '无关噪声甲');
  put('n4', [], '无关噪声乙');
  put('solo', ['孤词:5'], '孤。');
  put('tw', ['意識神經:8'], '意識神經是记忆层的底座');
  store.insertLink({ source_id: 'e1', target_id: 'n1', relation: 'sprout-candidate', confidence: 0.9 });
  store.insertLink({ source_id: 'e1', target_id: 'n2', relation: 'pollinate-candidate', confidence: 0.9 });
  store.insertLink({ source_id: 'e1', target_id: 'n3', relation: 'sprout-candidate', confidence: 0.5 });
  store.insertLink({ source_id: 'e1', target_id: 'n4', relation: 'related', confidence: 0.9 });
  const db = store._getDb();
  db.run("UPDATE links SET strength=8 WHERE target_id='n1'");
  db.run("UPDATE links SET strength=7 WHERE target_id='n2'");
  db.run("UPDATE links SET strength=6 WHERE target_id='n3'");   // 候选关系但不够强 → 不计
  db.run("UPDATE links SET strength=9 WHERE target_id='n4'");   // 够强但不是候选关系 → 不计
  store._persist();

  if (!SR) {
    ['AC-7a sprout 只数强候选边', 'AC-7b variants 数派生写法', 'AC-7c 死胡同与分布'].forEach((n) => ac(n, false, 'src/sprout-report.js 未实现'));
    console.log(`\n----- 7.1f pass=${pass} fail=${fail} -----`);
    process.exit(1);
  }

  const rep = SR.report(store, { keywords: ['三分编组', '孤词', '意識神經'] });
  const by = Object.fromEntries((rep.keywords || []).map((k) => [k.kw, k]));

  ac('AC-7a sprout 只数强候选边',
    by['三分编组'] && by['三分编组'].sprout === 2 &&
    (by['三分编组'].reached || []).sort().join(',') === 'n1,n2',
    JSON.stringify(by['三分编组']));

  ac('AC-7b variants 数派生写法',
    by['意識神經'] && by['意識神經'].variants >= 1 &&
    (by['意識神經'].forms || []).some((f) => f.includes('意识神经')) &&
    by['三分编组'].variants === 0,
    JSON.stringify({ tw: by['意識神經'] && by['意識神經'].forms, s: by['三分编组'].variants }));

  ac('AC-7c 死胡同与分布',
    rep.distribution && rep.distribution.dead === 2 && rep.distribution.n === 3 &&
    by['孤词'].sprout === 0 && typeof rep.distribution.median === 'number',
    JSON.stringify(rep.distribution));

  // AC-7d 提升后必须留在发芽面内（旧口径升 gen@6，等于把候选边踢出去）
  let P = null;
  try { P = require('../src/field-promote.js'); } catch (_) { P = null; }
  if (!P) {
    ac('AC-7d 提升后仍进发芽面', false, 'field-promote 未实现');
  } else {
    store.insertLink({ source_id: 'e2', target_id: 'n4', relation: 'sprout-candidate', confidence: 0.8 });
    db.run(`UPDATE links SET strength=5, evidence='["keyword","kespi"]' WHERE source_id='e2' AND target_id='n4'`);
    // 守恒闸（SPEC-2.10 边层口径）：退边要与产边同量，否则 growth-only 会拒提升
    for (const [s2, t2] of [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n1'], ['n1', 'n4']]) {
      store.insertLink({ source_id: s2, target_id: t2, relation: 'related', confidence: 0.3 });
    }
    db.run("UPDATE links SET invalid_at=datetime('now') WHERE target_id IN ('n2','n3','n1','n4') AND relation='related'");
    await P.promoteEdges(store, { cycleId: 'c-7d' });
    const row = db.prepare("SELECT relation, strength FROM links WHERE source_id='e2' AND target_id='n4'");
    row.step(); const ce = row.getAsObject(); row.free();
    const rep2 = SR.report(store, { keywords: ['三分编组'] });
    const k = (rep2.keywords || []).find((x) => x.kw === '三分编组');
    ac('AC-7d 提升后仍进发芽面',
      ce.relation === 'hydrogen-bond' && Number(ce.strength) >= 7 && !!k && k.reached.includes('n4'),
      JSON.stringify({ ce, reached: k && k.reached }));
  }

  // AC-7e 证据是对象形（sprout/pollinate 真实写法 [{kind,detail}]）也要能提升
  store.insertLink({ source_id: 'e2', target_id: 'n1', relation: 'sprout-candidate', confidence: 0.8 });
  db.run(`UPDATE links SET strength=6, invalid_at=NULL, evidence='[{"kind":"tag","detail":["x"]},{"kind":"kw","detail":["y"]}]' WHERE source_id='e2' AND target_id='n1'`);
  await P.promoteEdges(store, { cycleId: 'c-7e' });
  const row2 = db.prepare("SELECT relation, strength FROM links WHERE source_id='e2' AND target_id='n1'");
  row2.step(); const ce2 = row2.getAsObject(); row2.free();
  ac('AC-7e 对象形证据可提升', ce2.relation === 'hydrogen-bond' && Number(ce2.strength) >= 7, JSON.stringify(ce2));

  console.log(`\n----- 7.1f pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });

