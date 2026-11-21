'use strict';
// SPEC-1.9 修订 B failing test —— sprout 关键词文档频次阈值（2026-11-21 owner 拍板）
// 缘起：keywords() 每实体产中位 186 个关键词，其中 76.8% 唔具选择性，top 词系 2026/json/status
//       呢啲日期与 JSON 字段名（docs/Engineering/SPOUT-HOTSPOT-2026-11-21.md）。
// 口径：剔除出现在 ≥ docFreqPctMax % 扫描实体嘅词；保留 docFreq 低于该线嘅低频共享词。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-sprout-df-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const C = require('../src/config-runtime.js');
const store = require('../src/knowledge-store.js');
const sprout = require('../src/sprout.js');

const PATH = 'sprout.docFreqPctMax';

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  // AC-1 旋钮入单源，**默认 0（关）**——阈值喺同构语料上会剔晒共享词、令 sprout 归零
  // （test-2.10 AC-4 守恒带依赖 sprout 每轮产出），故唔敢默认开，由 owner 按语料开。
  ac('AC-1 旋钮默认 0（关）', C.getKnob(store, PATH) === 0, JSON.stringify(C.getKnob(store, PATH)));

  // 60 实体：5% = 3 个文档。docFreq ≥3 剔，=2 留。
  // hh/ii 系高频（hh 10 个实体、ii 8 个）→ 该剔
  // cc/dd 系低频共享（各 2 个实体）→ 该留
  const E = (id, tags, content) => store.insertEntity({
    id, name: id, type: 'Concept', content, tags: JSON.stringify(tags), status: 'active', confidence: 0.5
  });
  E('e1', ['T1:7'], 'hh ii');
  E('e2', ['T1:7'], 'hh ii');
  for (const id of ['h5', 'h6', 'h7']) E(id, [], 'hh zz');          // hh → 5 文档
  for (const id of ['i8', 'i9']) E(id, [], 'ii yy');                  // ii → 4 文档
  E('e3', ['T2:7'], 'cc dd');
  E('e4', ['T2:7'], 'cc dd');
  for (let i = 0; i < 50; i++) E('f' + i, [], 'qq ww');
  store._persist();

  const cand = () => {
    const s = db.prepare("SELECT source_id, target_id FROM links WHERE relation = 'sprout-candidate'");
    const out = new Set();
    while (s.step()) { const r = s.getAsObject(); out.add([r.source_id, r.target_id].sort().join('\u0000')); }
    s.free();
    return out;
  };

  // 清掉上一轮嘅候选边，保证每轮干净
  const clear = () => { db.prepare("DELETE FROM links WHERE relation = 'sprout-candidate'").run(); };

  // AC-1b 默认关：e1/e2 共享 hh+ii → tag + kw = 2 类 → 成候选（无过滤，原行为）
  await sprout.sproutStep(store, { cap: 10000, persist: true });
  ac('AC-1b 默认关保持原行为', cand().has('e1\u0000e2'), JSON.stringify([...cand()].sort()));
  clear();

  C.setKnob(store, PATH, 5);

  // AC-2 阈值生效：e1/e2 共享嘅 hh/ii 均 ≥3 文档 → kw 证据被剔 → 只剩 tag 一类 → 唔成候选
  clear();
  await sprout.sproutStep(store, { cap: 10000, persist: true });
  ac('AC-2 高频共享词剔后唔成候选', !cand().has('e1\u0000e2'), JSON.stringify([...cand()].sort()));

  // AC-3 低频共享词保留：e3/e4 共享 cc+dd（各 2 文档 < 3）→ tag + kw = 2 类 → 成候选
  ac('AC-3 低频共享词保留成候选', cand().has('e3\u0000e4'), 'e3-e4 未成候选');

  // AC-4 改旋钮 0 = 唔剔，e1/e2 返原行为（tag + kw = 2 类）
  clear();
  C.setKnob(store, PATH, 0);
  await sprout.sproutStep(store, { cap: 10000, persist: true });
  ac('AC-4 旋钮 0 恢复全量', cand().has('e1\u0000e2'), JSON.stringify([...cand()].sort()));
  C.setKnob(store, PATH, 0);

  // AC-5 绝对下限：旋钮 0.5 令百分比 cutoff = 60×0.5% = 0.3，无下限会把 df=2 嘅低频共享词
  // 一并剔晒（等于杀死 kw 证据）；下限 3 保佢哋存活。用同一 fixture 验。
  clear();
  C.setKnob(store, PATH, 0.5);
  await sprout.sproutStep(store, { cap: 10000, persist: true });
  ac('AC-5 小语料绝对下限保 df=2 共享词', cand().has('e3\u0000e4'),
    JSON.stringify([...cand()].sort()));
  C.setKnob(store, PATH, 0);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
