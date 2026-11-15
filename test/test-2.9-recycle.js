'use strict';
// M2 任务 2.9 failing test —— 锁 SPEC-2.9 回炉接线五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-recycle-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
let recycleStep, store, pipeline;
try {
  recycleStep = require('../src/recycle.js').recycleStep;
  store = require('../src/knowledge-store.js');
  pipeline = require('../src/metabolism.js');
  if (typeof recycleStep !== 'function') throw new Error('recycleStep 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/recycle.js / src/metabolism.js 未实现 SPEC-2.9'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }
const rows = (sql) => { const s = store._getDb().prepare(sql); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'raw-old', name: '旧实体', type: 'Concept', content: '旧内容正文'.repeat(20), status: 'active', confidence: 0.5 });
  store.insertEntity({ id: 'raw-fresh', name: '新实体', type: 'Concept', content: '新内容'.repeat(20), status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET last_access='2020-01-01 00:00:00'");
  store._persist();
  const compress = require('../src/compress.js');
  await compress.compressStep(store, {});

  // 预置一粒已解压（active=0）的籽：不应回炉
  db.run("UPDATE compressed_seeds SET active=0 WHERE entity_id='raw-fresh'");
  const r1 = await recycleStep(store, {});
  const mz = rows("SELECT * FROM entities WHERE id='mz-raw-old'")[0];
  ac('AC-1 籽回炉成微粒', !!mz && mz.type === 'MetaKnowledge' && /recycled-from:raw-old/.test(mz.content),
    JSON.stringify(mz && { type: mz.type, content: String(mz.content).slice(-40) }));

  const n1 = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  const r2 = await recycleStep(store, {});
  ac('AC-2 每粒一次', r2.recycled === 0 && rows('SELECT COUNT(*) AS n FROM entities')[0].n === n1, JSON.stringify(r2));

  // active=0 的籽不回炉
  // 复核：把籽重新激活也不会二次回炉（mz 已存在只落标记）
  db.run("UPDATE compressed_seeds SET active=1, recycled=0 WHERE entity_id='raw-old'");
  const r3 = await recycleStep(store, {});
  ac('AC-3 已解压籽不回炉', !rows("SELECT * FROM entities WHERE id='mz-raw-fresh'")[0] && r3.recycled === 0, JSON.stringify(r3));

  ac('AC-4 链上可见（默认步骤含 recycle）', pipeline.DEFAULT_STEPS.includes('recycle'), JSON.stringify(pipeline.DEFAULT_STEPS));
  // 链上可见的第二重证据：契约能真被编排器接收（不是摆设字符串）
  let registrable = false;
  try {
    const { MekoOrchestrator } = require('../src/meko-orchestrator.js');
    const orch = new MekoOrchestrator({ store });
    pipeline.buildDefaultSteps().forEach(c => orch.registerStep(c));
    registrable = orch.steps.some(s => s.id === 'recycle');
    pipeline.assertChain();
  } catch (e) { registrable = false; console.error('   注册失败: ' + e.message); }
  ac('AC-4b 编排器接收 recycle 契约', registrable);

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'recycle.js'), 'utf8');
  const la = rows("SELECT last_access FROM entities WHERE id='raw-old'")[0].last_access;
  ac('AC-5 铁律', !/DELETE\s+FROM/i.test(src) && String(la) === '2020-01-01 00:00:00');

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
