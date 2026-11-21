'use strict';
// SPEC-3.4 扩展 failing test —— KESPI 消费者阈值单源（2026-11-21 吸收 Addy「带数字的约束」）
// 收前：0.55/0.45/0.45/0.60 散落 field-promote / evolution-team / self-optimize 三处硬编码。
// 收后：集中进 config-runtime DEFAULTS.kespi，四组件经 getKnob 取值，库内 config 表可覆盖。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kespi-knob-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let C, store, fp;
try {
  C = require('../src/config-runtime.js');
  store = require('../src/knowledge-store.js');
  fp = require('../src/field-promote.js');
  if (typeof C.getKnob !== 'function') throw new Error('getKnob 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— KESPI 阈值未入 config-runtime 单源'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const PATHS = ['kespi.promoteMin', 'kespi.geneMin', 'kespi.redZone', 'kespi.greenZone'];

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);

  // AC-1 四阈值进单源，默认值 0.55 / 0.45 / 0.45 / 0.60
  const vals = PATHS.map(p => {
    try { return C.getKnob(store, p); } catch (_) { return null; }
  });
  ac('AC-1 KESPI 阈值默认值单源',
    JSON.stringify(vals) === JSON.stringify([0.55, 0.45, 0.45, 0.60]),
    JSON.stringify(vals));

  // AC-2 改真变行为：promoteMin 调低 → 原本进唔到 kespi 证据嘅实体进得来
  const ID = 'e-20261121-0001';
  store.insertEntity({ id: ID, name: ID, type: 'Concept', content: '阈值单源样本实体正文', tags: '[]', status: 'active', confidence: 0.5 });
  const db = store._getDb();
  db.prepare('INSERT INTO kespi_scores (entity_id, overall, computed_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run([ID, 0.5]);
  store._persist();
  const before = await fp.evidenceFor(store, ID);
  C.setKnob(store, 'kespi.promoteMin', 0.40);
  const after = await fp.evidenceFor(store, ID);
  ac('AC-2 改旋钮真变行为',
    !before.kinds.includes('kespi') && after.kinds.includes('kespi') && after.count === before.count + 1,
    JSON.stringify({ before, after }));
  C.setKnob(store, 'kespi.promoteMin', 0.55);
  const back = await fp.evidenceFor(store, ID);
  ac('AC-2b 调返默认即返原行为', !back.kinds.includes('kespi'), JSON.stringify(back));

  // AC-3 组件唔再硬编码同一数值
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  const fpSrc = src('field-promote.js'), soSrc = src('self-optimize.js'), evSrc = src('evolution-team.js');
  ac('AC-3 三组件唔硬编码',
    !/=\s*0\.55\b/.test(fpSrc) && !/red:\s*0\.45/.test(soSrc) && !/green:\s*0\.60/.test(soSrc) && !/>=\s*0\.45\b/.test(evSrc),
    JSON.stringify({
      fp: (fpSrc.match(/=\s*0\.55\b/g) || []).length,
      so: (soSrc.match(/(red|green):\s*0\.(45|60)/g) || []).length,
      ev: (evSrc.match(/>=\s*0\.45\b/g) || []).length
    }));

  // AC-4 resolveOptions('kespi') 三面同构
  const opts = C.resolveOptions(store, 'kespi');
  ac('AC-4 组件映射齐四件',
    opts.promoteMin === 0.55 && opts.geneMin === 0.45 && opts.redZone === 0.45 && opts.greenZone === 0.60,
    JSON.stringify(opts));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
