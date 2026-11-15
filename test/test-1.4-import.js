'use strict';
// M1 任务 1.4 failing test —— 锁 SPEC-1.4 import 双链写入七条 AC
// 运行（本仓根）：node test/test-1.4-import.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-import-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let importStep, store;
try {
  importStep = require('../src/import.js').importStep;
  store = require('../src/knowledge-store.js');
  if (typeof importStep !== 'function') throw new Error('importStep 未导出');
} catch (e) {
  console.error('❌ 红（正确的红）—— src/import.js 未实现 SPEC-1.4');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

const count = (sql) => {
  const s = store._getDb().prepare(sql); s.step();
  const n = s.getAsObject().n; s.free(); return n;
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // 源实体：raw 前缀 + 无前缀兼容 + 已退役 + 无 confidence（边 strength 默认 5）
  store.insertEntity({ id: 'raw-a', name: 'A', type: 'Concept', content: '甲原文', tags: '["x:9"]', status: 'active', confidence: 0.85 });
  store.insertEntity({ id: 'legacy-b', name: 'B', type: 'Method', content: '乙原文', status: 'active', confidence: 0.5 });
  store.insertEntity({ id: 'raw-retired', name: 'R', type: 'Concept', content: '已退役', status: 'active', confidence: 0.7 });
  store.insertEntity({ id: 'raw-noconf', name: 'N', type: 'Concept', content: '无置信', status: 'active', confidence: null });
  store.insertEntity({ id: 'raw-s', name: 'S', type: 'Concept', content: '强度样本', status: 'active', confidence: 0.65 });
  // 预置已存在镜像（内容不同 → AC-4 应保差异）
  store.insertEntity({ id: 'wiki-a', name: 'A', type: 'Concept', content: '落定版甲', status: 'active', confidence: 0.85 });
  // 退役源
  db.run("UPDATE entities SET invalid_at = '2026-01-01 00:00:00' WHERE id = 'raw-retired'");
  // last_access 预置（AC-6）
  db.run("UPDATE entities SET last_access = '2021-06-01 00:00:00' WHERE id IN ('raw-a','legacy-b','raw-noconf')");
  db.run("UPDATE entities SET last_access = '2021-06-01 00:00:00' WHERE id = 'wiki-a'");
  // 源强度设非默认（验证复制强度）
  db.run("UPDATE entities SET tolaria_strength = 8 WHERE id IN ('raw-a','raw-s')");
  store._persist();

  const r1 = await importStep(store, {});
  const wikiA = store.getEntity('wiki-a');
  const wikiB = store.getEntity('wiki-legacy-b');
  const wikiRetired = store.getEntity('wiki-retired');

  const wikiS = store.getEntity('wiki-s');
  ac('AC-1 双链成对 + 字段逐列复制',
    !!wikiB && wikiB.name === 'B' && wikiB.type === 'Method' && wikiB.content === '乙原文' &&
    wikiB.status === 'active' && wikiB.confidence === 0.5 &&
    !!wikiS && Number(wikiS.tolaria_strength) === 8,
    JSON.stringify({ wikiB, strengthS: wikiS && wikiS.tolaria_strength }));

  const bond = (() => {
    const s = db.prepare("SELECT * FROM links WHERE source_id='raw-a' AND target_id='wiki-a'");
    const row = s.step() ? s.getAsObject() : null; s.free(); return row;
  })();
  const bondNull = (() => {
    const s = db.prepare("SELECT * FROM links WHERE source_id='raw-noconf' AND target_id='wiki-noconf'");
    const row = s.step() ? s.getAsObject() : null; s.free(); return row;
  })();
  ac('AC-2 氢键入列 + strength 映射（0.85→8 / 空→5）',
    !!bond && bond.relation === 'hydrogen-bond' && Number(bond.strength) === 8 && bond.invalid_at == null &&
    !!bondNull && Number(bondNull.strength) === 5,
    JSON.stringify({ bond, bondNull }));

  const nEnt1 = count('SELECT COUNT(*) AS n FROM entities');
  const nLink1 = count('SELECT COUNT(*) AS n FROM links');
  const r2 = await importStep(store, {});
  ac('AC-3 幂等',
    r2.mirrored === 0 && r2.bonds === 0 &&
    count('SELECT COUNT(*) AS n FROM entities') === nEnt1 &&
    count('SELECT COUNT(*) AS n FROM links') === nLink1,
    JSON.stringify(r2));

  ac('AC-4 已存在镜像不覆盖（差分保留）', wikiA.content === '落定版甲', wikiA.content);
  ac('AC-5 退役源不建镜像 + 计数', wikiRetired == null && Number(r1.skippedRetired) >= 1, 'skippedRetired=' + r1.skippedRetired);
  ac('AC-6 两侧 last_access 不变',
    String(store.getEntity('raw-a').last_access) === '2021-06-01 00:00:00' &&
    String(store.getEntity('wiki-a').last_access) === '2021-06-01 00:00:00',
    JSON.stringify({ raw: store.getEntity('raw-a').last_access, wiki: wikiA.last_access }));

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'import.js'), 'utf8');
  ac('AC-7 无物理删 + 行数只增不减', !/DELETE\s+FROM/i.test(src) && nEnt1 >= 5, `nEnt1=${nEnt1}`);

  console.log(`${pass}/${pass + fail} 绿`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
