#!/usr/bin/env node
/**
 * show-kespi.js — 查看 KESPI 评分（从数据库读取）
 */

const KnowledgeStore = require('./knowledge-store');
const config = require('./growth.config');

async function main() {
  const store = new KnowledgeStore();
  await store.init();

  // 从数据库读取所有实体
  const entities = store.all(`
    SELECT 
      e.id,
      e.name,
      m.originality,
      m.relevance,
      m.consistency,
      m.provability,
      m.utility,
      m.kespi_score
    FROM entities e
    LEFT JOIN entity_metadata m ON e.id = m.entity_id
    ORDER BY m.kespi_score DESC
  `);

  console.log('📊 KESPI 评分汇总（当前阈值配置）\n');
  console.log('实体名称              KESPI   状态');
  console.log('─'.repeat(45));

  let total = 0;
  let passed = 0;

  entities.forEach(e => {
    const score = e.kespi_score || 0;
    const light = score >= config.kespi.greenLight ? '🟢' : 
                  score >= config.kespi.yellowLight ? '🟡' : '🔴';
    total += score;
    if (score >= config.kespi.yellowLight) passed++;
    const name = (e.name || e.id).substring(0, 20);
    console.log(`${name.padEnd(22)} ${score.toFixed(2)}  ${light}`);
  });

  console.log('─'.repeat(45));
  if (entities.length > 0) {
    console.log(`平均: ${(total/entities.length).toFixed(2)}  通过: ${passed}/${entities.length} (${Math.round(passed/entities.length*100)}%)`);
  } else {
    console.log('平均: 0.00  通过: 0/0 (0%)');
  }
  console.log(`\n阈值: 🟢 ≥${config.kespi.greenLight}  🟡 ≥${config.kespi.yellowLight}  🔴 <${config.kespi.yellowLight}`);
}

main().catch(console.error);
