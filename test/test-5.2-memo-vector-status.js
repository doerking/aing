'use strict';
// M5 任务 5.2 failing test —— 锁 SPEC-5.2 memo 向量库状态反馈八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-memovec-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const M = require('../src/memo.js');
const V = require('../src/vector.js');
const store = require('../src/knowledge-store.js');

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const codes = (m) => ((m.diagnostics && m.diagnostics.vector && m.diagnostics.vector.alerts) || []).map(a => a.code);

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, name, content) => store.insertEntity({ id, name, type: 'Concept', content, status: 'active', confidence: 0.6 });
  ins('a', '苹果手机', '苹果手机发布新旗舰');
  ins('b', '香蕉种植', '香蕉种植与热带农业');
  ins('c', '樱桃栽培', '樱桃栽培技术要点');
  store._persist();

  // AC-1 + AC-3 未建向量的冷态
  const m0 = await M.buildMemo(store, {});
  const v0 = m0.diagnostics && m0.diagnostics.vector;
  const shapeOk = !!v0 && ['backend', 'dim', 'model', 'source', 'active', 'indexed', 'stale', 'missing', 'percent']
    .every(k => k in v0) && Array.isArray(v0.alerts);
  ac('AC-1 诊断字段齐全', shapeOk, JSON.stringify(v0));
  ac('AC-3 未建向量告警', !!v0 && v0.active === 3 && v0.indexed === 0 && v0.missing === 3 && v0.percent === 0 && codes(m0).includes('low-coverage'), JSON.stringify(v0));

  // AC-2 默认态健康
  await V.vectorStep(store, {});
  const m1 = await M.buildMemo(store, {});
  const v1 = (m1.diagnostics && m1.diagnostics.vector) || {};
  ac('AC-2 默认态健康', v1.backend === 'hash-64' && v1.dim === 64 && v1.model === 'hash-64' && v1.indexed === 3 && v1.missing === 0 && v1.percent === 100 && v1.source === 'default' && v1.alerts.length === 0, JSON.stringify(v1));

  // AC-4 旧后端残留：用探针后端重建，再按默认后端看
  V.registerBackend({ name: 'probe-8', dim: 8, model: 'probe-8', embed: () => [1, 0, 0, 0, 0, 0, 0, 0] });
  await V.vectorStep(store, { backend: 'probe-8' });
  const m2 = await M.buildMemo(store, {});
  const v2 = (m2.diagnostics && m2.diagnostics.vector) || {};
  ac('AC-4 旧后端残留告警', v2.backend === 'hash-64' && v2.stale === 3 && v2.indexed === 0 && codes(m2).includes('stale-rows') && codes(m2).includes('low-coverage'), JSON.stringify(v2));

  // AC-5 测试开关告警（含未知名回退）
  process.env.AING_VECTOR_BACKEND = 'probe-8';
  const m3 = await M.buildMemo(store, {});
  const v3 = (m3.diagnostics && m3.diagnostics.vector) || {};
  const envOk = v3.source === 'env' && v3.backend === 'probe-8' && v3.indexed === 3 && v3.percent === 100 &&
    codes(m3).includes('env-override') && !codes(m3).includes('stale-rows');
  process.env.AING_VECTOR_BACKEND = 'no-such-backend';
  const m4 = await M.buildMemo(store, {});
  const v4 = (m4.diagnostics && m4.diagnostics.vector) || {};
  const fbOk = v4.backend === 'hash-64' && v4.source === 'env' && codes(m4).includes('backend-fallback');
  delete process.env.AING_VECTOR_BACKEND;
  ac('AC-5 测试开关告警（含未知名回退）', envOk && fbOk, JSON.stringify({ v3, v4 }));

  // AC-6 系统一行
  const line = m1.systemLine;
  ac('AC-6 系统一行含向量段且 ≤80', typeof line === 'string' && /向量\s/.test(line) && line.includes('hash-64') && line.includes('100%') && line.length <= M.SYSTEM_LINE_MAX, line);

  // AC-7 纯读
  const tables = ['entities', 'links', 'entity_vectors', 'meko_cycles', 'compressed_seeds'];
  const before = tables.map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();
  await M.buildMemo(store, {});
  const after = tables.map(t => rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n).join();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'memo.js'), 'utf8');
  ac('AC-7 纯读', before === after && !/INSERT\s+INTO|UPDATE\s+[a-z_]+\s+SET|DELETE\s+FROM/i.test(src), JSON.stringify({ before, after }));

  // AC-8 五字段不变
  const u = m1.user;
  ac('AC-8 用户面五字段不变', !!u && ['recent', 'openLoops', 'patterns', 'plans', 'coldStart'].every(k => k in u) && u.coldStart === true, JSON.stringify(Object.keys(u || {})));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
