'use strict';
// M7 任务 7.1c failing test —— 锁 SPEC-7.1 AC-5（检索入键）/ AC-6（发芽只走强边）
// 口径：词面 = content + keywords + variants，表头（title/name）不入键；
//       繁简、粤普同一意思互打；strength<7 的泛 related 不进检索加分，三类候选关系够强才进。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-face-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const V = require('../src/vector.js');
let R = null;
try { R = require('../src/retrieval.js'); if (typeof R.search !== 'function') R = null; } catch (_) { R = null; }

const LEX = { vector: 0, lexical: 1, name: 0 };
const ONLY_NAME = { vector: 0, lexical: 0, name: 1 };
const OFF = { kespi: 0, recency: 0 };
const idsOf = (r) => (r && r.candidates ? r.candidates.map((c) => c.id) : []);

(async () => {
  if (!R) {
    ['AC-5a 表头不入键', 'AC-5b 正文入键', 'AC-5c 繁简互打', 'AC-5d 粤普互打', 'AC-5e 序列号路只认 id',
      'AC-6a 弱 related 不进慢回忆', 'AC-6b 强候选关系可进'].forEach((n) => ac(n, false, 'retrieval.js 不可用'));
    console.log(`\n----- 7.1c pass=${pass} fail=${fail} -----`);
    process.exit(1);
  }

  await store.init(path.join(yard, 'knowledge.db'));
  const put = (id, name, content, tags = '[]') =>
    store.insertEntity({ id, name, type: 'Concept', content, tags, status: 'active', confidence: 0.6 });

  put('s-zh', '序列-0001', '意识神经是记忆层的底座');
  put('t-zh', '序列-0002', '意識神經是記憶層的底座');
  put('hijack', '意识神经', '番茄种植手册与灌溉周期');           // 表头=查询词，正文无关
  put('c-only', '无关表头甲乙', '这一段讲意识神经的三层结构');      // 正文有关，表头无关
  put('yue-zh', '序列-0003', '这件事已经搞掂了');                 // 粤语正文
  put('e-20261117-0007', '序列-七', '与查询无关的正文丁');          // id 即序列号，表头是派生
  put('seed2', '种子二', 'alpha 共同词');
  put('nb-weak', '弱邻', '完全无关甲');
  put('nb-strong', '强邻', '完全无关乙');
  store.insertLink({ source_id: 'seed2', target_id: 'nb-weak', relation: 'related', confidence: 0.3 });
  store.insertLink({ source_id: 'seed2', target_id: 'nb-strong', relation: 'sprout-candidate', confidence: 0.9 });
  const db = store._getDb();
  db.run("UPDATE links SET strength=3 WHERE target_id='nb-weak'");
  db.run("UPDATE links SET strength=7 WHERE target_id='nb-strong'");
  store._persist();
  await V.vectorStep(store, {});

  // AC-5a 表头不入键：表头命中查询词的档不进词面
  const r5a = await R.search(store, '意识神经', { weights: LEX, rerank: OFF });
  const hijackHit = (r5a.candidates || []).find((c) => c.id === 'hijack');
  ac('AC-5a 表头不入键', !hijackHit, JSON.stringify(idsOf(r5a)));

  // AC-5b 正文入键
  const cOnly = (r5a.candidates || []).find((c) => c.id === 'c-only');
  ac('AC-5b 正文入键', !!cOnly && cOnly.channels.lexical > 0, JSON.stringify(cOnly && cOnly.channels));

  // AC-5c 繁简互打：繁体查询与简体查询都能命中两种写法的档
  const hit = (r, id) => (r.candidates || []).find((c) => c.id === id);
  const lexOf = (r, id) => (hit(r, id) ? hit(r, id).channels.lexical : 0);
  const rT = await R.search(store, '意識神經', { weights: LEX, rerank: OFF });
  const rS = await R.search(store, '意识神经', { weights: LEX, rerank: OFF });
  const both = (r) => ['s-zh', 't-zh'].every((id) => lexOf(r, id) > 0);
  ac('AC-5c 繁简互打', both(rT) && both(rS),
    JSON.stringify({ t: ['s-zh', 't-zh'].map((id) => lexOf(rT, id)), s: ['s-zh', 't-zh'].map((id) => lexOf(rS, id)) }));

  // AC-5d 粤普互打：普通话查询命中粤语写法档
  const rY = await R.search(store, '搞定了吗', { weights: LEX, rerank: OFF });
  ac('AC-5d 粤普互打', lexOf(rY, 'yue-zh') > 0, JSON.stringify({ ids: idsOf(rY), lex: lexOf(rY, 'yue-zh') }));

  // AC-5e 序列号路只认 id（表头伪造无效）
  const rId = await R.search(store, 'e-20261117-0007', { weights: ONLY_NAME, rerank: OFF });
  const rTitle = await R.search(store, '序列-七', { weights: ONLY_NAME, rerank: OFF });
  ac('AC-5e 序列号路只认 id',
    idsOf(rId).includes('e-20261117-0007') && !idsOf(rTitle).includes('e-20261117-0007') && idsOf(rTitle).length === 0,
    JSON.stringify({ byId: idsOf(rId), byTitle: idsOf(rTitle) }));

  // AC-6 发芽只走强边
  const r6 = await R.search(store, 'alpha 共同词', { forceSlow: true, weights: LEX, rerank: OFF });
  const six = idsOf(r6);
  ac('AC-6a 弱 related 不进慢回忆', !six.includes('nb-weak'), JSON.stringify(six));
  ac('AC-6b 强候选关系可进', six.includes('nb-strong'), JSON.stringify(six));

  console.log(`\n----- 7.1c pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
