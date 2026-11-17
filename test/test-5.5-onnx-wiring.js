'use strict';
// M5 任务 5.5 failing test —— 语义后端接入（SPEC-5.5）
// 只测契约面：用假后端，不装模型、不联网、不碰真库。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-onnx-wiring-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');

const simple = (v) => ({ name: 'fake-sync', dim: 4, model: 'fake-sync', embed: () => v });

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();

  // AC-1 同步后端 vectorOf 行为不变
  {
    const out = V.vectorOf('任意', { backend: simple([0, 1, 0, 0]) });
    ac('AC-1 同步路径不变', Array.isArray(out) && out.length === 4 && out[1] === 1, JSON.stringify(out));
  }

  // AC-2 vectorOfAsync：解析 Promise + 三种坏值报错
  {
    let ok = true, msg = '';
    try {
      if (typeof V.vectorOfAsync !== 'function') throw new Error('vectorOfAsync 未导出');
      const good = await V.vectorOfAsync('任意', { backend: { name: 'fake-async', dim: 3, model: 'fake-async', embed: async () => [0.1, 0.2, 0.3] } });
      const bad = [];
      for (const [label, ret, dim] of [
        ['非数组', async () => 'nope', 4],
        ['维度不符', async () => [1, 0], 4],
        ['非有限数', async () => [1, NaN, 0, 0], 4]
      ]) {
        try { await V.vectorOfAsync('x', { backend: { name: 'b-' + label, dim, model: 'b-' + label, embed: ret } }); bad.push(label); }
        catch (_) { /* 期望抛错 */ }
      }
      ok = good.length === 3 && bad.length === 0;
      msg = JSON.stringify({ good, bad });
    } catch (e) { ok = false; msg = e.message; }
    ac('AC-2 异步解析与校验', ok, msg);
  }

  // AC-3 embedQuery 分流：search 走题侧、vectorStep 走文档侧
  {
    const calls = { doc: 0, query: 0 };
    const backend = {
      name: 'fake-split', dim: 4, model: 'fake-split',
      embed: () => { calls.doc++; return [1, 0, 0, 0]; },
      embedQuery: async () => { calls.query++; return [1, 0, 0, 0]; }
    };
    db.run("INSERT INTO entities (id, name, type, content, status) VALUES ('split-1', '甲', 'Concept', '正文', 'active')");
    await V.vectorStep(store, { backend });
    const afterStep = { ...calls };
    const hits = await V.search(store, '甲的问题', { backend, k: 3 });
    ac('AC-3 题/文档分流', afterStep.query === 0 && afterStep.doc > 0 && calls.query === 1 && hits.length === 1,
      JSON.stringify({ afterStep, calls, hits: hits.length }));
  }

  // AC-4 换后端全量重建：model 不同，旧行零复用
  {
    const b1 = { name: 'a1', dim: 4, model: 'm1', embed: () => [0, 1, 0, 0] };
    const b2 = { name: 'a2', dim: 4, model: 'm2', embed: () => [0, 0, 1, 0] };
    await V.vectorStep(store, { backend: b1 });
    const s2 = await V.vectorStep(store, { backend: b2 });
    const rows = [];
    const st = db.prepare('SELECT model, COUNT(*) c FROM entity_vectors GROUP BY model');
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    const m2 = rows.find((r) => r.model === 'm2');
    ac('AC-4 换后端重建', s2.skipped === 0 && Number(s2.rebuilt) > 0 && m2 && Number(m2.c) > 0,
      JSON.stringify({ s2, rows }));
  }

  // AC-5 模块不可用时 ensureRegistered 不抛、resolveBackend 回退
  {
    let ok = true, msg = '';
    try {
      const O = require('../src/onnx-backend.js');
      const r = await O.ensureRegistered({ loadPipeline: async () => { throw new Error('模拟模块缺失'); } });
      const back = V.resolveBackend('onnx-e5-small');
      ok = r && r.ok === false && typeof r.reason === 'string' && back.name === V.MODEL && back.fallback === true;
      msg = JSON.stringify({ r, back: { name: back.name, fallback: back.fallback } });
    } catch (e) { ok = false; msg = '抛了异常: ' + e.message; }
    ac('AC-5 不可用则回退', ok, msg);
  }

  // AC-6 默认值不动
  {
    ac('AC-6 默认仍是 hash-64w2', V.MODEL === 'hash-64w2' && V.resolveBackend().name === 'hash-64w2',
      JSON.stringify({ model: V.MODEL }));
  }

  // AC-7 reindex 子命令：按请求的后端全量重建（换后端的标准动作）
  {
    let ok = true, msg = '';
    try {
      const cli = require('../src/cli.js');
      const before = process.env.AING_VECTOR_BACKEND;
      process.env.AING_VECTOR_BACKEND = 'fake-reindex';
      V.registerBackend({ name: 'fake-reindex', dim: 4, model: 'fake-reindex', embed: () => [0, 0, 1, 0] });
      store.insertEntity({ id: 're-1', name: '重建', type: 'Concept', content: '正文', tags: '[]' });
      const out = await cli.cmdReindex(path.join(yard, 'k.db'));
      const live = store._getDb(); // cmdReindex 会 openStore 重开库，旧句柄已失效
      const st = live.prepare("SELECT COUNT(*) c FROM entity_vectors WHERE model = 'fake-reindex'");
      st.step(); const n = Number(st.getAsObject().c); st.free();
      if (before === undefined) delete process.env.AING_VECTOR_BACKEND; else process.env.AING_VECTOR_BACKEND = before;
      ok = out.backend === 'fake-reindex' && n > 0;
      msg = JSON.stringify({ out, n });
    } catch (e) { ok = false; msg = e.message; }
    ac('AC-7 reindex 按请求后端重建', ok, msg);
  }

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
