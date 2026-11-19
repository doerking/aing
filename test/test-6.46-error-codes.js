'use strict';
// M6 任务 6.46 failing test —— 错误码行动表（SPEC-6.46）
// 要修的病：v2 的错误散在几十个 throw 里，没人知道哪条该重试、哪条该补输入、哪条是接线炸了。
const fs = require('fs'); const path = require('path');
const { spawnSync } = require('child_process');
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let E = null;
try { E = require('../src/error-handler.js'); } catch (_) { E = null; }
const KLASSES = ['wiring', 'fix-input', 'retryable', 'operator'];

(async () => {
  const table = E && E.ERROR_TABLE ? E.ERROR_TABLE : null;

  // AC-1 结构守卫：src 中所有小写错误码都在表内
  const dir = path.join(__dirname, '..', 'src');
  const codes = new Set();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of text.matchAll(/throw new Error\(\s*'([a-z][a-z0-9-]{2,})(?::|')/g)) codes.add(m[1]);
  }
  const missing = [...codes].filter(c => !table || !table[c]);
  ac('AC-1 结构守卫：src 错误码全登记', !!table && codes.size >= 20 && missing.length === 0,
    JSON.stringify({ codes: [...codes], missing }));

  // AC-2 表项四要素齐、code 不重复（对象天然不重复，验值形状）
  const bad = table ? Object.entries(table).filter(([, v]) => !v || !KLASSES.includes(v.klass) || !String(v.action || '').trim()) : ['no-table'];
  ac('AC-2 表项形状齐（klass 四类内、action 非空）', !!table && bad.length === 0, JSON.stringify(bad.slice(0, 5)));

  // AC-3 分类正确
  const c1 = E && E.classify ? E.classify('identity-rejected: 写面只认 hana') : null;
  const c2 = E && E.classify ? E.classify('db-locked: 另一写者持有锁') : null;
  const c3 = E && E.classify ? E.classify('id-required') : null;
  ac('AC-3 identity-rejected→operator / db-locked→retryable / id-required→fix-input',
    !!c1 && c1.klass === 'operator' && !!c2 && c2.klass === 'retryable' && !!c3 && c3.klass === 'fix-input',
    JSON.stringify({ c1, c2, c3 }));

  // AC-4 接受 Error 实例
  const c4 = E && E.classify ? E.classify(new Error('narrative-invalid: missing-section:产出')) : null;
  ac('AC-4 接受 Error 实例', !!c4 && c4.code === 'narrative-invalid' && c4.known === true, JSON.stringify(c4));

  // AC-5 未知码 → unknown 不抛
  let c5 = null; let threw = false;
  try { c5 = E && E.classify ? E.classify('totally-new-code: 什么东西') : null; } catch (_) { threw = true; }
  ac('AC-5 未知码返回 unknown 且不抛', !threw && !!c5 && c5.klass === 'unknown' && c5.known === false, JSON.stringify(c5));

  // AC-6 wiring 家族
  const c6 = E && E.classify ? E.classify('kespi 需要 store 注入（SPEC-1.15 契约）') : null;
  ac('AC-6 wiring 家族识别', !!c6 && c6.klass === 'wiring' && c6.code === 'wiring', JSON.stringify(c6));

  // AC-7 CLI --json 可解析且条数一致
  const r7 = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'errors.js'), '--json'], { encoding: 'utf8', timeout: 60000 });
  let j7 = null; try { j7 = JSON.parse(r7.stdout); } catch (_) { j7 = null; }
  ac('AC-7 CLI --json 可解析且条数与表一致',
    r7.status === 0 && !!j7 && Array.isArray(j7.codes) && j7.codes.length === Object.keys(table || {}).length,
    JSON.stringify({ status: r7.status, n: j7 && j7.codes && j7.codes.length, t: Object.keys(table || {}).length }));

  console.log(`\n----- 6.46 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
