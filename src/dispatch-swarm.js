'use strict';
// aing-v2 dispatch-swarm.js —— M2 任务 2.18（SPEC-2.18 外派采集面）
// 定位（D11 裁定 A，2026-11-17）：包内只做「派单底版校验 + 攻果门校验」的纯函数与记账，
//   **不执行派工**：不 spawn、不起进程、不发网络、不接触知识库。
// 死约束：本文件禁进程/网络/存储依赖（arch-lint 执行位守 + AC-9）。
// 外派零写权：只出轨迹与标签；残渣回流由场域件决定是否落库。

const crypto = require('crypto');

const BASELINE_REQUIRED = ['language', 'behavior', 'workflow'];
const REQUIRED_TAGS = ['unit', 'ticket', 'outcome'];
const FRAMEWORK_REQUIRED = ['background', 'statement', 'trace_policy', 'output_schema'];
const PARTICLE_CLASSES = ['normal', 'cover', 'spot-check'];
const SOURCE_LEVELS = ['high', 'medium', 'low', 'unclassified'];
const TRACE_MAX = 12;

const UNIT_ROLES = [
  { role: '主责', responsibility: '定方向、担结果、收口签认' },
  { role: '协同', responsibility: '并行展开、补齐材料、推进到可判' },
  { role: '校验', responsibility: '独立复核、挑错、守判据' }
];

// 两权分离：谁可以做什么（拍板独归 owner）
const AUTHORITY = {
  owner: ['approve', 'decide', 'dispatch'],
  dispatcher: ['dispatch', 'collect', 'aggregate'],
  'squad-lead': ['coordinate'],
  'unit-lead': ['execute'],
  particle: ['execute']
};

function _id(prefix) { return prefix + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'); }

/** 派单框架四项：缺一不得派出 */
function checkFramework(fw) {
  const o = fw && typeof fw === 'object' ? fw : {};
  const missing = FRAMEWORK_REQUIRED.filter(k => o[k] == null || o[k] === '');
  return missing.length ? { ok: false, missing } : { ok: true, missing: [] };
}

/** 厚度：派单只要 required>0；收口要三件齐且 met 与 achieved 自洽 */
function checkThickness(t, { needAll = false } = {}) {
  if (!t || typeof t !== 'object') return { ok: false, reason: 'incomplete' };
  if (!(Number(t.required) > 0)) return { ok: false, reason: 'incomplete' };
  if (!needAll) return { ok: true };
  if (!Number.isFinite(Number(t.achieved)) || typeof t.met !== 'boolean') return { ok: false, reason: 'incomplete' };
  const met = Number(t.achieved) >= Number(t.required);
  if (met !== t.met) return { ok: false, reason: 'inconsistent' };
  return { ok: true };
}

/** 轨迹口径：只过事实+来源指针，每点 ≤12 条，拦结论全文 */
function checkTraces(traces) {
  if (!Array.isArray(traces)) return { ok: false, reason: 'not-array' };
  if (traces.length > TRACE_MAX) return { ok: false, reason: 'over-limit', limit: TRACE_MAX, count: traces.length };
  for (let i = 0; i < traces.length; i++) {
    const t = traces[i] || {};
    if (t.conclusion != null || t.opinion != null) return { ok: false, reason: 'conclusion', index: i };
    if (t.fact == null || t.source == null || t.source === '') return { ok: false, reason: 'no-source', index: i };
  }
  return { ok: true, count: traces.length };
}

/** 来源分级 + 交叉验证：未分级归残渣；高置信需 ≥2 独立源，否则只能当线索 */
function evaluateClaim({ sources, confidence } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return { verdict: 'residue', reasons: ['no-source'] };
  if (list.some(s => !s || !SOURCE_LEVELS.includes(s.level) || s.level === 'unclassified')) {
    return { verdict: 'residue', reasons: ['unclassified-source'] };
  }
  const independent = new Set(list.map(s => s.author || s.id || '')).size;
  if (confidence === 'high' && independent < 2) return { verdict: 'lead', reasons: ['single-source'] };
  return { verdict: 'attack', reasons: [] };
}

/** 攻果发布门：事实 + 证据 + 分级 + 自评，四件缺一不发布 */
function gateResult(r = {}) {
  const need = ['facts', 'evidence', 'grading', 'selfReview'];
  const missing = need.filter(k => {
    const v = r[k];
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'string') return v === '';
    return false;
  });
  return missing.length ? { ok: false, missing } : { ok: true, missing: [] };
}

/** 基线门：无基线不编队；打不过基线就砍 */
function baselineGate({ baseline, score, baselineScore } = {}) {
  if (baseline == null || (typeof baseline === 'object' && !Object.keys(baseline).length)) {
    return { ok: false, reason: 'no-baseline' };
  }
  if (baselineScore != null && Number(score) < Number(baselineScore)) return { ok: false, reason: 'below-baseline' };
  return { ok: true };
}

/** 禁虚报：三布尔分开报，只有 inRuntimeSurface 才许说 swarm-skill */
function dispatchMode(flags = {}) {
  const swarmInstalled = flags.swarmInstalled === true;
  const inRuntimeSurface = flags.inRuntimeSurface === true;
  const bundledInPackage = flags.bundledInPackage === true;
  return { swarmInstalled, inRuntimeSurface, bundledInPackage, mode: inRuntimeSurface ? 'swarm-skill' : 'inline-degraded' };
}

/** 两权分离：粒子/班长/单元长都无拍板权 */
function checkAuthority(role, action) {
  const allowed = (AUTHORITY[role] || []).includes(action);
  return { allowed, role, action, reason: allowed ? null : 'no-authority' };
}

/** 三类粒子：每批至少 1 粒掩护位 */
function checkLanes(lanes) {
  const list = Array.isArray(lanes) ? lanes : [];
  const bad = list.filter(l => !PARTICLE_CLASSES.includes(l));
  if (bad.length) return { ok: false, reason: 'unknown-class', bad };
  if (!list.includes('cover')) return { ok: false, reason: 'cover-missing' };
  return { ok: true };
}

/** 掩护位三铁律：只抓不修 / 两边都报 / 红即回炉 */
function checkCoverReport(rep = {}) {
  for (const k of ['conflicts', 'singleSource', 'unclassified']) {
    if (!Array.isArray(rep[k])) return { ok: false, reason: 'field-missing', missing: k };
  }
  if (rep.fix != null || rep.solution != null || rep.suggestion != null) return { ok: false, reason: 'no-fix-allowed' };
  for (const c of rep.conflicts) {
    const both = c && c.a && c.b && c.a.fact != null && c.b.fact != null && c.a.source != null && c.b.source != null;
    if (!both) return { ok: false, reason: 'both-sides-required' };
  }
  return { ok: true };
}

/** 回报 schema：五项齐；四件不齐却写 PASS 即违规 */
function checkReport(rep = {}) {
  const need = ['statement', 'materials', 'conflicts', 'selfReview', 'verdict'];
  const missing = need.filter(k => rep[k] == null || (Array.isArray(rep[k]) && k !== 'conflicts' && rep[k].length === 0));
  if (missing.length) return { ok: false, reason: 'field-missing', missing };
  const tr = checkTraces(rep.materials);
  if (!tr.ok) return { ok: false, reason: tr.reason, index: tr.index };
  if (String(rep.verdict).toUpperCase() === 'PASS' && rep.gateOk !== true) return { ok: false, reason: 'pass-without-gate' };
  return { ok: true };
}

/** 降级阶梯：降级但不跳门 */
function degrade({ inRuntimeSurface, missingRole } = {}) {
  if (missingRole) return { mode: 'inline-persona', stillGated: true, note: '某类粒子缺失：派发人内联补位，终报标注降级损失' };
  if (inRuntimeSurface === false) return { mode: 'inline-degraded', stillGated: true, note: '运行时未加载：内联扮演，仍过门，不跳门' };
  return { mode: 'swarm-skill', stillGated: true, note: '正常派工' };
}

/** 波次：1 前出、2 展开，禁同刻全开 */
function planWave({ units } = {}) {
  const n = Number(units);
  if (!Number.isInteger(n) || n <= 0) return { waves: [], reason: 'bad-units' };
  if (n === 1) return { waves: [[1]] };
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 2);
  return { waves: [[1], rest] };
}

class DispatchUnit {
  constructor({ id, ticket, baseline, inherited, thickness }) {
    this.id = id;
    this.ticket = ticket;
    this.state = 'running';
    this.baseline = baseline;
    this.thickness = thickness || null;
    this.inherited = Array.isArray(inherited) ? inherited.slice() : [];
    this.openedAt = new Date().toISOString();
    this.members = UNIT_ROLES.map((r, i) => ({
      id: `${id}-m${i + 1}`,
      role: r.role,
      responsibility: r.responsibility,
      writes: []
    }));
  }

  write() { throw new Error('swarm-no-write: 外派单位对知识库零写权'); }
}

class DispatchDesk {
  constructor({ maxUnits = Infinity, batch = null } = {}) {
    this.maxUnits = maxUnits;
    this.batch = batch;
    this._units = new Map();
    this._closed = 0;
    this._refused = 0;
  }

  dispatch({ ticket, baseline, inherited, thickness, batch, continued } = {}) {
    if (!ticket || typeof ticket !== 'string') throw new Error('dispatch 需要 ticket');
    const missing = BASELINE_REQUIRED.filter(k => !baseline || baseline[k] == null || baseline[k] === '');
    if (missing.length) throw new Error(`baseline-missing: 缺 ${missing.join(',')}`);
    const th = checkThickness(thickness);
    if (!th.ok) throw new Error(`thickness-missing: 命题须写明厚度要求（required>0）`);
    // 批间只认用户闸：同批可连派，换批未说继续即锁
    if (this.batch == null) this.batch = batch || 'default';
    else if (batch && batch !== this.batch) {
      if (continued !== true) throw new Error('batch-locked: 批间需用户说继续');
      this.batch = batch;
    }
    if (this._units.size >= this.maxUnits) throw new Error(`编制已满: ${this._units.size}/${this.maxUnits}`);
    const unit = new DispatchUnit({ id: _id('unit'), ticket, baseline, inherited, thickness });
    this._units.set(unit.id, unit);
    return unit;
  }

  async close(unitId, { traces, tags, thickness } = {}) {
    const unit = this._units.get(unitId);
    if (!unit) return { closed: false, reason: 'not-found' };
    const trail = Array.isArray(traces) ? traces : [];
    if (!trail.length) { this._refused++; return { closed: false, reason: 'traces-incomplete' }; }
    const tagSet = new Set(Array.isArray(tags) ? tags : []);
    const missingTags = REQUIRED_TAGS.filter(t => !tagSet.has(t));
    if (missingTags.length) { this._refused++; return { closed: false, reason: 'tags-incomplete', missing: missingTags }; }
    const th = checkThickness(thickness, { needAll: true });
    if (!th.ok) {
      this._refused++;
      return { closed: false, reason: th.reason === 'inconsistent' ? 'thickness-inconsistent' : 'thickness-incomplete' };
    }

    this._units.delete(unitId);
    this._closed++;
    return {
      closed: true,
      residue: {
        unitId,
        ticket: unit.ticket,
        thickness: { required: thickness.required, achieved: thickness.achieved, met: thickness.met },
        traces: trail,
        tags: [...tagSet],
        // 交接唔继承：只回残渣，人走人路、料归料堆
        inherited: [],
        residue: `${unit.ticket} 收口：轨迹 ${trail.length} 步，标签齐，厚度 ${thickness.achieved}/${thickness.required}；上下文不入下一单`
      }
    };
  }

  units() {
    return [...this._units.values()].map(u => ({
      id: u.id, ticket: u.ticket, state: u.state,
      members: u.members.length, inherited: u.inherited.length
    }));
  }

  stats() {
    return { open: this._units.size, closed: this._closed, refused: this._refused, batch: this.batch };
  }

  write() {
    throw new Error('swarm-no-write: 外派单位对知识库零写权');
  }
}

module.exports = {
  BASELINE_REQUIRED, REQUIRED_TAGS, FRAMEWORK_REQUIRED, PARTICLE_CLASSES, SOURCE_LEVELS, TRACE_MAX,
  UNIT_ROLES, AUTHORITY,
  checkFramework, checkThickness, checkTraces, evaluateClaim, gateResult, baselineGate,
  dispatchMode, checkAuthority, checkLanes, checkCoverReport, checkReport, degrade, planWave,
  DispatchUnit, DispatchDesk
};
