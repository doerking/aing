'use strict';
// M6 任务 6.33 failing test —— P1 全寄生一轮：领单 → 交六段 → 写回 → 验收
// 要修的病：6.32 能给烂叙事开 P1 单，但没有接单方交六段、系统写回的那一跳。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-p1r-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');
const S = require('../src/self-optimize.js');
const P = require('../src/parasite-slot.js');
const T = require('../tools/parasite-round.js');

const narrative = (markdown, turns) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: turns || [], stats: { bodyChars: markdown.length }, calibrations: []
});
const thin = () => narrative(N.SECTIONS.map(k => `### ${k}\n无`).join('\n\n'), [{
  scene: '把上一轮巡检里失败的三个节点列出来，并说明各自的失败原因。',
  thinking: '先按错误码分类，再看是否同源，避免把同源故障重复计三次。',
  output: '三个节点分别是 A、B、C；A 是超时，B、C 同源（上游限流），共两类原因。',
  tools: [{ name: 'Read', isSub: false, input: '{"path":"logs/run.log"}', result: 'ok', approval: null }]
}]);

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('n-thin','n-thin','Conversation',?,'[\"a\",\"b\",\"c\"]','active',0.6,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [thin()]);
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('p-thin','p-thin','Conversation','短。','[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  store._persist();
  await K.kespiStep(store, {});
  S.scanTickets(store, { persist: true, maxTickets: 50 });
  S.dispatchTickets(store, {});

  // AC-1 P1 接单方 claim 得到
  const reg = T.NARRATIVE_REG;
  ac('AC-1 NARRATIVE_REG 存在且为 P1/full', !!reg && reg.slot === 'P1' && reg.mode === 'full', JSON.stringify(reg));
  const list = reg ? P.claimable(store, reg) : [];
  const claim = list.find(t => String(t.entity_id) === 'n-thin');
  ac('AC-1b 低分叙事单可领', !!claim, JSON.stringify(list.map(t => t.entity_id)));

  // AC-2 外部件不写库：前后整库快照一致
  const snap = () => { const s = db.prepare('SELECT id, content, tags, updated_at FROM entities ORDER BY id'); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return JSON.stringify(a); };
  const beforeSnap = snap();
  const ret = claim ? T.externalPartNarrative(db, claim) : null;
  ac('AC-2 外部件取单不写库（快照一致）', !!ret && beforeSnap === snap(), beforeSnap === snap() ? '' : 'snapshot changed');

  // AC-3/AC-4 系统写回
  if (claim && ret) T.applyReturnNarrative(store, claim, ret);
  const ent = (() => { const s = db.prepare("SELECT content FROM entities WHERE id='n-thin'"); s.step(); const r = s.getAsObject(); s.free(); return JSON.parse(r.content); })();
  const cov = K.narrativeCoverage(ent.markdown);
  ac('AC-3 写回六段有实料且 turns 保留', cov >= 0.8 && Array.isArray(ent.turns) && ent.turns.length === 1, JSON.stringify({ cov, turns: ent.turns && ent.turns.length }));
  ac('AC-4 narrative 标记 P1/full/provided', !!ent.narrative && ent.narrative.slot === 'P1' && ent.narrative.mode === 'full' && ent.narrative.provided === true, JSON.stringify(ent.narrative));

  // AC-5 重算 + 验收
  await K.kespiStep(store, {});
  const v = await S.verifyTickets(store, { round: 1 });
  const row = (() => { const s = db.prepare("SELECT status, evidence_json FROM opt_tickets WHERE entity_id='n-thin' AND dim='kq'"); s.step(); const r = s.getAsObject(); s.free(); return r; })();
  const ev = JSON.parse((row && row.evidence_json) || '{}');
  const kq = (() => { const s = db.prepare("SELECT kq FROM kespi_scores WHERE entity_id='n-thin'"); s.step(); const r = s.getAsObject(); s.free(); return Number(r.kq); })();
  ac('AC-5 重算 kq≥0.5 且工单 verified/accepted', kq >= 0.5 && row && row.status === 'verified' && ev.reason === 'accepted',
    JSON.stringify({ kq, status: row && row.status, reason: ev.reason, v: { verified: v.verified.length } }));

  // AC-6 位不混：P2 接单方领不到 P1 单
  const p2List = P.claimable(store, T.REG);
  ac('AC-6 P2 接单方领不到 P1 单', !p2List.some(t => String(t.entity_id) === 'n-thin'), JSON.stringify(p2List.map(t => t.entity_id)));

  console.log(`\n----- 6.33 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
