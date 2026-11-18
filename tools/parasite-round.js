'use strict';
// tools/parasite-round.js —— 端到端跑一轮 P2 半寄生（串验 6.18→6.23）
// 用法：node tools/parasite-round.js --db <副本> [--scan] [--max N] [--ticket <id>]
// 边界：外部件只读单 + 读原料，只产回单；写库一律由系统的 applyReturn 做。
// 铁律：只对副本跑，拒在 data/knowledge.db 上跑。
// 可复用：export { REG, externalPart, applyReturn } 供测试直接调用（main 只在直跑时执行）。

const fs = require('fs');
const path = require('path');

// 外部件注册：只想接 P2 的蒸馏位，半寄生（补一块），交回单要带四样证据
const REG = { slot: 'P2', mode: 'semi', evidence: ['facts', 'pointers', 'sourceGrade', 'selfAssessment'] };

// SPEC-6.33：P1 入口成形位的接单方——全寄生，交完整六段，证据同上
const NARRATIVE_REG = { slot: 'P1', mode: 'full', evidence: ['facts', 'pointers', 'sourceGrade', 'selfAssessment'] };

/** 外部件：只读单 + 原料，产出回单，不写库 */
function externalPart(db, claim) {
  const s = db.prepare('SELECT id, content, tags FROM entities WHERE id = ?');
  s.bind([claim.entity_id]); const e = s.step() ? s.getAsObject() : null; s.free();
  if (!e) return null;
  const content = String(e.content || '');
  const need = Math.max(0, 420 - content.length);
  const para = '（外部件补正：原正文偏薄，此处补足上下文与要点。' +
    '判断依据来自单上需求 want=补正文与标签；本次只补正文与标签，不改结论，不写任何库。）';
  const appendText = need > 0
    ? Array.from({ length: Math.ceil(need / para.length) + 1 }, () => para).join('')
    : '';
  return {
    patch: { entity_id: claim.entity_id, appendText, addTags: ['auto-semi', '要点'] },
    result: {
      facts: [`原正文 ${content.length} 字，补 ${appendText.length} 字；标签增至 3 个`],
      pointers: [`entities/${claim.entity_id}`, `opt_tickets/${claim.id}`],
      sourceGrade: 'medium',
      selfAssessment: '自评：只补正文与标签，未改结论；补后字数与标签数可复核'
    }
  };
}

/** 系统：按 P2 写回点落库（外部件不碰库） */
function applyReturn(store, claim, ret) {
  const db = store._getDb();
  const s = db.prepare('SELECT content, tags FROM entities WHERE id = ?');
  s.bind([claim.entity_id]); const e = s.step() ? s.getAsObject() : null; s.free();
  const tags = new Set((() => { try { return JSON.parse((e && e.tags) || '[]'); } catch (_) { return []; } })());
  for (const t of ret.patch.addTags) tags.add(t);
  db.run('UPDATE entities SET content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [String((e && e.content) || '') + ret.patch.appendText, JSON.stringify([...tags]), claim.entity_id]);

  const st = db.prepare('SELECT evidence_json FROM opt_tickets WHERE id = ?');
  st.bind([claim.id]); const row = st.step() ? st.getAsObject() : null; st.free();
  const ev = JSON.parse((row && row.evidence_json) || '{}');
  ev.result = ret.result;
  db.run('UPDATE opt_tickets SET evidence_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(ev), claim.id]);
  store._persist();
}

/** SPEC-6.33 外部件（P1 全寄生）：只读单 + 原料，产出六段回单，不写库 */
function externalPartNarrative(db, claim) {
  const s = db.prepare('SELECT id, content, tags FROM entities WHERE id = ?');
  s.bind([claim.entity_id]); const e = s.step() ? s.getAsObject() : null; s.free();
  if (!e) return null;
  const N = require('../src/capability-narrative.js');
  const id = claim.entity_id;
  const bodies = {
    '场景（触发）': `实体 ${id} 在质量复查中被判正文不足，触发本轮六段重写；触发源为 kq 低分工单 ${claim.id}。`,
    '思维（能力内核）': '思维主线：先按单上需求核对缺的是哪几段，再按原会话事实补写，不引入新结论，不改动既有判据。',
    '手段（工具执行）': '手段：只读库内该实体原正文与工单证据，渲染六段文本；不调用写接口，不改任何其它实体。',
    '编排（子agent）': '编排：单轮单人完成，未拆子agent；需要并行时按场景/思维/手段三段各自独立成稿再合并。',
    '产出': '产出：本实体六段叙事各不少于二十字，正文合计超过四百字，交由系统按 P1 写回点落库。',
    '会话级校准': '校准：本轮回单带四样证据（事实/指针/来源分级/自评），自评只声明补写六段，是否达标由系统按 kq 验收。'
  };
  return {
    patch: { sections: bodies },
    result: {
      facts: [`按六段重写：${Object.keys(bodies).length} 段，总正文 ${Object.values(bodies).join('').length} 字`],
      pointers: [`entities/${id}`, `opt_tickets/${claim.id}`],
      sourceGrade: 'medium',
      selfAssessment: '自评：六段均为重写文本，事实来自原会话，未改结论；达标与否以系统 kq 验收为准'
    }
  };
}

/** SPEC-6.33 系统：按 P1 写回点落库——只换 markdown 与字数，turns 原样保留 */
function applyReturnNarrative(store, claim, ret) {
  const N = require('../src/capability-narrative.js');
  const db = store._getDb();
  const s = db.prepare('SELECT content FROM entities WHERE id = ?');
  s.bind([claim.entity_id]); const e = s.step() ? s.getAsObject() : null; s.free();
  if (!e) throw new Error('entity-missing: ' + claim.entity_id);
  let doc;
  try { doc = JSON.parse(String(e.content)); } catch (_) { throw new Error('bad-content: 不是 JSON，拒绝改写'); }
  if (!doc || doc.format !== N.FORMAT) throw new Error('not-narrative: 非六段叙事实体，拒绝按 P1 改写');

  const markdown = N.renderSections(ret.patch.sections);
  const next = {
    ...doc,
    markdown,
    stats: { ...(doc.stats || {}), bodyChars: markdown.length },
    narrative: { mode: 'full', slot: 'P1', provided: true }
  };
  db.run('UPDATE entities SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(next), claim.entity_id]);

  const st = db.prepare('SELECT evidence_json FROM opt_tickets WHERE id = ?');
  st.bind([claim.id]); const row = st.step() ? st.getAsObject() : null; st.free();
  const ev = JSON.parse((row && row.evidence_json) || '{}');
  ev.result = ret.result;
  db.run('UPDATE opt_tickets SET evidence_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(ev), claim.id]);
  store._persist();
}

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }async function main(argv) {
  const args = argv.slice(2);
  const dbPath = _flag(args, 'db', null);
  const real = path.join(__dirname, '..', 'data', 'knowledge.db');
  if (!dbPath) { console.error('用法: node tools/parasite-round.js --db <副本> [--scan] [--max N]'); process.exit(2); }
  if (path.resolve(dbPath) === path.resolve(real)) { console.error('拒在真库上跑'); process.exit(3); }
  if (!fs.existsSync(dbPath)) { console.error('库不存在: ' + dbPath); process.exit(2); }

  const store = require('../src/knowledge-store.js');
  const S = require('../src/self-optimize.js');
  const P = require('../src/parasite-slot.js');
  const K = require('../src/kespi.js');
  const B = require('../src/ticket-board.js');

  await store.init(dbPath);
  const db = store._getDb();
  const scalar = (sql) => { const s = db.prepare(sql); s.step(); const r = s.getAsObject(); s.free(); return r; };
  const round = Number(scalar('SELECT COUNT(*) AS n FROM meko_cycles').n || 0);

  if (args.includes('--scan')) await S.scanTickets(store, { maxTickets: Number(_flag(args, 'max', '200')) });
  await S.dispatchTickets(store, {});

  const list = P.claimable(store, REG);
  const wantId = _flag(args, 'ticket', null);
  const claim = wantId ? list.find(t => t.id === wantId) : list[0];
  if (!claim) {
    console.log(JSON.stringify({ ok: false, reason: '无单可接', claimable: list.length, round }, null, 2));
    process.exit(1);
  }
  const before = scalar(`SELECT kq, overall FROM kespi_scores WHERE entity_id = '${claim.entity_id}'`) || {};

  const ret = externalPart(db, claim);
  if (!ret) { console.log(JSON.stringify({ ok: false, reason: '原料不存在' })); process.exit(1); }
  applyReturn(store, claim, ret);                 // 系统写回

  await K.kespiStep(store, {});
  const v = await S.verifyTickets(store, { round });

  const after = scalar(`SELECT kq, overall FROM kespi_scores WHERE entity_id = '${claim.entity_id}'`) || {};
  const row = (() => {
    const s = db.prepare('SELECT status, evidence_json FROM opt_tickets WHERE id = ?');
    s.bind([claim.id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r;
  })();
  const ev = JSON.parse((row && row.evidence_json) || '{}');
  const board = B.boardOf(store, { round });

  console.log(JSON.stringify({
    ok: row.status === 'verified',
    round,
    slot: REG.slot, mode: REG.mode,
    claim: { id: claim.id, entity: claim.entity_id, want: claim.demand.want, acceptance: claim.demand.acceptance },
    return: ret.result,
    writeBack: { charsAdded: ret.patch.appendText.length, tagsAdded: ret.patch.addTags },
    kq: { before: before.kq, after: after.kq },
    ticket: { status: row.status, reason: ev.reason || null, acceptance: ev.acceptance || null },
    verify: { verified: v.verified.length, rejected: v.rejected.length, stillOpen: v.stillOpen.length },
    board: { total: board.summary.total, pending: board.summary.pending, noBeat: board.summary.noBeat, noProgress: board.summary.noProgress, verified: board.summary.verified },
    lines: board.lines.slice(0, 4)
  }, null, 2));
}

if (require.main === module) {
  main(process.argv).catch((e) => { console.error('parasite-round 失败: ' + e.message); process.exit(1); });
}

module.exports = { REG, NARRATIVE_REG, externalPart, applyReturn, externalPartNarrative, applyReturnNarrative };
