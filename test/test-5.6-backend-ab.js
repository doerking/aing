'use strict';
// M5 任务 5.6 failing test —— 后端对照自测（SPEC-5.6）
// 纯函数面：检索器注入，不连库、不加载模型。
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const AB = require('../src/backend-ab.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const queries = [
  { q: '安全债还剩几项', lang: 'zh', kind: 'exact' },
  { q: '啲高危漏洞边个跟', lang: 'yue', kind: '口语' }
];

// 假检索器：按后端名返回不同结果，并记录调用
function makeSearch() {
  const calls = [];
  const searchOf = async (backend, q) => {
    calls.push({ backend, q });
    const tag = backend === 'lit' ? 'L' : 'S';
    return [{ id: tag + '-1', name: tag + ' 一号' }, { id: tag + '-2', name: tag + ' 二号' }, { id: tag + '-3', name: tag + ' 三号' }];
  };
  return { searchOf, calls };
}

(async () => {
  // AC-1 表结构
  {
    const { searchOf } = makeSearch();
    const sheet = await AB.buildSheet({ queries, searchOf, k: 3 });
    const lines = sheet.sheet.split('\n');
    const header = lines.find((l) => /^\|\s*#\s*\|/.test(l)) || '';
    const rows = lines.filter((l) => /^\|\s*\d+\s*\|/.test(l));
    const cols = header.split('|').map((c) => c.trim()).filter(Boolean);
    const ok = cols.join(',') === '#,问题,字面（hash-64w2）,语义（onnx-e5-small）,判定' &&
      rows.length === queries.length && rows.every((r) => /\|\s*\?\s*\|/.test(r));
    ac('AC-1 表结构', ok, JSON.stringify({ cols, rows: rows.length }));
  }

  // AC-2 两列不串源
  {
    const { searchOf, calls } = makeSearch();
    const sheet = await AB.buildSheet({ queries, searchOf, k: 3 });
    const first = sheet.rows[0] || { lit: [], sem: [] };
    const litIds = first.lit.map((x) => x.id).join(',');
    const semIds = first.sem.map((x) => x.id).join(',');
    const both = calls.filter((c) => c.q === queries[0].q).map((c) => c.backend).sort().join(',');
    ac('AC-2 两列不串源', /^L-1,L-2,L-3$/.test(litIds) && /^S-1,S-2,S-3$/.test(semIds) && both === 'lit,sem',
      JSON.stringify({ litIds, semIds, both }));
  }

  // AC-3 复跑一致
  {
    const a = await AB.buildSheet({ queries, searchOf: makeSearch().searchOf, k: 3 });
    const b = await AB.buildSheet({ queries, searchOf: makeSearch().searchOf, k: 3 });
    ac('AC-3 复跑一致', a.sheet === b.sheet, '两次出单不同');
  }

  // AC-4 空集安全
  {
    let ok = true, msg = '';
    try {
      const r = await AB.buildSheet({ queries: [], searchOf: makeSearch().searchOf, k: 3 });
      const rows = r.sheet.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
      ok = r.rows.length === 0 && rows.length === 0 && /^\|\s*#\s*\|/m.test(r.sheet);
      msg = JSON.stringify({ rows: r.rows.length });
    } catch (e) { ok = false; msg = e.message; }
    ac('AC-4 空集安全', ok, msg);
  }

  // AC-5 judge-score 识别 ab 单
  {
    const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-ab-score-'));
    const file = path.join(yard, 'ab.md');
    const { searchOf } = makeSearch();
    const sheet = await AB.buildSheet({ queries, searchOf, k: 3 });
    fs.writeFileSync(file, sheet.sheet.replace(/\| \? \|/g, (m, i) => m), 'utf8');
    // 第一条判语义好、第二条判字面好
    const filled = sheet.sheet.split('\n').map((l) => {
      if (/^\|\s*1\s*\|/.test(l)) return l.replace(/\|\s*\?\s*\|/, '| 语义好 |');
      if (/^\|\s*2\s*\|/.test(l)) return l.replace(/\|\s*\?\s*\|/, '| 字面好 |');
      return l;
    }).join('\n');
    fs.writeFileSync(file, filled, 'utf8');
    let out = '', code = 0;
    try { out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'judge-score.js'), '--in', file], { encoding: 'utf8' }); }
    catch (e) { code = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
    fs.rmSync(yard, { recursive: true, force: true });
    ac('AC-5 判分器认 ab 单', code === 0 && /语义胜率/.test(out) && /50\.0%/.test(out), JSON.stringify({ code, out: out.slice(0, 120) }));
  }

  // AC-6 未判 / 错值拒收
  {
    const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-ab-reject-'));
    const file = path.join(yard, 'ab.md');
    const { searchOf } = makeSearch();
    const sheet = await AB.buildSheet({ queries, searchOf, k: 3 });
    fs.writeFileSync(file, sheet.sheet, 'utf8');
    let code = 0, out = '';
    try { out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'judge-score.js'), '--in', file], { encoding: 'utf8' }); }
    catch (e) { code = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
    fs.rmSync(yard, { recursive: true, force: true });
    ac('AC-6 未判拒收', code !== 0 && /1|2/.test(out), JSON.stringify({ code, out: out.slice(0, 120) }));
  }

  // AC-7 语义胜率分子是「语义好」——非对称样本才能识破分子分母颠倒
  // （AC-5 用 1:1 样本，正反算出来都是 50%，掩了这个 bug）
  {
    const { parseSheet, score } = require('../tools/judge-score.js');
    const sheet = [
      '# 后端对照自测 · ab · 3 条',
      '| # | 问题 | 字面（hash-64w2） | 语义（onnx-e5-small） | 判定 |',
      '|---|---|---|---|---|',
      '| 1 | q1 | A | B | 语义好 |',
      '| 2 | q2 | A | B | 语义好 |',
      '| 3 | q3 | A | B | 字面好 |'
    ].join('\n');
    const s = score(parseSheet(sheet));
    ac('AC-7 语义胜率分子是语义好（2:1 → 66.7%）',
      s.rate != null && Math.abs(s.rate - 2 / 3) < 1e-9,
      JSON.stringify({ rate: s.rate, counts: s.counts }));
  }

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
