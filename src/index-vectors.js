#!/usr/bin/env node
/**
 * index-vectors.js — 为所有实体生成向量索引
 * 
 * 默认使用 384 维本地语义向量（模型内置在 models/，零外呼；模型缺失自动回退 64 维哈希）；
 * --hash 强制哈希模式（零模型加载，最快）；--semantic 保持兼容（与默认同效）。
 *
 * 设计变更（2026-09-03）：原默认 64 维哈希导致「入库即建索引、但语义搜索搜不到新笔记」，
 * 为保证入库即可被语义召回（外脑协作链闭环），改为模型在即语义。
 * 
 * 使用：
 *   node src/index-vectors.js                      # 索引未索引实体（默认语义，模型缺失回退哈希）
 *   node src/index-vectors.js --reindex            # 语义模式全量重建
 *   node src/index-vectors.js --hash --reindex     # 强制哈希模式全量重建
 */

const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');

async function main() {
  const reindex = process.argv.includes('--reindex');
  const forceHash = process.argv.includes('--hash');
  const wantSemantic = process.argv.includes('--semantic') || !forceHash;
  
  const store = new KnowledgeStore();
  await store.init();
  
  const vectorSearch = new VectorSearch(store);
  await vectorSearch.init();
  
  if (wantSemantic) {
    try {
      await vectorSearch.enableSemantic();
    } catch (err) {
      if (process.argv.includes('--semantic')) {
        // 显式要求语义而不可得：硬失败（保持旧 --semantic 语义）
        console.error('❌ 语义向量未就绪:', err.message);
        console.error('   回退提示：--hash 直接运行则用 64 维哈希模式。');
        process.exit(1);
      }
      // 默认路径模型缺失：静默回退哈希，保证入库链路不断
      console.error('⚠️ 语义模型未就绪，本次回退 64 维哈希模式: ' + err.message);
    }
  }
  console.log(`🔧 向量模式: ${vectorSearch.mode} (${vectorSearch.dimension}维, ${vectorSearch.modelName})\n`);
  
  // 获取需要索引的实体
  let entities;
  if (reindex) {
    entities = store.getEntities({ status: 'active' });
    console.log(`🔄 重新索引 ${entities.length} 个实体\n`);
  } else {
    // 只索引没有 embedding 的
    entities = store.all(`
      SELECT e.* FROM entities e
      LEFT JOIN entity_embeddings ee ON e.id = ee.entity_id
      WHERE ee.entity_id IS NULL AND e.status = 'active'
    `);
    console.log(`📇 索引 ${entities.length} 个未索引实体\n`);
  }
  
  if (entities.length === 0) {
    console.log('✅ 所有实体已有向量索引');
    return;
  }
  
  let indexed = 0;
  
  for (const entity of entities) {
    // 生成 embedding（基于 name + content）
    const text = `${entity.name} ${entity.content || ''}`.trim();
    const vector = await vectorSearch.embed(text);
    
    if (!vector) {
      console.log(`  ⚠️ 跳过 ${entity.name}: 向量生成失败`);
      continue;
    }
    
    // 转换为 Buffer
    const float32 = new Float32Array(vector);
    const buffer = Buffer.from(float32.buffer);
    
    // 存储
    store.run(
      `INSERT OR REPLACE INTO entity_embeddings (entity_id, embedding, dimension, model)
       VALUES (?, ?, ?, ?)`,
      [entity.id, buffer, vectorSearch.dimension, vectorSearch.modelName]
    );
    
    console.log(`  ✅ ${entity.name} (${vectorSearch.dimension}维)`);
    indexed++;
  }
  
  console.log(`\n✅ 索引完成: ${indexed}/${entities.length} 个实体`);
}

main().catch(err => {
  console.error('❌ 索引失败:', err.message);
  process.exit(1);
});
