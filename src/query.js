#!/usr/bin/env node
/**
 * query.js — 知识库查询 CLI（精排版）
 *
 * 1. 语义/关键词混合检索（默认 hash 64 维，本地模型可用自动升级 384 维语义）
 * 2. 三路加权融合排序：语义相似度 + 关键词命中 + 名称/ID 匹配
 * 3. 双路径慢回忆（RF-Mem 思路）：候选整体置信低时，沿 wiki 链接邻居做二跳扩展
 * 4. 伪精排：融合 KESPI 评分与新鲜度（替代重型 cross-encoder reranker）
 * 5. 附带实体 KESPI 最新评分
 *
 * 阈值唯一来源：growth.config.js `query` 块（环境变量 AING_QUERY_* 可覆盖）
 *
 * 用法：
 *   node src/query.js "三路突击"             # 精排混合检索
 *   node src/query.js "KESPI" --limit 5      # 限定返回条数
 *   node src/query.js "代谢" --names         # 仅按名称/ID 匹配
 *   node src/query.js "生僻词" --slow        # 强制启用慢回忆二跳扩展
 */

const path = require('path');
const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');
const growthConfig = require('./growth.config');

// 查询阈值（唯一来源 growth.config.js；缺省兜底防旧配置文件）
const QC = growthConfig.query || {
  fusionWeights: { semantic: 0.6, keyword: 0.25, name: 0.15 },
  slowRecallThreshold: 0.35,
  slowRecallExpand: 6,
  rerank: { kespi: 0.15, recency: 0.1 },
};

function parseArgs(argv) {
  const query = argv.find(a => !a.startsWith('--')) || null;
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(argv[limitIdx + 1], 10) || 8 : 8;
  const namesOnly = argv.includes('--names');
  const forceSlow = argv.includes('--slow');
  return { query, limit, namesOnly, forceSlow };
}

// 关键词命中分：query 拆词对 (name + tags + type) 的覆盖率
function keywordScore(entity, query) {
  const tags = (() => {
    try { return JSON.parse(entity.tags || '[]'); } catch (e) { return []; }
  })();
  const hay = [entity.name || '', entity.type || '', ...tags].join(' ').toLowerCase();
  if (!hay) return 0;
  const tokens = query.toLowerCase().split(/[\s,，、;；]+/).filter(t => t.length > 0);
  if (tokens.length === 0) return 0;
  // CJK 长词整体子串也算一路命中
  let hit = 0;
  for (const t of tokens) {
    if (hay.includes(t)) { hit++; continue; }
    if (t.length >= 2 && /[\u4e00-\u9fff]/.test(t)) {
      // 中文词：任一 2 字滑窗命中即算半路（保守）
      let sub = false;
      for (let i = 0; i + 2 <= t.length; i++) {
        if (hay.includes(t.slice(i, i + 2))) { sub = true; break; }
      }
      if (sub) hit += 0.5;
    }
  }
  return Math.min(1, hit / tokens.length);
}

// 名称/ID 匹配分
function nameScore(entity, query) {
  const q = query.toLowerCase();
  const name = (entity.name || '').toLowerCase();
  const id = String(entity.id || '').toLowerCase();
  if (name === q || id === q) return 1;
  if (name.includes(q) || id.includes(q)) return 0.8;
  return 0;
}

// 新鲜度分：30 天半衰期
function recencyScore(entity) {
  if (!entity.updated_at) return 0;
  const days = Math.max(0, (Date.now() - new Date(entity.updated_at).getTime()) / 86400000);
  if (Number.isNaN(days)) return 0;
  return 1 / (1 + days / 30);
}

function printEntity(e, rank) {
  const score = typeof e._final === 'number'
    ? `综合 ${e._final.toFixed(3)} (语义 ${Number(e.score || 0).toFixed(2)} / 关键词 ${Number(e._kw || 0).toFixed(2)} / 名称 ${Number(e._nm || 0).toFixed(2)})${e._slowRecall ? ' | ⏳慢回忆' : ''} | `
    : (typeof e.score === 'number' ? `相似度 ${e.score.toFixed(3)} | ` : '');
  const kespi = e._kespi != null ? `KESPI ${Number(e._kespi).toFixed(2)} | ` : '';
  console.log(`${String(rank).padStart(2)}. [${e.id}] ${e.name || '(无名)'}`);
  console.log(`    ${score}${kespi}类型: ${e.type || '-'} | 更新: ${e.updated_at || '-'}`);
}

async function main() {
  const { query, limit, namesOnly, forceSlow } = parseArgs(process.argv.slice(2));
  if (!query) {
    console.log('用法:');
    console.log('  node src/query.js "<关键词>" [--limit N] [--names] [--slow]');
    console.log('  --names  仅按名称/ID 模糊匹配，不做向量检索');
    console.log('  --slow   强制启用慢回忆（二跳邻居扩展）');
    process.exit(1);
  }

  const store = new KnowledgeStore();
  await store.init();
  const pool = new Map(); // id -> entity（含各路分数）

  // 1) 向量/语义检索（模型不可用时静默回退 hash 模式）
  let semanticAvailable = false;
  if (!namesOnly) {
    const vs = new VectorSearch(store);
    await vs.init();
    try {
      await vs.enableSemantic();
      semanticAvailable = true;
      console.log('🔎 语义检索 (384 维本地模型)\n');
    } catch (e) {
      console.log('🔎 向量检索 (hash 64 维；语义模型未就绪)\n');
    }
    const hits = await vs.semanticSearch(query, limit * 3); // 取宽池供融合
    for (const e of hits) {
      if (!pool.has(e.id)) pool.set(e.id, e);
    }
  }

  // 2) 名称/ID 匹配 + 关键词命中并入池（只收真命中，不全库倾倒——池子留给慢回忆扩展）
  const all = store.getEntities();
  for (const e of all) {
    if (pool.has(e.id)) continue;
    e._kw = keywordScore(e, query);
    e._nm = nameScore(e, query);
    if (e._nm > 0 || e._kw > 0) pool.set(e.id, e);
  }

  // 3) 三路加权融合
  const w = QC.fusionWeights;
  for (const e of pool.values()) {
    e._kw = keywordScore(e, query);
    e._nm = nameScore(e, query);
    const sim = typeof e.score === 'number' ? Math.max(0, e.score) : 0;
    e._final = w.semantic * sim + w.keyword * e._kw + w.name * e._nm;
  }

  // 4) 双路径慢回忆：整体置信低（或强制）时，沿 wiki 链接邻居二跳扩展
  const withSim = [...pool.values()].filter(e => typeof e.score === 'number' && e.score > 0.01);
  const avgSim = withSim.length
    ? withSim.reduce((s, e) => s + e.score, 0) / withSim.length
    : 0;
  const needSlow = forceSlow || (semanticAvailable && withSim.length > 0 && avgSim < QC.slowRecallThreshold);
  if (needSlow) {
    const NeuralGuideChain = require('./neural-guide-chain');
    const gc = new NeuralGuideChain({ baseDir: path.join(__dirname, '..') });
    const seeds = withSim.sort((a, b) => b.score - a.score).slice(0, 3);
    const expanded = new Set();
    for (const seed of seeds) {
      const ename = seed.name || seed.id;
      for (const nb of gc._getNeighbors(ename)) {
        if (pool.has(nb)) continue;
        const hit = all.find(x => x.name === nb || String(x.id) === nb);
        if (hit && !expanded.has(hit.id)) {
          expanded.add(hit.id);
          hit._slowRecall = true;
          hit._kw = keywordScore(hit, query);
          hit._nm = nameScore(hit, query);
          // 邻居入池：基础关联分（0.3 上限）× 种子相似度
          hit.score = 0.3 * (seeds.length ? seeds[0].score : 0);
          hit._final = w.semantic * hit.score + w.keyword * hit._kw + w.name * hit._nm + 0.05;
          pool.set(hit.id, hit);
        }
      }
    }
    if (expanded.size > 0) {
      console.log(`⏳ 置信低（均相似度 ${avgSim.toFixed(2)} < ${QC.slowRecallThreshold}），慢回忆扩展 ${expanded.size} 条邻居\n`);
    }
  }

  // 5) 伪精排：融合 KESPI 与新鲜度（TODO(origin-trust): 低信任降权接入点，
  //    见 E:\SQA\DESIGN-ORIGIN-TRUST-2026-09-03.md，origin_trust 列落地后在此减分）
  const candidates = [...pool.values()];
  for (const e of candidates) {
    try {
      const k = store.getLatestKespi(e.id);
      if (k) e._kespi = k.overall_score != null ? k.overall_score : k.score;
    } catch (err) { /* 无评分记录则跳过 */ }
    const kespiRaw = e._kespi != null ? Number(e._kespi) : null;
    const kespiNorm = kespiRaw == null ? 0 : (kespiRaw <= 1 ? kespiRaw : kespiRaw / 100);
    const r = QC.rerank;
    e._final = e._final * (1 - r.kespi - r.recency) + kespiNorm * r.kespi + recencyScore(e) * r.recency;
  }

  candidates.sort((a, b) => b._final - a._final);

  const visible = candidates.filter(e => namesOnly ? e._nm > 0 : true);
  if (visible.length === 0) {
    console.log(`未命中: "${query}"`);
    return;
  }

  console.log(`🎯 命中 ${visible.length} 条（按综合分排序）:\n`);
  visible.slice(0, limit).forEach((e, i) => printEntity(e, i + 1));
}

main().catch(e => {
  console.error('查询失败:', e.message);
  process.exit(1);
});
