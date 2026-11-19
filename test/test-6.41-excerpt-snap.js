'use strict';
// M6 任务 6.41 failing test —— 摘录起点对齐句读（SPEC-6.41）
// 要修的病：6.38 的窗口起点按游标偏移后会落在句子中腰，摘出来读着别扭。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-snap-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const N = require('../src/capability-narrative.js');
const T = require('../tools/parasite-round.js');

const win = (text, start, width) => (typeof T.excerptWindow === 'function' ? T.excerptWindow(text, start, width) : null);

(async () => {
  // AC-1 起点落在句中 → 吸附到附近句读之后
  const t1 = '先把报表里的异常项挑出来，再按错误码分类，最后决定要不要改口径。';
  const w1 = win(t1, 6, 20);   // 6 = 「表里的异常项…」中腰
  ac('AC-1 句中起点吸附到句读之后',
    !!w1 && t1[w1.start - 1] === '，' && w1.text === t1.slice(w1.start, w1.start + 20),
    JSON.stringify({ w1, at: t1.slice(0, 30) }));

  // AC-2 前后都有句读 → 取更近的
  const t2 = '甲乙丙丁，戊己庚辛壬癸子丑寅卯辰巳午。';
  const w2 = win(t2, 9, 8);    // 前面「，」在 4，后面「。」在 20：前近
  ac('AC-2 就近取（前 4 后 20 → 取前）',
    !!w2 && w2.start === 5,
    JSON.stringify({ w2 }));

  // AC-3 半径内无句读 → 起点不动
  const t3 = '甲'.repeat(40);
  const w3 = win(t3, 7, 10);
  ac('AC-3 无句读 → 起点不动（超长照旧加省略号）', !!w3 && w3.start === 7 && w3.text === '甲'.repeat(10) + '…', JSON.stringify({ w3 }));

  // AC-4 越界夹紧
  const t4 = '第一句，第二句，第三句，第四句。';
  const w4a = win(t4, -5, 6), w4b = win(t4, 999, 6);
  ac('AC-4 越界夹紧（负归 0、超长落尾部且窗口不超限）',
    !!w4a && w4a.start === 0 && !!w4b && w4b.start >= t4.length - 6 && w4b.text.replace('…', '').length <= 6,
    JSON.stringify({ w4a, w4b }));

  // AC-5 窗口宽度不变、超长加省略号
  const t5 = '甲'.repeat(30) + '，' + '乙'.repeat(30);
  const w5 = win(t5, 28, 10);
  ac('AC-5 宽度不变且超长加省略号',
    !!w5 && w5.text.replace('…', '').length === 10 && w5.text.endsWith('…'),
    JSON.stringify({ w5 }));

  // AC-6 同 (实体,轮) 可复算
  const a6 = win(t1, 6, 20), b6 = win(t1, 6, 20);
  ac('AC-6 可复算', !!a6 && JSON.stringify(a6) === JSON.stringify(b6), JSON.stringify({ a6, b6 }));

  // AC-7 端到端：externalPartNarrative 摘录起点在段首或句读之后
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const turns = [{ scene: t1, thinking: t1, output: t1, tools: [] }];
  const content = JSON.stringify({
    format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
    markdown: N.SECTIONS.map(k => `### ${k}\n${'甲'.repeat(60)}`).join('\n\n'),
    turns, stats: { bodyChars: 100 }, calibrations: []
  });
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('n-snap','n-snap','Conversation',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [content]);
  store._persist();
  const ret = T.externalPartNarrative(db, { entity_id: 'n-snap', id: 't-snap' }, { round: 3 });
  const scene = ret && ret.patch && ret.patch.sections ? String(ret.patch.sections['场景（触发）']) : '';
  // 「首轮触发为「…」」——检查引号内首字是段首或紧跟句读
  const m = /「(.+?)」/.exec(scene);
  const q = m ? m[1] : '';
  const okSeg = !!q && (t1.startsWith(q.replace(/…$/, '')) || /[，。！？；、：]$/.test(t1[t1.indexOf(q.slice(0, 3)) - 1]));
  ac('AC-7 端到端摘录起点在段首或句读之后', !!ret && !!q && okSeg, JSON.stringify({ scene, q }));

  console.log(`\n----- 6.41 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
