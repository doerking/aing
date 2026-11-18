'use strict';
// M6 任务 6.25 failing test —— 扫单按维配额：一维不能挤占全部名额
// 要修的病：MAX_TICKETS=20 是全局抢位，kd(0 分)/ka(0.2) 永远排前面，
// kq 单进不来——不是没信号，是名额被别的维度吃掉。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-quota-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const S = require('../src/self-optimize.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const mkEnt = (id) => db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Concept',?,'[]','active',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [id, id, '正文'.repeat(400)]);
  const mkScore = (id, o) => db.run("INSERT INTO kespi_scores (entity_id,kq,ka,kd,kc,kr,overall,computed_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)", [id, o.kq, o.ka, o.kd, o.kc, o.kr, o.overall]);

  // 10 个 kq 低（qa 全高，不触发别的维）
  for (let i = 0; i < 10; i++) { mkEnt('q' + i); mkScore('q' + i, { kq: 0.3 + i * 0.001, ka: 1, kd: 0.5, kc: 0.5, kr: 1, overall: 0.66 }); }
  store._persist();

  const r1 = S.scanTickets(store, { persist: false });
  const kq1 = r1.tickets.filter(t => t.dim === 'kq');
  ac('AC-1 默认配额：10 个 kq 低只开 5 张', kq1.length === 5, JSON.stringify({ kq: kq1.length }));

  // 再加 10 个 ka 低
  for (let i = 0; i < 10; i++) { mkEnt('a' + i); mkScore('a' + i, { kq: 0.9, ka: 0.1, kd: 0.5, kc: 0.5, kr: 1, overall: 0.6 }); }
  store._persist();
  const r2 = S.scanTickets(store, { persist: false, maxTickets: 20 });
  const byDim = (r2.tickets || []).reduce((m, t) => (m[t.dim] = (m[t.dim] || 0) + 1, m), {});
  ac('AC-2 各维各占自己额度，互不挤占',
    byDim.kq === 5 && byDim.ka === 5,
    JSON.stringify(byDim));

  const r3 = S.scanTickets(store, { persist: false, quota: { kq: 2 } });
  ac('AC-3 配额可覆盖', r3.tickets.filter(t => t.dim === 'kq').length === 2,
    JSON.stringify({ kq: r3.tickets.filter(t => t.dim === 'kq').length }));

  const r4 = S.scanTickets(store, { persist: false, maxTickets: 3 });
  ac('AC-4 总上限仍优先', r4.tickets.length === 3, JSON.stringify(r4.tickets.map(t => t.dim)));

  // 配额内低分优先：q0..q9 分数递增，取前 5 = q0..q4
  const ids = r1.tickets.filter(t => t.dim === 'kq').map(t => t.entity_id).sort();
  ac('AC-5 配额内低分优先', JSON.stringify(ids) === JSON.stringify(['q0', 'q1', 'q2', 'q3', 'q4']), JSON.stringify(ids));

  const r5 = S.scanTickets(store, { persist: false, maxTickets: 20 });
  const keys = r5.tickets.map(t => t.entity_id + '|' + t.dim);
  ac('AC-6 无重复 (entity,dim) 且不超总上限',
    new Set(keys).size === keys.length && r5.tickets.length <= 20, JSON.stringify({ n: r5.tickets.length }));

  console.log(`\n----- 6.25 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
