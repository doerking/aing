'use strict';
// M6 任务 6.32 failing test —— 叙事工单与读数口径对齐六段
// 要修两处：① 叙事 kq 长度只量六段正文（段外填充不抬分）；
//           ② kq-low 工单对叙事实体改走 P1/full，want 要求六段齐全。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-narrtk-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');
const SO = require('../src/self-optimize.js');
const TD = require('../src/ticket-demand.js');

const narrative = (markdown) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: [], stats: { bodyChars: markdown.length }, calibrations: []
});
const stuffed = () => narrative('# 能力单元 1\n\n' + '废话'.repeat(2000) + '\n\n' + N.SECTIONS.map(k => `### ${k}\n无`).join('\n\n'));
const good = () => narrative(N.SECTIONS.map(k => `### ${k}\n` + '甲'.repeat(130)).join('\n\n'));

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content, tags = '[]', conf = 0.5) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,?,'active',?,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, content, tags, conf]);

  put('n-stuffed', stuffed());
  put('n-good', good(), JSON.stringify(['a', 'b', 'c']), 0.6);
  put('p-low', '短。');
  store._persist();
  await K.kespiStep(store, {});
  const sc = (id) => { const s = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? Number(r.kq) : null; };

  // AC-1 段外填充不抬分
  ac('AC-1 叙事只量六段正文（段外 4000 字不抬分）', sc('n-stuffed') < 0.3, JSON.stringify({ kq: sc('n-stuffed') }));

  // AC-2 六段齐全正常
  ac('AC-2 六段齐全读数正常（≥0.6）', sc('n-good') >= 0.6, JSON.stringify({ kq: sc('n-good') }));

  // AC-3/AC-4 工单分流
  const scan = SO.scanTickets(store, { persist: true, maxTickets: 50 });
  const rowOf = (id) => { const s = db.prepare("SELECT evidence_json FROM opt_tickets WHERE entity_id = ? AND dim = 'kq' AND status = 'open'"); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? JSON.parse(r.evidence_json) : null; };
  const evN = rowOf('n-stuffed'), evP = rowOf('p-low');
  ac('AC-3 叙事工单走 P1/full 且 want 提六段', !!evN && !!evN.demand &&
    evN.demand.slot === 'P1' && evN.demand.mode === 'full' && /六段/.test(evN.demand.want),
    JSON.stringify(evN && evN.demand));
  ac('AC-3b 非叙事工单仍 P2/semi', !!evP && !!evP.demand && evP.demand.slot === 'P2' && evP.demand.mode === 'semi',
    JSON.stringify(evP && evP.demand));
  ac('AC-4 六段齐全的叙事不开 kq 工单', rowOf('n-good') === null, JSON.stringify(rowOf('n-good')));

  // AC-5 新需求自校验
  const d = TD.demandFor('kq-low-narrative');
  const v = d ? TD.validateDemand(d) : { ok: false, reasons: ['no-demand'] };
  ac('AC-5 demandFor(kq-low-narrative) 自校验通过', v.ok === true && d.acceptance[0].dim === 'kq' && d.acceptance[0].op === 'gte',
    JSON.stringify({ ok: v.ok, reasons: v.reasons, demand: d }));

  // AC-6 非叙事读数不变
  ac('AC-6 非叙事实体读数不受影响', Math.abs(sc('p-low') - 0.078) <= 0.02, JSON.stringify({ kq: sc('p-low') }));

  console.log(`\n----- 6.32 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
