'use strict';
// M3 任务 3.12c failing test —— 预案可读性：时间名回退 / 空引文 / 双链同源去重（SPEC-3.12 修订 B）
// 真库现状：139 条会话正文是 markdown，不是 JSON → 引文空、话题退成「会话-<ISO 时间戳>」、双链双胞胎各出一张卡。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-predread-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const P = require('../src/predict.js');
const call = async (fn, ...args) => { try { return await fn(...args); } catch (e) { return { error: e.message }; } };

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();
  const put = (id, name, content) => db.run(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, created_at, updated_at)
     VALUES (?, ?, 'Conversation', ?, '["t"]', 'active', 0.6, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [id, name, content]);

  // markdown 正文（旧库常态）+ 双链双胞胎 + 一条正经 topic
  const mdBody = ['# 会话-2026-11-09T01:23:41.985Z', '', '## 来源', '', '- 原', '',
    '回炉闭环要先补接链，否则压缩单向泄漏。后面再优化。'].join(String.fromCharCode(10));
  put('conv-a', '会话-2026-11-09T01:23:41.985Z', mdBody);
  put('raw-conv-a', '会话-2026-11-09T01:23:41.985Z', mdBody);
  put('conv-b', '检索融合', JSON.stringify({ topic: '检索融合', at: '2026-11-10T01:00:00Z', reply: '检索融合要加 IDF 通道，稀有词更值钱。', searchShown: [], rationale: '先补权重' }));
  // 真库典型形状：标题 + 来源 + 内容 + 蒸馏摘要（摘要段才是真内容）
  const realShape = ['# 会话-2026-11-05T18:43:59.201Z', '', '## 来源', '',
    '- 原始资料：dispatch-20261106T0240-hourglass-opt-w1-2026-11-05T18-43-59-201Z', '',
    '## 内容', '', '# 会话-2026-11-05T18:43:59.201Z', '', '## 蒸馏摘要', '',
    '- 【决策闸理解摘要 w1】①本质：可交付可自检可复用的决策纪律引擎。'].join(String.fromCharCode(10));
  put('conv-c', 'dispatch-20261106T0240-hourglass-opt-w1', realShape);
  await require('../src/vector.js').vectorStep(store, {});
  await store._persist?.();

  const snap = () => JSON.stringify((() => { const s = db.prepare('SELECT id,name,type,content,last_access,status,invalid_at FROM entities ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  const before = snap();

  const r = await call(P.predict, store, { message: '回炉闭环 检索融合', k: 8 });
  const plans = (r && r.plans) || [];
  const hay = JSON.stringify(plans);

  // AC-1 markdown 正文也能出引文（不再空白依据）
  const quotes = plans.flatMap((p) => (p.basis || []).map((b) => String(b.quote || '')));
  ac('AC-1 引文非空', plans.length >= 1 && quotes.length >= 1 && quotes.every((q) => q.length > 0),
    JSON.stringify({ quotes }));

  // AC-2 时间名回退：话题不再裸露 ISO 时间戳，改用正文首句；真库形状从摘要段取，不吐结构词
  const r2 = await call(P.predict, store, { message: '决策纪律 可交付 可自检', k: 8 });
  const hay2 = JSON.stringify((r2 && r2.plans) || []);
  ac('AC-2 时间名回退', !/T01:23:41/.test(hay) && !/# /.test(hay) && /回炉闭环/.test(hay) &&
    /可交付/.test(hay2) && !/蒸馏摘要|原始资料|决策闸理解摘要|session-/.test(hay + hay2),
    JSON.stringify({ plans: plans.map((p) => p.hypothesis), plans2: ((r2 && r2.plans) || []).map((p) => p.hypothesis) }));

  // AC-3 双链同源去重：同一条正文只出一张卡
  const dup = plans.filter((p) => /回炉闭环/.test(p.hypothesis)).length;
  ac('AC-3 双链去重', dup === 1, JSON.stringify({ dup, plans: plans.map((p) => p.hypothesis) }));

  // AC-4 真 topic 优先：JSON 会话照用原文主题
  ac('AC-4 真 topic 优先', plans.some((p) => /检索融合/.test(p.hypothesis)) &&
    plans.every((p) => !/检索融合$/.test(String(p.id))),
    JSON.stringify({ hypotheses: plans.map((p) => p.hypothesis) }));

  // AC-5 只读
  ac('AC-5 只读', before === snap(), '预测改动了实体');

  // AC-6 铁律
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'predict.js'), 'utf8');
  ac('AC-6 铁律', !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src) && !/INSERT\s+INTO/i.test(src),
    'predict 源码含写语句');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });

