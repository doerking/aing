'use strict';
// M6 任务 6.51 failing test —— kc 读法对齐（SPEC-6.51）
// 要修的病：import 先占 raw→wiki 的 pair 边（hydrogen-bond），distill 的 derived 永不落地，
// 真库 0 条 derived → kc 322/322 恒 0.5，kc<0.40 永不触发。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kc-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const kespi = require('../src/kespi.js');
const rows = (sql) => { const s = store._getDb().prepare(sql); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, strand) => store.insertEntity({ id, name: id, type: 'Concept', content: '正文 ' + id, tags: '["t:7"]', status: 'active', confidence: 0.6, strand });

  // 样本
  ins('raw-full', 'past'); ins('wiki-full', 'future');      // 同世 2/2
  ins('raw-half', 'past'); ins('wiki-half', 'future');      // 同世 1/2
  ins('raw-orphan', 'past');                                // 无镜像
  ins('concept-a', 'past'); ins('wiki-b', 'future');        // 非同源
  ins('raw-x', 'past'); ins('wiki-y', 'future');            // 非同源（raw 前缀但镜像名不对）
  ins('raw-d', 'past'); ins('wiki-d', 'future');            // 显式 derived
  ins('raw-kd', 'past');                                    // kd 对照

  // 边：镜像 bond（strength 5 → 不进 kd）
  store.insertLink({ source_id: 'raw-full', target_id: 'wiki-full', relation: 'hydrogen-bond', confidence: 0.8, strength: 5 });
  store.insertLink({ source_id: 'raw-half', target_id: 'wiki-half', relation: 'hydrogen-bond', confidence: 0.8, strength: 5 });
  store.insertLink({ source_id: 'concept-a', target_id: 'wiki-b', relation: 'hydrogen-bond', confidence: 0.8, strength: 5 });
  store.insertLink({ source_id: 'raw-x', target_id: 'wiki-y', relation: 'hydrogen-bond', confidence: 0.8, strength: 5 });
  store.insertLink({ source_id: 'raw-d', target_id: 'wiki-d', relation: 'derived', confidence: 0.8, strength: 5 });
  // kd 对照：raw-kd 出向 3 条强边
  for (const t of ['raw-full', 'concept-a', 'raw-half']) store.insertLink({ source_id: 'raw-kd', target_id: t, relation: 'related', confidence: 0.9, strength: 8 });

  // 轮次 c1/c2 executed
  for (const id of ['c1', 'c2']) db.run(`INSERT INTO meko_cycles (id, cycle_type, executed_at, status) VALUES ('${id}', 'test', CURRENT_TIMESTAMP, 'executed')`);
  const er = (cid, eid) => db.run('INSERT INTO entity_rounds (entity_id, cycle_id, alive, recorded_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)', [eid, cid]);
  // raw-full + wiki-full：两轮同世
  er('c1', 'raw-full'); er('c2', 'raw-full'); er('c1', 'wiki-full'); er('c2', 'wiki-full');
  // raw-half + wiki-half：只有 c1 同世
  er('c1', 'raw-half'); er('c2', 'raw-half'); er('c1', 'wiki-half');
  // 其余少量在场，保证轮子有账
  er('c1', 'raw-orphan'); er('c1', 'raw-d'); er('c1', 'wiki-d');

  await kespi.kespiStep(store, {});
  const row = (id) => rows(`SELECT * FROM kespi_scores WHERE entity_id='${id}'`)[0];

  const kcFull = Number(row('raw-full').kc);
  ac('AC-1 镜像边计入派生：同世 2/2 → kc=1', kcFull === 1, JSON.stringify({ kcFull }));

  const kcHalf = Number(row('raw-half').kc);
  ac('AC-2 同世 1/2 → kc=0.5（仍走同世占比）', kcHalf === 0.5, JSON.stringify({ kcHalf }));

  const kcConcept = Number(row('concept-a').kc);
  ac('AC-3 源非 raw → 不计，kc 中性 0.5', kcConcept === 0.5, JSON.stringify({ kcConcept }));

  const kcXy = Number(row('raw-x').kc);
  ac('AC-4 raw-x→wiki-y 非同源 → 不计，kc 0.5', kcXy === 0.5, JSON.stringify({ kcXy }));

  const kcD = Number(row('raw-d').kc);
  ac('AC-5 显式 derived 边仍计入（同世 1/2 → 0.5）', kcD === 0.5, JSON.stringify({ kcD }));

  const rkd = row('raw-kd'), rfull = row('raw-full');
  ac('AC-6 其他四维不受影响：kd=1（3 条强边）、kq/ka/kr 不变',
    Number(rkd.kd) === 1 && typeof rfull.kq === 'number' && typeof rfull.ka === 'number' && typeof rfull.kr === 'number' &&
    Math.abs(Number(rfull.overall) - (Number(rfull.kq) + Number(rfull.ka) + Number(rfull.kd) + 1 + Number(rfull.kr)) / 5) < 1e-3,
    JSON.stringify({ kd: rkd.kd, rfull }));

  console.log(`\n----- 6.51 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
