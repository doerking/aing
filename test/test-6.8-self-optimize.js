'use strict';
// M6 任务 6.8 failing test —— 锁 SPEC-6.8 自优化闭环八条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-selfopt-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let S;
try {
  S = require('../src/self-optimize.js');
  for (const k of ['scanTickets', 'dispatchTickets', 'verifyTickets', 'graduateToGene', 'selfOptimizeStep']) {
    if (typeof S[k] !== 'function') throw new Error(k + ' 未导出');
  }
  if (!Array.isArray(S.TRAINER_STAGES) || S.TRAINER_STAGES.length !== 6) throw new Error('TRAINER_STAGES 应为六阶段');
} catch (e) { console.error('❌ 红（正确的红）—— 6.8 自优化闭环未实现（src/self-optimize.js）'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const LONG = '自优化闭环测试正文，长度足够触发质量评分且不带特殊结构。'.repeat(12);
const rows = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const one = (db, sql, b = []) => rows(db, sql, b)[0] || null;

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  let db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at,last_access) VALUES ('raw-x','X','Concept',?,?, 'active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [LONG, '["t"]']);
  store._persist();

  // 先算 KESPI：raw-x 无 wiki 双链 → KC 低；无邻居 → KD 低
  const K = require('../src/kespi.js');
  await K.kespiStep(store, {});
  const k0 = one(db, "SELECT * FROM kespi_scores WHERE entity_id='raw-x'");

  // AC-1 表与导出
  const tbl = rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='opt_tickets'").length === 1;
  const idx = rows(db, "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_opt_tickets_open'").length === 1;
  ac('AC-1 工单表与索引 + 契约导出', tbl && idx && k0 && Number(k0.kc) < 0.8 && Number(k0.kd) < 0.4,
    JSON.stringify({ tbl, idx, kc: k0 && k0.kc, kd: k0 && k0.kd }));

  // AC-2 扫描开单 + 幂等
  const scan1 = S.scanTickets(store, { cycleId: 'cyc-68' });
  const kinds1 = scan1.tickets.map(t => t.kind).sort();
  const scan2 = S.scanTickets(store, { cycleId: 'cyc-68' });
  ac('AC-2 误差开单 + 幂等', scan1.created >= 2 && kinds1.includes('kc-low') && kinds1.includes('kd-low') && scan2.created === 0,
    JSON.stringify({ created: scan1.created, kinds: kinds1, second: scan2.created }));

  // AC-3 路由映射
  const tkc = one(db, "SELECT * FROM opt_tickets WHERE kind='kc-low'");
  const tkd = one(db, "SELECT * FROM opt_tickets WHERE kind='kd-low'");
  ac('AC-3 维度→动作路由',
    tkc && tkd && tkc.action === 'reconcile' && tkd.action === 'rebond' &&
    S.DIM_RULES.kq.action === 'memo-card' && S.DIM_RULES.kb.action === 'demote' &&
    S.ACTION_ORDER.reconcile < S.ACTION_ORDER.rebond,
    JSON.stringify({ kc: tkc && tkc.action, kd: tkd && tkd.action }));

  // AC-4 下药：reconcile 先补双链，rebond 再补键
  const disp = await S.dispatchTickets(store, { cycleId: 'cyc-68' });
  const wiki = one(db, "SELECT * FROM entities WHERE id='wiki-x'");
  const fa = one(db, "SELECT * FROM field_actions WHERE cycle_id='cyc-68' AND action='reconcile'");
  const kcDispatched = disp.dispatched.some(d => d.dim === 'kc');
  ac('AC-4 场域下药 + 账本留痕',
    kcDispatched && wiki && wiki.invalid_at == null && fa && String(wiki.content) === LONG &&
    one(db, "SELECT * FROM opt_tickets WHERE kind='kc-low'").status === 'dispatched',
    JSON.stringify({ dispatched: disp.dispatched.map(d => d.dim), wiki: !!(wiki && !wiki.invalid_at), fa: !!fa }));

  // AC-5 复核：重算 KESPI 后 KC/KD 均上升
  await K.kespiStep(store, {});
  const ver = S.verifyTickets(store, {});
  const kcV = ver.verified.find(v => v.dim === 'kc');
  const kdV = ver.verified.find(v => v.dim === 'kd');
  ac('AC-5 读数上升即复核通过',
    kcV && kdV && kcV.after > kcV.before && kdV.after > kdV.before,
    JSON.stringify(ver.verified.map(v => ({ dim: v.dim, before: v.before, after: v.after }))));

  // AC-6 gene 毕业：先过 gate 再落 genes
  const grad = await S.graduateToGene(store, { cycleId: 'cyc-68' });
  const g = one(db, "SELECT * FROM genes WHERE name='opt:kc-low:reconcile'");
  const gate = one(db, "SELECT * FROM gate_records WHERE subject='opt:kc-low:reconcile' AND kind='gene'");
  const tkcAfter = one(db, "SELECT * FROM opt_tickets WHERE kind='kc-low'");
  ac('AC-6 已验证→gene（过闸留痕）',
    grad.graduated.length >= 2 && g && g.status === 'active' && Number(g.score) > 0 && gate && gate.passed === 1 &&
    tkcAfter.status === 'graduated',
    JSON.stringify({ graduated: grad.graduated.length, gene: g && { status: g.status, score: g.score }, gate: gate && gate.passed }));

  // AC-7 技能导入：五成员有 skills；gene-keeper 带训练师且只读
  const E = require('../src/evolution-team.js');
  const gk = E.MEMBERS.find(m => m.id === 'gene-keeper');
  const allHaveSkills = E.MEMBERS.length === 5 && E.MEMBERS.every(m => Array.isArray(m.skills) && m.skills.length > 0);
  const beforeTickets = Number(one(db, 'SELECT COUNT(*) AS n FROM opt_tickets').n);
  const probe = await E.buildEvolutionSteps().find(s => s.id === 'evo-gene-keeper').onCycle({ store });
  const afterTickets = Number(one(db, 'SELECT COUNT(*) AS n FROM opt_tickets').n);
  ac('AC-7 技能导入 + 训练师只读',
    allHaveSkills && gk.skills.includes('skill-trainer') &&
    E.TRAINER_STAGES.join() === ['rollout', 'reflect', 'aggregate', 'select', 'update', 'gate'].join() &&
    probe.proposal && Array.isArray(probe.proposal.tickets) && probe.proposal.trainerStages.length === 6 &&
    beforeTickets === afterTickets,
    JSON.stringify({ allHaveSkills, skills: gk.skills, tickets: beforeTickets, after: afterTickets }));

  // AC-8 铁律：只读扫描不碰双链；组件不直连 store；无物理删
  const snap = () => JSON.stringify([rows(db, 'SELECT * FROM entities'), rows(db, 'SELECT * FROM links')]);
  const s0 = snap();
  S.scanTickets(store, { persist: false });
  const s1 = snap();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'self-optimize.js'), 'utf8');
  ac('AC-8 铁律', s0 === s1 && !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src),
    JSON.stringify({ same: s0 === s1 }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
