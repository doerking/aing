'use strict';
// aing-v2 parasite-slot.js —— M6 任务 6.19 实现（SPEC-6.18 §三/§四 寄生位注册表与取单口）
// 点位是「外部件可以挂进来」的声明面：每个位点定输入、输出、写回点与拒绝条件，
// 以及两种植入形态——semi（只补一块）与 full（接管整步）。
// 铁律：外部件不写库，只交回单；写入由系统按 writeBack 执行。
// 本件只做声明与取单：claim 判「能不能接」，claimable 列出「现在有哪些单可接」。

const MODES = ['semi', 'full'];
const OUTSOURCEABLE = new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);

const SLOTS = [
  {
    slot: 'P1', name: '入口成形',
    location: 'auto-ingest 分流后、落库前',
    modes: ['semi', 'full'],
    in: ['session'], out: ['title', 'tags', 'narrative'],
    writeBack: ['entities.title', 'entities.tags', 'entities.content'],
    refuse: ['段数不足六段', '字段缺']
  },
  {
    slot: 'P2', name: '蒸馏',
    location: 'distill 的 pending-distillation 循环',
    modes: ['semi', 'full'],
    in: ['raw-entity', 'demand'], out: ['product-content'],
    writeBack: ['entities(wiki-*, strand=future)', 'links(derived)'],
    refuse: ['产物为空', '与原料逐字相同', '写后读回不一致']
  },
  {
    slot: 'P3', name: '关联建边',
    location: 'sprout / pollinate / field-maintain',
    modes: ['semi', 'full'],
    in: ['target-entity', 'demand'], out: ['candidate-edges'],
    writeBack: ['links(候选关系 → 过闸提升)'],
    refuse: ['无证据', '类型配对非法', 'future→past 边']
  },
  {
    slot: 'P4', name: '蒸馏点提取',
    location: 'distill-points 的 points_json 产出',
    modes: ['semi', 'full'],
    in: ['conversation-text'], out: ['points'],
    writeBack: ['distill_points(只增)'],
    refuse: ['区间对不回原文', '重复点']
  },
  {
    slot: 'P5', name: '洞察提取',
    location: 'insight-extract、轮末',
    modes: ['semi', 'full'],
    in: ['cycle-readings'], out: ['insight-candidates'],
    writeBack: ['entities(raw-insight-*, strand=future)'],
    refuse: ['写过去边', '与已有洞察重复']
  },
  {
    slot: 'P6', name: '提案承接',
    location: 'opt_tickets status=proposed',
    modes: ['semi', 'full'],
    in: ['demand'], out: ['result'],
    writeBack: ['entities(按需求改动)', 'opt_tickets.evidence_json.result'],
    refuse: ['缺自评', '缺事实', '弱证据', '超 TTL']
  },
  {
    slot: 'P7', name: '回单校验',
    location: 'verifyTickets 的闸阶段',
    modes: [],
    in: ['result'], out: ['admitted', 'reasons'],
    writeBack: [],
    refuse: ['不可外包（主权动作）']
  }
];

function slotOf(id) { return SLOTS.find(s => s.slot === String(id)) || null; }

function validateSlot(s) {
  const reasons = [];
  if (!s || typeof s !== 'object') return { ok: false, reasons: ['no-slot'] };
  if (!slotOf(s.slot)) reasons.push('unknown-slot');
  if (String(s.name || '').trim().length === 0) reasons.push('no-name');
  if (!Array.isArray(s.modes)) reasons.push('no-modes');
  else if (s.modes.some(m => !MODES.includes(m))) reasons.push('bad-mode');
  else if (s.slot !== 'P7' && s.modes.length === 0) reasons.push('no-modes');
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/**
 * 判断一份注册能否接某个需求。
 * @param {string} slotId 位点
 * @param {{mode:string, evidence:string[]}} reg 外部件注册
 * @param {{slot:string, mode:string, evidence:string[]}} demand 单上的需求
 */
function claim(slotId, reg, demand) {
  const id = String(slotId);
  if (id === 'P7' || !OUTSOURCEABLE.has(id)) return { ok: false, reason: 'not-outsourceable:' + id };
  if (!slotOf(id)) return { ok: false, reason: 'unknown-slot:' + id };
  const d = demand && typeof demand === 'object' ? demand : {};
  if (String(d.slot || '') !== id) return { ok: false, reason: 'slot-mismatch' };
  const regMode = String((reg && reg.mode) || '');
  const wantMode = String(d.mode || '');
  if (!MODES.includes(regMode)) return { ok: false, reason: 'bad-registration-mode' };
  if (wantMode === 'full' && regMode !== 'full') return { ok: false, reason: 'mode-too-narrow' };
  const has = new Set(Array.isArray(reg.evidence) ? reg.evidence : []);
  const need = Array.isArray(d.evidence) ? d.evidence : [];
  const missing = need.filter(e => !has.has(e));
  if (missing.length) return { ok: false, reason: 'evidence-missing:' + missing.join('+') };
  return { ok: true };
}

/**
 * 取单口：列出当前能被这份注册接走的提案单（只读）。
 * 只认 status='proposed' 且需求齐全的单；作废/已结的单不出现。
 */
function claimable(store, reg, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('claimable 需要 store 注入（SPEC-1.15 契约）');
  const db = store._getDb();
  const s = db.prepare("SELECT * FROM opt_tickets WHERE status = 'proposed' ORDER BY updated_at, id");
  const out = [];
  while (s.step()) {
    const t = s.getAsObject();
    let ev = {};
    try { ev = JSON.parse(t.evidence_json || '{}'); } catch (_) { ev = {}; }
    const demand = ev.demand && typeof ev.demand === 'object' ? ev.demand : null;
    if (!demand) continue;
    if (claim(reg && reg.slot, reg, demand).ok) out.push({ ...t, demand });
    if (opts.limit != null && out.length >= Number(opts.limit)) break;
  }
  s.free();
  return out;
}

module.exports = { SLOTS, MODES, OUTSOURCEABLE, slotOf, validateSlot, claim, claimable };
