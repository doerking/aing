'use strict';
// M5 任务 5.3c failing test —— 检索评测执行器（tools/bench-retrieval.js）
// 口径见 docs/Engineering/EMBEDDING-BENCH-2026-11-16.md §二/§三：冻结评测集 + P@10 / R@10 / 负例命中率，粤语单列。
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const B = require('../tools/bench-retrieval.js');

(async () => {
  // AC-1 单题指标：P@10 分母固定 10；R@10 按 pos 数；负例命中 = 1/0
  const m1 = B.metricsFor(['eval-001', 'eval-002'], { pos: ['eval-001'], neg: ['eval-002'] }, 10);
  const m2 = B.metricsFor(['eval-003'], { pos: ['eval-001', 'eval-002'], neg: [] }, 10);
  ac('AC-1 单题指标', Math.abs(m1.p10 - 0.1) < 1e-9 && Math.abs(m1.r10 - 1) < 1e-9 && m1.negHit === 1 &&
    Math.abs(m2.p10 - 0) < 1e-9 && Math.abs(m2.r10 - 0) < 1e-9 && m2.negHit === 0,
    JSON.stringify({ m1, m2 }));

  // 基准：真库与评测集快照
  const REAL = path.join(__dirname, '..', 'data', 'knowledge.db');
  const realBefore = fs.existsSync(REAL) ? (() => { const s = fs.statSync(REAL); return s.size + ':' + s.mtimeMs; })() : null;

  // AC-2 跑通 + 分层单列：65 题，zh/yue/en 题数与 FROZEN 一致，yue 单列存在
  const frozen = JSON.parse(fs.readFileSync(B.DEFAULTS.frozen, 'utf8'));
  const r1 = await B.runBench({ keep: false });
  const langOk = r1.byLang.zh && r1.byLang.yue && r1.byLang.en &&
    r1.byLang.zh.n === frozen.counts.langs.zh && r1.byLang.yue.n === frozen.counts.langs.yue &&
    r1.byLang.en.n === frozen.counts.langs.en;
  ac('AC-2 跑通且分层单列', r1.pairs === frozen.counts.pairs && langOk && r1.backend === 'hash-64w2',
    JSON.stringify({ pairs: r1.pairs, byLang: Object.fromEntries(Object.entries(r1.byLang).map(([k, v]) => [k, v.n])), backend: r1.backend }));

  // AC-3 确定性：同输入两次跑，名次与指标完全一致
  const r2 = await B.runBench({ keep: false });
  const sig = (r) => JSON.stringify({ o: r.overall, l: r.byLang, k: r.byKind, rows: r.rows.map((x) => [x.q, x.p10, x.r10, x.negHit]) });
  ac('AC-3 确定性', sig(r1) === sig(r2), '两次结果不同');

  // AC-4 后端可切：hash-64 也能跑，且报告后端名
  const r3 = await B.runBench({ backend: 'hash-64', keep: false });
  ac('AC-4 后端可切', r3.backend === 'hash-64' && r3.rows.length === frozen.counts.pairs,
    JSON.stringify({ backend: r3.backend, rows: r3.rows.length }));

  // AC-5 只读实体：跑完 name/content/last_access/status 逐字段不变（向量表可写）
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-bench-t-'));
  const store = require('../src/knowledge-store.js');
  await B.runBench({ dbPath: yard, keep: true });
  const snap = () => {
    const db = store._getDb();
    const s = db.prepare('SELECT id,name,content,last_access,status,invalid_at FROM entities ORDER BY id');
    const out = []; while (s.step()) out.push(s.getAsObject()); s.free();
    return JSON.stringify(out);
  };
  const before = snap();
  await B.runBench({ dbPath: yard, keep: true });
  const after = snap();
  ac('AC-5 只读实体', before === after && JSON.parse(after).length === frozen.counts.corpus,
    JSON.stringify({ same: before === after, n: JSON.parse(after).length }));

  // AC-6 不碰真库：跑完 data/knowledge.db 的 size/mtime 不变
  const realAfter = fs.existsSync(REAL) ? (() => { const s = fs.statSync(REAL); return s.size + ':' + s.mtimeMs; })() : null;
  ac('AC-6 真库零扰动', realBefore === realAfter, JSON.stringify({ realBefore, realAfter }));

  try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
