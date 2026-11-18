'use strict';
// M6 任务 6.15 failing test —— 锁 SPEC-6.15 跟单三律（L3）
// 要修的病：回单只是慢的工单，两轮就被 attempts+1 判死（假跟单）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-follow-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const S = require('../src/self-optimize.js');
const one = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
const cnt = (db, sql) => { const r = one(db, sql); return Number((r && Object.values(r)[0]) || 0); };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id) => db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Concept',?,'[]','active',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [id, id, '正文足够长以通过质量评分。'.repeat(8)]);
  const kespi = (id, kd) => db.run("INSERT INTO kespi_scores (entity_id,kq,kg,ka,km,kd,kc,kr,kb,overall,computed_at) VALUES (?,0.5,0.5,0.5,0.5,?,0.5,0.5,0.5,0.5,CURRENT_TIMESTAMP)", [id, kd]);
  const GOOD = { facts: ['命中 86.9%'], pointers: ['eval/frozen'], evidence: ['eval/frozen'], sourceGrade: 'high', selfAssessment: '样本单一' };
  const ticket = (id, ent, attempts, result) => db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,?,'kd','kd-low','rebond',0.50,'red','dispatched',?,?,'c1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, ent, attempts, JSON.stringify(result ? { score: 0.50, result } : { score: 0.50 })]);

  ['slow', 'stuck', 'good'].forEach(put);
  kespi('slow', 0.50); kespi('stuck', 0.45); kespi('good', 0.80);
  ticket('t-slow', 'slow', 0);      // 无回单、读数不动 → 应追单不计失败
  ticket('t-stuck', 'stuck', 2, GOOD);    // 回单合格但两轮读数都不动 → 改派深工
  ticket('t-good', 'good', 0);      // 读数上升 → verified

  const before = cnt(db, 'SELECT COUNT(*) AS n FROM field_actions');
  const r1 = S.verifyTickets(store, { cycleId: 'c1' });
  const slow1 = one(db, "SELECT status, attempts, evidence_json FROM opt_tickets WHERE id='t-slow'");
  ac('AC-1 追单不计失败（attempts 不推进）', slow1 && slow1.status === 'dispatched' && Number(slow1.attempts) === 0, JSON.stringify(slow1));
  ac('AC-1b 原因 awaiting-return', r1.stillOpen.some(x => x.id === 't-slow' && /awaiting-return/.test(x.reason)), JSON.stringify(r1.stillOpen));

  const r2 = S.verifyTickets(store, { cycleId: 'c2' });
  const slow2 = one(db, "SELECT status, attempts FROM opt_tickets WHERE id='t-slow'");
  ac('AC-1c 两轮后仍 dispatched、attempts 仍 0', slow2 && slow2.status === 'dispatched' && Number(slow2.attempts) === 0, JSON.stringify(slow2));

  ac('AC-2 追单不补位（无新增 field_actions）', cnt(db, 'SELECT COUNT(*) AS n FROM field_actions') === before, String(before));

  const ev2 = JSON.parse(one(db, "SELECT evidence_json FROM opt_tickets WHERE id='t-slow'").evidence_json);
  ac('AC-3 心跳递增（beats≥2 且 beatAt 在）', ev2.followup && Number(ev2.followup.beats) >= 2 && !!ev2.followup.beatAt, JSON.stringify(ev2.followup));

  const stuck = one(db, "SELECT status, evidence_json FROM opt_tickets WHERE id='t-stuck'");
  ac('AC-4 失败≥2 改派深工', stuck && stuck.status === 'rejected' && /escalate-deep-work/.test(stuck.evidence_json || ''), JSON.stringify(stuck));
  ac('AC-4b out.escalated 暴露', Array.isArray(r1.escalated) && r1.escalated.some(x => x.id === 't-stuck'), JSON.stringify(r1.escalated));

  ac('AC-5 读数上升仍 verified', r1.verified.some(x => x.id === 't-good'), JSON.stringify(r1.verified.map(x => x.id)));

  // AC-6 stale 扫描
  let F = null;
  try { F = require('../src/ticket-followup.js'); } catch (_) { F = null; }
  if (!F) { ac('AC-6 stale 可扫', false, 'ticket-followup.js 未实现'); }
  else {
    db.run("UPDATE opt_tickets SET evidence_json = '{\"score\":0.50,\"followup\":{\"beatAt\":\"2020-01-01T00:00:00Z\",\"beats\":3}}' WHERE id='t-slow'");
    store._persist();
    const st = F.staleTickets(store, { maxHours: 48 });
    ac('AC-6 stale 可扫（心跳超时被扫出）', st.some(x => x.id === 't-slow'), JSON.stringify(st));

    // AC-7 纯函数可复算
    const a = JSON.stringify(F.heartbeatOf('{"x":1}', { at: '2026-11-18T00:00:00Z' }));
    const b = JSON.stringify(F.heartbeatOf('{"x":1}', { at: '2026-11-18T00:00:00Z' }));
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ticket-followup.js'), 'utf8');
    const dirty = [/require\(['"]fs['"]\)/, /child_process/, /https?:\/\//, /fetch\(/].filter(re => re.test(src));
    ac('AC-7 纯函数可复算（无 I/O，同输入同输出）', a === b && dirty.length === 0, JSON.stringify({ dirty }));
  }

  console.log(`\n----- 6.15 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
