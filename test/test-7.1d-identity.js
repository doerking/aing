'use strict';
// M7 任务 7.1d failing test —— 锁 SPEC-7.1 AC-1（序列号身份）/ AC-2（指纹去重 · 只追加）
// 口径：id 是序列号（e-YYYYMMDD-NNNN），只追加不复用；title 由正文派生，永不入键；
//       同内容指纹第二次进来返回原号，不再落行；同号不同内容一律拒（原文不改写）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-id-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let ID = null;
try { ID = require('../src/identity.js'); } catch (_) { ID = null; }

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const count = () => {
    const s = db.prepare('SELECT COUNT(*) AS n FROM entities'); s.step();
    const n = s.getAsObject().n; s.free(); return n;
  };

  if (!ID) {
    ['AC-1a 序列号格式与单调', 'AC-1b 标题由正文派生', 'AC-2a 指纹去重', 'AC-2b 同号不同内容拒写',
      'AC-2c 指纹落列且可查'].forEach((n) => ac(n, false, 'src/identity.js 未实现'));
    console.log(`\n----- 7.1d pass=${pass} fail=${fail} -----`);
    process.exit(1);
  }

  // ── AC-1a 序列号：格式 e-YYYYMMDD-NNNN，同日单调递增，不回收 ──
  const a1 = ID.nextSerial(store, { date: '20261117' });
  const a2 = ID.nextSerial(store, { date: '20261117' });
  store.insertEntity({ id: a1, name: '占位', type: 'Concept', content: '占位正文', tags: '[]', status: 'active' });
  const a3 = ID.nextSerial(store, { date: '20261117' });
  const fmt = (x) => /^e-\d{8}-\d{4}$/.test(String(x));
  ac('AC-1a 序列号格式与单调',
    fmt(a1) && fmt(a2) && fmt(a3) && a1 !== a2 && a3 !== a2 && Number(a3.slice(-4)) > Number(a1.slice(-4)),
    JSON.stringify({ a1, a2, a3 }));

  // ── AC-1b 标题派生：从正文取，不取时间戳、不泄漏 JSON 外壳 ──
  const conv = JSON.stringify({ topic: '意识神经缺口工单', at: '2026-11-05T20:57:03Z', reply: '12 单就绪，W1-W12。', searchShown: [], rationale: '', outcome: 'open' });
  const t1 = ID.titleOf(conv);
  const t2 = ID.titleOf('# 三三制学说草案\n\n正文第一段');
  const t3 = ID.titleOf('');
  ac('AC-1b 标题由正文派生',
    t1 === '意识神经缺口工单' && t2 === '三三制学说草案' && t3.length > 0 &&
    !/^\d{4}-\d{2}-\d{2}T/.test(t1) && !t1.includes('{') && t1.length <= 40,
    JSON.stringify({ t1, t2, t3 }));

  // ── AC-2a 指纹去重：同内容再进返回原号，不落新行 ──
  const body = '三三制攻防学说草案 v0 落档：三面合拢。';
  const r1 = ID.ingestEntity(store, { content: body, type: 'Concept', title: '甲标题' });
  const n1 = count();
  const r2 = ID.ingestEntity(store, { content: body, type: 'Concept', title: '乙标题' });
  const n2 = count();
  ac('AC-2a 指纹去重',
    !!r1.id && r2.id === r1.id && r2.deduped === true && n2 === n1 && fmt(r1.id),
    JSON.stringify({ r1, r2, n1, n2 }));

  // ── AC-2b 同号不同内容：拒写，原文不动 ──
  const before = store.getEntity(r1.id).content;
  let threw = false;
  try { store.insertEntity({ id: r1.id, name: '改名', type: 'Concept', content: '另一段完全不同的正文', tags: '[]', status: 'active' }); }
  catch (_) { threw = true; }
  const after = store.getEntity(r1.id).content;
  ac('AC-2b 同号不同内容拒写', threw && after === before, JSON.stringify({ threw, same: after === before }));

  // ── AC-2c 指纹落列且可查（去重靠列，不靠扫全库字符串比较）──
  const cols = store.columns('entities');
  const row = store.getEntity(r1.id);
  ac('AC-2c 指纹落列且可查',
    cols.includes('fingerprint') && !!row.fingerprint && row.fingerprint === ID.fingerprint(body),
    JSON.stringify({ has: cols.includes('fingerprint'), fp: row && row.fingerprint }));

  console.log(`\n----- 7.1d pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
