'use strict';
// M5 任务 5.1 failing test —— 锁 SPEC-5.1 向量后端可插拔与测试口径九条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-vecbe-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const m = require('../src/vector.js');
const store = require('../src/knowledge-store.js');

// 默认路径特征化快照（SPEC-1.8 实况，逐位锁定）
const SNAP_APPLE = [0,0,0,0,0,0,0,0,0,0,-0.3779644730092272,0,0,0,0,0,-0.3779644730092272,0,0,0,0,0,0,0,0,0,0,-0.3779644730092272,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.3779644730092272,0,0,0.3779644730092272,0,0,0,0.3779644730092272,0,0,0,0.3779644730092272,0,0,0,0,0,0,0];

// 探针后端：8 维确定性哈希，供评测注入用
function probeEmbed(text) {
  const v = new Array(8).fill(0);
  for (const tok of m.tokens(text)) {
    let h = 0;
    for (const ch of tok) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    v[h % 8] += 1;
  }
  const n = Math.hypot(...v);
  return n > 0 ? v.map(x => x / n) : v;
}
const PROBE = { name: 'probe-8', dim: 8, model: 'probe-8', embed: probeEmbed };

const sameVec = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }
function rowsOf(db) { const st = db.prepare('SELECT entity_id, dim, model FROM entity_vectors ORDER BY entity_id'); const o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; }

(async () => {
  // AC-1 默认路径不变
  const v0 = m.vectorOf('苹果手机');
  ac('AC-1 默认路径不变（逐位等于 SPEC-1.8 快照）', sameVec(v0, SNAP_APPLE) && m.DIM === 64 && m.MODEL === 'hash-64', JSON.stringify(v0));

  // AC-2 自定义后端可用
  const reg = typeof m.registerBackend === 'function' && typeof m.resolveBackend === 'function' && typeof m.listBackends === 'function';
  let regOk = false;
  if (reg) { try { m.registerBackend(PROBE); regOk = true; } catch (_) { regOk = false; } }
  const v8 = m.vectorOf('香蕉种植', { backend: 'probe-8' });
  ac('AC-2 自定义后端可用（8 维）', reg && regOk && Array.isArray(v8) && v8.length === 8 && m.resolveBackend('probe-8').dim === 8, String(Array.isArray(v8) ? v8.length : v8));

  // AC-3 环境变量开关
  let envOk = false;
  if (typeof m.resolveBackend === 'function') {
    process.env.AING_VECTOR_BACKEND = 'probe-8';
    const r = m.resolveBackend();
    envOk = r && r.name === 'probe-8' && r.fallback !== true;
    delete process.env.AING_VECTOR_BACKEND;
    const back = m.resolveBackend();
    envOk = envOk && back && back.name === 'hash-64';
  }
  ac('AC-3 环境变量开关（只供测试）', envOk);

  // AC-4 未知后端回退
  let fb = null;
  if (typeof m.resolveBackend === 'function') fb = m.resolveBackend('no-such-backend');
  ac('AC-4 未知后端回退 hash-64', !!fb && fb.name === 'hash-64' && fb.fallback === true && fb.requested === 'no-such-backend', JSON.stringify(fb && { name: fb.name, fallback: fb.fallback, requested: fb.requested }));

  // AC-5 非法后端拒收
  const bad1 = typeof m.registerBackend === 'function' && throws(() => m.registerBackend({ name: 'no-embed', dim: 8 }));
  const bad2 = typeof m.registerBackend === 'function' && throws(() => m.registerBackend({ name: 'bad-dim', dim: 0, embed: () => [] }));
  const bad3 = typeof m.registerBackend === 'function' && throws(() => m.registerBackend({ name: 'hash-64', dim: 64, model: 'hijack', embed: () => new Array(64).fill(0) }));
  ac('AC-5 非法后端拒收（缺 embed / dim 非法 / 覆盖内置）', bad1 && bad2 && bad3, JSON.stringify({ bad1, bad2, bad3 }));

  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, name, content) => store.insertEntity({ id, name, type: 'Concept', content, status: 'active', confidence: 0.6 });
  ins('apple', '苹果手机', '苹果手机发布新旗舰');
  ins('banana', '香蕉种植', '香蕉种植与热带农业');
  ins('cherry', '樱桃栽培', '樱桃栽培技术要点');
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00'");
  store._persist();

  // AC-6 默认后端建向量记后端
  const r1 = await m.vectorStep(store, {});
  const rows1 = rowsOf(db);
  ac('AC-6 建向量记后端（64 / hash-64）', r1.indexed === 3 && rows1.length === 3 && rows1.every(r => r.dim === 64 && r.model === 'hash-64'), JSON.stringify(rows1));

  // AC-7 换后端重建
  const r2 = await m.vectorStep(store, { backend: 'probe-8' });
  const rows2 = rowsOf(db);
  ac('AC-7 换后端重建（不跳过，维度随之变）', r2.rebuilt === 3 && r2.skipped === 0 && rows2.every(r => r.dim === 8 && r.model === 'probe-8'), JSON.stringify({ r2, rows2 }));

  // AC-8 混用防护：把 apple 一行换回 hash-64（模拟部分迁移的混库）
  const put = db.prepare("UPDATE entity_vectors SET dim=64, model='hash-64', vector=? WHERE entity_id='apple'");
  put.run([JSON.stringify(m.vectorOf('苹果手机\n苹果手机发布新旗舰'))]); put.free();
  store._persist();
  const probeHits = await m.search(store, '苹果手机', { backend: 'probe-8', k: 10 });
  const defHits = await m.search(store, '苹果手机', { k: 10 });
  const probeIds = probeHits.map(h => h.id);
  const defIds = defHits.map(h => h.id);
  const probeOnly = probeIds.every(id => id === 'banana' || id === 'cherry');
  ac('AC-8 混用防护（各后端只出自己的行）', probeOnly && !probeIds.includes('apple') && defIds.length === 1 && defIds[0] === 'apple', JSON.stringify({ probeIds, defIds }));

  // AC-9 铁律
  const la = db.prepare("SELECT last_access FROM entities WHERE id='apple'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'vector.js'), 'utf8');
  ac('AC-9 铁律', String(laV) === '2021-06-01 00:00:00' && !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
