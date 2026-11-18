'use strict';
// M6 任务 6.30 failing test —— 六段覆盖率进 kq（缺段要掉分）
// 要修的病：只要正文够长，只写一段的叙事与六段齐全的叙事拿一样的分——
// 外部件没有动力写全六段。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cov-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');

const mdWith = (keys, body = '甲'.repeat(800)) => keys.map(k => `### ${k}\n${body}`).join('\n\n');
const narrative = (markdown) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: [], stats: { bodyChars: markdown.length }, calibrations: []
});

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, content]);
  const SIX = N.SECTIONS;

  put('n-six', narrative(mdWith(SIX)));
  put('n-three', narrative(mdWith(SIX.slice(0, 3))));
  put('n-none', narrative('没有标题的正文' + '甲'.repeat(800)));
  put('p-plain', '# 会话\n\n' + '甲'.repeat(800) + '甲'.repeat(800));
  store._persist();
  await K.kespiStep(store, {});
  const sc = (id) => { const s = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? Number(r.kq) : null; };

  // AC-1 覆盖率纯函数：六段=1、三段=0.5、无标题=0
  const cov = K.narrativeCoverage ? [K.narrativeCoverage(mdWith(SIX)), K.narrativeCoverage(mdWith(SIX.slice(0, 3))), K.narrativeCoverage('无标题')] : [];
  ac('AC-1 覆盖率计算', JSON.stringify(cov) === JSON.stringify([1, 0.5, 0]), JSON.stringify(cov));

  // AC-2 六段齐不惩罚：与同正文纯文本同分
  ac('AC-2 六段齐与纯文本同分', Math.abs(sc('n-six') - sc('p-plain')) <= 0.06, JSON.stringify({ six: sc('n-six'), plain: sc('p-plain') }));

  // AC-3 三段掉分：≈ 六段的 0.8
  const ratio3 = sc('n-three') / sc('n-six');
  ac('AC-3 三段按覆盖率掉分（0.75~0.85）', ratio3 >= 0.75 && ratio3 <= 0.85, JSON.stringify({ ratio: Number(ratio3.toFixed(3)), three: sc('n-three'), six: sc('n-six') }));

  // AC-4 零段压在覆盖率下限（factor 层验，kq 因长度也归零只做排序）
  const noSec = narrative('没有标题的正文' + '甲'.repeat(800));
  const f0 = K.narrativeFactor ? K.narrativeFactor(noSec) : null;
  ac('AC-4 无段压到覆盖率下限（×0.6）', f0 != null && Math.abs(f0 - 0.6) < 1e-9 && sc('n-none') < sc('n-six'),
    JSON.stringify({ factor: f0, none: sc('n-none'), six: sc('n-six') }));

  // AC-5 三源实体零影响（回归）
  ac('AC-5 非叙事实体不受影响', Math.abs(sc('p-plain') - 0.675) <= 0.02, JSON.stringify({ plain: sc('p-plain') }));

  // AC-6 覆盖率是纯函数
  const a = K.narrativeCoverage ? K.narrativeCoverage(mdWith(SIX)) : null;
  const b = K.narrativeCoverage ? K.narrativeCoverage(mdWith(SIX)) : null;
  ac('AC-6 覆盖率纯函数', a === b && a === 1, JSON.stringify({ a, b }));

  console.log(`\n----- 6.30 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
