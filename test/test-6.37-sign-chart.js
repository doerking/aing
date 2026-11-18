'use strict';
// M6 任务 6.37 failing test —— 阈值符号串 ++-+----+-++（12 符号，每 6 个反相）
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-sign-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const TH = (id, r) => (K.sectionThreshold ? K.sectionThreshold(id, { round: r }) : null);
const CHART = ['+', '+', '-', '+', '-', '-', '-', '-', '+', '-', '+', '+'];
const signOf = (v) => (v > 20 ? '+' : v < 20 ? '-' : '0');

(async () => {
  const seq = Array.from({ length: 12 }, (_, r) => TH('e-x', r));

  // AC-1 非零位符号与符号串一致
  const okSigns = seq.every((v, r) => (r % 6 === 0 ? v === 20 : signOf(v) === CHART[r % 12]));
  ac('AC-1 符号与 ++-+----+-++ 一致', okSigns, JSON.stringify({ seq, signs: seq.map(signOf) }));

  // AC-2 每周期首轮 20
  ac('AC-2 r=0、r=6 为 20', seq[0] === 20 && seq[6] === 20, JSON.stringify({ a: seq[0], b: seq[6] }));

  // AC-3 幅度每周期各一次
  const mags = (s) => s.slice(1).map(v => Math.abs(v - 20)).sort().join(',');
  ac('AC-3 幅度 1..5 各一次', mags(seq.slice(0, 6)) === '1,2,3,4,5' && mags(seq.slice(6, 12)) === '1,2,3,4,5', JSON.stringify({ c0: mags(seq.slice(0, 6)), c1: mags(seq.slice(6, 12)) }));

  // AC-4 第 2 周期为反相
  const s0 = seq.slice(0, 6).map(signOf), s1 = seq.slice(6, 12).map(signOf);
  const flip = (s) => s.map(x => (x === '+' ? '-' : x === '-' ? '+' : '0'));
  ac('AC-4 第 2 周期全反相', flip(s0).join('') === s1.join(''), JSON.stringify({ s0, s1 }));

  // AC-5 可复算
  ac('AC-5 同实体同轮可复算', TH('e-x', 3) === seq[3] && TH('other', 3) !== null, JSON.stringify({ a: TH('e-x', 3), b: TH('e-x', 3) }));

  // AC-6 非叙事不变
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('p','p','Conversation',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['# 会话\n\n' + '甲'.repeat(1600)]);
  store._persist();
  await K.kespiStep(store, {});
  const kq = (() => { const s = db.prepare("SELECT kq FROM kespi_scores WHERE entity_id='p'"); s.step(); const r = s.getAsObject(); s.free(); return Number(r.kq); })();
  ac('AC-6 非叙事实体读数不变', Math.abs(kq - 0.675) <= 0.02, JSON.stringify({ kq }));

  console.log(`\n----- 6.37 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
