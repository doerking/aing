#!/usr/bin/env node
/**
 * insight-extractor.js — W4 轨迹/代谢 insight 统计抽取器（2026-11-03，唯一新件）
 *
 * 背景（工单 W4）：raw/growth/ 空——growth-docs 写道与 compile 消费端都建好、无内容可写；
 * 轨迹（W1 之后）有供数但无人提炼。本件做 ExpeL 式 extract→store 的「无 LLM 统计版」，
 * 与 distill 机械蒸馏同风格（确定性、可追溯、不编造）：
 *
 *   读 logs/metabolism-decision-lineage.jsonl（W1 已接自动供数）
 *   + kespi_history（分数真源，growth-director.js:338 同口径）
 *   → 按「动作 → 轮级 KESPI 分差」聚合
 *   → 产 top-N 候选 insight（结构化：条件 / 动作 / 效果 / 样本量）
 *   → 落 raw/growth/insight-*.md（frontmatter confidence 0 + status pending-distillation，
 *     同 auto-ingest 身份铁律：不自动晋升、不加分、下轮 compile 自然代谢、四门晋级闸把关）
 *
 * 诚实纪律（工单 W4 红线 + 纪律 4）：
 *   - 只报「统计相关」，**不报「候选分>基线」**（无控制组、多步并行、KESPI 分差可能纯是轮间自然波动）；
 *   - insight 档 confidence 恒 0（待蒸馏/四门验证，本抽取器不自评）；
 *   - insight 档不自执行任何动作（growth-docs 头注契约：不写 knowledge.db、不执行候选）。
 *
 * 时间对齐（避坑 22）：lineage 是 ISO 时间、kespi_history 是 datetime('now') 空格 UTC，
 * 二者不同时钟源，不做跨时钟精确「step↔时刻」join。改用**轮序**对齐：
 *   代谢轮数 = lineage 里 pipeline-summary 行数；轮级 KESPI 序列 = kespi_history distinct created_at 升序。
 *   每个动作的「效果」= 该动作出现所在代谢周期的 KESPI 均值（轮级前后差），非该动作因果。
 *
 * 用法：
 *   node src/insight-extractor.js                # 抽取 + 落档（默认 top 5）
 *   node src/insight-extractor.js --top 8        # top-N
 *   node src/insight-extractor.js --dry-run      # 只打印不落档
 *   node src/insight-extractor.js --count        # 只统计不落档不打印明细
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LINEAGE_FILE = path.join(ROOT, 'logs', 'metabolism-decision-lineage.jsonl');
const GROWTH_DIR = path.join(ROOT, 'raw', 'growth');

function iso() { return new Date().toISOString(); }
function safe(v, max = 2000) { return String(v == null ? '' : v).replace(/\r/g, '').slice(0, max); }
function slug(v) {
  return String(v || 'unknown').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'unknown';
}

/** 读 lineage（只读）→ 行数组；缺失/空回 []。 */
function readLineage() {
  if (!fs.existsSync(LINEAGE_FILE)) return [];
  return fs.readFileSync(LINEAGE_FILE, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter(Boolean);
}

/**
 * 主抽取（async：kespi_history 经 KnowledgeStore 读）。
 * @returns {{ insights: Array, cycles: number, kespiSeries: Array, empty: boolean }}
 */
async function extract(top = 5) {
  const rows = readLineage();
  if (!rows.length) return { insights: [], cycles: 0, kespiSeries: [], empty: true };

  // 代谢轮数 = pipeline-summary 行数（W1 每轮链尾写一条）
  const cycles = rows.filter(r => r.step === 'pipeline-summary').length;

  // 轮级 KESPI 序列（distinct created_at 升序 → avg）：读真源
  let kespiSeries = [];
  try {
    const KnowledgeStore = require('./knowledge-store');
    const store = new KnowledgeStore();
    await store.init();
    kespiSeries = store.all(
      'SELECT created_at, AVG(overall_score) AS avg_score, COUNT(*) AS n FROM kespi_history GROUP BY created_at ORDER BY created_at ASC'
    ).map(r => ({ at: r.created_at, avg: Number(r.avg_score), n: Number(r.n) }));
    store.close();
  } catch (e) { kespiSeries = []; } // 无库/无表：KESPI 面降级，动作统计仍出（effect 记 null）

  // 动作统计（不分轮，轮级 KESPI 做整体效果基线）：
  // 每个 step（排除 pipeline-summary 汇总行）：出现次数、成功次数、成功率、样本量
  const actionMap = new Map();
  for (const r of rows) {
    if (!r || !r.step || r.step === 'pipeline-summary') continue;
    const name = String(r.step);
    const ok = String(r.outcome || '').toLowerCase() === 'success';
    let a = actionMap.get(name);
    if (!a) { a = { name, count: 0, success: 0 }; actionMap.set(name, a); }
    a.count += 1;
    if (ok) a.success += 1;
  }

  // 轮级 KESPI 前后差（整体趋势）：末轮 avg - 首轮 avg（不足两轮记 0，诚实标注无样本差）
  let deltaOverall = null;
  if (kespiSeries.length >= 2) {
    deltaOverall = +(kespiSeries[kespiSeries.length - 1].avg - kespiSeries[0].avg).toFixed(4);
  }

  // 组装 insight 候选：按「成功率 × 样本量」排（成功率高且样本多 = 更值得人复核）
  const candidates = [...actionMap.values()]
    .map(a => ({
      condition: `代谢周期内执行 step「${a.name}」（共 ${cycles} 轮代谢、lineage ${rows.length} 行）`,
      action: a.name,
      effect: (deltaOverall == null)
        ? 'KESPI 分差无样本（kespi_history 不足两轮）——仅记录成功率，不下 KESPI 效果结论'
        : `所在代谢周期 KESPI 均值前后差 ${deltaOverall >= 0 ? '+' : ''}${deltaOverall}（轮级关联，非该动作因果；含多步并行与自然波动）`,
      sampleSize: a.count,
      successRate: a.count ? +(a.success / a.count).toFixed(3) : 0,
      successCount: a.success,
      ranking: +((a.success / Math.max(a.count, 1)) * Math.log2(a.count + 1)).toFixed(3),
    }))
    .sort((x, y) => y.ranking - x.ranking)
    .slice(0, Math.max(1, Number(top) || 5));

  return { insights: candidates, cycles, kespiSeries, empty: false };
}

/** 落 raw/growth/insight-*.md（frontmatter confidence 0 + pending-distillation，身份铁律同 auto-ingest）。 */
function writeInsightDoc(insights, meta) {
  if (!insights.length) return null;
  const docId = `insight-${iso().replace(/[-:.]/g, '').slice(0, 14)}`;
  const ts = iso();
  const top = insights.slice(0, 3).map(i => i.action).join('-') || 'aggregate';

  const bodyLines = [];
  bodyLines.push(`# 代谢 insight 统计抽取（ExpeL 无 LLM 版）`);
  bodyLines.push('');
  bodyLines.push(`> 生成: ${ts}  轮数: ${meta.cycles}  lineage 行: ${meta.rows}`);
  bodyLines.push(`> KESPI 轮级序列: ${meta.kespiSeries.length} 轮（前后差 ${meta.deltaOverall == null ? '无样本' : (meta.deltaOverall >= 0 ? '+' : '') + meta.deltaOverall}）`);
  bodyLines.push('');
  bodyLines.push('## 方法口径');
  bodyLines.push('- 源：logs/metabolism-decision-lineage.jsonl（W1 自动供数）+ kespi_history（分数真源）');
  bodyLines.push('- 按「动作 → 轮级 KESPI 分差」聚合；**统计相关、非因果**（无控制组、多步并行、轮间自然波动都会污染 KESPI 分差）');
  bodyLines.push('- 排序键：成功率 × log2(样本量+1)（成功率高且样本多者优先待人复核）');
  bodyLines.push('');
  bodyLines.push('## 候选 insight（top-N，按 ranking 降序）');
  bodyLines.push('');
  insights.forEach((i, idx) => {
    bodyLines.push(`### ${idx + 1}. step「${i.action}」`);
    bodyLines.push(`- 条件：${i.condition}`);
    bodyLines.push(`- 效果：${i.effect}`);
    bodyLines.push(`- 样本量：${i.sampleSize} 次执行 / 成功 ${i.successCount} 次 / 成功率 ${(i.successRate * 100).toFixed(1)}%`);
    bodyLines.push('');
  });
  bodyLines.push('## 晋升条件（诚实纪律，红线）');
  bodyLines.push('- 本档 **confidence 恒 0**（待蒸馏 + growth-loop.promoteImprovement 四门 Gate-3 基线 margin 0.02 把关）；本抽取器**不自评、不报「候选分>基线」**');
  bodyLines.push('- insight 不自执行任何动作；下轮 compile 自然代谢成长实体，晋级须独立证据');
  bodyLines.push('- KESPI 分差若跨轮不稳定，结论降级为「观察中」，不据此改阈值（纪律 5）');
  bodyLines.push('');

  const frontmatter = [
    '---',
    `name: ${JSON.stringify(`代谢 insight 统计·${top}`)}`,
    "type: 'Insight'",
    `id: ${docId}`,
    `created: ${JSON.stringify(ts)}`,
    `modified: ${JSON.stringify(ts)}`,
    `tags: ${JSON.stringify(['insight', 'metabolism', 'kespi', 'expeL'])}`,
    `status: pending-distillation`,
    `confidence: 0`,
    `source: insight-extractor.js`,
    `origin: derived`,
    `cycles: ${meta.cycles}`,
    '---',
    '',
    bodyLines.join('\n'),
    '',
  ].join('\n');

  fs.mkdirSync(GROWTH_DIR, { recursive: true });
  const output = path.join(GROWTH_DIR, `${slug(docId)}.md`);
  const tmp = output + '.tmp';
  fs.writeFileSync(tmp, frontmatter, 'utf8');
  fs.renameSync(tmp, output);
  return { id: docId, path: output };
}

// CLI
(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const countOnly = args.includes('--count');
  const topIdx = args.indexOf('--top');
  const top = topIdx >= 0 ? Number(args[topIdx + 1]) || 5 : 5;

  const res = await extract(top);
  if (res.empty) {
    console.log('⚠ 无 lineage 数据，空跑优雅退出（不落档）/ no lineage data, graceful no-op');
    process.exit(0);
  }
  if (countOnly) {
    console.log(JSON.stringify({ cycles: res.cycles, actionCount: res.insights.length, kespiWheels: res.kespiSeries.length }, null, 2));
    return;
  }
  console.log(`📊 代谢 insight 统计：${res.cycles} 轮、lineage ${readLineage().length} 行、KESPI ${res.kespiSeries.length} 轮、候选 ${res.insights.length} 条`);
  res.insights.forEach((i, k) => console.log(`  ${k + 1}. ${i.action}  成功率 ${(i.successRate * 100).toFixed(1)}% × 样本 ${i.sampleSize}`));
  if (dryRun) {
    console.log('（--dry-run：不落档）');
    return;
  }
  const w = writeInsightDoc(res.insights, {
    cycles: res.cycles,
    rows: readLineage().length,
    kespiSeries: res.kespiSeries,
    deltaOverall: res.kespiSeries.length >= 2 ? +(res.kespiSeries[res.kespiSeries.length - 1].avg - res.kespiSeries[0].avg).toFixed(4) : null,
  });
  if (w) console.log(`✅ 已落档: ${path.relative(ROOT, w.path)}（confidence 0 / pending-distillation，下轮 compile 自然代谢）`);
  else console.log('（无候选 insight，不落档）');
})().catch(e => { console.error('❌ insight-extractor 失败:', e.message); process.exit(1); });

module.exports = { extract, writeInsightDoc, readLineage };
