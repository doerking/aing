'use strict';
// M3 任务 3.11b failing test —— memo 用户面话题可读（SPEC-3.11 修订 A）
// 真库现状：会话正文多为 markdown，memo 取不到 topic → 用户面直接裸露「会话-<ISO 时间戳>」。
// 判据不变：只改显示用的读法，不改任何筛选/排序。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-memoread-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let M = {};
try { M = require('../src/memo.js'); } catch (_) { M = {}; }
const call = async (fn, ...args) => { try { return await fn(...args); } catch (e) { return { error: e.message }; } };

const NL = String.fromCharCode(10);
const cnv = (sessionTs, summary) => ['# 会话-' + sessionTs, '', '## 来源', '',
  '- 原始资料：dispatch-20261106T0240-hourglass-opt-w1', '', '## 内容', '',
  '# 会话-' + sessionTs, '', '## 蒸馏摘要', '', '- ' + summary, ''].join(NL);

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();
  const put = (id, name, content) => db.run(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, created_at, updated_at)
     VALUES (?, ?, 'Conversation', ?, '["t"]', 'active', 0.6, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [id, name, content]);

  const sameSummary = '回炉闭环要先补接链，否则压缩单向泄漏。';
  put('conv-md1', '会话-2026-11-09T01:23:41.985Z', cnv('2026-11-09T01:23:41.985Z', sameSummary));
  put('conv-md2', '会话-2026-11-08T02:10:00.000Z', cnv('2026-11-08T02:10:00.000Z', sameSummary));
  put('conv-json', '检索融合', JSON.stringify({ topic: '检索融合', at: '2026-11-10T01:00:00Z', reply: '检索融合要加 IDF 通道。', outcome: 'open' }));
  await require('../src/vector.js').vectorStep(store, {});
  await store._persist?.();

  const snap = () => JSON.stringify((() => { const s = db.prepare('SELECT id,name,type,content,last_access,status,invalid_at FROM entities ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  const before = snap();

  const m = await call(M.buildMemo, store, { limit: 5 });
  const user = (m && m.user) || {};
  const recentText = JSON.stringify(user.recent || []);
  const loopText = JSON.stringify(user.openLoops || []);
  const patText = JSON.stringify(user.patterns || []);

  // AC-1 以往主题可读：markdown 会话不再裸露 ISO 时间戳 / 标题符
  ac('AC-1 以往主题可读', (user.recent || []).length === 3 &&
    !/T01:23:41|T02:10:00/.test(recentText) && !/## /.test(recentText) &&
    /回炉闭环/.test(recentText),
    recentText.slice(0, 300));

  // AC-2 未闭环同源可读
  ac('AC-2 未闭环可读', (user.openLoops || []).length >= 1 &&
    !/T01:23:41|T02:10:00/.test(loopText) && /回炉闭环/.test(loopText),
    loopText.slice(0, 300));

  // AC-3 JSON 会话照用原文 topic（不被改写、不被摘要段覆盖）
  ac('AC-3 JSON 主题原样', (user.recent || []).some((r) => r.topic === '检索融合'),
    recentText.slice(0, 300));

  // AC-4 模式能按可读话题聚合（旧实现 markdown 会话无 topic → 模式恒空）
  const pats = user.patterns || [];
  ac('AC-4 模式聚合', pats.length >= 1 && /回炉闭环/.test(patText) && pats.some((p) => p.hits >= 2),
    patText.slice(0, 300));

  // AC-5 只读
  ac('AC-5 只读', before === snap(), 'memo 改动了实体');

  // AC-6 铁律
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'memo.js'), 'utf8');
  ac('AC-6 铁律', !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src) && !/INSERT\s+INTO/i.test(src),
    'memo 源码含写语句');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
