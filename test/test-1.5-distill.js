'use strict';
// M1 任务 1.5 failing test —— 锁 SPEC-1.5 distill 复制链保真七条 AC
// 运行（本仓根）：node test/test-1.5-distill.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-distill-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(name, cond, detail = '') {
  if (cond) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

let distillStep, store;
try {
  distillStep = require('../src/distill.js').distillStep;
  store = require('../src/knowledge-store.js');
  if (typeof distillStep !== 'function') throw new Error('distillStep 未导出');
} catch (e) {
  console.error('❌ 红（正确的红）—— src/distill.js 未实现 SPEC-1.5');
  console.error('   ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  const body = '第一行\n\n  第二行有缩进  \n第三行';
  store.insertEntity({ id: 'raw-p1', name: 'P1', type: 'Concept', content: body, tags: '["a:7"]', status: 'pending-distillation', confidence: 0.7 });
  store.insertEntity({ id: 'raw-ok', name: 'OK', type: 'Concept', content: '已蒸馏正文', status: 'active', confidence: 0.5 });
  store.insertEntity({ id: 'raw-ret', name: 'RET', type: 'Concept', content: '退役正文', status: 'pending-distillation', confidence: 0.5 });
  db.run("UPDATE entities SET invalid_at = '2026-01-01 00:00:00' WHERE id = 'raw-ret'");
  db.run("UPDATE entities SET last_access = '2021-06-01 00:00:00' WHERE id IN ('raw-p1','raw-ok','raw-ret')");
  // 已 active 的实体给个旧 updated_at，验「不动」
  db.run("UPDATE entities SET updated_at = '2020-01-01 00:00:00' WHERE id = 'raw-ok'");
  store._persist();

  const r1 = await distillStep(store, {});
  const raw1 = store.getEntity('raw-p1');
  const wiki1 = store.getEntity('wiki-p1');

  ac('AC-1 双链同时转 active', raw1.status === 'active' && wiki1.status === 'active',
    JSON.stringify({ raw: raw1.status, wiki: wiki1 && wiki1.status }));
  ac('AC-2 逐字保真（含多行/缩进/尾随空格）', !!wiki1 && wiki1.content === body, JSON.stringify(wiki1 && wiki1.content));
  ac('AC-3 元数据同步', !!wiki1 && wiki1.name === 'P1' && wiki1.type === 'Concept' && wiki1.tags === '["a:7"]' && wiki1.confidence === 0.7);

  const before = { content: raw1.content, updated: String(raw1.updated_at) };
  const r2 = await distillStep(store, {});
  const ok = store.getEntity('raw-ok');
  ac('AC-4 幂等', r2.distilled === 0 && store.getEntity('raw-p1').content === before.content,
    JSON.stringify(r2));
  ac('AC-5 非 pending 不动', ok.content === '已蒸馏正文' && String(ok.updated_at) === '2020-01-01 00:00:00',
    String(ok.updated_at));
  ac('AC-6 退役源不蒸馏', store.getEntity('raw-ret').status === 'pending-distillation' && store.getEntity('wiki-ret') == null);

  const la = ['raw-p1', 'raw-ok', 'raw-ret'].map(id => String(store.getEntity(id).last_access));
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'distill.js'), 'utf8');
  ac('AC-7 last_access 不变 + 无物理删',
    la.every(v => v === '2021-06-01 00:00:00') && !/DELETE\s+FROM/i.test(src),
    JSON.stringify(la) + ' distilled=' + r1.distilled);

  console.log(`${pass}/${pass + fail} 绿`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
