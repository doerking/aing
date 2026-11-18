'use strict';
// M6 任务 6.36 failing test —— 阈值游标：20 一次，±(1..5) 各走一遍，再回 20，方向交替
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cur-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');

const TH = (id, r) => (K.sectionThreshold ? K.sectionThreshold(id, { round: r }) : null);

(async () => {
  const seq = Array.from({ length: 12 }, (_, r) => TH('e-x', r));

  // AC-1 序列形状：每 6 轮首项 20，其余为 20±(1..5) 各一次
  const cycle0 = seq.slice(0, 6), cycle1 = seq.slice(6, 12);
  const shape = (c) => c[0] === 20 && c.slice(1).map(v => Math.abs(v - 20)).sort().join(',') === '1,2,3,4,5';
  ac('AC-1 每周期 20 开头、幅度 1..5 各一次', shape(cycle0) && shape(cycle1), JSON.stringify({ seq }));

  // AC-2 同 (实体, 轮) 恒定
  const rep = [TH('e-x', 3), TH('e-x', 3), TH('e-x', 7), TH('e-x', 7)];
  ac('AC-2 同实体同轮可复算', rep[0] === rep[1] && rep[2] === rep[3], JSON.stringify(rep));

  // AC-3 两实体 shuffle 顺序不同
  const a = [1, 2, 3, 4, 5].map(r => TH('alpha', r));
  const b = [1, 2, 3, 4, 5].map(r => TH('beta', r));
  ac('AC-3 不同实体顺序不同', a.join(',') !== b.join(','), JSON.stringify({ a, b }));

  // AC-4 无 id 或无 round → 20
  ac('AC-4 缺参退回 20', K.sectionThreshold && K.sectionThreshold('') === 20 && K.sectionThreshold('e-x') === 20,
    JSON.stringify({ empty: K.sectionThreshold && K.sectionThreshold(''), noRound: K.sectionThreshold && K.sectionThreshold('e-x') }));

  // AC-5 方向交替：第 2 周期符号全反
  const s0 = cycle0.slice(1).map(v => Math.sign(v - 20));
  const s1 = cycle1.slice(1).map(v => Math.sign(v - 20));
  ac('AC-5 第 2 周期逐位反相', s1.every((x, i) => x === -s0[i]), JSON.stringify({ s0, s1 }));

  // AC-6 非叙事读数不变
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('p','p','Conversation',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['# 会话\n\n' + '甲'.repeat(1600)]);
  store._persist();
  await K.kespiStep(store, {});
  const kq = (() => { const s = db.prepare("SELECT kq FROM kespi_scores WHERE entity_id='p'"); s.step(); const r = s.getAsObject(); s.free(); return Number(r.kq); })();
  ac('AC-6 非叙事实体读数不变', Math.abs(kq - 0.675) <= 0.02, JSON.stringify({ kq }));

  console.log(`\n----- 6.36 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
