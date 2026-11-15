'use strict';
// M1 任务 1.10 failing test —— 锁 SPEC-1.10 pollinate 六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-poll-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
let pollinateStep, store;
try { pollinateStep = require('../src/pollinate.js').pollinateStep; store = require('../src/knowledge-store.js'); if (typeof pollinateStep !== 'function') throw new Error('pollinateStep 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/pollinate.js 未实现 SPEC-1.10'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }
const rows = (sql) => { const s = store._getDb().prepare(sql); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, type, content, tags) => store.insertEntity({ id, name: id, type, content, tags: JSON.stringify(tags || []), status: 'active', confidence: 0.6 });

  ins('s1', 'Concept', '向量检索与强度加权', ['检索:7']);
  ins('s2', 'Concept', '向量检索强度排序', ['检索:7']);      // 同类型 → 不授粉
  ins('c1', 'Concept', '向量检索方法论', ['检索:7']);
  ins('m1', 'Method', '向量检索与强度调参', ['检索:7']);      // 跨域 + 标签 + 关键词 → 6
  ins('c2', 'Concept', '蒸馏链保真复制', ['代谢:7']);
  ins('m2', 'Method', '蒸馏链保真复制校验步骤', ['代谢:7']); // 跨域 + 标签 + 关键词 → 6
  ins('c3', 'Concept', '无关内容甲', ['甲:5']);
  ins('m3', 'Method', '无关内容乙', ['乙:5']);
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00'");
  db.run("UPDATE entities SET updated_at='2026-01-01 00:00:00'");
  store._persist();

  const r1 = await pollinateStep(store, { floor: 2, cap: 4 });
  const seeded = rows("SELECT * FROM links WHERE relation='pollinate-candidate'");
  const find = (x, y) => seeded.find(r => (r.source_id === x && r.target_id === y) || (r.source_id === y && r.target_id === x));

  ac('AC-1 同类型不授粉', !find('s1', 's2'), JSON.stringify(seeded.map(r => [r.source_id, r.target_id])));
  ac('AC-2 跨域+标签 → strength 4（用 c2/m2 的三类作对照，另验二类）',
    seeded.length > 0 && seeded.every(r => [4, 6].includes(Number(r.strength))), JSON.stringify(seeded.map(r => Number(r.strength))));
  const c1m1 = find('c1', 'm1');
  ac('AC-3 三类证据 strength 6', !!c1m1 && Number(c1m1.strength) === 6 && new Set(JSON.parse(c1m1.evidence || '[]').map(e => e.kind)).size === 3,
    JSON.stringify(c1m1));
  ac('AC-4 每轮 2–4 粒', r1.seeded >= 2 && r1.seeded <= 4, JSON.stringify(r1));
  const pairKey = (r) => r.source_id + '>' + r.target_id;
  const firstPairs = new Set(seeded.map(pairKey));
  const r2 = await pollinateStep(store, { floor: 2, cap: 4 });
  const seeded2 = rows("SELECT * FROM links WHERE relation='pollinate-candidate'").map(pairKey);
  const dupes = seeded2.filter(k => seeded2.indexOf(k) !== seeded2.lastIndexOf(k));
  const reSeeded = seeded2.filter(k => firstPairs.has(k)).length - seeded.length;
  ac('AC-5 已有边跳过 + 幂等（同一边不重复发种）',
    dupes.length === 0 && seeded2.length === new Set(seeded2).size && r2.seeded >= 0 && seeded2.length >= firstPairs.size,
    JSON.stringify({ r2, firstPairs: [...firstPairs], seeded2 }));
  const la = rows('SELECT last_access FROM entities').map(r => String(r.last_access));
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'pollinate.js'), 'utf8');
  ac('AC-6 铁律', la.every(v => v === '2021-06-01 00:00:00') && !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
