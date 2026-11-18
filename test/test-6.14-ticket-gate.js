'use strict';
// M6 任务 6.14 failing test —— 锁 SPEC-6.14 回单内容闸（L4 基础件）
// 口径：膜三档只过该过的、发布门五条硬拦、落盘粒度事实+指针缺一不可、组合闸分阶段。
// 纯函数：不碰 store、不做 I/O。
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let G = null;
try { G = require('../src/ticket-gate.js'); } catch (e) { G = null; }

const REC = {
  facts: ['检索命中率 86.9%', '死胡同 68/93'],
  evidence: ['eval/frozen@2026-11-18', 'run/orch-so.json'],
  pointers: ['eval/frozen@2026-11-18'],
  sourceGrade: 'high',
  selfAssessment: 'P@10 11.6% 偏低，样本单一',
  conclusion: '所以应当合并该实体',
  fulltext: '一'.repeat(300),
  landing: '回单 #42 落点：wiki-x'
};

(async () => {
  if (!G) {
    ['AC-1 膜 open 只给落点', 'AC-2 膜 semi 只过事实+指针', 'AC-3 膜 closed 零交换', 'AC-4 未知档位不猜'
    ].forEach((n) => ac(n, false, 'ticket-gate.js 未实现 SPEC-6.14'));
    console.log(`\n----- 6.14 pass=${pass} fail=${fail} -----`);
    process.exit(1);
  }

  // AC-1 膜 open：只给落点，不带结论与全文
  const open = G.membrane('open', REC);
  ac('AC-1 膜 open 只给落点', !!open && open.conclusion === undefined && open.fulltext === undefined &&
    JSON.stringify(open).includes('落点'), JSON.stringify(open));

  // AC-2 膜 semi：只过事实+指针
  const semi = G.membrane('semi', REC);
  const semiKeys = Object.keys(semi || {}).sort();
  ac('AC-2 膜 semi 只过事实+指针',
    JSON.stringify(semiKeys) === JSON.stringify(['facts', 'pointers']) &&
      semi.conclusion === undefined && semi.fulltext === undefined && semi.landing === undefined,
    JSON.stringify({ keys: semiKeys }));

  // AC-3 膜 closed：零交换
  const closed = G.membrane('closed', REC);
  ac('AC-3 膜 closed 零交换', !!closed && Object.keys(closed).length === 0, JSON.stringify(closed));

  // AC-4 未知档位不猜
  let err = '';
  try { G.membrane('half', REC); } catch (e) { err = e.message; }
  ac('AC-4 未知档位不猜（抛 unknown-membrane）', /unknown-membrane/.test(err), err);

  // AC-5 发布门五条硬拦
  const base = { facts: REC.facts, evidence: REC.evidence, sourceGrade: 'high', selfAssessment: REC.selfAssessment };
  const r1 = G.publishGate({ ...base, facts: [] });
  const r2 = G.publishGate({ ...base, evidence: [] });
  const r3 = G.publishGate({ ...base, sourceGrade: undefined });
  const r4 = G.publishGate({ ...base, selfAssessment: '' });
  const r5 = G.publishGate({ ...base, sourceGrade: 'low' });
  ac('AC-5 发布门五条硬拦',
    r1.reasons.includes('no-facts') && r2.reasons.includes('no-evidence') &&
      r3.reasons.includes('no-source-grade') && r4.reasons.includes('no-self-assessment') &&
      r5.reasons.includes('weak-evidence') &&
      [r1, r2, r3, r4, r5].every((r) => r.ok === false),
    JSON.stringify([r1, r2, r3, r4, r5].map((r) => r.reasons)));

  // AC-6 原因码可收全
  const r6 = G.publishGate({ facts: [], evidence: [], sourceGrade: 'high', selfAssessment: '' });
  ac('AC-6 原因码可收全', r6.reasons.includes('no-facts') && r6.reasons.includes('no-evidence') &&
    r6.reasons.includes('no-self-assessment'), JSON.stringify(r6.reasons));

  // AC-7 全过才发
  const ok = G.publishGate(base);
  ac('AC-7 四项齐且分级 high → ok', ok.ok === true && ok.reasons.length === 0, JSON.stringify(ok));

  // AC-8 粒度硬口径
  const thin = G.landingGate({ facts: ['只有事实'], evidence: [], pointers: [] });
  const thick = G.landingGate({ facts: ['事实'], pointers: ['p1'] });
  ac('AC-8 粒度硬口径（缺指针即 thin-payload）',
    thin.ok === false && thin.reason === 'thin-payload' && thick.ok === true,
    JSON.stringify({ thin, thick }));

  // AC-9 组合闸分阶段
  const a1 = G.admit({ ...REC, facts: [], evidence: [], pointers: [] }, { membrane: 'semi' });
  const a2 = G.admit({ ...REC, pointers: [], evidence: [] }, { membrane: 'semi' });
  const a3 = G.admit({ ...REC, selfAssessment: '' }, { membrane: 'semi' });
  const a4 = G.admit(REC, { membrane: 'semi' });
  ac('AC-9 组合闸分阶段（membrane/landing/publish）',
    a1.admitted === false && a1.stage === 'membrane' &&
      a2.admitted === false && a2.stage === 'landing' &&
      a3.admitted === false && a3.stage === 'publish' &&
      a4.admitted === true,
    JSON.stringify({ a1: a1.stage, a2: a2.stage, a3: a3.stage, a4: a4.admitted }));

  // AC-10 纯函数：源码无 store/fs/网络/子进程，同输入两次逐位相等
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ticket-gate.js'), 'utf8');
  const dirty = [/knowledge-store/, /require\(['"]fs['"]\)/, /child_process/, /https?:\/\//, /fetch\(/]
    .filter((re) => re.test(src));
  const twice = JSON.stringify(G.membrane('semi', REC)) === JSON.stringify(G.membrane('semi', REC)) &&
    JSON.stringify(G.publishGate(base)) === JSON.stringify(G.publishGate(base));
  ac('AC-10 纯函数（无 store/fs/网络/子进程，可复算）', dirty.length === 0 && twice, JSON.stringify({ dirty }));

  console.log(`\n----- 6.14 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
