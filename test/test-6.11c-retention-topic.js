'use strict';
// M6 任务 6.11c failing test —— 留存候选带可读话题（SPEC-6.11 修订 B）
// 真库会话多是 markdown：候选名单（归档 md / 手机退役请求）只印「会话-<ISO 时间戳>」，人没法校对。
// 判据一行不动，只给候选补一个显示用 topic。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-retention-topic-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const NL = String.fromCharCode(10);
const mdConv = (ts, summary) => ['# 会话-' + ts, '', '## 蒸馏摘要', '', '- ' + summary, ''].join(NL);

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();
  const put = (id, name, type, content, updatedAt) => db.run(
    `INSERT INTO entities (id, name, type, content, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`, [id, name, type, content, updatedAt, updatedAt]);

  // 两条到窗短料（候选）+ 一条新会话（在窗内）+ 一条旧知识层（不进候选）
  put('a', '会话-2026-09-01T10:00:00.000Z', 'Conversation', mdConv('2026-09-01T10:00:00.000Z', '回炉闭环要先补接链'), '2026-09-01 10:00:00');
  put('b', '会话-2026-09-02T11:00:00.000Z', 'Conversation', mdConv('2026-09-02T11:00:00.000Z', '检索融合要加 IDF 通道'), '2026-09-02 11:00:00');
  put('fresh', '会话-2026-11-15T10:00:00.000Z', 'Conversation', mdConv('2026-11-15T10:00:00.000Z', '新会话不该进候选'), '2026-11-15 10:00:00');
  put('old-concept', '守恒闸', 'Concept', JSON.stringify({ topic: '守恒闸', reply: '边层主读数。' }), '2026-09-01 10:00:00');
  await store._persist?.();

  const R = require('../src/retention.js');
  const MR = require('../src/mobile-retire.js');
  const A = require('../tools/archive.js');

  const plan = R.planRetention(store, {});
  const ids = plan.candidates.map((c) => c.id).sort();

  // AC-1 候选带可读话题
  const topics = plan.candidates.map((c) => String(c.topic || ''));
  ac('AC-1 候选话题可读', plan.candidates.length === 2 && topics.every((t) => t && !/T10:00:00|T11:00:00/.test(t)) &&
    topics.some((t) => /回炉闭环/.test(t)) && topics.some((t) => /检索融合/.test(t)),
    JSON.stringify({ ids, topics }));

  // AC-2 判据一行不动：只有两条到窗短料进候选
  ac('AC-2 判据不变', ids.length === 2 && ids[0] === 'a' && ids[1] === 'b',
    JSON.stringify({ ids }));

  // AC-3 归档 md 用话题而非时间戳名
  const outDir = path.join(yard, 'archive');
  const exp = A.exportMonth(store, { month: '2026-11', outDir, plan });
  const md = fs.readFileSync(exp.mdPath, 'utf8');
  ac('AC-3 归档 md 可读', /话题/.test(md) && /回炉闭环/.test(md) && !/T10:00:00/.test(md),
    JSON.stringify({ head: md.split(NL).slice(0, 8) }));

  // AC-4 手机退役请求带话题，且摘要随正文变（不是拿旧名凑）
  const NOW = { now: '2026-11-17T00:00:00Z' };
  const req1 = MR.buildRetireRequest(store, NOW);
  ac('AC-4 退役请求带话题', req1.candidates.length === 2 &&
    req1.candidates.every((c) => c.topic && !/T10:00:00|T11:00:00/.test(c.topic)) && typeof req1.sha256 === 'string' && req1.sha256.length === 64,
    JSON.stringify({ cands: req1.candidates.slice(0, 2), sha: String(req1.sha256).slice(0, 12) }));
  db.run('UPDATE entities SET content = ? WHERE id = ?', [mdConv('2026-09-01T10:00:00.000Z', '回滚验证缺一不可'), 'a']);
  const req2 = MR.buildRetireRequest(store, NOW);
  ac('AC-5 摘要随正文变', req1.sha256 !== req2.sha256,
    JSON.stringify({ s1: String(req1.sha256).slice(0, 12), s2: String(req2.sha256).slice(0, 12) }));

  // AC-6 铁律：留存规划本身无写路径
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'retention.js'), 'utf8');
  ac('AC-6 铁律', !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src) && !/INSERT\s+INTO/i.test(src),
    'retention 源码含写语句');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
