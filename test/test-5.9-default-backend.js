'use strict';
// M5 任务 5.9 failing test —— 默认后端切换为语义（onnx-e5-small）
// 口径（SPEC-5.9）：缺省解析先看语义后端；未注册不许静默，要带 fallback/requested 可解释；
// 环境变量与显式参数仍能压过缺省；memo 与 vectorStep 都按缺省口径走。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-default-be-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const V = require('../src/vector.js');
const store = require('../src/knowledge-store.js');
const M = require('../src/memo.js');

// 测试用语义后端桩：只验缺省解析与落库口径，不加载真模型（那是 5.9 实跑验证的事）
const STUB = { name: 'onnx-e5-small', dim: 384, model: 'onnx-e5-small', embed: (t) => new Array(384).fill(String(t).length % 7 + 1) };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  store.insertEntity({ id: 'doc-a', name: 'doc-a', type: 'Concept', content: '落盘先写临时文件再改名。', tags: '[]', status: 'active' });

  // AC-1 未注册语义后端：缺省不静默
  const r1 = V.resolveBackend();
  ac('AC-1 未注册时不静默（requested=onnx，实际回退字面）',
    r1.requested === 'onnx-e5-small' && r1.fallback === true && r1.name === 'hash-64w2' && V.DEFAULT_BACKEND === 'onnx-e5-small',
    JSON.stringify({ name: r1.name, requested: r1.requested, fallback: r1.fallback, DEF: V.DEFAULT_BACKEND }));

  // AC-2 注册后缺省即语义
  V.registerBackend(STUB);
  const r2 = V.resolveBackend();
  ac('AC-2 注册后缺省即 onnx-e5-small', r2.name === 'onnx-e5-small' && r2.fallback === false && r2.dim === 384,
    JSON.stringify({ name: r2.name, fallback: r2.fallback, dim: r2.dim }));

  // AC-3 环境变量仍优先
  process.env.AING_VECTOR_BACKEND = 'hash-64w2';
  const r3 = V.resolveBackend();
  delete process.env.AING_VECTOR_BACKEND;
  ac('AC-3 环境变量压过缺省', r3.name === 'hash-64w2' && r3.requested === 'hash-64w2', JSON.stringify(r3));

  // AC-4 显式参数可切回字面
  const r4 = V.resolveBackend('hash-64w2');
  ac('AC-4 显式参数可切回 hash-64w2', r4.name === 'hash-64w2' && r4.fallback === false, JSON.stringify(r4));

  // AC-5 memo 向量行按缺省口径
  const v1 = M.vectorStatus ? M.vectorStatus(store) : null;
  if (v1) {
    ac('AC-5a memo 缺省报 onnx', v1.backend === 'onnx-e5-small' && v1.dim === 384 && v1.source === 'default',
      JSON.stringify({ backend: v1.backend, dim: v1.dim, source: v1.source, stale: v1.stale }));
  } else {
    ac('AC-5a memo 缺省报 onnx', false, 'memo 未导出 vectorStatus');
  }

  // AC-6 隔离库按缺省 vectorStep 落 onnx 行
  await V.vectorStep(store);
  const db = store._getDb();
  const s = db.prepare('SELECT model, dim FROM entity_vectors');
  const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free();
  ac('AC-6 向量行全为 onnx-e5-small / 384',
    rows.length === 1 && rows.every((r) => r.model === 'onnx-e5-small' && Number(r.dim) === 384),
    JSON.stringify(rows));

  // AC-5b 旧 model 行计入 stale
  db.run("UPDATE entity_vectors SET model='hash-64w2', dim=64");
  store._persist();
  const v2 = M.vectorStatus ? M.vectorStatus(store) : null;
  ac('AC-5b 切后旧 model 行计入 stale', !!v2 && v2.stale === 1 && v2.indexed === 0,
    JSON.stringify(v2 && { stale: v2.stale, indexed: v2.indexed }));

  console.log(`\n----- 5.9 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
