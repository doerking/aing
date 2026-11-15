'use strict';
// M1 任务 1.9 failing test —— 锁 SPEC-1.9 sprout 六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-sprout-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
let sproutStep, store;
try { sproutStep = require('../src/sprout.js').sproutStep; store = require('../src/knowledge-store.js'); if (typeof sproutStep !== 'function') throw new Error('sproutStep 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/sprout.js 未实现 SPEC-1.9'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }
const rows = (sql) => { const s = store._getDb().prepare(sql); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, content, tags) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: JSON.stringify(tags || []), status: 'active', confidence: 0.6 });

  // a-b：只共享 1 标签（不成种）
  ins('a', '苹果手机发布', ['tech:9']);
  ins('b', '香蕉种植方法', ['tech:9']);
  // c-d：共享标签 + 关键词重叠（2 类 → strength 4）
  ins('c', '向量检索与强度加权', ['检索:7']);
  ins('d', '向量检索的强度排序', ['检索:7']);
  // e-f：再加共同邻居（3 类 → strength 6）；邻居 n 同时连 e/f
  ins('e', '蒸馏链保真复制', ['代谢:7']);
  ins('f', '蒸馏链的保真复制校验', ['代谢:7']);
  ins('n', '代谢链通用节点', ['代谢:7']);
  ins('n2', '代谢链第二个共同邻居', ['代谢:7']);
  // 预置边：a-b 已有边（不应重复发种）；e-n / f-n 作为共同邻居
  store.insertLink({ source_id: 'a', target_id: 'b', relation: 'existing', confidence: 0.6 });
  store.insertLink({ source_id: 'e', target_id: 'n', relation: 'kb', confidence: 0.6 });
  store.insertLink({ source_id: 'f', target_id: 'n', relation: 'kb', confidence: 0.6 });
  store.insertLink({ source_id: 'e', target_id: 'n2', relation: 'kb', confidence: 0.6 });
  store.insertLink({ source_id: 'f', target_id: 'n2', relation: 'kb', confidence: 0.6 });
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00'");
  // 让候选面顺序稳定
  db.run("UPDATE entities SET updated_at='2026-01-01 00:00:00'");
  store._persist();

  const r1 = await sproutStep(store, { floor: 2, cap: 4 });
  const seeded = rows("SELECT * FROM links WHERE relation='sprout-candidate'");
  const find = (x, y) => seeded.find(r => (r.source_id === x && r.target_id === y) || (r.source_id === y && r.target_id === x));

  ac('AC-1 单类证据不成种', !find('a', 'b') || false, JSON.stringify(seeded.map(r => [r.source_id, r.target_id])));

  const cd = find('c', 'd');
  const ev = cd ? JSON.parse(cd.evidence || '[]') : [];
  ac('AC-2 两类证据成种 + strength 4', !!cd && Number(cd.strength) === 4 && new Set(ev.map(e => e.kind)).size === 2,
    JSON.stringify({ cd, ev }));

  const ef = find('e', 'f');
  const ev2 = ef ? JSON.parse(ef.evidence || '[]') : [];
  ac('AC-3 三类证据 strength 6', !!ef && Number(ef.strength) === 6 && new Set(ev2.map(e => e.kind)).size === 3,
    JSON.stringify({ ef, ev2 }));

  ac('AC-4 sproutFloor 2–4', r1.seeded >= 2 && r1.seeded <= 4, JSON.stringify(r1));

  const nBefore = rows("SELECT COUNT(*) AS n FROM links")[0].n;
  const r2 = await sproutStep(store, { floor: 2, cap: 4 });
  ac('AC-5 已有边不发种 + 幂等', r2.seeded === 0 && rows("SELECT COUNT(*) AS n FROM links")[0].n === nBefore, JSON.stringify(r2));

  const la = rows('SELECT last_access FROM entities').map(r => String(r.last_access));
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'sprout.js'), 'utf8');
  ac('AC-6 铁律', la.every(v => v === '2021-06-01 00:00:00') && !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
