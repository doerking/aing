#!/usr/bin/env node
/**
 * recalc-kespi.js — 重新计算所有实体的 KESPI 八维分数
 * 
 * 用途：修复 KD/KB 反转问题后，批量重算历史数据
 * 
 * 使用：
 *   node recalc-kespi.js          # 重新计算并更新
 *   node recalc-kespi.js --dry-run # 只显示不更新
 */

const KnowledgeStore = require('./knowledge-store');
const KespiChecker = require('./kespi-check');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  const store = new KnowledgeStore();
  await store.init();
  
  const checker = new KespiChecker();
  checker.store = store;
  
  // 获取所有活跃实体
  const entities = store.getEntities({ status: 'active' });
  
  console.log(`\n🔄 KESPI 八维重算 (${entities.length} 个实体)${dryRun ? ' [DRY RUN]' : ''}\n`);
  
  let updated = 0;
  let errors = 0;
  
  for (const entity of entities) {
    try {
      // 计算新分数
      const result = checker.calculateEntity(entity);
      
      if (!dryRun) {
        // 保存到 kespi_history
        store.run(
          'INSERT INTO kespi_history (entity_id, overall_score, dimension_scores) VALUES (?, ?, ?)',
          [result.entity_id, result.overall, JSON.stringify(result.dimensions)]
        );
        
        // 更新 entity_metadata（UPSERT 只更新目标列，保留维度分等其他字段）
        store.run(
          `INSERT INTO entity_metadata (entity_id, kespi_score, last_checked_at) 
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(entity_id) DO UPDATE SET
             kespi_score = excluded.kespi_score,
             last_checked_at = datetime('now')`,
          [result.entity_id, result.overall]
        );
        
        updated++;
      }
      
      // 显示结果
      const dims = ['KQ', 'KG', 'KA', 'KM', 'KD', 'KC', 'KR', 'KB']
        .map(d => `${d}:${result.dimensions[d].toFixed(2)}`)
        .join(' ');
      
      const light = result.overall >= 0.80 ? '🟢' : result.overall >= 0.65 ? '🟡' : '🔴';
      console.log(`  ${light} ${(entity.name || entity.id).substring(0, 20).padEnd(20)} 综合:${result.overall.toFixed(2)}  ${dims}`);
      
    } catch (err) {
      console.error(`  ❌ ${entity.id}: ${err.message}`);
      errors++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  if (dryRun) {
    console.log(`📋 DRY RUN 完成，未写入数据`);
  } else {
    console.log(`✅ 更新完成: ${updated} 成功, ${errors} 失败`);
  }
  
  // 统计
  const allResults = entities.map(e => checker.calculateEntity(e));
  const avgOverall = allResults.reduce((s, r) => s + r.overall, 0) / allResults.length;
  const passed = allResults.filter(r => r.overall >= 0.65).length;
  
  console.log(`\n📊 重算后统计:`);
  console.log(`  综合平均: ${avgOverall.toFixed(2)}`);
  console.log(`  通过(≥0.65): ${passed}/${allResults.length} (${Math.round(passed/allResults.length*100)}%)`);
  
  // 各维度通过率
  console.log(`\n📈 各维度通过率 (≥0.65):`);
  for (const d of ['KQ', 'KG', 'KA', 'KM', 'KD', 'KC', 'KR', 'KB']) {
    const passCount = allResults.filter(r => r.dimensions[d] >= 0.65).length;
    const rate = Math.round(passCount / allResults.length * 100);
    const bar = '█'.repeat(Math.round(rate / 5)) + '░'.repeat(20 - Math.round(rate / 5));
    console.log(`  ${d}: ${bar} ${passCount}/${allResults.length} (${rate}%)`);
  }
}

main().catch(err => {
  console.error('❌ 重算失败:', err.message);
  process.exit(1);
});
