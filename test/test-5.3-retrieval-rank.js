'use strict';
// M5 任务 5.3 failing test —— 锁 SPEC-5.3 检索排序修正八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-rank-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const m = require('../src/vector.js');
const store = require('../src/knowledge-store.js');

const SNAP_LEGACY = [0,0,0,0,0,0,0,0,0,0,-0.3779644730092272,0,0,0,0,0,-0.3779644730092272,0,0,0,0,0,0,0,0,0,0,-0.3779644730092272,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.3779644730092272,0,0,0.3779644730092272,0,0,0,0.3779644730092272,0,0,0,0.3779644730092272,0,0,0,0,0,0,0];
const sameVec = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }

(async () => {
  // AC-1 缺省指语义（SPEC-5.9）；本档验字面后端，进程未注册语义时按缺省回退 hash-64w2（带 requested 标记）
  const def = m.resolveBackend();
  const names = (typeof m.listBackends === 'function' ? m.listBackends() : []).map(b => b.name);
  ac('AC-1 缺省指语义、本档回退字面（SPEC-5.9）', def.requested === 'onnx-e5-small' && def.fallback === true &&
    def.name === 'hash-64w2' && m.DEFAULT_BACKEND === 'onnx-e5-small' && m.MODEL === 'hash-64w2' && m.DIM === 64 &&
    names.includes('hash-64') && names.includes('hash-64w2'),
    JSON.stringify({ def: def.name, requested: def.requested, fallback: def.fallback, MODEL: m.MODEL, names }));

  // AC-2 旧口径可切且逐位不变
  const old = m.vectorOf('苹果手机', { backend: 'hash-64' });
  ac('AC-2 旧口径逐位不变（可切回）', sameVec(old, SNAP_LEGACY), JSON.stringify(old));

  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, name, content, strength) => {
    store.insertEntity({ id, name, type: 'Concept', content, status: 'active', confidence: 0.6 });
    if (strength) db.run(`UPDATE entities SET tolaria_strength=${strength} WHERE id='${id}'`);
  };
  // 繁体正文（真实工作区形状）
  ins('trad', '轮阵', '輪陣係判斷与行動交替嘅架構。輪陣強調冷判斷再落手。', 5);
  ins('noise', '杂谈', '热带农业与水果种植要点。', 5);
  // 双字证据 vs 单字散落
  ins('bigram', '双字', '轮阵轮阵，冷判断先行。', 5);
  ins('scatter', '散字', '轮与阵，冷与判断先行。', 5);
  // 双链：raw + wiki 镜像同内容
  ins('doc-a', '文档甲', '沙盒隔离验证不上真库，跑完即撤。', 5);
  ins('wiki-doc-a', '文档甲', '沙盒隔离验证不上真库，跑完即撤。', 5);
  // 强度加权
  ins('strong', '强度高', '向量重建之后检索按模型过滤。', 9);
  ins('weak', '强度低', '向量重建之后检索按模型过滤！', 3); // 只差标点：同词元、异内容（去重不误伤），用于单看强度系数
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00'");
  store._persist();

  const r = await m.vectorStep(store, {});
  const rows = (() => { const s = db.prepare('SELECT model, dim FROM entity_vectors'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })();
  ac('AC-1b 建向量记新模型', r.indexed === 8 && rows.every(x => x.model === 'hash-64w2' && x.dim === 64), JSON.stringify({ r, n: rows.length }));

  // AC-3 简繁归一：简体查询命中繁体正文
  const trad = await m.search(store, '轮阵是什么', { k: 3 });
  ac('AC-3 简繁归一（简查询命繁正文）', trad.length > 0 && trad[0].base === 'trad', JSON.stringify(trad.map(h => [h.base, +h.score.toFixed(3)])));

  // AC-4 双字权重
  const bg = await m.search(store, '轮阵', { k: 4 });
  const bgBase = bg.map(h => h.base);
  ac('AC-4 双字权重（双字证据排散字前）', bgBase.indexOf('bigram') >= 0 && (bgBase.indexOf('scatter') === -1 || bgBase.indexOf('bigram') < bgBase.indexOf('scatter')), JSON.stringify(bg.map(h => [h.base, +h.score.toFixed(3)])));

  // AC-5 双链去重
  const dedup = await m.search(store, '沙盒隔离验证', { k: 3 });
  const dIds = dedup.map(h => h.id);
  ac('AC-5 双链去重（raw 优先，一条）', dIds.filter(x => String(x).replace(/^wiki-/, '') === 'doc-a').length === 1 &&
    dIds[0] === 'doc-a' && !dIds.includes('wiki-doc-a'), JSON.stringify(dIds));

  // AC-6 k 按去重后计
  const two = await m.search(store, '沙盒隔离验证', { k: 2 });
  const bases = two.map(h => h.base || String(h.id).replace(/^wiki-/, ''));
  ac('AC-6 k 按去重后计', two.length === 2 && new Set(bases).size === 2, JSON.stringify(bases));

  // AC-7 强度加权收窄（SPEC-5.8）：9 段仍排 3 段前，但系数只在 0.9–1.0 之间
  const s = await m.search(store, '向量重建模型过滤', { k: 5 });
  const sIds = s.map(h => h.id);
  const strong = s.find(h => h.id === 'strong');
  const weak = s.find(h => h.id === 'weak');
  const gap = strong && weak ? (strong.score / weak.similarity) / (weak.score / weak.similarity) : 0;
  ac('AC-7 强度加权收窄', sIds.indexOf('strong') >= 0 && sIds.indexOf('weak') >= 0 &&
    sIds.indexOf('strong') < sIds.indexOf('weak') && gap > 1 && gap <= 1.12,
    JSON.stringify({ sIds, gap }));

  // AC-8 内置不可覆盖 + 铁律
  const noHijack = throws(() => m.registerBackend({ name: 'hash-64w2', dim: 64, model: 'hijack', embed: () => new Array(64).fill(0) })) &&
    throws(() => m.registerBackend({ name: 'hash-64', dim: 64, model: 'hijack', embed: () => new Array(64).fill(0) }));
  const la = db.prepare("SELECT last_access FROM entities WHERE id='trad'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'vector.js'), 'utf8');
  ac('AC-8 内置不可覆盖 + 铁律', noHijack && String(laV) === '2021-06-01 00:00:00' && !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
