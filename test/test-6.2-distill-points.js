'use strict';
// M6 任务 6.2 failing test —— 锁 SPEC-6.2 能力叙事消费与蒸馏点七条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dp-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
const store = require('../src/knowledge-store.js');
let D;
try { D = require('../src/distill-points.js'); if (typeof D.extractStep !== 'function') throw new Error('extractStep 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/distill-points.js 未实现 SPEC-6.2'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

// ── 造一段六段能力叙事（区间 20 行，验「不截断」）────────────
const LONG_LINES = Array.from({ length: 20 }, (_, i) => `产出第${i + 1}条：这是用来验证区间捕获不会截断正文的第${i + 1}行原话。`);
const NARRATIVE = [
  '# 能力单元 1', '',
  '### 场景（触发）',
  '用户要求核对消费侧，指出旧记录在工作区。', '',
  '### 思维（能力内核）',
  '先扫文件名，不按中文关键词搜。', '',
  '### 手段（工具执行）',
  '#### 手段 · Bash',
  '参数: {"command":"node trial.js"}',
  '结果: compile 18 实体。', '',
  '### 编排（子agent）',
  '#### 编排 · agent',
  '参数: {"prompt":"并行核对"}', '',
  '### 产出',
  ...LONG_LINES, '',
  '### 会话级校准',
  '- **反馈**: 不要只信资产地图',
  '> 时间戳 2026-11-16',
  '（编译注记）',
  '...', '',
  '# 提取实体',
  '这条在止端后，不该入。', '',
  '## 标签',
  '这条也不该入。'
].join('\n');

const MESSAGES = [
  { role: 'user', content: '核对消费侧。' },
  { role: 'assistant', content: [
    { type: 'reasoning', text: '先扫文件名。' },
    { type: 'text', text: '核对完成，四个真缺口。' },
    { type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'node trial.js' } }
  ] },
  { role: 'tool', content: [{ type: 'tool_result', content: 'compile 18 实体。' }] }
];
const NARR = require('../src/capability-narrative.js');

(async () => {
  // AC-1 区间捕获：20 行全入，噪声不入
  const out1 = D.extractRawMessages(NARRATIVE);
  const has20 = LONG_LINES.every(l => out1.includes(l));
  const noNoise = !out1.some(s => /^#{1,6}\s/.test(s)) && !out1.includes('> 时间戳 2026-11-16') &&
    !out1.includes('（编译注记）') && !out1.includes('...') && !out1.includes('这条在止端后，不该入。') &&
    !out1.includes('这条也不该入。');
  ac('AC-1 区间捕获', has20 && noNoise && out1.includes('用户要求核对消费侧，指出旧记录在工作区。') &&
    out1.includes('结果: compile 18 实体。'), JSON.stringify({ n: out1.length, has20, noNoise }));

  // AC-2 层级鲁棒 + 双语起锚
  const out2a = D.extractRawMessages('###### Capability Unit 2\n第一行英文锚下的原话。\n## 标签\n止端后的行。');
  const out2b = D.extractRawMessages('## 能力单元 3\n第二行中文锚下的原话。\n### 蒸馏摘要\n止端后。');
  ac('AC-2 层级鲁棒 + 双语起锚', out2a.includes('第一行英文锚下的原话。') && !out2a.includes('止端后的行。') &&
    out2b.includes('第二行中文锚下的原话。') && !out2b.includes('止端后。'), JSON.stringify({ out2a, out2b }));

  // AC-3 不过捕：正文词不触发；止端后不入
  const out3 = D.extractRawMessages('我们讨论能力单元的定义。\n这一行不在任何区间内。\n## 能力单元\n区间内行。\n## 标签\n区间外行。');
  ac('AC-3 不过捕', !out3.includes('我们讨论能力单元的定义。') && !out3.includes('这一行不在任何区间内。') &&
    out3.includes('区间内行。') && !out3.includes('区间外行。'), JSON.stringify(out3));

  // AC-4 蒸馏点确定性
  const items = ['短句。', '这是一个比较长的句子，长度明显更长。', '中等的句子。', '另一句也不短，长度居中。', '第五句，长度还行。', '第六句。', '第七句也在这里，够长了。'];
  const a = D.buildPoints(items), b = D.buildPoints(items.slice());
  const set = new Set(a.points);
  const expectLongest = items.filter((s, i) => true).map((s, i) => ({ s, i, len: s.length }))
    .sort((x, y) => y.len - x.len || x.i - y.i).slice(0, 5).map(x => x.s);
  const stable = a.points.length <= 5 && a.points.length === expectLongest.length &&
    expectLongest.every(s => set.has(s)) && D.digestOf(items) === D.digestOf(items.slice());
  const orderOk = a.points.map(s => items.indexOf(s)).every((v, i, arr) => i === 0 || arr[i - 1] < v);
  ac('AC-4 蒸馏点确定性', stable && a.lineCount === items.filter(s => s.length >= 4).length && orderOk, JSON.stringify({ points: a.points, lineCount: a.lineCount }));

  // AC-5 落表形状（6.1 JSON 形状）
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const built = NARR.buildCapabilityNarrative(MESSAGES, {}, []);
  const content = JSON.stringify({ format: 'capability-narrative-v1', markdown: built.markdown, turns: built.turns, stats: built.stats, calibrations: [] });
  store.insertEntity({ id: 'conv-s1', name: '会话 s1', type: 'Conversation', content, tags: '["conv:9"]', status: 'active', confidence: 0.6 });
  const r1 = await D.extractStep(store, {});
  const row = (() => { const s = db.prepare("SELECT * FROM distill_points WHERE base_id='conv-s1'"); const ok = s.step(); const o = ok ? s.getAsObject() : null; s.free(); return o; })();
  let pts = [];
  try { pts = JSON.parse(row.points_json); } catch (_) {}
  ac('AC-5 落表形状', r1.extracted >= 1 && !!row && Number(row.raw_count) > 0 &&
    Number(row.line_count) > 0 && Array.isArray(pts) && typeof row.digest === 'string' && row.updated_at != null,
    JSON.stringify({ r1, row: row && { raw: row.raw_count, line: row.line_count, pts: pts.length } }));

  // AC-6 幂等 + 退役跳过
  const r2 = await D.extractStep(store, {});
  store.insertEntity({ id: 'conv-gone', name: '退役会话', type: 'Conversation', content, tags: '["conv:9"]', status: 'active', confidence: 0.6 });
  db.run("UPDATE entities SET invalid_at='2026-01-01 00:00:00' WHERE id='conv-gone'");
  store._persist();
  const r3 = await D.extractStep(store, {});
  const gone = (() => { const s = db.prepare("SELECT COUNT(*) AS n FROM distill_points WHERE base_id='conv-gone'"); s.step(); const n = s.getAsObject().n; s.free(); return Number(n); })();
  ac('AC-6 幂等 + 退役跳过', r2.extracted === 0 && r2.skipped >= 1 && gone === 0,
    JSON.stringify({ r2, gone }));

  // AC-7 链上可见 + 铁律
  const meta = require('../src/metabolism.js');
  const la = db.prepare("SELECT last_access FROM entities WHERE id='conv-s1'"); la.step(); const laV = la.getAsObject().last_access; la.free();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'distill-points.js'), 'utf8');
  const unchanged = (() => { const s = db.prepare("SELECT content FROM entities WHERE id='conv-s1'"); s.step(); const c = s.getAsObject().content; s.free(); return c === content; })();
  ac('AC-7 链上可见 + 铁律', meta.DEFAULT_STEPS.includes('distill-points') &&
    (laV == null || String(laV) === '') && unchanged &&
    !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
