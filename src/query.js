#!/usr/bin/env node
/**
 * query.js — 知识库查询 CLI
 *
 * 功能：
 * 1. 语义/关键词混合检索（默认 hash 64 维，本地模型可用自动升级 384 维语义）
 * 2. 实体名称模糊匹配
 * 3. 附带实体 KESPI 最新评分
 *
 * 用法：
 *   node src/query.js "三路突击"             # 混合检索
 *   node src/query.js "KESPI" --limit 5      # 限定返回条数
 *   node src/query.js "代谢" --names         # 仅按名称/ID 匹配
 */

const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');

function parseArgs(argv) {
  const query = argv.find(a => !a.startsWith('--')) || null;
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(argv[limitIdx + 1], 10) || 8 : 8;
  const namesOnly = argv.includes('--names');
  return { query, limit, namesOnly };
}

function printEntity(e, rank) {
  const score = typeof e.score === 'number' ? `相似度 ${e.score.toFixed(3)} | ` : '';
  const kespi = e._kespi != null ? `KESPI ${Number(e._kespi).toFixed(2)} | ` : '';
  console.log(`${String(rank).padStart(2)}. [${e.id}] ${e.name || '(无名)'}`);
  console.log(`    ${score}${kespi}类型: ${e.type || '-'} | 更新: ${e.updated_at || '-'}`);
}

async function main() {
  const { query, limit, namesOnly } = parseArgs(process.argv.slice(2));
  if (!query) {
    console.log('用法:');
    console.log('  node src/query.js "<关键词>" [--limit N] [--names]');
    console.log('  --names  仅按名称/ID 模糊匹配，不做向量检索');
    process.exit(1);
  }

  const store = new KnowledgeStore();
  await store.init();
  const seen = new Set();
  const merged = [];

  // 1) 向量/语义检索（模型不可用时静默回退 hash 模式）
  if (!namesOnly) {
    const vs = new VectorSearch(store);
    await vs.init();
    try {
      await vs.enableSemantic();
      console.log('🔎 语义检索 (384 维本地模型)\n');
    } catch (e) {
      console.log('🔎 向量检索 (hash 64 维；语义模型未就绪)\n');
    }
    const hits = await vs.semanticSearch(query, limit);
    for (const e of hits) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      merged.push(e);
    }
  }

  // 2) 名称/ID 模糊匹配补充
  const all = store.getEntities();
  for (const e of all) {
    if (seen.has(e.id)) continue;
    if ((e.name || '').includes(query) || String(e.id).includes(query)) {
      seen.add(e.id);
      merged.push(e);
    }
  }

  // 3) 附带最新 KESPI 分
  for (const e of merged) {
    try {
      const k = store.getLatestKespi(e.id);
      if (k) e._kespi = k.overall_score != null ? k.overall_score : k.score;
    } catch (err) { /* 无评分记录则跳过 */ }
  }

  if (merged.length === 0) {
    console.log(`未命中: "${query}"`);
    return;
  }

  console.log(`🎯 命中 ${merged.length} 条:\n`);
  merged.slice(0, limit).forEach((e, i) => printEntity(e, i + 1));
}

main().catch(e => {
  console.error('查询失败:', e.message);
  process.exit(1);
});
