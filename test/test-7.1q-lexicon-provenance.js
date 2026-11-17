'use strict';
// M7 任务 7.1q failing test —— 锁 SPEC-7.1 AC-9（纯本地）与 AC-13（词典可追溯）
// 契约：
//   AC-9  生成器与词典纯本地：源码里不出现网络/子进程调用（无 http(s)/net/tls/dns/fetch、
//         无 child_process 跑外部工具），也不引 GPU 运行时；
//   AC-13 每个词典文件登记出处与许可（`_meta.license`），且 `data/lexicon/README.md` 逐个列名；
//         抽词器确定性——同输入两次输出逐位一致。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-lexprov-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const ROOT = path.join(__dirname, '..');
const LEX = path.join(ROOT, 'data', 'lexicon');
const derive = require('../src/derive.js');

const files = fs.readdirSync(LEX).filter((f) => f.endsWith('.json')).sort();

(async () => {
  // ── AC-13a 每个词典文件都有出处/许可 ──
  const missing = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), 'utf8'));
    const m = d && d._meta;
    if (!m || !String(m.license || '').trim() || !String(m.purpose || '').trim()) missing.push(f);
  }
  ac('AC-13a 每个词典文件登记 purpose + license',
    files.length >= 3 && missing.length === 0,
    JSON.stringify({ files, missing }));

  // ── AC-13b README 逐个列名（许可与出处汇总在一处）──
  const readmePath = path.join(LEX, 'README.md');
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
  const unlisted = files.filter((f) => !readme.includes(f));
  ac('AC-13b README 逐个登记词典文件',
    readme.length > 0 && unlisted.length === 0 && /许可|license/i.test(readme),
    JSON.stringify({ exists: fs.existsSync(readmePath), unlisted }));

  // ── AC-13c 抽词器确定性 ──
  const sample = ['意识神经', '搞掂', '拎返嚟', 'aing harness-engineering'];
  const twice = (fn) => sample.every((s) => JSON.stringify(fn(s)) === JSON.stringify(fn(s)));
  ac('AC-13c 抽词器同输入同输出（四次调用逐位一致）',
    twice((s) => derive.variants(s)) &&
    twice((s) => [...derive.keywordsOf(s)]) &&
    twice((s) => derive.segment(s)) &&
    twice((s) => derive.synonymsOf(s)),
    '存在非确定性');

  // ── AC-9 纯本地：源码无网络/子进程/GPU 依赖 ──
  const banned = [
    [/\brequire\s*\(\s*['"](?:node:)?(?:http|https|net|tls|dns|http2|dgram)['"]/, '网络模块'],
    [/\brequire\s*\(\s*['"]child_process['"]/, '子进程'],
    [/\brequire\s*\(\s*['"](?:node-fetch|axios|got|undici|request)['"]/, 'HTTP 客户端'],
    [/\brequire\s*\(\s*['"](?:onnxruntime-node|onnxruntime-web|@tensorflow\/[^'"]+)['"]/, 'GPU/推理运行时'],
    [/\b(?:globalThis\.)?fetch\s*\(/, 'fetch 调用'],
    [/\bnew\s+XMLHttpRequest\b/, 'XHR'],
    [/\bexecSync\s*\(\s*['"](?:curl|wget|python|pip)\b/, '外部工具调用']
  ];
  const scanned = ['src/derive.js', 'src/sprout-report.js', 'src/sprout.js', 'src/pollinate.js'];
  const hits = [];
  for (const rel of scanned) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const [re, label] of banned) if (re.test(src)) hits.push({ file: rel, kind: label });
  }
  ac('AC-9 生成器与发芽链纯本地（无网络/子进程/GPU 调用）',
    hits.length === 0, JSON.stringify(hits));

  // ── AC-9b 只从仓内 data/lexicon 读词典（不外链路径）──
  const src = fs.readFileSync(path.join(ROOT, 'src', 'derive.js'), 'utf8');
  ac('AC-9b 词典只从仓内 data/lexicon 读',
    /data['"],\s*['"]lexicon/.test(src.replace(/\s+/g, ' ')) || src.includes("'lexicon'"),
    '未看到 data/lexicon 的路径拼装');

  console.log(`\n----- 7.1q pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
