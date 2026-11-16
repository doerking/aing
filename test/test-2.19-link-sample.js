'use strict';
// M2 任务 2.19 failing test —— 链接质量人工判定取样 + 只认人工填写的计分（SPEC-2.19）
// 要守的：取样确定性、全程只读、表头可填、两跳只出缺边三元组、未判拒收、比率真算。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-linksample-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const ROOT = path.join(__dirname, '..');
const SAMPLE = path.join(ROOT, 'tools', 'link-sample.js');
const SCORE = path.join(ROOT, 'tools', 'judge-score.js');
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

const NL = String.fromCharCode(10);
const cellsOf = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const mdConv = (ts, summary) => ['# 会话-' + ts, '', '## 蒸馏摘要', '', '- ' + summary, ''].join(NL);

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();
  const put = (id, name, type, content) => db.run(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', 'active', 0.6, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [id, name, type, content]);
  const link = (a, b, rel) => db.run(
    `INSERT INTO links (source_id, target_id, relation, confidence, strength, created_at)
     VALUES (?, ?, ?, 0.6, 5, CURRENT_TIMESTAMP)`, [a, b, rel]);

  put('e1', '会话-2026-11-01T10:00:00.000Z', 'Conversation', mdConv('2026-11-01T10:00:00.000Z', '回炉闭环要先补接链'));
  put('e2', '检索融合', 'Conversation', JSON.stringify({ topic: '检索融合', reply: '检索融合要加 IDF 通道。' }));
  put('e3', '守恒闸', 'Concept', JSON.stringify({ topic: '守恒闸', reply: '边层主读数。' }));
  put('e4', '二跳候选', 'Concept', JSON.stringify({ topic: '二跳候选', reply: '两跳污染测试点。' }));
  // 三元组 e1—e2—e3（e1—e3 无边）
  link('e1', 'e2', 'sprout');
  link('e2', 'e3', 'pollinate');
  // 对照组：e1—e4—e2，但 e1—e2 已有边 → 两跳取样不该出「e1—e2」这对端点
  link('e4', 'e1', 'sprout');
  link('e4', 'e2', 'sprout');
  await store._persist?.();

  const counts = () => {
    const t = store.listTables().sort();
    return JSON.stringify(t.map((n) => [n, Number((db.prepare('SELECT COUNT(*) AS n FROM ' + n).getAsObject() || {}).n)]));
  };
  const before = counts();

  const r1 = run(SAMPLE, ['--db', DB, '--kind', 'edges', '--n', '20']);
  const r1b = run(SAMPLE, ['--db', DB, '--kind', 'edges', '--n', '20']);

  // AC-1 确定性
  ac('AC-1 取样确定性', r1.status === 0 && r1.stdout.length > 0 && r1.stdout === r1b.stdout,
    JSON.stringify({ s1: r1.status, s2: r1b.status, same: r1.stdout === r1b.stdout, err: (r1.stderr || '').slice(-200) }));

  const rows = r1.stdout.split(NL).filter((l) => /^\|\s*\d+\s*\|/.test(l));

  // AC-2 只读
  const after = counts();
  ac('AC-2 全程只读', before === after, JSON.stringify({ before: before.slice(0, 120), after: after.slice(0, 120) }));

  // AC-3 表头列齐 + 行数 + 标题可读
  const head = r1.stdout.split(NL).find((l) => /^\|\s*#\s*\|/.test(l)) || '';
  const colsOk = ['#', '边', 'A', 'B', '关系', '强度', '判定'].every((c) => head.includes(c));
  const vi = cellsOf(head).indexOf('判定');
  const cellOk = vi !== -1 && rows.every((l) => cellsOf(l)[vi] === '?');
  ac('AC-3 取样单可填', colsOk && rows.length === 4 && !/T10:00:00/.test(r1.stdout) && /回炉闭环/.test(r1.stdout) && cellOk,
    JSON.stringify({ head, rows: rows.length, vi, cellOk }));

  // AC-4 两跳只出 A≠C 且 A—C 无边的三元组
  const r2 = run(SAMPLE, ['--db', DB, '--kind', 'twohop', '--n', '20']);
  const tri = r2.stdout.split(NL).filter((l) => /^\|\s*\d+\s*\|/.test(l));
  const direct = new Set(['e1|e2', 'e2|e1', 'e2|e3', 'e3|e2', 'e4|e1', 'e1|e4', 'e4|e2', 'e2|e4']);
  const endpoints = (l) => {
    const path = cellsOf(l)[1];           // "e3→e2→e4"
    const parts = path.split('→');
    return [parts[0], parts[parts.length - 1]];
  };
  const noDirect = tri.every((l) => {
    const [a, c] = endpoints(l);
    return a !== c && !direct.has(a + '|' + c);
  });
  const triCellOk = tri.every((l) => {
    const vi2 = cellsOf(r2.stdout.split(NL).find((x) => /^\|\s*#\s*\|/.test(x)) || '').indexOf('判定');
    return vi2 !== -1 && cellsOf(l)[vi2] === '?';
  });
  ac('AC-4 两跳只出缺边', r2.status === 0 && tri.length >= 1 && noDirect && triCellOk,
    JSON.stringify({ status: r2.status, tri: tri.slice(0, 4), noDirect, triCellOk, err: (r2.stderr || '').slice(-200) }));

  // AC-5 未判拒收：默认单原样喂判分器
  const sheet = path.join(yard, 'sheet.md');
  fs.writeFileSync(sheet, r1.stdout || '(空)');
  const r3 = run(SCORE, ['--in', sheet]);
  ac('AC-5 未判拒收', r3.status !== 0 && /未判|未填|\?/.test(r3.stdout + r3.stderr),
    JSON.stringify({ status: r3.status, out: (r3.stdout || '').slice(-200), err: (r3.stderr || '').slice(-200) }));

  // AC-6 填好后比率真算：1 假 / 1 真 / 1 存疑 / 1 未判→填真
  const verdictOf = { 1: '假', 2: '真', 3: '存疑', 4: '真' };
  const filled = r1.stdout.split(NL).map((l) => {
    if (!/^\|\s*\d+\s*\|/.test(l)) return l;
    const cs = cellsOf(l);
    cs[vi] = verdictOf[cs[0]] || '真';
    return '| ' + cs.join(' | ') + ' |';
  }).join(NL);
  const sheet2 = path.join(yard, 'sheet2.md');
  fs.writeFileSync(sheet2, filled);
  const r4 = run(SCORE, ['--in', sheet2, '--json']);
  let j = null;
  try { j = JSON.parse(r4.stdout); } catch (_) { j = null; }
  // 4 行：假 / 真 / 存疑 / 真 → 分母 = 真 2 + 假 1，率 = 1/3
  const rateOk = j && j.kind === 'edges' && j.counts.真 === 2 && j.counts.假 === 1 && j.counts.存疑 === 1 &&
    Math.abs((j.rate == null ? -1 : j.rate) - (1 / 3)) < 1e-9;
  ac('AC-6 比率真算', r4.status === 0 && rateOk,
    JSON.stringify({ status: r4.status, out: (r4.stdout || '').slice(0, 300), err: (r4.stderr || '').slice(-200) }));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
