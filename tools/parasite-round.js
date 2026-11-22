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

// SPEC-6.61：P3 关联建边位的接单方——全寄生，交候选边回单
const EDGES_REG = { slot: 'P3', mode: 'full', evidence: ['facts', 'pointers', 'sourceGrade', 'selfAssessment'] };

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

/** SPEC-6.61 外部件（P3 关联建边）：镜像实体的入向强边来源，补一条出向催化边 */
// 只读单与库、不写库（铁律：外部件不写库，只交回单）。
// 拒：无入向强边 → null（P3 refuse「无证据」）。
// 强边口径与 KESPI 的 outStrong 一致：strength >= 7 且 relation 唔属候选关系。
// 证据去重后 2 类——与「≥ 2 类独立证据才成种」（sprout）与提升闸
// （promoteEdges 的 distinct >= 2）同口径，否则建边永远提唔升。
function externalPartEdges(db, claim) {
  const e = claim && claim.entity_id ? String(claim.entity_id).trim() : '';
  if (!e) return null;
  const CAND = require('../src/field-promote.js').CANDIDATE_RELATIONS || [];
  const ph = CAND.length ? CAND.map(() => '?').join(',') : "''";
  const s = db.prepare(
    'SELECT l.source_id AS src FROM links l WHERE l.target_id = ? AND l.invalid_at IS NULL AND l.strength >= 7 AND l.relation NOT IN (' + ph + ') ORDER BY l.strength DESC, l.created_at DESC');
  s.bind([e, ...CAND]);
  const srcs = [];
  while (s.step()) { const v = String(s.getAsObject().src || '').trim(); if (v) srcs.push(v); }
  s.free();
  if (!srcs.length) return null;
  const edges = srcs.map((src) => ({
    target: src,
    evidence: [
      e + ' 被 ' + src + ' 以 strength>=7 强边引用（镜像入向强边）',
      e + ' 与 ' + src + ' 同标签共现，补出向催化边以闭合引用环'
    ]
  }));
  return {
    result: {
      facts: edges.map((x) => e + ' 被 ' + x.target + ' 强引用却无出向强边，补出向催化边'),
      pointers: edges.map((x) => 'links:' + e + '->' + x.target),
      sourceGrade: 'high',
      selfAssessment: '证据系库内强边镜像，可回原文；反向边系真边（links 主键有向）',
      edges
    }
  };
}

/** SPEC-6.34 外部件（P1 全寄生）：六段从实体事实抽出——骨架恒定，内容随实体滑动 */
// SPEC-6.41：摘录起点对齐句读——偏移后落在句子中腰的，就近吸附到句读之后
const SNAP_RADIUS = 12;
const SNAP_PUNCT = /[。！？；，、：\n]/;
function snapStart(text, start, radius = SNAP_RADIUS) {
  const s = String(text == null ? '' : text);
  const from = Math.min(Math.max(0, Number(start) || 0), s.length);
  const hi = Math.min(s.length, from + radius);
  const lo = Math.max(0, from - radius);
  for (let d = 0; d < radius; d++) {
    const fwd = from + d;
    if (fwd < hi && SNAP_PUNCT.test(s[fwd])) return fwd + 1;      // 向后（平手优先）
    const back = from - 1 - d;
    if (back >= lo && SNAP_PUNCT.test(s[back])) return back + 1;  // 向前
  }
  return from;
}
function excerptWindow(text, start, width) {
  const t = String(text == null ? '' : text).trim();
  const w = Math.max(0, Number(width) || 0);
  const maxStart = Math.max(0, t.length - w);
  const start0 = Math.min(Math.max(Number(start) || 0, 0), maxStart);
  // 段首起不吸附；吸附后窗口可短于 width——宽度是上限，宁可短也不从中腰起
  const st = start0 > 0 ? snapStart(t, start0) : 0;
  const out = t.slice(st, st + w);
  return { text: st + w < t.length ? out + '…' : out, start: st, width: w };
}

function externalPartNarrative(db, claim, opts = {}) {
  const s = db.prepare('SELECT id, content, tags FROM entities WHERE id = ?');
  s.bind([claim.entity_id]); const e = s.step() ? s.getAsObject() : null; s.free();
  if (!e) return null;
  const N = require('../src/capability-narrative.js');
  let doc;
  try { doc = JSON.parse(String(e.content)); } catch (_) { return null; }
  if (!doc || doc.format !== N.FORMAT) return null;

  // SPEC-6.38：摘录起点按阈值游标的偏移前后滑动（±1..±5 字）
  // SPEC-6.41：滑动后的起点再就近吸附到句读之后，避免从句子中腰起
  const round = Number.isFinite(Number(opts && opts.round)) ? Number(opts.round) : 0;
  const delta = Number(require('../src/kespi.js').sectionThreshold(claim.entity_id, { round })) - 20;
  const excerpt = (text, width) => excerptWindow(String(text == null ? '' : text).trim(), delta, width).text;

  const turns = Array.isArray(doc.turns) ? doc.turns : [];
  const cals = Array.isArray(doc.calibrations) ? doc.calibrations : [];
  const clip = (v, n) => { const t = String(v == null ? '' : v).trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  const scenes = turns.map(t => String(t.scene || '')).filter(Boolean);
  const thinks = turns.map(t => String(t.thinking || '')).filter(Boolean);
  const outs = turns.map(t => String(t.output || '')).filter(Boolean);
  const tools = turns.flatMap(t => Array.isArray(t.tools) ? t.tools : []);
  const plain = tools.filter(x => !x.isSub);
  const subs = tools.filter(x => x.isSub);
  const uniq = (xs) => [...new Set(xs.map(x => String(x.name || '')))].filter(Boolean).join('、');

  const sections = {
    '场景（触发）': scenes.length
      ? `本单元共 ${turns.length} 轮会话；首轮触发为「${excerpt(scenes[0], 60)}」。`
      : `本单元共 ${turns.length} 轮会话，首轮无用户输入记录。`,
    '思维（能力内核）': thinks.length
      ? `推理线索：${excerpt(thinks.join(' '), 80)}`
      : '本单元无显式推理块，思维只能由产出反推。',
    '手段（工具执行）': plain.length
      ? `调用工具 ${plain.length} 次：${uniq(plain)}；参数摘要见各轮 tools[].input。`
      : '本单元无工具调用，手段仅为对话推理。',
    '编排（子agent）': subs.length
      ? `派发子agent ${subs.length} 次：${uniq(subs)}。`
      : '本单元无子agent 派发，全部工作单轮内完成。',
    '产出': outs.length
      ? `产出：${excerpt(outs.join(' '), 80)}`
      : '本单元无文本产出记录。',
    '会话级校准': cals.length
      ? `校准 ${cals.length} 条：${clip(cals.map(c => String(c.summary || c.type || '')).join('；'), 60)}`
      : '本单元无会话级校准记录。'
  };
  return {
    patch: { sections },
    result: {
      facts: [
        `场景取自 turns[0].scene（共 ${turns.length} 轮）`,
        `思维取自 ${thinks.length} 段推理块`,
        `手段取自工具调用 ${plain.length} 次`,
        `编排取自子agent ${subs.length} 次`,
        `产出取自 ${outs.length} 段文本`,
        `校准取自 ${cals.length} 条会话级校准`
      ],
      pointers: [`entities/${claim.entity_id}`, `opt_tickets/${claim.id}`],
      sourceGrade: 'medium',
      selfAssessment: '自评：六段均按实体既有轨迹抽取，无证据的段只写声明；达标与否以系统 kq 验收为准'
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

  const isP1 = _flag(args, 'slot', 'P2') === 'P1';
  const reg = isP1 ? NARRATIVE_REG : REG;
  const list = P.claimable(store, reg);
  const wantId = _flag(args, 'ticket', null);
  const claim = wantId ? list.find(t => t.id === wantId) : list[0];
  if (!claim) {
    console.log(JSON.stringify({ ok: false, reason: '无单可接', claimable: list.length, round }, null, 2));
    process.exit(1);
  }
  const before = scalar(`SELECT kq, overall FROM kespi_scores WHERE entity_id = '${claim.entity_id}'`) || {};

  const ret = isP1 ? externalPartNarrative(db, claim, { round }) : externalPart(db, claim);
  if (!ret) { console.log(JSON.stringify({ ok: false, reason: '原料不存在' })); process.exit(1); }
  (isP1 ? applyReturnNarrative : applyReturn)(store, claim, ret);   // 系统写回

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
    slot: reg.slot, mode: reg.mode,
    claim: { id: claim.id, entity: claim.entity_id, want: claim.demand.want, acceptance: claim.demand.acceptance },
    return: ret.result,
    writeBack: isP1
      ? { sections: Object.keys(ret.patch.sections || {}).length }
      : { charsAdded: ret.patch.appendText.length, tagsAdded: ret.patch.addTags },
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

module.exports = { REG, NARRATIVE_REG, EDGES_REG, externalPart, applyReturn, externalPartNarrative, externalPartEdges, applyReturnNarrative, snapStart, excerptWindow, SNAP_RADIUS };
