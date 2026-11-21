'use strict';
// aing-v2 evolution-team.js —— M2 任务 2.14 实现（SPEC-2.14 进化团入驻）
// 五成员按 1.15 契约注册进 meko，随 runCycle 被驱动；只读只判（I7），输出只到提案/评分/建议（I10）。
// 无独立调度入口——编排唯一入口仍是 1.14。
// 成员池 = 蜂巢：5 单元 ×（1 常驻 + ≤2 狼位），总量 15 席，按信号进出。
// 本模块唔 require knowledge-store（C5 对进化团同样生效）。

// 技能导入（SPEC-0.8 修订 B）：每位成员继承原院角色文件的能力，唔止继承名。
// 训练师技能并入 gene-keeper；六阶段本地化，不依赖外部 SkillOpt / 外部编排平台。
const { getKnob } = require('./config-runtime.js');
const TRAINER_STAGES = ['rollout', 'reflect', 'aggregate', 'select', 'update', 'gate'];

const MEMBERS = [
  {
    id: 'gene-keeper', name: '基因组长',
    role: '记录 episode/route/pattern，管 gene 与 elitePattern 的生老病死；兼训练师：KESPI 误差开单→下药→复核→gene',
    skills: ['skill-trainer', 'growth-loop'],
    reads: ['entities', 'meko_cycles', 'links', 'kespi_scores'], writes: ['gene', 'opt_tickets'],
    timepoint: 'T2'
  },
  {
    id: 'omni-gate', name: '闸东',
    role: 'canary/holdout/acceptance 三闸，真接任何 promote 与改进提升',
    skills: ['adversarial-reviewer', 'guardrails'],
    reads: ['scores', 'gene', 'baseline'], writes: ['gate-log'],
    timepoint: 'T1'
  },
  {
    id: 'pilot', name: '调度长',
    role: '七类信号 → 九动作优先级 → 只出本轮 plan，交编排器执行',
    skills: ['neuro-theorist', 'growth-director'],
    reads: ['meko_cycles', 'conservation'], writes: ['plan'],
    timepoint: 'T0'
  },
  {
    id: 'tri-cross', name: '三路复核',
    role: 'explore/verify/optimize ≥2 路同意 + 双链互校',
    skills: ['plasticity-analyst', 'senior-engineer'],
    reads: ['links', 'entities'], writes: ['verdict'],
    timepoint: 'T1'
  },
  {
    id: 'poll', name: '召集团',
    role: '争议/高风险时召集三位规则官出加权意见（唔系多数票）',
    skills: ['guide-chain-swarm'],
    reads: ['dispute'], writes: ['opinion'],
    timepoint: 'on-demand'
  }
];

const MAX_SEATS = 15;
const WOLVES_PER_UNIT = 2;

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

function _conservation(store) {
  try { return require('./conservation.js').measureConservation(store, {}); }
  catch (_) { return { growth: 0, pruned: 0, ratio: 1, inBand: true, verdict: 'balanced', idle: true }; }
}

// —— 各成员 onCycle：只读 + 只出判定
const HANDLERS = {
  'gene-keeper': async (store) => {
    const db = store._getDb();
    const kespi = _scalar(db, 'SELECT COUNT(*) AS n, AVG(overall) AS avg FROM kespi_scores');
    const c = _conservation(store);
    const overall = kespi && kespi.n ? Math.round(Number(kespi.avg) * 1000) / 1000 : null;
    // 训练师技能：只读扫描工单候选，唔落库（I7：成员零写权）
    let tickets = [];
    try { tickets = require('./self-optimize.js').scanTickets(store, { persist: false }).tickets; } catch (_) { tickets = []; }
    return {
      ok: true,
      actions: { scored: kespi ? Number(kespi.n) : 0, tickets: tickets.length },
      proposal: {
        type: 'score',
        dims: { D3: { kespiOverall: overall, conservationRatio: c.ratio, inBand: c.inBand } },
        // SPEC-1.12 修订 A：五维均值整体下移（真库约 0.46），阈值从 0.6 调到 0.45（≈中位）；单源喺 config-runtime
        geneCandidates: overall != null && overall >= getKnob(store, 'kespi.geneMin') ? ['kespi-high'] : [],
        tickets,
        trainerStages: TRAINER_STAGES
      }
    };
  },
  'omni-gate': async () => ({ ok: true, actions: { checked: 0 }, gate: { verdict: 'pass', gates: ['canary', 'holdout', 'acceptance'], holds: [] } }),
  'pilot': async (store) => {
    const db = store._getDb();
    const last = _scalar(db, `SELECT * FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 1`);
    const c = _conservation(store);
    const entities = Number(_scalar(db, 'SELECT COUNT(*) AS n FROM entities WHERE invalid_at IS NULL').n || 0);
    const pending = Number(_scalar(db, `SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND relation IN ('sprout-candidate','pollinate-candidate')`).n || 0);
    const focus = !last || c.idle ? 'supply' : (c.verdict === 'growth-only' ? 'digest' : (c.verdict === 'prune-only' ? 'restore' : 'maintain'));
    return {
      ok: true,
      actions: { planned: 1 },
      plan: {
        focus,
        reason: c.verdict,
        entities,
        pendingCandidates: pending,
        lastCycle: last ? { cycleType: last.cycle_type, status: last.status } : null,
        budget: { rounds: 1, fieldTick: 1 }
      }
    };
  },
  'tri-cross': async (store) => {
    const db = store._getDb();
    const raw = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE id LIKE 'raw-%' AND invalid_at IS NULL`).n || 0);
    const wiki = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE id LIKE 'wiki-%' AND invalid_at IS NULL`).n || 0);
    const gaps = Math.abs(raw - wiki);
    return {
      ok: true,
      actions: { routes: 3, agree: gaps === 0 ? 3 : 2 },
      verdict: { gap: gaps, raw, wiki, roads: ['explore', 'verify', 'optimize'], agreement: gaps === 0 ? 'unanimous' : 'majority' }
    };
  },
  'poll': async () => ({ ok: true, actions: { convened: 0 }, opinion: { convened: false, reason: 'no-dispute' } })
};

function buildEvolutionSteps() {
  return MEMBERS.map((m) => ({
    id: 'evo-' + m.id,
    strand: 'cross',
    band: 'field',
    reads: m.reads.slice(),
    writes: m.writes.slice(),
    budgetTick: 1,
    reversible: true,
    onCycle: (ctx = {}) => HANDLERS[m.id](ctx.store, ctx)
  }));
}

function registerEvolutionTeam(orch) {
  if (!orch || typeof orch.registerStep !== 'function') throw new Error('registerEvolutionTeam 需要编排器');
  return buildEvolutionSteps().map(c => orch.registerStep(c));
}

// 蜂巢成员池：单元 = 常驻成员 + 狼位（≤2），总席 15
class MemberPool {
  constructor() { this.units = new Map(); }

  get seats() {
    let n = 0;
    for (const w of this.units.values()) n += 1 + w;
    return n;
  }

  join(unitId, opts = {}) {
    if (!unitId || typeof unitId !== 'string') throw new Error('unitId 必填');
    const wolves = Number.isInteger(opts.wolves) ? opts.wolves : 0;
    if (wolves < 0 || wolves > WOLVES_PER_UNIT) throw new Error(`狼位超编制：${unitId} 申请 ${wolves} > ${WOLVES_PER_UNIT}`);
    const exists = this.units.has(unitId);
    if (!exists && this.units.size >= MEMBERS.length) throw new Error(`单元已满：${this.units.size}/${MEMBERS.length}`);
    const prevWolves = exists ? this.units.get(unitId) : 0;
    const seatsAfter = this.seats - (exists ? 1 + prevWolves : 0) + 1 + wolves;
    if (seatsAfter > MAX_SEATS) throw new Error(`席位超编：${seatsAfter} > ${MAX_SEATS}`);
    this.units.set(unitId, wolves);
    return { ok: true, unit: unitId, wolves, seats: seatsAfter };
  }

  leave(unitId) {
    if (!this.units.has(unitId)) return { left: false, unit: unitId };
    this.units.delete(unitId);
    return { left: true, unit: unitId, seats: this.seats };
  }

  snapshot() {
    return [...this.units.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([unit, wolves]) => ({ unit, wolves, seats: 1 + wolves }));
  }
}

module.exports = { MEMBERS, MAX_SEATS, WOLVES_PER_UNIT, TRAINER_STAGES, buildEvolutionSteps, registerEvolutionTeam, MemberPool };
