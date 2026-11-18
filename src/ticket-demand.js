'use strict';
// aing-v2 ticket-demand.js —— M6 任务 6.18 实现（SPEC-6.18 §一 提案单需求定义）
// 一张提案单要能被接走，必须自带五段需求：要什么（want）/ 怎样算好（acceptance）/
// 回单要带什么（evidence）/ 谁接（mode + slot）/ 几时作废（ttlRounds）。
// 纯函数面：无 I/O、无 store 依赖，供 scanTickets 与外部承接方共用同一份口径。

const OPS = ['gte', 'gt', 'improved'];
const DIMS = ['kq', 'ka', 'kr', 'kd', 'kc', 'overall'];
const MODES = ['semi', 'full'];
const EVIDENCE_KEYS = ['facts', 'pointers', 'sourceGrade', 'selfAssessment'];
const DEFAULT_TTL = 3;

// 各维默认需求（SPEC-6.18 §1.3）
const DEMANDS = {
  'kq-low': {
    want: '补正文到 400 字以上并有 ≥3 个标签',
    acceptance: [{ dim: 'kq', op: 'gte', value: 0.50 }],
    evidence: EVIDENCE_KEYS.slice(),
    mode: 'semi', slot: 'P2', ttlRounds: DEFAULT_TTL
  },
  'ka-low': {
    want: '重新激活（有访问）或体面退场',
    acceptance: [{ dim: 'ka', op: 'gte', value: 0.30 }],
    evidence: EVIDENCE_KEYS.slice(),
    mode: 'semi', slot: 'P6', ttlRounds: DEFAULT_TTL
  },
  'kr-low': {
    want: '进入下一轮代谢并在场',
    acceptance: [{ dim: 'kr', op: 'gte', value: 0.30 }],
    evidence: EVIDENCE_KEYS.slice(),
    mode: 'semi', slot: 'P6', ttlRounds: DEFAULT_TTL
  },
  'kd-low': {
    want: '补出向结构边（母件→镜像）',
    acceptance: [{ dim: 'kd', op: 'gte', value: 0.30 }],
    evidence: EVIDENCE_KEYS.slice(),
    mode: 'semi', slot: 'P3', ttlRounds: DEFAULT_TTL
  },
  'kd-cited': {
    want: '生成派生或关联，令被引用者也能向外催化',
    acceptance: [{ dim: 'kd', op: 'gte', value: 0.30 }],
    evidence: EVIDENCE_KEYS.slice(),
    mode: 'full', slot: 'P3', ttlRounds: DEFAULT_TTL
  },
  'overall-red': {
    want: '任一维改善即算有交代',
    acceptance: [{ dim: 'overall', op: 'improved' }],
    evidence: EVIDENCE_KEYS.slice(),
    mode: 'semi', slot: 'P6', ttlRounds: DEFAULT_TTL
  }
};

function demandFor(kind, overrides = {}) {
  const base = DEMANDS[kind];
  if (!base) return null;
  const d = {
    ...base,
    acceptance: base.acceptance.map(a => ({ ...a })),
    evidence: base.evidence.slice(),
    ...overrides
  };
  return validateDemand(d).ok ? d : null;
}

function validateDemand(d) {
  const reasons = [];
  if (!d || typeof d !== 'object') return { ok: false, reasons: ['no-demand'] };
  const want = d.want == null ? '' : String(d.want).trim();
  if (want.length < 6) reasons.push('want-too-vague');
  if (!Array.isArray(d.acceptance) || d.acceptance.length === 0) reasons.push('no-acceptance');
  else {
    for (const a of d.acceptance) {
      if (!a || !DIMS.includes(a.dim)) reasons.push('bad-dim');
      else if (!OPS.includes(a.op)) reasons.push('bad-op');
      else if (a.op !== 'improved' && !Number.isFinite(Number(a.value))) reasons.push('bad-value');
    }
  }
  if (!Array.isArray(d.evidence) || d.evidence.length === 0) reasons.push('no-evidence');
  else if (d.evidence.some(e => !EVIDENCE_KEYS.includes(e))) reasons.push('unknown-evidence');
  if (!MODES.includes(d.mode)) reasons.push('bad-mode');
  if (typeof d.slot !== 'string' || !/^P\d+$/.test(d.slot)) reasons.push('bad-slot');
  if (!Number.isFinite(Number(d.ttlRounds)) || Number(d.ttlRounds) < 1) reasons.push('bad-ttl');
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

module.exports = { DEMANDS, OPS, DIMS, MODES, EVIDENCE_KEYS, DEFAULT_TTL, demandFor, validateDemand };
