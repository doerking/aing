'use strict';
// M6 任务 6.34 failing test —— 六段由实体事实抽出（模板滑动）
// 要修的病：P1 回单六段是恒定文案，换哪个实体都同一句话，覆盖率满分但零信息。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-slide-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');
const S = require('../src/self-optimize.js');
const T = require('../tools/parasite-round.js');

const narrative = (md, turns, calibrations) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown: md, turns: turns || [], stats: { bodyChars: md.length }, calibrations: calibrations || []
});
const thinMd = () => N.SECTIONS.map(k => `### ${k}\n无`).join('\n\n');

// A：有工具、无子agent；B：无工具、有校准
const A_TURNS = [{
  scene: '帮我把季度报表里的异常项挑出来，并说明每一类异常的判定标准。',
  thinking: '先按金额与同环比两个维度筛，避免只看单一指标误判。',
  output: '已挑出 7 项异常，其中 3 项是季节性波动，4 项需要人工复核。',
  tools: [{ name: 'Read', isSub: false, input: '{"path":"q3.csv"}', result: 'ok', approval: null }]
}];
const B_TURNS = [{
  scene: '把昨天的会议纪要整理成三条待办，标注负责人。',
  thinking: '按行动项拆，负责人取原文点名者。',
  output: '三条待办已整理，负责人分别为甲、乙、丙。',
  tools: []
}];
const B_CAL = [{ type: 'feedback', summary: '用户要求把第三条待办改由丁负责' }];

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,'[\"a\",\"b\",\"c\"]','active',0.6,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, content]);
  put('n-a', narrative(thinMd(), A_TURNS));
  put('n-b', narrative(thinMd(), B_TURNS, B_CAL));
  store._persist();
  await K.kespiStep(store, {});
  S.scanTickets(store, { persist: true, maxTickets: 50 });
  S.dispatchTickets(store, {});
  const list = T.NARRATIVE_REG ? P_claimable() : [];
  function P_claimable() { return require('../src/parasite-slot.js').claimable(store, T.NARRATIVE_REG); }
  const cA = list.find(t => String(t.entity_id) === 'n-a');
  const cB = list.find(t => String(t.entity_id) === 'n-b');
  ac('前置 两个叙事单都可领', !!cA && !!cB, JSON.stringify(list.map(t => t.entity_id)));

  const rA = cA ? T.externalPartNarrative(db, cA) : null;
  const rB = cB ? T.externalPartNarrative(db, cB) : null;

  // AC-1 纯读可复现
  const rA2 = cA ? T.externalPartNarrative(db, cA) : null;
  ac('AC-1 同一实体两次回单一致', !!rA && JSON.stringify(rA.patch) === JSON.stringify(rA2 && rA2.patch), '');

  // AC-2 两实体各异且含自身事实
  const sA = rA ? JSON.stringify(rA.patch.sections) : '', sB = rB ? JSON.stringify(rB.patch.sections) : '';
  const factsA = sA.includes('季度报表') && sA.includes('Read');
  const factsB = sB.includes('会议纪要') && sB.includes('丁负责');
  ac('AC-2 回单各自含自身事实（首轮输入/工具名/校准）', factsA && factsB && sA !== sB, JSON.stringify({ factsA, factsB }));

  // AC-3 无子agent → 编排段如实声明，不含他实体事实
  const pageBian = rA ? rA.patch.sections['编排（子agent）'] : '';
  ac('AC-3 无子agent 段如实声明', /无子\s*agent/i.test(pageBian) && !pageBian.includes('季度报表'), JSON.stringify({ pageBian }));

  // AC-4 facts 记来源
  ac('AC-4 facts 写明抽取来源', !!rA && rA.result.facts.some(f => /turn|轮|工具|证据/.test(f)), JSON.stringify(rA && rA.result.facts));

  // AC-5 E2E：轨迹完整 → 写回 → kq 达标 → verified
  if (cA && rA) T.applyReturnNarrative(store, cA, rA);
  await K.kespiStep(store, {});
  const v = await S.verifyTickets(store, { round: 1 });
  const row = (() => { const s = db.prepare("SELECT status, evidence_json FROM opt_tickets WHERE entity_id='n-a' AND dim='kq'"); s.step(); const r = s.getAsObject(); s.free(); return r; })();
  const kq = (() => { const s = db.prepare("SELECT kq FROM kespi_scores WHERE entity_id='n-a'"); s.step(); const r = s.getAsObject(); s.free(); return Number(r.kq); })();
  ac('AC-5 写回后 kq≥0.5 且 verified', kq >= 0.5 && row && row.status === 'verified', JSON.stringify({ kq, status: row && row.status, verified: v.verified.length }));

  // AC-6 不写库（用 B 的回单再验一次快照）
  const snap = () => { const s = db.prepare('SELECT id, content, updated_at FROM entities ORDER BY id'); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return JSON.stringify(a); };
  const b1 = snap(); const rB2 = cB ? T.externalPartNarrative(db, cB) : null;
  ac('AC-6 外部件不写库（快照一致）', !!rB2 && b1 === snap(), '');

  console.log(`\n----- 6.34 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
