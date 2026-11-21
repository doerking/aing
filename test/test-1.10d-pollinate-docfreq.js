'use strict';
// SPEC-1.10 修订 A failing test —— pollinate 关键词文档频次阈值
// 同根因（sprout 1.10c）：keywords() 每实体产中位 186 词，76.8% 唔具选择性（SPOUT-HOTSPOT-*）。
// pollinate 复用 keywords() 做跨域 kw 证据，有相同噪声——阈值应系 keywords 证据层嘅共享旋钮
// （kw.docFreqPctMax），唔系 sprout 专属。本档锁 pollinate 嘅阈值行为。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-poll-df-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const C = require('../src/config-runtime.js');
const store = require('../src/knowledge-store.js');
const pol = require('../src/pollinate.js');

const PATH = 'kw.docFreqPctMax';

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // AC-1 共享旋钮入单源，默认 0（关）
  ac('AC-1 旋钮默认 0（关）', C.getKnob(store, PATH) === 0, JSON.stringify(C.getKnob(store, PATH)));

  // 60 实体、5% = 3 文档。hh/ii 高频（hh 5 个、ii 4 个）→ 该剔；cc/dd 低频（各 2 个）→ 该留。
  // 跨域（类型 A vs B）先系 pollinate 候选；kw 证据 + cross（恒 1 类）先够 2 类。
  const E = (id, type, content) => store.insertEntity({
    id, name: id, type, content, tags: '[]', status: 'active', confidence: 0.5
  });
  E('e1', 'A', 'hh ii');
  E('e2', 'B', 'hh ii');
  for (const id of ['h5', 'h6', 'h7']) E(id, 'A', 'hh zz');          // hh → 5 文档
  for (const id of ['i8', 'i9']) E(id, 'A', 'ii yy');                  // ii → 4 文档
  E('e3', 'A', 'cc dd');
  E('e4', 'B', 'cc dd');
  for (let i = 0; i < 50; i++) E('f' + i, 'A', 'qq ww');
  store._persist();

  const cand = () => {
    const s = db.prepare("SELECT source_id, target_id FROM links WHERE relation = 'pollinate-candidate'");
    const out = new Set();
    while (s.step()) { const r = s.getAsObject(); out.add([r.source_id, r.target_id].sort().join('\u0000')); }
    s.free();
    return out;
  };
  const clear = () => { db.prepare("DELETE FROM links WHERE relation = 'pollinate-candidate'").run(); };

  // AC-2 阈值开：e1/e2 共享嘅 hh/ii 均 ≥3 文档 → kw 证据被剔 → 只剩 cross 一类 → 唔成候选
  C.setKnob(store, PATH, 5);
  clear();
  await pol.pollinateStep(store, { cap: 10000, persist: true });
  ac('AC-2 高频共享词剔后唔成候选', !cand().has('e1\u0000e2'), JSON.stringify([...cand()].sort()));

  // AC-3 低频共享词保留：e3/e4 共享 cc+dd（各 2 文档 < 3）→ cross + kw = 2 类 → 成候选
  ac('AC-3 低频共享词保留成候选', cand().has('e3\u0000e4'), 'e3-e4 未成候选');

  // AC-4 旋钮 0：e1/e2 返原行为（cross + kw = 2 类）
  clear();
  C.setKnob(store, PATH, 0);
  await pol.pollinateStep(store, { cap: 10000, persist: true });
  ac('AC-4 旋钮 0 恢复全量', cand().has('e1\u0000e2'), JSON.stringify([...cand()].sort()));
  C.setKnob(store, PATH, 0);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
