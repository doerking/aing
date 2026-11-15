'use strict';
// M1 任务 1.15 failing test —— 锁 SPEC-1.15 场域骨架七条 AC
// 运行（本仓根）：node test/test-1.15-field.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-field-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let FieldEngine, store;
try {
  FieldEngine = require('../src/field-engine.js').FieldEngine;
  store = require('../src/knowledge-store.js');
} catch (e) {
  console.error('❌ 红（正确的红）—— src/field-engine.js 未实现 SPEC-1.15');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  for (const [id, s] of [['e9', 9], ['e7', 7], ['e6', 6], ['e5', 5], ['e4', 4], ['e3', 3]]) {
    store.insertEntity({ id, name: id, type: 'Concept', content: 'c', status: 'active', confidence: 0.5 });
    db.run(`UPDATE entities SET tolaria_strength = ${s} WHERE id='${id}'`);
  }
  store._persist();

  const fe = new FieldEngine({ store });

  // AC-1 分带
  ac('AC-1 分带 9/7→entry、6/5/4→field、3→background',
    fe.bandOf(9) === 'entry' && fe.bandOf(7) === 'entry' && fe.bandOf(6) === 'field' && fe.bandOf(5) === 'field' && fe.bandOf(4) === 'field' && fe.bandOf(3) === 'background');

  // AC-2 边界
  let e7 = null, e3 = null;
  try { await fe.promote('e7', ['x', 'y']); } catch (e) { e7 = e; }
  try { await fe.demote('e3', ['reason']); } catch (e) { e3 = e; }
  ac('AC-2 边界：7 段 promote 拒 / 3 段 demote 拒', !!e7 && !!e3, `e7=${e7 && e7.message} e3=${e3 && e3.message}`);

  // AC-3 证据闸
  let eOne = null;
  try { await fe.promote('e6', ['only-one']); } catch (e) { eOne = e; }
  const okRec = await fe.promote('e6', ['sig1', 'sig2']);
  const e6row = store.getEntity('e6');
  ac('AC-3 1 证据拒 / 2 证据 6→7', !!eOne && e6row.tolaria_strength === 7, `strength=${e6row.tolaria_strength}`);

  // AC-4 可逆
  await fe.revert(okRec);
  const back = store.getEntity('e6');
  ac('AC-4 revert 回原值', back.tolaria_strength === 6, `strength=${back.tolaria_strength}`);
  const dRec = await fe.demote('e9', ['stale']);
  await fe.revert(dRec);
  ac('AC-4b demote 可逆', store.getEntity('e9').tolaria_strength === 9);

  // AC-5 扫描面
  const ids = (await fe.scan()).sort();
  ac('AC-5 scan 只返 6/5/4', JSON.stringify(ids) === JSON.stringify(['e4', 'e5', 'e6']), JSON.stringify(ids));

  // AC-6 arch-lint 门禁
  const lint = path.join(__dirname, '..', 'tools', 'arch-lint.js');
  const repoRun = spawnSync(process.execPath, [lint], { encoding: 'utf8' });
  const badDir = path.join(yard, 'bad');
  fs.mkdirSync(badDir);
  fs.writeFileSync(path.join(badDir, 'oops.js'), "const store = require('./knowledge-store.js');\n");
  const badRun = spawnSync(process.execPath, [lint, '--dir', badDir], { encoding: 'utf8' });
  ac('AC-6 arch-lint：本仓绿 / 违规红',
    repoRun.status === 0 && badRun.status === 1,
    `repo=${repoRun.status} bad=${badRun.status} out=${(badRun.stdout || '').trim().split('\n')[0]}`);

  // AC-7 无物理删
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'field-engine.js'), 'utf8');
  ac('AC-7 field-engine 无 DELETE FROM', !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
