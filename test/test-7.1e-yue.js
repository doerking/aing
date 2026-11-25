'use strict';
// M7 任务 7.1e failing test —— 锁 SPEC-7.1 AC-4（粤语拆解 · 粤普对照）在真实问句上的覆盖
// 口径：九条粤语问句进来，拆得出词素，也转得出普通话对照；非粤语不得乱猜对照。
const fs = require('fs'); const os = require('os'); const path = require('path');
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const derive = require('../src/derive.js');
const gloss = (q) => (derive.segment(q).mandarin || []).join('|');

// 九条粤语问句（来自 24 条对照单）
const CASES = [
  ['啲高危漏洞扫出嚟之后边个跟', ['谁', '扫出来']],
  ['commit 俾个闸拦住咗点算', ['被', '拦住了', '怎么办']],
  ['意识神经嗰边仲争几多单', ['那边', '还', '多少']],
  ['红蓝啲技能系边度搵返嚟嘅', ['哪里', '找', '回来']],
  ['两个回路点样合埋一齐', ['怎样', '合并', '一起']],
  ['战役打完嘅复盘记咗喺边', ['打完', '记了']],
  ['三分编组学说嗰份草案放咗喺边度', ['那份', '放了', '哪里']],
  ['mimosa 扫出嚟嘅安全债仲有几多未拍板', ['扫出来', '还有', '多少', '未决定']],
  ['意识神经缺口 12 单系边个同步过嚟', ['是', '谁', '同步过来']]
];

for (const [q, need] of CASES) {
  const g = gloss(q);
  const miss = need.filter((w) => !g.includes(w));
  ac('AC-4d 粤语问句可转普通话：' + q.slice(0, 12), miss.length === 0, JSON.stringify({ g, miss }));
}

// AC-4e 非粤语不猜：完全无关的书面语不应产出对照词
const gl = gloss('三分编组攻防学说草案落档');
ac('AC-4e 非粤语不乱猜', gl === '', JSON.stringify(gl));

// AC-4f 词素拆分：粤语句拆出的词素数 ≥ 1，且原句不改写
const s = derive.segment('搞掂之后点样跟进');
ac('AC-4f 词素拆分', (s.tokens || []).length >= 3 && s.text === '搞掂之后点样跟进',
  JSON.stringify({ tokens: s.tokens.slice(0, 8), text: s.text }));

console.log(`\n----- 7.1e pass=${pass} fail=${fail} -----`);
process.exit(fail ? 1 : 0);

