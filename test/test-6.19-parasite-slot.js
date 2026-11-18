'use strict';
// M6 任务 6.19 failing test —— 锁 SPEC-6.18 §三/§四 寄生位注册表与取单口
// 要修的病：点位只写在纸上，外部件无从声明「我能接哪个位、能接多深」。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-slot-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('e1','E','Concept',?,'[]','active',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['正文'.repeat(300)]);
  const mk = (id, demand, status = 'proposed') => db.run(
    "INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,?,'ka','ka-low','memo-card',0.2,'red',?,0,?,'c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, 'e1', status, JSON.stringify({ score: 0.2, reason: 'proposal-only', demand })]);

  const D_SEMI = { want: '重新激活（有访问）或体面退场', acceptance: [{ dim: 'ka', op: 'gte', value: 0.3 }], evidence: ['facts', 'pointers'], mode: 'semi', slot: 'P6', ttlRounds: 3 };
  const D_FULL = { want: '生成派生或关联，令被引用者也能向外催化', acceptance: [{ dim: 'kd', op: 'gte', value: 0.3 }], evidence: ['facts'], mode: 'full', slot: 'P3', ttlRounds: 3 };
  mk('t-semi', D_SEMI);
  mk('t-full', D_FULL);
  mk('t-p3-semi', { ...D_FULL, mode: 'semi' });
  mk('t-done', D_SEMI, 'verified');
  store._persist();

  let P = null;
  try { P = require('../src/parasite-slot.js'); } catch (_) { P = null; }
  if (!P || !Array.isArray(P.SLOTS)) {
    ['AC-1 P1–P7 七点位齐且字段完整', 'AC-2 注册校验器拦缺件', 'AC-3 P7 不可外包',
      'AC-4 slot 不匹配不接单', 'AC-5 full 可接 semi，semi 不能接 full',
      'AC-6 回单能力不足不接单', 'AC-7 取单口只给可接的 proposed 单', 'AC-8 纯函数无 I/O'].forEach(n => ac(n, false, 'parasite-slot.js 未实现'));
  } else {
    const ids = P.SLOTS.map(s => s.slot);
    const need = ['slot', 'name', 'location', 'modes', 'in', 'out', 'writeBack', 'refuse'];
    ac('AC-1 P1–P7 七点位齐且字段完整',
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].every(x => ids.includes(x)) &&
      P.SLOTS.every(s => need.every(k => s[k] != null)),
      JSON.stringify({ ids, missing: P.SLOTS.filter(s => need.some(k => s[k] == null)).map(s => s.slot) }));

    const bad = P.validateSlot({ slot: 'P9', name: '', modes: ['weird'] });
    ac('AC-2 注册校验器拦缺件', bad.ok === false && bad.reasons.length >= 2, JSON.stringify(bad));

    const p7 = P.claim('P7', { mode: 'full', evidence: ['facts', 'pointers', 'sourceGrade', 'selfAssessment'] }, D_SEMI);
    ac('AC-3 P7 不可外包', p7.ok === false && /not-outsourceable|P7/.test(String(p7.reason)), JSON.stringify(p7));

    const wrongSlot = P.claim('P2', { mode: 'semi', evidence: ['facts', 'pointers'] }, D_SEMI);
    ac('AC-4 slot 不匹配不接单', wrongSlot.ok === false && /slot-mismatch/.test(String(wrongSlot.reason)), JSON.stringify(wrongSlot));

    const fullTakesSemi = P.claim('P6', { mode: 'full', evidence: ['facts', 'pointers'] }, D_SEMI);
    const semiTakesFull = P.claim('P3', { mode: 'semi', evidence: ['facts'] }, D_FULL);
    ac('AC-5 full 可接 semi，semi 不能接 full',
      fullTakesSemi.ok === true && semiTakesFull.ok === false && /mode-too-narrow/.test(String(semiTakesFull.reason)),
      JSON.stringify({ fullTakesSemi, semiTakesFull }));

    const noEvidence = P.claim('P6', { mode: 'semi', evidence: ['facts'] }, D_SEMI);
    ac('AC-6 回单能力不足不接单', noEvidence.ok === false && /evidence-missing/.test(String(noEvidence.reason)), JSON.stringify(noEvidence));

    const list = P.claimable(store, { slot: 'P3', mode: 'full', evidence: ['facts', 'pointers'] });
    const gotIds = (list || []).map(t => t.id);
    ac('AC-7 取单口只给可接的 proposed 单',
      gotIds.includes('t-full') && gotIds.includes('t-p3-semi') && !gotIds.includes('t-semi') && !gotIds.includes('t-done'),
      JSON.stringify(gotIds));

    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'parasite-slot.js'), 'utf8');
    const dirty = [/require\(['"]fs['"]\)/, /child_process/, /fetch\(/, /https?:\/\//].filter(re => re.test(src));
    ac('AC-8 纯函数无 I/O（除取单口读库）', dirty.length === 0, JSON.stringify({ dirty }));
  }

  console.log(`\n----- 6.19 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
