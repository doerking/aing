'use strict';
// M6 任务 6.17 failing test —— 锁 SPEC-6.17 催化率口径与派单匹配（kd 闭环）
// 要修的病：kd 门槛卡在离散步长的半格上（kd 只能取 0 / 1/3 / 2/3 / 1），
//   而唯一能补出向边的动作 rebond 造的键 strength=1（不计催化），且单子派给了 rebond 碰不到的非 raw 实体。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kd-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const F = require('../src/meko-field.js');
const S = require('../src/self-optimize.js');
const one = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
const rows = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

const LONG = '催化闭环测试正文，长度足够触发质量评分且不带特殊结构。'.repeat(12);

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, type, content, conf, ts) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at,last_access) VALUES (?,?,?,?,'[]','active',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)",
    [id, id, type, content, conf == null ? null : conf, ts == null ? 5 : ts]);

  // raw-r：带内（5）、confidence=0（真库现状）、有 wiki 孪生、缺键
  put('raw-r', 'Concept', LONG, 0, 5);
  put('wiki-r', 'Concept', LONG, 0, 5);
  // c-cited：非 raw、被引用（入向强边 2）却不向外催化
  put('c-cited', 'Conversation', LONG, 0.9, 8);
  put('src-a', 'Insight', '来源甲', 0.9, 5);
  put('src-b', 'Insight', '来源乙', 0.9, 5);
  store.insertLink({ source_id: 'src-a', target_id: 'c-cited', relation: 'hydrogen-bond', confidence: 0.9, strength: 8 });
  store.insertLink({ source_id: 'src-b', target_id: 'c-cited', relation: 'hydrogen-bond', confidence: 0.9, strength: 8 });
  store._persist();

  // ── AC-1 rebond 造出的镜像键是强边（旧行为：confidence 0 → strength 1，等于白干）
  const rB = await F.rebond(store, { entityId: 'raw-r' });
  const bond = one(db, "SELECT * FROM links WHERE source_id='raw-r' AND target_id='wiki-r' AND invalid_at IS NULL");
  ac('AC-1 带内母件的镜像键封底为强边（≥7）',
    !!bond && Number(bond.strength) >= 7 && rB.bonded === 1,
    JSON.stringify({ bond: bond && bond.strength, stats: rB }));

  // ── AC-2 强镜像键计入 kd（1 条出向强边 → 1/3）
  await K.kespiStep(store, {});
  const kdRaw = Number((one(db, "SELECT kd FROM kespi_scores WHERE entity_id='raw-r'") || {}).kd);
  ac('AC-2 强镜像键计入催化率', Math.abs(kdRaw - 1 / 3) < 1e-3, String(kdRaw));

  // ── AC-3 门槛落在离散步长之间（0 < below <= 1/3）
  const below = Number(S.DIM_RULES.kd.below);
  ac('AC-3 kd 门槛与离散步长对齐（0 < below ≤ 1/3）',
    below > 0 && below <= 1 / 3 + 1e-9 && below < 0.40,
    String(below));

  // ── AC-4 kd 单作用域：raw + 孪生 + 缺键 → rebond 单
  db.run("UPDATE links SET invalid_at = CURRENT_TIMESTAMP, invalid_reason='test-reset' WHERE source_id='raw-r' AND target_id='wiki-r'");
  store._persist();
  await K.kespiStep(store, {});
  const scan = S.scanTickets(store, { cycleId: 'cyc-617' });
  const tRaw = one(db, "SELECT * FROM opt_tickets WHERE entity_id='raw-r' AND dim='kd'");
  ac('AC-4 kd 单派给 rebond 真能修的 raw 对象',
    !!tRaw && tRaw.action === 'rebond' && tRaw.kind === 'kd-low',
    JSON.stringify({ scan: scan.tickets.map(t => t.kind), tRaw: tRaw && { kind: tRaw.kind, action: tRaw.action } }));

  // ── AC-5 非 raw「被引用却不催化」→ 提案单，不再派注定落空的 rebond
  const tCited = one(db, "SELECT * FROM opt_tickets WHERE entity_id='c-cited' AND dim='kd'");
  ac('AC-5 非 raw 的不催化改走提案单',
    !!tCited && tCited.action === 'memo-card' && tCited.kind === 'kd-cited',
    JSON.stringify(tCited && { kind: tCited.kind, action: tCited.action }));

  // ── AC-6 派单护栏：非 raw 的 rebond 单直接拒绝，不产生场域动作
  db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES ('t-badscope','c-cited','kd','kd-low','rebond',0.20,'red','open',0,'{}','cyc-617',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  store._persist();
  const faBefore = Number((one(db, 'SELECT COUNT(*) AS n FROM field_actions') || {}).n);
  const disp = await S.dispatchTickets(store, { cycleId: 'cyc-617' });
  const bad = one(db, "SELECT * FROM opt_tickets WHERE id='t-badscope'");
  const faAfter = Number((one(db, 'SELECT COUNT(*) AS n FROM field_actions') || {}).n);
  const faCited = Number((one(db, "SELECT COUNT(*) AS n FROM field_actions WHERE target LIKE '%c-cited%'") || {}).n);
  ac('AC-6 越界 rebond 被拒（原因 out-of-scope，不碰越界对象）',
    !!bad && bad.status === 'rejected' && /out-of-scope/.test(bad.evidence_json || '') && faCited === 0 && (faAfter - faBefore) <= 1,
    JSON.stringify({ status: bad && bad.status, fa: faAfter - faBefore, faCited }));

  // ── AC-7 闭环端到端：rebond → 重算 → 复核 verified
  await K.kespiStep(store, {});
  const v = S.verifyTickets(store, { cycleId: 'cyc-617' });
  const tRaw2 = one(db, "SELECT * FROM opt_tickets WHERE entity_id='raw-r' AND dim='kd'");
  ac('AC-7 闭环转起来（补键 → kd 升 → verified）',
    !!tRaw2 && tRaw2.status === 'verified' && v.verified.some(x => x.id === tRaw2.id),
    JSON.stringify({ status: tRaw2 && tRaw2.status, verified: v.verified.map(x => x.id) }));

  // ── AC-8 回归：其他维规则不变；候选关系不计催化
  db.run("INSERT INTO links (source_id,target_id,relation,confidence,strength,created_at) VALUES ('c-cited','wiki-r','sprout-candidate',0.9,9,CURRENT_TIMESTAMP)");
  store._persist();
  await K.kespiStep(store, {});
  const kdWiki = Number((one(db, "SELECT kd FROM kespi_scores WHERE entity_id='c-cited'") || {}).kd);
  ac('AC-8 回归（kq/ka/kc 规则不变 + 候选边不计 kd）',
    S.DIM_RULES.kq.action === 'memo-card' && S.DIM_RULES.ka.action === 'memo-card' &&
    S.DIM_RULES.kc.action === 'reconcile' && S.DIM_RULES.kc.below === 0.40 &&
    kdWiki === 0,
    JSON.stringify({ kq: S.DIM_RULES.kq.action, ka: S.DIM_RULES.ka.action, kc: S.DIM_RULES.kc.action, kdWiki }));

  // ── AC-9 未来档母件：不建边、不记账、不谎报（库层闸会 ABORT）
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,strand,created_at,updated_at) VALUES ('raw-fut','F','Concept',?, '[]','active',0,5,'future',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [LONG]);
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('wiki-fut','F','Concept',?, '[]','active',0,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [LONG]);
  store._persist();
  const faFutBefore = Number((one(db, 'SELECT COUNT(*) AS n FROM field_actions') || {}).n);
  const rFut = await F.rebond(store, { entityId: 'raw-fut' });
  const faFutAfter = Number((one(db, 'SELECT COUNT(*) AS n FROM field_actions') || {}).n);
  const futLink = one(db, "SELECT * FROM links WHERE source_id='raw-fut'");
  ac('AC-9 未来档母件不建边、不记账、不谎报',
    rFut.bonded === 0 && Number(rFut.skippedFuture) === 1 && !futLink && faFutAfter === faFutBefore,
    JSON.stringify({ stats: rFut, link: !!futLink, fa: faFutAfter - faFutBefore }));

  // ── AC-10 已有非氢键有效边：不覆盖、不谎报（links 主键只看 source+target）
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('raw-d2','D','Concept',?, '[]','active',0,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [LONG]);
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('wiki-d2','D','Concept',?, '[]','active',0,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [LONG]);
  db.run("INSERT INTO links (source_id,target_id,relation,confidence,strength,created_at) VALUES ('raw-d2','wiki-d2','derived',0.9,7,CURRENT_TIMESTAMP)");
  store._persist();
  const rDer = await F.rebond(store, { entityId: 'raw-d2' });
  const derLink = one(db, "SELECT relation FROM links WHERE source_id='raw-d2' AND target_id='wiki-d2'");
  ac('AC-10 已有 derived 边不被覆盖，且不谎报成功',
    rDer.bonded === 0 && Number(rDer.skippedExisting) === 1 && derLink && derLink.relation === 'derived',
    JSON.stringify({ stats: rDer, relation: derLink && derLink.relation }));

  console.log(`\n----- 6.17 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
