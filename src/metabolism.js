'use strict';
// aing-v2 metabolism.js —— 代谢链步骤表（SPEC-2.9 AC-4 / SPEC-1.14）
// 链即真相：一个步骤只有出现在这里并被编排器注册，才算「在链上」。
// 旧院 recycle 缺席 STEPS 造成压缩单向泄漏（核读 §2.3）——此处以表 + 门禁断言堵住。

// 默认代谢链（顺序 = 语义依赖序）
const DEFAULT_STEPS = [
  'compile',
  'import',
  'distill',
  'link-sync',
  'vector',
  'sprout',
  'pollinate',
  'hub-trim',
  'compress',
  'recycle',
  'kespi',
  'prune',
  'conservation'
];

// id → { strand, band, reads, writes, reversible, module, fn }
const REGISTRY = {
  compile:     { strand: 'raw',   band: 'entry',      reads: [],                      writes: ['entities'],            reversible: false, module: './compile.js',     fn: 'compile' },
  import:      { strand: 'raw',   band: 'background', reads: ['entities'],            writes: ['entities', 'links'],   reversible: true,  module: './import.js',      fn: 'importStep' },
  distill:     { strand: 'raw',   band: 'background', reads: ['entities'],            writes: ['entities'],            reversible: true,  module: './distill.js',     fn: 'distillStep' },
  'link-sync': { strand: 'cross', band: 'background', reads: ['entities', 'links'],   writes: ['links'],               reversible: true,  module: './link-sync.js',   fn: 'linkSyncStep' },
  vector:      { strand: 'cross', band: 'background', reads: ['entities'],            writes: ['entity_vectors'],      reversible: true,  module: './vector.js',      fn: 'vectorStep' },
  sprout:      { strand: 'cross', band: 'field',      reads: ['entities', 'links'],   writes: ['links'],               reversible: true,  module: './sprout.js',      fn: 'sproutStep' },
  pollinate:   { strand: 'cross', band: 'field',      reads: ['entities', 'links'],   writes: ['links'],               reversible: true,  module: './pollinate.js',   fn: 'pollinateStep' },
  'hub-trim':  { strand: 'cross', band: 'field',      reads: ['links'],               writes: ['links'],               reversible: true,  module: './hub-trim.js',    fn: 'trimHubs' },
  compress:    { strand: 'wiki',  band: 'field',      reads: ['entities'],            writes: ['compressed_seeds'],    reversible: true,  module: './compress.js',    fn: 'compressStep' },
  recycle:     { strand: 'raw',   band: 'field',      reads: ['compressed_seeds'],    writes: ['entities'],            reversible: true,  module: './recycle.js',     fn: 'recycleStep' },
  kespi:       { strand: 'cross', band: 'background', reads: ['entities', 'links'],   writes: ['kespi_scores'],        reversible: true,  module: './kespi.js',       fn: 'kespiStep' },
  prune:       { strand: 'wiki',  band: 'background', reads: ['entities'],            writes: ['entities'],            reversible: true,  module: './prune.js',       fn: 'pruneCycle' },
  conservation:{ strand: 'cross', band: 'background', reads: ['links', 'entities'],   writes: ['meko_cycles'],         reversible: true,  module: './conservation.js', fn: 'conservationStep' }
};

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
      budgetTick: 1,
      reversible: spec.reversible,
      onCycle: async (ctx = {}) => {
        const mod = require(spec.module);
        const fn = mod[spec.fn];
        if (typeof fn !== 'function') throw new Error('metabolism: ' + id + ' 入口缺失 ' + spec.fn);
        return fn(ctx.store, { round: ctx.round });
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
