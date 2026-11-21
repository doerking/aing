'use strict';
// aing-v2 metabolism.js —— 代谢链步骤表（SPEC-2.9 AC-4 / SPEC-1.14）
// 链即真相：一个步骤只有出现在这里并被编排器注册，才算「在链上」。
// 旧院 recycle 缺席 STEPS 造成压缩单向泄漏（核读 §2.3）——此处以表 + 门禁断言堵住。

// 默认代谢链（顺序 = 语义依赖序）
const DEFAULT_STEPS = [
  'compile',
  'import',
  'distill',
  'distill-points',
  'trajectory',
  'insight-extract',
  'link-sync',
  'vector',
  'sprout',
  'pollinate',
  'hub-trim',
  'field-maintain',
  'compress',
  'recycle',
  'kespi',
  'capability-dispatch',
  'self-optimize',
  'lineage-reflect',
  'retrieval-kpi',
  'prune',
  'conservation'
];

// 维护/自优化轮才执行的步骤共用开关（SPEC-6.8 §三 / SPEC-6.9 §2.5）
function maintenanceGuard(ctx = {}) {
  return ctx.selfOptimize === true ||
    (ctx.opts && ctx.opts.selfOptimize === true) ||
    /维护|自优化/.test(String(ctx.cycleType || ''));
}

// id → { strand, band, reads, writes, reversible, module, fn }
const REGISTRY = {
  compile:     { strand: 'raw',   band: 'entry',      reads: [],                      writes: ['entities'],            reversible: false, module: './compile.js',     fn: 'compile', argStyle: 'dir-store' },
  import:      { strand: 'raw',   band: 'background', reads: ['entities'],            writes: ['entities', 'links'],   reversible: true,  module: './import.js',      fn: 'importStep' },
  distill:     { strand: 'raw',   band: 'background', reads: ['entities'],            writes: ['entities'],            reversible: true,  module: './distill.js',     fn: 'distillStep' },
  'distill-points': { strand: 'cross', band: 'background', reads: ['entities'],       writes: ['distill_points'],      reversible: true,  module: './distill-points.js', fn: 'extractStep' },
  trajectory:  { strand: 'cross', band: 'background', reads: ['entities'],            writes: ['task_trajectories'],   reversible: true,  module: './trajectory.js',  fn: 'syncSessions' },
  'insight-extract': { strand: 'cross', band: 'background', reads: ['entities'],      writes: ['entities'],            reversible: true,  module: './insight-extract.js', fn: 'extractInsights' },
  'link-sync': { strand: 'cross', band: 'background', reads: ['entities', 'links'],   writes: ['links'],               reversible: true,  module: './link-sync.js',   fn: 'linkSyncStep' },
  vector:      { strand: 'cross', band: 'background', reads: ['entities'],            writes: ['entity_vectors'],      reversible: true,  module: './vector.js',      fn: 'vectorStep' },
  sprout:      { strand: 'cross', band: 'field',      reads: ['entities', 'links'],   writes: ['links'],               reversible: true,  module: './sprout.js',      fn: 'sproutStep' },
  pollinate:   { strand: 'cross', band: 'field',      reads: ['entities', 'links'],   writes: ['links'],               reversible: true,  module: './pollinate.js',   fn: 'pollinateStep' },
  'hub-trim':  { strand: 'cross', band: 'field',      reads: ['links'],               writes: ['links'],               reversible: true,  module: './hub-trim.js',    fn: 'trimHubs' },
  compress:    { strand: 'wiki',  band: 'field',      reads: ['entities'],            writes: ['compressed_seeds'],    reversible: true,  module: './compress.js',    fn: 'compressStep' },
  recycle:     { strand: 'raw',   band: 'field',      reads: ['compressed_seeds'],    writes: ['entities'],            reversible: true,  module: './recycle.js',     fn: 'recycleStep' },
  kespi:       { strand: 'cross', band: 'background', reads: ['entities', 'links'],   writes: ['kespi_scores'],        reversible: true,  module: './kespi.js',       fn: 'kespiStep' },
  'self-optimize': { strand: 'cross', band: 'field', reads: ['entities','kespi_scores'], writes: ['opt_tickets','field_actions','genes','gate_records'], reversible: true, module: './self-optimize.js', fn: 'selfOptimizeStep',
    // 默认唔自动下药：维护/自优化轮或显式 opts.selfOptimize 才开（SPEC-6.8 §三）
    guard: maintenanceGuard },
  'capability-dispatch': { strand: 'cross', band: 'field', reads: ['entities','distill_points'], writes: ['opt_tickets'], reversible: true, module: './capability-dispatch.js', fn: 'dispatchCapabilities',
    // 能力叙事派单只在维护轮开（SPEC-6.9 §2.5）
    guard: maintenanceGuard },
  'lineage-reflect': { strand: 'cross', band: 'background', reads: ['field_actions','meko_cycles'], writes: ['task_trajectories'], reversible: true, module: './lineage-reflect.js', fn: 'reflect',
    // 谱系反思只在维护轮开（SPEC-6.9 §2.5）
    guard: maintenanceGuard },
  'retrieval-kpi': { strand: 'cross', band: 'background', reads: ['entities'], writes: ['task_trajectories'], reversible: true, module: './retrieval-kpi.js', fn: 'runKpi',
    // 检索 KPI 只在维护轮开（SPEC-6.9 §2.5）
    guard: maintenanceGuard },
  prune:       { strand: 'wiki',  band: 'background', reads: ['entities'],            writes: ['entities'],            reversible: true,  module: './prune.js',       fn: 'pruneCycle' },
  'field-maintain': { strand: 'cross', band: 'field', reads: ['entities','links'], writes: ['entities','links','field_actions'], reversible: true, module: './meko-field.js', fn: 'maintainStep' },
  conservation:{ strand: 'cross', band: 'background', reads: ['links', 'entities'],   writes: ['meko_cycles'],         reversible: true,  module: './conservation.js', fn: 'conservationStep' }
};

// 每步契约 tick（SPEC-6.9b §2.4）：求和抬升 T_bound，并作分步软配额
const STEP_TICKS = {
  compile: 10, import: 15, distill: 5, 'distill-points': 5, trajectory: 5,
  'insight-extract': 5, 'link-sync': 5, vector: 30, sprout: 5, pollinate: 5,
  'hub-trim': 5, 'field-maintain': 10, compress: 5, recycle: 5, kespi: 10,
  'capability-dispatch': 5, 'self-optimize': 10, 'lineage-reflect': 2,
  'retrieval-kpi': 15, prune: 5, conservation: 2
};
for (const [id, ticks] of Object.entries(STEP_TICKS)) {
  if (REGISTRY[id]) REGISTRY[id].budgetTick = ticks;
}

// 生成可注册契约（onCycle 由编排器回调，store 注入）
function buildDefaultSteps(ids = DEFAULT_STEPS) {
  return ids.map((id) => {
    const spec = REGISTRY[id];
    if (!spec) throw new Error('metabolism: 未登记步骤 ' + id);
    return {
      id,
      strand: spec.strand,
      band: spec.band,
      reads: spec.reads.slice(),
      writes: spec.writes.slice(),
      budgetTick: spec.budgetTick || 1,
      reversible: spec.reversible,
      onCycle: async (ctx = {}) => {
        if (typeof spec.guard === 'function' && !spec.guard(ctx)) {
          return { ok: true, skipped: true, actions: { skipped: true } };
        }
        const mod = require(spec.module);
        const fn = mod[spec.fn];
        if (typeof fn !== 'function') throw new Error('metabolism: ' + id + ' 入口缺失 ' + spec.fn);
        // compile 的历史签名为 (rawDir, store)，其余步骤为 (store, opts)
        if (spec.argStyle === 'dir-store') {
          const rawDir = ctx.rawDir || process.env.AING_RAW || require('path').join(__dirname, '..', 'raw');
          return fn(rawDir, ctx.store, { round: ctx.round, deadlineAt: ctx.deadlineAt });
        }
        // SPEC-1.14 修订 H：deadline 下传——让长步能自己按块自检、主动收口
        return fn(ctx.store, { ...(ctx.opts || {}), round: ctx.round, cycleId: ctx.cycleId, deadlineAt: ctx.deadlineAt });
      }
    };
  });
}

// 门禁：链上必须真有这些步骤（缺一即红）
function assertChain(ids = DEFAULT_STEPS, required = ['recycle']) {
  const missing = required.filter(r => !ids.includes(r));
  if (missing.length) throw new Error('代谢链缺步骤: ' + missing.join(','));
  return true;
}

module.exports = { DEFAULT_STEPS, REGISTRY, buildDefaultSteps, assertChain };
