#!/usr/bin/env node
/**
 * sprout.js — 发芽引擎
 * 
 * 功能：从现有知识中长出新的链接和关联
 * 
 * 算法：
 * 1. 读取所有实体文件
 * 2. 提取关键词和主题
 * 3. 计算实体间相似度
 * 4. 生成潜在的新链接
 * 5. 输出候选链接列表
 * 
 * 使用：
 *   node sprout.js                  # 生成新链接建议
 *   node sprout.js --apply          # 自动应用高置信度链接
 *   node sprout.js --threshold 0.8  # 设置置信度阈值
 */

const fs = require('fs');
const path = require('path');

// 支持 --base-dir 参数覆盖默认路径
function resolvePath(segment) {
  const args = process.argv;
  const baseDirIndex = args.indexOf('--base-dir');
  if (baseDirIndex !== -1 && baseDirIndex + 1 < args.length) {
    return path.join(args[baseDirIndex + 1], ...segment.split('/'));
  }
  return path.join(__dirname, '..', ...segment.split('/'));
}

// 配置
const CONFIG = {
  wikiDir: resolvePath('wiki'),
  entitiesDir: resolvePath('wiki/entities'),
  linksDir: resolvePath('wiki/links'),
  logsDir: resolvePath('logs/sprouting-reports'),
  
  // 发芽参数
  threshold: 0.7,
  maxSuggestions: 20,
  minWordOverlap: 3
};

// 状态
const stats = {
  entitiesAnalyzed: 0,
  linksFound: 0,
  suggestionsGenerated: 0,
  startTime: Date.now()
};

/**
 * 提取实体关键词
 */
function extractKeywords(entityContent) {
  // 移除 frontmatter
  const content = entityContent.replace(/^---\n[\s\S]*?\n---\n/, '');
  
  // 提取标题
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].toLowerCase() : '';
  
  // 提取标签
  const tagMatch = entityContent.match(/tags:\s*\[([^\]]+)\]/);
  const tags = tagMatch ? tagMatch[1].split(',').map(t => t.trim().toLowerCase()) : [];
  
  // 提取 wikilinks
  const linkMatches = content.match(/\[\[([^\]]+)\]\]/g) || [];
  const linkedEntities = linkMatches.map(l => l.replace(/[\[\]]/g, '').toLowerCase());
  
  // 提取关键词（简单实现：分词 + 过滤停用词）
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but']);
  const words = content.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(w => (w.length > 2 || /[\u4e00-\u9fff]/.test(w)) && !stopWords.has(w));
  
  return {
    title,
    tags,
    linkedEntities,
    keywords: [...new Set(words)]
  };
}

/**
 * 计算两个实体的相似度
 */
function calculateSimilarity(entity1, entity2) {
  const k1 = entity1.keywords;
  const k2 = entity2.keywords;
  
  // 关键词重叠度
  const overlap = k1.filter(w => k2.includes(w));
  const wordScore = overlap.length / Math.max(k1.length, k2.length, 1);
  
  // 标签重叠度
  const tags1 = new Set(entity1.tags);
  const tags2 = new Set(entity2.tags);
  const tagOverlap = [...tags1].filter(t => tags2.has(t));
  const tagScore = tagOverlap.length / Math.max(tags1.size, tags2.size, 1);
  
  // 标题相关度
  const title1 = entity1.title;
  const title2 = entity2.title;
  const titleScore = (title1.includes(title2) || title2.includes(title1)) ? 0.5 : 0;
  
  // 加权综合
  return wordScore * 0.5 + tagScore * 0.3 + titleScore * 0.2;
}

/**
 * 生成发芽建议
 */
function generateSuggestions() {
  console.log('🌱 发芽引擎启动\n');
  console.log('📋 参数:');
  console.log(`   置信度阈值: ${CONFIG.threshold}`);
  console.log(`   最大建议数: ${CONFIG.maxSuggestions}`);
  console.log('');
  
  // 读取所有实体
  const entities = {};
  const entityFiles = fs.readdirSync(CONFIG.entitiesDir).filter(f => f.endsWith('.md'));
  
  console.log(`📂 读取 ${entityFiles.length} 个实体文件\n`);
  
  for (const file of entityFiles) {
    const entityId = file.replace('.md', '');
    const content = fs.readFileSync(path.join(CONFIG.entitiesDir, file), 'utf8');
    const keywords = extractKeywords(content);
    
    entities[entityId] = {
      id: entityId,
      content,
      ...keywords
    };
    
    stats.entitiesAnalyzed++;
  }
  
  // 计算相似度矩阵
  const entityIds = Object.keys(entities);
  const suggestions = [];
  
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      const id1 = entityIds[i];
      const id2 = entityIds[j];
      
      // 检查是否已存在链接
const existingLink = fs.existsSync(path.join(CONFIG.linksDir, `${id1}__${id2}.md`)) ||
                     fs.existsSync(path.join(CONFIG.linksDir, `${id2}__${id1}.md`));
if (existingLink) {
        continue;
      }
      
      // 计算相似度
      const similarity = calculateSimilarity(entities[id1], entities[id2]);
      
      if (similarity >= CONFIG.threshold) {
        suggestions.push({
          source: id1,
          target: id2,
          similarity,
          reason: generateReason(entities[id1], entities[id2], similarity)
        });
        
        stats.linksFound++;
      }
    }
  }
  
  // 按相似度排序
  suggestions.sort((a, b) => b.similarity - a.similarity);
  
  // 限制数量
  const topSuggestions = suggestions.slice(0, CONFIG.maxSuggestions);
  stats.suggestionsGenerated = topSuggestions.length;
  
  // 输出结果
  console.log(`📊 分析结果:`);
  console.log(`   实体数量: ${stats.entitiesAnalyzed}`);
  console.log(`   潜在链接: ${stats.linksFound}`);
  console.log(`   建议数量: ${topSuggestions.length}\n`);
  
  if (topSuggestions.length > 0) {
    console.log('💡 发芽建议:\n');
    
    for (let i = 0; i < topSuggestions.length; i++) {
      const s = topSuggestions[i];
      console.log(`${i + 1}. [[${s.source}]] ↔ [[${s.target}]]`);
      console.log(`   置信度: ${(s.similarity * 100).toFixed(1)}%`);
      console.log(`   原因: ${s.reason}`);
      console.log('');
    }
    
    // 保存建议报告
    saveReport(topSuggestions);
  } else {
    console.log('✅ 暂无新链接建议');
  }
  
  console.log(`\n⏱️  耗时: ${((Date.now() - stats.startTime) / 1000).toFixed(2)}s`);
}

/**
 * 生成链接原因
 */
function generateReason(entity1, entity2, similarity) {
  const reasons = [];
  
  // 检查关键词重叠
  const overlap = entity1.keywords.filter(w => entity2.keywords.includes(w));
  if (overlap.length > 0) {
    reasons.push(`共同关键词: ${overlap.slice(0, 3).join(', ')}`);
  }
  
  // 检查标签重叠
  const tagOverlap = entity1.tags.filter(t => entity2.tags.includes(t));
  if (tagOverlap.length > 0) {
    reasons.push(`共同标签: ${tagOverlap.join(', ')}`);
  }
  
  // 检查标题相关
  if (entity1.title.includes(entity2.title) || entity2.title.includes(entity1.title)) {
    reasons.push('标题相关');
  }
  
  return reasons.join(' | ') || '语义相似度高';
}

/**
 * 保存报告
 */
function saveReport(suggestions) {
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(CONFIG.logsDir, `sprouting-${timestamp}.md`);
  
  const reportContent = `# 发芽报告

## 时间
${new Date().toISOString()}

## 参数
- 置信度阈值: ${CONFIG.threshold}
- 最大建议数: ${CONFIG.maxSuggestions}

## 统计
- 实体分析: ${stats.entitiesAnalyzed}
- 潜在链接: ${stats.linksFound}
- 建议生成: ${suggestions.length}

## 建议详情

${suggestions.map((s, i) => `### ${i + 1}. [[${s.source}]] ↔ [[${s.target}]]

- **置信度**: ${(s.similarity * 100).toFixed(1)}%
- **原因**: ${s.reason}

`).join('\n')}

---

*由 aing 发芽引擎自动生成*
`;
  
  fs.writeFileSync(reportPath, reportContent, 'utf8');
  console.log(`📄 报告已保存: ${reportPath}`);
}

/**
 * 自动应用高置信度链接
 */
function applySuggestions() {
  console.log('🌱 自动应用高置信度链接...\n');
  
  // 读取所有实体
  const entityFiles = fs.readdirSync(CONFIG.entitiesDir).filter(f => f.endsWith('.md'));
  const entities = {};
  
  for (const file of entityFiles) {
    const entityId = file.replace('.md', '');
    const content = fs.readFileSync(path.join(CONFIG.entitiesDir, file), 'utf8');
    entities[entityId] = extractKeywords(content);
  }
  
  // 生成建议并应用
  const entityIds = Object.keys(entities);
  let applied = 0;
  
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      const id1 = entityIds[i];
      const id2 = entityIds[j];
      
      // 检查是否已存在链接
const existingLink = fs.existsSync(path.join(CONFIG.linksDir, `${id1}__${id2}.md`)) ||
                     fs.existsSync(path.join(CONFIG.linksDir, `${id2}__${id1}.md`));
if (existingLink) {
        continue;
      }
      
      // 计算相似度
      const similarity = calculateSimilarity(entities[id1], entities[id2]);
      
      // 高置信度自动应用
      if (similarity >= 0.85) {
        createLink(id1, id2, similarity);
        applied++;
      }
    }
  }
  
  console.log(`✅ 已应用 ${applied} 个高置信度链接`);
}

/**
 * 创建链接
 */
function createLink(sourceId, targetId, similarity) {
  const linkPath = path.join(CONFIG.linksDir, `${sourceId}__${targetId}.md`);
  
  const linkContent = `---
source: ${sourceId}
target: ${targetId}
type: automatically_generated
confidence: ${similarity.toFixed(2)}
created: ${new Date().toISOString()}
method: sprouting
---

# Link: ${sourceId} ↔ ${targetId}

- **Source**: [[${sourceId}]]
- **Target**: [[${targetId}]]
- **Type**: automatically_generated
- **Confidence**: ${(similarity * 100).toFixed(1)}%
- **Created**: ${new Date().toISOString()}
- **Method**: 发芽引擎自动发现
`;
  
  fs.writeFileSync(linkPath, linkContent, 'utf8');
  console.log(`   ✅ 自动链接: [[${sourceId}]] ↔ [[${targetId}]]`);
}

// CLI 入口
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const threshold = parseFloat((args.find(a => a.startsWith('--threshold=')) || '').slice(12));

if (threshold) {
  CONFIG.threshold = threshold;
}

if (apply) {
  applySuggestions();
} else {
  generateSuggestions();
}
