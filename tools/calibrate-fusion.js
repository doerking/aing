#!/usr/bin/env node
/**
 * calibrate-fusion.js — query 融合权重标定工具（2026-09-08，改进项 #7）
 *
 * 目标：把 query.js 的 fusionWeights / rerank 从"拍脑袋"变成"有依据"。
 * 方法：候选权重网格 × 标定查询集（相关性标注）→ MRR@K / nDCG@K 排名。
 *
 * 性能设计：候选召回与权重无关（融合/精排只影响重排序），因此每个查询只跑一次
 * searchCandidates，网格内全部组合共享候选池重打分——24 组合 × N 查询只需 N 次检索。
 *
 * 标注集在哪？
 *   1. 优先 tools/calibrate-set.json（格式：[{"q": "查询", "rel": ["实体id", ...]}]，rel 按相关度降序）
 *   2. 缺省自动生成：查询 = wiki 实体名 + 该实体 wiki 正文高频词（剔除虚词），相关 = 该实体本身
 *      —— 覆盖全库、可复现，但偏"名字即答案"；有真实查询后建议人工标注 calibrate-set.json。
 *
 * 用法：
 *   npm run calibrate:fusion            # 网格标定，打印榜单与建议
 *   node tools/calibrate-fusion.js --json  # 机器可读输出（供后续自动化）
 *
 * 纪律：
 *   - 只读评测：不写库、不改配置，可反复跑
 *   - 评测走 src/query.js 的 searchCandidates（单一实现，不搞第二套融合逻辑）
 *   - 重打分公式与 query.js 完全一致（含慢回忆 +0.05 关联加成）
 *   - 小样本纪律：实体 < 30 或查询 < 10 时结论只作方向参考，不写回配置
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('../src/knowledge-store');

const PKG = path.resolve(__dirname, '..');
const JSON_FLAG = process.argv.includes('--json');
const K = 5;

// ── 候选权重网格（融合三路 + 精排两维；含当前默认组合）──
const GRID = {
  fusionWeights: [
    { semantic: 0.7, keyword: 0.2, name: 0.1 },
    { semantic: 0.6, keyword: 0.25, name: 0.15 },   // 当前默认
    { semantic: 0.5, keyword: 0.3, name: 0.2 },
    { semantic: 0.45, keyword: 0.35, name: 0.2 },
    { semantic: 0.6, keyword: 0.2, name: 0.2 },
    { semantic: 0.7, keyword: 0.1, name: 0.2 }
  ],
  rerank: [
    { kespi: 0.15, recency: 0.1 },                  // 当前默认
    { kespi: 0.1, recency: 0.1 },
    { kespi: 0.2, recency: 0.05 },
    { kespi: 0.0, recency: 0.0 }
  ]
};

const STOPWORDS = new Set(['的', '了', '和', '是', '在', '与', '或', '一个', '这个', '那个', '以及', '并且', '可以', '通过', '使用', '进行', '如果', '然后', '因此', 'the', 'and', 'for', 'with', 'that', 'this']);

// ── 指标 ──
function mrrAtK(ranked, relSet, k) {
  const hits = ranked.slice(0, k);
  for (let i = 0; i < hits.length; i++) if (relSet.has(hits[i])) return 1 / (i + 1);
  return 0;
}
function ndcgAtK(ranked, relArr, k) {
  const relSet = new Set(relArr);
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) if (relSet.has(ranked[i])) dcg += 1 / Math.log2(i + 2);
  let idcg = 0;
  for (let i = 0; i < Math.min(k, relArr.length); i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

// ── 标定集 ──
async function buildEvalSet(store) {
  const customPath = path.join(PKG, 'tools', 'calibrate-set.json');
  if (fs.existsSync(customPath)) {
    const set = JSON.parse(fs.readFileSync(customPath, 'utf8'));
    if (!Array.isArray(set) || set.length === 0) throw new Error('calibrate-set.json 为空或格式非法');
    return { items: set, source: 'manual' };
  }
  const entities = store.getEntities({ status: 'active' });
  const wikiDir = path.join(PKG, 'wiki', 'entities');
  const items = [];
  for (const e of entities) {
    let bodyWords = [];
    try {
      const md = fs.readFileSync(path.join(wikiDir, e.id + '.md'), 'utf8');
      const text = md.replace(/[#*`>\-\[\]()\n\r]/g, ' ').toLowerCase();
      const uni = text.match(/[\u4e00-\u9fff]{2,4}|[a-z]{3,}/g) || [];
      const freq = new Map();
      for (const w of uni) {
        if (STOPWORDS.has(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
      bodyWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
    } catch (err) { /* 无 wiki 文件则退化为仅实体名 */ }
    const q = [e.name, ...bodyWords].filter(Boolean).join(' ');
    if (!q) continue;
    items.push({ q, rel: [e.id] });
  }
  return { items, source: 'auto' };
}

// ── 重打分：与 query.js 公式一致（三路融合 → KESPI/新鲜度精排 → 慢回忆 +0.05）──
function rescore(candidates, fw, rr) {
  return candidates.map(e => {
    const sim = typeof e.score === 'number' ? Math.max(0, e.score) : 0;
    const base = fw.semantic * sim + fw.keyword * (e._kw || 0) + fw.name * (e._nm || 0);
    const kespiRaw = e._kespi != null ? Number(e._kespi) : null;
    const kespiNorm = kespiRaw == null ? 0 : (kespiRaw <= 1 ? kespiRaw : kespiRaw / 100);
    const recency = e.updated_at
      ? 1 / (1 + Math.max(0, (Date.now() - new Date(e.updated_at).getTime()) / 86400000) / 30)
      : 0;
    const slowBonus = e._slowRecall ? 0.05 : 0;
    const final = base * (1 - rr.kespi - rr.recency) + kespiNorm * rr.kespi + recency * rr.recency + slowBonus;
    return { id: e.id, final };
  }).sort((a, b) => b.final - a.final).map(x => x.id);
}

async function main() {
  const store = new KnowledgeStore();
  await store.init();
  const nEntities = store.getEntities({ status: 'active' }).length;
  const { items, source } = await buildEvalSet(store);

  console.log(`📏 融合权重标定 ｜ K=${K} ｜ 实体 ${nEntities} ｜ 查询 ${items.length} 条（来源: ${source === 'manual' ? 'tools/calibrate-set.json 人工标注' : '自动生成（实体名+wiki高频词）'}）`);
  console.log('   指标：MRR@K = 首个相关命中排名倒数均值；nDCG@K = 排序质量（1=完美）。越高越好。');
  console.log('   流程：每查询检索一次（候选池与权重无关），24 个权重组合共享候选重打分。\n');

  // 1) 每查询一次检索，缓存候选
  const pools = [];
  for (const it of items) {
    const { candidates } = await require('../src/query').searchCandidates(it.q, { limit: 24, forceSlow: false });
    pools.push({ rel: it.rel, candidates });
    console.log(`  🔎 "${it.q}" → ${candidates.length} 候选`);
  }

  // 2) 网格重打分
  const rows = [];
  for (const fw of GRID.fusionWeights) {
    for (const rr of GRID.rerank) {
      let mrrSum = 0, ndcgSum = 0;
      for (const { rel, candidates } of pools) {
        const ranked = rescore(candidates, fw, rr);
        mrrSum += mrrAtK(ranked, new Set(rel), K);
        ndcgSum += ndcgAtK(ranked, rel, K);
      }
      const n = Math.max(1, pools.length);
      rows.push({ fw, rr, mrr: mrrSum / n, ndcg: ndcgSum / n, n: pools.length });
    }
  }

  rows.sort((a, b) => (b.ndcg + b.mrr) - (a.ndcg + a.mrr));
  const best = rows[0];
  const cur = rows.find(x => x.fw.semantic === 0.6 && x.fw.keyword === 0.25 && x.fw.name === 0.15 && x.rr.kespi === 0.15 && x.rr.recency === 0.1);

  console.log('\n═══ 榜单（按 MRR+nDCG 综合）═══');
  rows.slice(0, 8).forEach((x, i) => {
    const tag = x === cur ? ' ← 当前默认' : (i === 0 ? ' ← 最佳' : '');
    console.log(`${String(i + 1).padStart(2)}. MRR ${x.mrr.toFixed(3)} | nDCG ${x.ndcg.toFixed(3)}  fusion(语 ${x.fw.semantic} / 键 ${x.fw.keyword} / 名 ${x.fw.name}) rerank(KESPI ${x.rr.kespi} / 新鲜 ${x.rr.recency})${tag}`);
  });

  const smallSample = nEntities < 30 || items.length < 10;
  console.log('\n═══ 结论与纪律 ═══');
  if (smallSample) console.log(`⚠️ 小样本模式（实体 ${nEntities} < 30 或查询 ${items.length} < 10）：结论仅作方向参考，不写回配置。`);
  if (cur && best && cur !== best) {
    const dMrr = best.mrr - cur.mrr, dNdcg = best.ndcg - cur.ndcg;
    if ((dNdcg >= 0.01 || dMrr >= 0.02) && !smallSample) {
      console.log(`💡 建议：fusion → (semantic ${best.fw.semantic} / keyword ${best.fw.keyword} / name ${best.fw.name})，rerank → (kespi ${best.rr.kespi} / recency ${best.rr.recency})`);
      console.log(`   预期：MRR ${cur.mrr.toFixed(3)}→${best.mrr.toFixed(3)}，nDCG ${cur.ndcg.toFixed(3)}→${best.ndcg.toFixed(3)}；落实 = growth.config.js 的 AING_QUERY_W_* / AING_QUERY_R_* 环境变量或改 config.query 默认值，改后重跑本工具复核。`);
    } else {
      console.log('✅ 当前默认与最佳候选差距在噪声范围内（ΔnDCG < 0.01 且 ΔMRR < 0.02），维持现状。');
    }
  } else if (cur === best) {
    console.log('✅ 当前默认已是网格内最佳，无需调整。');
  }
  console.log(smallSample
    ? '📌 后续：实体 ≥ 30 后重跑；有真实查询日志后，把高频查询人工标注进 tools/calibrate-set.json 再标定，结论才够硬。'
    : '📌 后续：定期（如每月）重跑；配置改动后必须复测。');

  if (JSON_FLAG) {
    console.log('\n' + JSON.stringify({ k: K, entities: nEntities, queries: items.length, source, rows, best: { fusionWeights: best.fw, rerank: best.rr, mrr: best.mrr, ndcg: best.ndcg } }, null, 2));
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error('标定失败:', e.message);
  process.exit(1);
});
