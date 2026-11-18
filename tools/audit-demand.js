'use strict';
// tools/audit-demand.js —— 需求穿透审计（SPEC-6.18/6.19 之后的口径检查）
// 用法：node tools/audit-demand.js
// 做法：逐跳验「需求还在不在」。自带临时库造单造回单，不读也不动真库。
// 结论只有两种：PASS（这一跳需求确实被读到）或 BREAK（这一跳没人读需求）。
// 退出码：全通 0；有 BREAK 1；参数/环境错 2。

const fs = require('fs');
const os = require('os');
const path = require('path');


const D = require('../src/ticket-demand.js');
const P = require('../src/parasite-slot.js');
const store = require('../src/knowledge-store.js');

let breaks = 0;
function hop(id, label, ok, detail) {
  if (!ok) breaks++;
  console.log(`${ok ? '✅' : '❌'} ${id} ${label} — ${detail}`);
}

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-audit-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

const RESULT_OK = { facts: ['正文 512 字'], pointers: ['entities/e1'], sourceGrade: 'high', selfAssessment: '自评：补齐正文与标签' };

(async () => {
  // ── H1 生成：每种单的需求都齐五段 ────────────────────────────
  const kinds = Object.keys(D.DEMANDS);
  const bad = kinds.filter(k => { const d = D.demandFor(k); return !d || !D.validateDemand(d).ok; });
  hop('H1', '需求生成（五段齐）', bad.length === 0, `${kinds.length} 种单全部可校验，坏件 ${bad.length}`);

  // ── H2 落库：扫出的单带 demand，且需求被取单口读到 ──────────
  await store.init(path.join(yard, 'audit.db'));
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('e-audit','A','Concept',?,'[]','active',0.8,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['正文'.repeat(300)]);
  db.run("INSERT INTO kespi_scores (entity_id,kq,ka,kd,kc,kr,overall,computed_at) VALUES ('e-audit',0.20,0.50,0.50,0.50,0.50,0.44,CURRENT_TIMESTAMP)");
  const S = require('../src/self-optimize.js');
  await S.scanTickets(store, {});
  const scanRow = (() => {
    const st = db.prepare("SELECT evidence_json FROM opt_tickets WHERE entity_id='e-audit' AND dim='kq' LIMIT 1");
    const r = st.step() ? st.getAsObject() : null; st.free(); return r;
  })();
  const scanEv = scanRow ? JSON.parse(scanRow.evidence_json || '{}') : {};
  hop('H2', '需求落库（单上带 demand）', !!(scanEv.demand && D.validateDemand(scanEv.demand).ok), scanEv.demand ? `slot=${scanEv.demand.slot} mode=${scanEv.demand.mode}` : '无 demand');

  // ── H3 取单：注册能从取单口取到 take 得走的单 ────────────────
  await S.dispatchTickets(store, {});
  const reg = { slot: scanEv.demand.slot, mode: 'full', evidence: scanEv.demand.evidence };
  const list = P.claimable(store, reg);
  const hit = list.find(t => t.entity_id === 'e-audit');
  hop('H3', '需求可接（取单口命中）', !!hit, hit ? `${list.length} 单可取，含 e-audit` : '取单口取不到');

  // ── H4 判回单：回单达标 → 应按需求判成 verified ──────────────
  const id = hit ? hit.id : null;
  if (id) {
    const st = db.prepare('SELECT evidence_json FROM opt_tickets WHERE id = ?'); st.bind([id]);
    const row = st.step() ? st.getAsObject() : null; st.free();
    const ev = JSON.parse((row && row.evidence_json) || '{}');
    ev.result = RESULT_OK;
    db.run('UPDATE opt_tickets SET evidence_json = ? WHERE id = ?', [JSON.stringify(ev), id]);
    db.run("UPDATE kespi_scores SET kq = 0.60 WHERE entity_id = 'e-audit'");
    store._persist();
    const v = await S.verifyTickets(store, {});
    const st2 = db.prepare('SELECT status, evidence_json FROM opt_tickets WHERE id = ?'); st2.bind([id]);
    const after = st2.step() ? st2.getAsObject() : null; st2.free();
    hop('H4', '需求判回单（达标→verified）', after && after.status === 'verified',
      after ? `status=${after.status}` + (after.status === 'verified' ? '' : '（acceptance 未被读，回单无人判）') : '单不见了');

    // H5 另造一张不达标的：把读数压回 0.20，回单格式合格但判据不过
    db.run("UPDATE kespi_scores SET kq = 0.20 WHERE entity_id = 'e-audit'");
    db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES ('t-audit-fail','e-audit','kq','kq-low','memo-card',0.2,'red','proposed',0,?,'c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
      [JSON.stringify({ score: 0.2, demand: scanEv.demand, readings: { kq: 0.2 }, result: RESULT_OK })]);
    store._persist();
    const v5 = await S.verifyTickets(store, {});
    const st5 = db.prepare('SELECT status, evidence_json FROM opt_tickets WHERE id = ?'); st5.bind(['t-audit-fail']);
    const row5 = st5.step() ? st5.getAsObject() : null; st5.free();
    const ev5 = row5 ? JSON.parse(row5.evidence_json || '{}') : {};
    hop('H5', '需求判回单（不达标→rejected）', !!(row5 && row5.status === 'rejected' && ev5.reason === 'acceptance-failed'),
      row5 ? `status=${row5.status} reason=${ev5.reason || '-'}` : '单不见了');
  } else {
    hop('H4', '需求判回单（达标→verified）', false, 'H3 未命中，无法造回单');
    hop('H5', '需求判回单（不达标→rejected）', false, 'H3 未命中，无法造回单');
  }

  // ── H7 到期：TTL 仍有效（无回单超期作废）────────────────────
  db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES ('t-ttl','e-audit','ka','ka-low','memo-card',0.1,'red','proposed',0,?,'c',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [JSON.stringify({ score: 0.1, demand: D.demandFor('ka-low'), result: null, followup: { beats: 4, beatAt: 'x' } })]);
  store._persist();
  const v2 = await S.verifyTickets(store, {});
  const ttl = (v2.rejected || []).some(r => r.id === 't-ttl' && r.reason === 'proposal-expired');
  hop('H7', '需求到期（超 TTL 作废）', ttl, ttl ? 'proposal-expired' : '未作废');

  console.log(`\n----- 需求穿透：${breaks === 0 ? '全程通' : breaks + ' 处断点'} -----`);
  process.exit(breaks ? 1 : 0);
})().catch((e) => { console.error('审计执行失败（环境）—— ' + e.message); process.exit(2); });
