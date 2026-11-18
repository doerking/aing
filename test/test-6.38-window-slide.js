'use strict';
// M6 任务 6.38 failing test —— 摘录窗口滑动：六段抽取的起点按游标偏移前后移动
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-win-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');
const T = require('../tools/parasite-round.js');

const SCENE = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥' + '春夏秋冬梅兰竹菊风雨雷电山川湖海琴棋书画诗酒花茶' + '东西南北金石丝竹土革木石宫商角徵羽清浊缓急刚柔';
const narrative = () => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown: N.SECTIONS.map(k => `### ${k}\n无`).join('\n\n'),
  turns: [{ scene: SCENE, thinking: '思考内容足够长可以截取一段', output: '产出内容也足够长可以截取', tools: [] }],
  stats: { bodyChars: 0 }, calibrations: []
});

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('n-w','n-w','Conversation',?,'[\"a\",\"b\",\"c\"]','active',0.6,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [narrative()]);
  store._persist();
  const claim = { id: 't-1', entity_id: 'n-w', dim: 'kq' };

  // 找 delta 正负两类轮次
  const deltaOf = (r) => (K.sectionThreshold ? K.sectionThreshold('n-w', { round: r }) - 20 : 0);
  let posRound = -1, negRound = -1;
  for (let r = 0; r < 12; r++) { const d = deltaOf(r); if (d > 0 && posRound < 0) posRound = r; if (d < 0 && negRound < 0) negRound = r; }

  const part = (r) => (T.externalPartNarrative ? T.externalPartNarrative(db, claim, { round: r }) : null);
  const sect = (r, k) => { const p = part(r); return p ? p.patch.sections[k] : ''; };

  // AC-1 不同轮摘录起点不同
  ac('AC-1 不同轮次摘到不同片段', posRound >= 0 && negRound >= 0 && sect(posRound, '场景（触发）') !== sect(negRound, '场景（触发）'),
    JSON.stringify({ posRound, negRound, d0: deltaOf(posRound) }));

  // AC-2 delta<0 从头；delta>0 跳过 delta 字
  const sNeg = sect(negRound, '场景（触发）'), sPos = sect(posRound, '场景（触发）');
  ac('AC-2 负偏移从头、正偏移跳过', sNeg.includes(SCENE.slice(0, 5)) && !sPos.includes(SCENE.slice(0, 3)),
    JSON.stringify({ n: sNeg.slice(0, 20), p: sPos.slice(0, 20) }));

  // AC-3 摘录确为原文子串
  const dPos = deltaOf(posRound);
  ac('AC-3 摘录来自原文对应位置', sPos.includes(SCENE.slice(dPos, dPos + 8)), JSON.stringify({ dPos, s: sPos.slice(0, 24) }));

  // AC-4 窗口宽度不变
  const lens = [posRound, negRound].map(r => {
    const body = sect(r, '场景（触发）');
    const m = body.match(/「(.*)」/);
    return m ? m[1].length : -1;
  });
  ac('AC-4 窗口宽度受约束（≤62含省略号）', lens.every(n => n > 0 && n <= 62), JSON.stringify({ lens }));

  // AC-5 同 (实体,轮) 可复算
  ac('AC-5 同轮可复算', JSON.stringify(part(posRound)) === JSON.stringify(part(posRound)), '');

  // AC-6 不写库
  const snap = () => { const s = db.prepare('SELECT id, content, updated_at FROM entities ORDER BY id'); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return JSON.stringify(a); };
  const b = snap(); part(posRound);
  ac('AC-6 外部件不写库', b === snap(), '');

  console.log(`\n----- 6.38 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
