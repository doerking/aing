#!/usr/bin/env node
/**
 * generate-analysis-report.js — 生成自成长分析文档
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

const args = process.argv.slice(2);
const baseDir = args.includes('--base-dir') ? args[args.indexOf('--base-dir') + 1] : '.';

async function main() {
  const store = new KnowledgeStore(path.join(baseDir, 'knowledge.db'));
  await store.init();

  // 生成报告
  const report = {
  timestamp: new Date().toISOString(),
  stats: store.getStats(),
  kespiScores: store.db.prepare(`
    SELECT e.name, e.type, m.kespi_score, m.originality, m.relevance, m.consistency, m.provability, m.utility
    FROM entities e
    LEFT JOIN entity_metadata m ON e.id = m.entity_id
    ORDER BY m.kespi_score DESC
  `).all(),
  links: store.db.prepare('SELECT COUNT(*) as count FROM links').get().count,
    pendingErrors: store.getPendingErrors(5)
  };

  store.close();

// 输出报告
  console.log('📊 自成长核心需求分析 - 执行报告\n');
  console.log('生成时间:', report.timestamp);
  console.log('\n📈 知识库统计:');
  console.log(`   实体总数: ${report.stats.entities}`);
  console.log(`   链接总数: ${report.links}`);
  console.log(`   平均 KESPI: ${report.stats.avgKespi.toFixed(2)}`);
  console.log(`   待处理错误: ${report.pendingErrors.length}`);

  console.log('\n📊 KESPI 评分分布:');
  let passed = 0, failed = 0;
  for (const r of report.kespiScores) {
    const score = r.kespi_score || 0;
    if (score >= 0.75) passed++;
    else failed++;
  }
  console.log(`   通过 (≥0.75): ${passed}`);
  console.log(`   失败 (<0.75): ${failed}`);

  // 保存到文件
  const reportPath = path.join(baseDir, 'SELF-GROWTH-REPORT.md');
const reportContent = `# 自成长核心需求分析 - 执行报告

> 生成时间：${report.timestamp}
> 版本：v1.0

---

## 一、执行摘要

### 完成项

| 优先级 | 需求 | 状态 | 说明 |
|--------|------|------|------|
| P0 | 向量检索 | ⏳ 预留 | 使用关键词搜索 fallback |
| P0 | SQL 事务安全 | ✅ 完成 | SQLite + 迁移脚本 |
| P1 | KESPI 质量提升 | ⚠️ 部分 | 通过率 ${(passed/(passed+failed)*100).toFixed(1)}% |
| P1 | 错误码行动表 | ✅ 完成 | 已集成错误处理 |
| P2 | 分布式部署 | ⏳ 规划 | 待实施 |
| P2 | Web Dashboard | ⏳ 规划 | 待实施 |

### 知识库统计

\`\`\`
实体总数: ${report.stats.entities}
链接总数: ${report.links}
平均 KESPI: ${report.stats.avgKespi.toFixed(2)}
待处理错误: ${report.pendingErrors.length}
\`\`\`

---

## 二、KESPI 评分详情

| 实体 | 类型 | KESPI | originality | relevance | consistency | provability | utility |
|------|------|-------|-------------|-----------|-------------|-------------|---------|
${report.kespiScores.map(r => {
  const score = r.kespi_score || 0;
  const status = score >= 0.75 ? '✅' : '❌';
  return `| ${status} ${r.name} | ${r.type} | ${score.toFixed(2)} | ${(r.originality||0).toFixed(2)} | ${(r.relevance||0).toFixed(2)} | ${(r.consistency||0).toFixed(2)} | ${(r.provability||0).toFixed(2)} | ${(r.utility||0).toFixed(2)} |`;
}).join('\n')}

---

## 三、实施文件

### 新增脚本（7个）

| 脚本 | 功能 | 状态 |
|------|------|------|
| \`sql-migrate.js\` | SQLite 迁移 | ✅ |
| \`knowledge-store.js\` | 知识库存储层 | ✅ |
| \`kespi-enhance.js\` | KESPI 质量增强 | ✅ |
| \`error-handler.js\` | 错误码行动表 | ✅ |
| \`vector-search.js\` | 向量检索（预留） | ⏳ |
| \`self-growth.js\` | 自成长核心 | ✅ |
| \`import-from-wiki.js\` | 从 wiki 导入 | ✅ |
| \`fix-kespi.js\` | KESPI 修复 | ✅ |
| \`show-kespi.js\` | KESPI 查看 | ✅ |

### 数据库迁移（4个）

| 版本 | 文件 | 内容 |
|------|------|------|
| v1 | \`001_initial.sql\` | 核心 Schema |
| v2 | \`002_vector_support.sql\` | 向量存储 |
| v3 | \`003_metadata_enhancement.sql\` | 元数据增强 |
| v4 | \`004_vector_index.sql\` | 向量索引 |

---

## 四、待完成项

### 短期（本周）
- [ ] 完善 KESPI 评分算法
- [ ] 添加更多跨域关联规则
- [ ] 实现向量嵌入（需要 @xenova/transformers）

### 中期（2周）
- [ ] Web Dashboard 基础版
- [ ] 自动错误分类优化
- [ ] 元数据补全工具

### 长期（1月）
- [ ] 分布式部署
- [ ] 实时同步
- [ ] 移动端推送

---

**文档版本**: v1.0  
**维护者**: aing
`;

  fs.writeFileSync(reportPath, reportContent, 'utf8');
  console.log(`\n✅ 报告已保存到: ${reportPath}`);
}

main().catch(err => {
  console.error('❌ 报告生成失败:', err.message);
  process.exit(1);
});
