'use strict';
// SPEC-1.9 发芽候选等价性 characterization test —— 包住现有行为，refactor 前后逐对同解
// 缘起（2026-11-21）：sprout 系一轮代谢最大热区（24.2%，18,891 对全扫 → 4 粒种子）。
// 优化前先锁行为：本档内联一份 O(n²) 参考实现，断言 sproutStep 产出嘅 links 同参考逐对一致。
// 优化落手后跑呢档：绿 = 行为未变；红 = 等价性破。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-sproutequiv-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const sprout = require('../src/sprout.js');

const strip = (t) => String(t).replace(/:\d+$/, '');
function parseTags(tags) { try { const a = JSON.parse(tags || '[]'); return Array.isArray(a) ? a.map(strip) : []; } catch (_) { return []; } }
const keywords = (t) => sprout.keywords(t);

// 参考实现：逐对扫描（优化前嘅口径），返候选对集合与各自证据种类
function referenceCandidates(db) {
  const rows = [];
  const st = db.prepare('SELECT id, content, tags FROM entities WHERE invalid_at IS NULL ORDER BY updated_at DESC, id LIMIT 200');
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  const links = [];
  const ls = db.prepare('SELECT source_id, target_id FROM links');
  while (ls.step()) links.push(ls.getAsObject());
  ls.free();

  const hasEdge = new Set(); const neighbors = new Map();
  const addN = (a, b) => { if (!neighbors.has(a)) neighbors.set(a, new Set()); neighbors.get(a).add(b); };
  for (const l of links) {
    hasEdge.add(l.source_id + '\u0000' + l.target_id); hasEdge.add(l.target_id + '\u0000' + l.source_id);
    addN(l.source_id, l.target_id); addN(l.target_id, l.source_id);
  }
  const meta = new Map();
  for (const e of rows) meta.set(e.id, { tags: new Set(parseTags(e.tags)), kw: keywords(e.content) });

  const out = new Set(); let pairs = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i].id, b = rows[j].id;
      if (hasEdge.has(a + '\u0000' + b)) continue;
      pairs++;
      const ma = meta.get(a), mb = meta.get(b);
      const sharedTags = [...ma.tags].filter(t => mb.tags.has(t));
      const sharedKw = [...ma.kw].filter(k => mb.kw.has(k));
      const na = neighbors.get(a) || new Set(), nb = neighbors.get(b) || new Set();
      const sharedN = [...na].filter(n => nb.has(n));
      const kinds = (sharedTags.length ? 1 : 0) + (sharedKw.length >= 2 ? 1 : 0) + (sharedN.length >= 2 ? 1 : 0);
      if (kinds >= 2) out.add([a, b].sort().join('\u0000'));
    }
  }
  return { out, pairs };
}

function actualPairs(db) {
  const s = db.prepare("SELECT source_id, target_id FROM links WHERE relation = 'sprout-candidate'");
  const out = new Set(); while (s.step()) { const r = s.getAsObject(); out.add([r.source_id, r.target_id].sort().join('\u0000')); } s.free();
  return out;
}

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const E = (id, tags, content) => store.insertEntity({
    id, name: id, type: 'Concept', content, tags: JSON.stringify(tags), status: 'active', confidence: 0.5
  });
  // a-b：共享 tag T1 + 共享关键词 alpha/beta → 2 类 ✓
  E('a', ['T1:7'], 'alpha beta gamma');
  E('b', ['T1:5'], 'alpha beta delta');
  // c-d：只共享 tag T2，关键词全唔同 → 1 类 ✗
  E('c', ['T2:7'], 'gamma delta epsilon');
  E('d', ['T2:7'], 'zeta eta theta');
  // g-h：只共享关键词 lamda/mu，无 tag → 1 类 ✗
  E('g', [], 'lamda mu omicron');
  E('h', [], 'lamda mu pi');
  // p-q：共享 tag T3 + 共享 2 个邻居 r/s → 2 类 ✓
  E('p', ['T3:7'], 'sigma tau');
  E('q', ['T3:7'], 'upsilon phi');
  E('r', [], 'chi psi');
  E('s', [], 'omega nu');
  store._persist();
  const db = store._getDb();
  const ins = db.prepare('INSERT INTO links (source_id, target_id, relation, confidence, strength, created_at) VALUES (?, ?, ?, 0.5, 5, CURRENT_TIMESTAMP)');
  for (const [x, y] of [['p', 'r'], ['p', 's'], ['q', 'r'], ['q', 's']]) ins.run([x, y, 'field-edge']);
  // a-c 已有边 → 唔再发种（idempotence）
  ins.run(['a', 'c', 'existing-edge']);
  ins.free();
  store._persist();

  const ref = referenceCandidates(db);
  const stats = await sprout.sproutStep(store, { persist: true });
  const got = actualPairs(db);

  // AC-1 候选对集合逐对一致（含「唔该发种」嘅负例）
  const missing = [...ref.out].filter(k => !got.has(k));
  const extra = [...got].filter(k => !ref.out.has(k));
  ac('AC-1 候选对集合同参考逐对一致', missing.length === 0 && extra.length === 0,
    `缺 ${JSON.stringify(missing)} 多 ${JSON.stringify(extra)}`);

  // AC-2 正例 a-b / p-q 有，负例 c-d / g-h 无
  ac('AC-2 正负例分辨',
    got.has('a\u0000b') && got.has('p\u0000q') && !got.has('c\u0000d') && !got.has('g\u0000h'),
    JSON.stringify([...got].sort()));

  // AC-3 已有边唔再发种（a-c 系 existing-edge，唔该出 sprout-candidate）
  ac('AC-3 已有边唔再发种', !got.has('a\u0000c'), 'a-c 被误发种');

  // AC-4 扫描对数与参考同口径（唔少扫、唔多扫）
  ac('AC-4 扫描对数同口径', stats.pairs === ref.pairs, `stats=${stats.pairs} ref=${ref.pairs}`);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
