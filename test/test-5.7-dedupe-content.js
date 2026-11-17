'use strict';
// M5 任务 5.7 failing test —— 检索结果按内容去重（SPEC-5.7）
// 真库 320 实体只有 117 种内容：同文多份把前 3 张卡占满。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dedupe-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');

(async () => {
  await store.init(path.join(yard, 'k.db'));

  const put = (id, name, content) => store.insertEntity({ id, name, type: 'Concept', content, tags: '[]' });
  // 同文三份 + 异文两份
  put('dup-a', '安全债：Mimosa 扫 80 高危', '存量安全债：高危 80 中危 24，待决策 2 项。');
  put('dup-b', '安全债：Mimosa 扫 80 高危', '存量安全债：高危 80 中危 24，待决策 2 项。');
  put('dup-c', '安全债副本', '存量安全债：高危 80 中危 24，待决策 2 项。');
  put('other-1', '红蓝技能拉入', '红蓝技能四大套已经拉进来，登记进 skill-registry。');
  put('other-2', '意识神经缺口', '意识神经缺口 12 单，W1 到 W12。');

  await V.vectorStep(store, {});

  // AC-1 同内容不同 id 只出一条
  {
    const hits = await V.search(store, '存量安全债 高危', { k: 10 });
    const dupHits = hits.filter((h) => /^dup-/.test(h.id));
    ac('AC-1 同文只出一条', dupHits.length === 1, JSON.stringify(hits.map((h) => h.id)));
  }

  // AC-2 k 按去重后计
  {
    const hits = await V.search(store, '安全债', { k: 2 });
    ac('AC-2 k 去重后计', hits.length === 2 && new Set(hits.map((h) => h.id.replace(/^wiki-/, ''))).size === 2,
      JSON.stringify(hits.map((h) => h.id)));
  }

  // AC-3 同名异文都保留
  {
    put('same-1', '同名', '第一种内容：向量检索去重。');
    put('same-2', '同名', '第二种内容：完全不同的主题，说的是归档。');
    await V.vectorStep(store, {});
    const hits = await V.search(store, '同名', { k: 10 });
    const same = hits.filter((h) => /^same-/.test(h.id));
    ac('AC-3 同名异文保留', same.length === 2, JSON.stringify(hits.map((h) => h.id)));
  }

  // AC-4 双链口径不破
  {
    put('doc-x', '双链原文', '双链原文内容：编排与守恒。');
    put('wiki-doc-x', '双链镜像', '双链原文内容：编排与守恒。');
    await V.vectorStep(store, {});
    const hits = await V.search(store, '双链原文 编排 守恒', { k: 10 });
    const pair = hits.filter((h) => h.id === 'doc-x' || h.id === 'wiki-doc-x');
    ac('AC-4 双链只出一条且优先原文', pair.length === 1 && pair[0].id === 'doc-x', JSON.stringify(hits.map((h) => h.id)));
  }

  // AC-5 只读
  {
    const db = store._getDb();
    const snap = () => {
      const q = (sql) => { const t = db.prepare(sql); t.step(); const r = t.getAsObject(); t.free(); return JSON.stringify(r); };
      return q('SELECT COUNT(*) e FROM entities') + q('SELECT COUNT(*) v FROM entity_vectors');
    };
    const before = snap();
    await V.search(store, '安全债', { k: 5 });
    ac('AC-5 只读', before === snap(), '检索改动了库');
  }

  // AC-6 空内容不炸
  {
    put('empty-1', '空一', '');
    put('empty-2', '空二', '');
    await V.vectorStep(store, {});
    let ok = true, msg = '';
    try {
      const hits = await V.search(store, '空', { k: 5 });
      const empties = hits.filter((h) => /^empty-/.test(h.id));
      ok = empties.length === 1;
      msg = JSON.stringify(hits.map((h) => h.id));
    } catch (e) { ok = false; msg = '抛了: ' + e.message; }
    ac('AC-6 空内容安全', ok, msg);
  }

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
