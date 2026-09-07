#!/usr/bin/env node
/**
 * pollinate.js — 授粉引擎
 * 
 * 功能：跨领域交叉，发现意外连接
 * 
 * 算法：
 * 1. 将实体按类型分组
 * 2. 随机配对不同组的实体
 * 3. 计算跨域相似度
 * 4. 生成"意外"的新链接
 * 
 * 使用：
 *   node pollinate.js                 # 生成跨域链接建议
 *   node pollinate.js --apply         # 自动应用高创意链接
 *   node pollinate.js --creative 0.9  # 设置创意阈值
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  wikiDir: path.join(__dirname, '..', 'wiki'),
  entitiesDir: path.join(__dirname, '..', 'wiki', 'entities'),
  linksDir: path.join(__dirname, '..', 'wiki', 'links'),
  logsDir: path.join(__dirname, '..', 'logs', 'pollination-reports'),
  
  // 授粉参数
  // 注：creativity 理论上限 = 0.3(跨类型) + 0(高相似时无加分) + 1*0.5 = 0.8
  // 阈值必须 <= 0.8，否则 --apply 永远建不了链接（曾误设 0.85 导致功能失效）
  creativeThreshold: 0.75,
  maxSuggestions: 15,
  minCrossDomainScore: 0.6
};

// 状态
const stats = {
  entitiesGrouped: 0,
  crossDomainPairs: 0,
  suggestionsGenerated: 0,
  startTime: Date.now()
};

/**
 * 按类型分组实体
 */
function groupEntitiesByType() {
  console.log('🌸 授粉引擎启动\n');
  console.log('📋 参数:');
  console.log(`   创意阈值: ${CONFIG.creativeThreshold}`);
  console.log(`   最大建议数: ${CONFIG.maxSuggestions}`);
  console.log('');
  
  // 读取所有实体
  const entityFiles = fs.readdirSync(CONFIG.entitiesDir).filter(f => f.endsWith('.md'));
  const groups = {};
  
  console.log(`📂 读取 ${entityFiles.length} 个实体文件\n`);
  
  for (const file of entityFiles) {
    const entityId = file.replace('.md', '');
    const content = fs.readFileSync(path.join(CONFIG.entitiesDir, file), 'utf8');
    
    // 提取类型
    const typeMatch = content.match(/type:\s*(\w+)/);
    const type = typeMatch ? typeMatch[1] : 'Concept';
    
    if (!groups[type]) {
      groups[type] = [];
    }
    
    groups[type].push({
      id: entityId,
      content,
      type
    });
    
    stats.entitiesGrouped++;
  }
  
  console.log('📊 实体分组:');
  for (const [type, entities] of Object.entries(groups)) {
    console.log(`   ${type}: ${entities.length} 个`);
  }
  console.log('');
  
  return groups;
}

/**
 * 计算跨域相似度
 */
function calculateCrossDomainSimilarity(entity1, entity2) {
  // 提取关键词
  const extractKeywords = (content) => {
    const text = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but']);
    return text.toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter(w => (w.length > 2 || /[\u4e00-\u9fff]/.test(w)) && !stopWords.has(w));
  };
  
  const keywords1 = extractKeywords(entity1.content);
  const keywords2 = extractKeywords(entity2.content);
  
  // 计算重叠度
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  const intersection = [...set1].filter(w => set2.has(w));
  
  const jaccardSimilarity = intersection.length / Math.max(set1.size + set2.size - intersection.length, 1);
  
  // 跨域创意分（不同类型 + 低相似度 = 高创意）
  const differentTypes = entity1.type !== entity2.type ? 0.3 : 0;
  const lowSimilarityBonus = jaccardSimilarity < 0.3 ? 0.2 : 0;
  
  return {
    similarity: jaccardSimilarity,
    creativity: differentTypes + lowSimilarityBonus + jaccardSimilarity * 0.5,
    keywords: intersection.slice(0, 5)
  };
}

/**
 * 生成授粉建议
 */
function generatePollinationSuggestions(groups) {
  const groupNames = Object.keys(groups);
  const suggestions = [];
  
  console.log('🌸 跨域配对中...\n');
  
  // 随机配对不同组的实体
  for (let i = 0; i < groupNames.length; i++) {
    for (let j = i + 1; j < groupNames.length; j++) {
      const type1 = groupNames[i];
      const type2 = groupNames[j];
      
      const entities1 = groups[type1];
      const entities2 = groups[type2];
      
      // 随机抽样
      const samples1 = entities1.sort(() => Math.random() - 0.5).slice(0, 10);
      const samples2 = entities2.sort(() => Math.random() - 0.5).slice(0, 10);
      
      for (const e1 of samples1) {
        for (const e2 of samples2) {
          const result = calculateCrossDomainSimilarity(e1, e2);
          
          if (result.creativity >= CONFIG.minCrossDomainScore) {
            suggestions.push({
              source: e1.id,
              target: e2.id,
              type1,
              type2,
              creativity: result.creativity,
              similarity: result.similarity,
              sharedKeywords: result.keywords,
              reason: `跨域连接: ${type1} × ${type2}`
            });
            
            stats.crossDomainPairs++;
          }
        }
      }
    }
  }
  
  // 按创意度排序
  suggestions.sort((a, b) => b.creativity - a.creativity);
  
  // 限制数量
  const topSuggestions = suggestions.slice(0, CONFIG.maxSuggestions);
  stats.suggestionsGenerated = topSuggestions.length;
  
  return topSuggestions;
}

/**
 * 输出建议
 */
function outputSuggestions(suggestions) {
  console.log(`📊 分析结果:`);
  console.log(`   实体分组: ${stats.entitiesGrouped}`);
  console.log(`   跨域配对: ${stats.crossDomainPairs}`);
  console.log(`   建议数量: ${suggestions.length}\n`);
  
  if (suggestions.length > 0) {
    console.log('💡 授粉建议（跨领域连接）:\n');
    
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      console.log(`${i + 1}. [[${s.source}]] ↔ [[${s.target}]]`);
      console.log(`   类型: ${s.type1} → ${s.type2}`);
      console.log(`   创意度: ${(s.creativity * 100).toFixed(1)}%`);
      console.log(`   相似度: ${(s.similarity * 100).toFixed(1)}%`);
      console.log(`   共同关键词: ${s.sharedKeywords.join(', ') || '无'}`);
      console.log(`   原因: ${s.reason}`);
      console.log('');
    }
    
    saveReport(suggestions);
  } else {
    console.log('✅ 暂无跨域连接建议');
  }
  
  console.log(`\n⏱️  耗时: ${((Date.now() - stats.startTime) / 1000).toFixed(2)}s`);
}

/**
 * 保存报告
 */
function saveReport(suggestions) {
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(CONFIG.logsDir, `pollination-${timestamp}.md`);
  
  const reportContent = `# 授粉报告

## 时间
${new Date().toISOString()}

## 参数
- 创意阈值: ${CONFIG.creativeThreshold}
- 最大建议数: ${CONFIG.maxSuggestions}

## 统计
- 实体分组: ${stats.entitiesGrouped}
- 跨域配对: ${stats.crossDomainPairs}
- 建议生成: ${suggestions.length}

## 建议详情

${suggestions.map((s, i) => `### ${i + 1}. [[${s.source}]] ↔ [[${s.target}]]

- **类型**: ${s.type1} → ${s.type2}
- **创意度**: ${(s.creativity * 100).toFixed(1)}%
- **相似度**: ${(s.similarity * 100).toFixed(1)}%
- **共同关键词**: ${s.sharedKeywords.join(', ') || '无'}
- **原因**: ${s.reason}

`).join('\n')}

---

*由 aing 授粉引擎自动生成*
`;
  
  fs.writeFileSync(reportPath, reportContent, 'utf8');
  console.log(`📄 报告已保存: ${reportPath}`);
}

/**
 * 自动应用高创意链接
 */
function applySuggestions() {
  console.log('🌸 自动应用高创意链接...\n');
  
  const groups = groupEntitiesByType();
  const suggestions = generatePollinationSuggestions(groups);
  
  let applied = 0;
  
  for (const s of suggestions) {
    if (s.creativity >= CONFIG.creativeThreshold && !linkExists(s.source, s.target)) {
      createLink(s.source, s.target, s);
      applied++;
    }
  }
  
  console.log(`\n✅ 已应用 ${applied} 个高创意跨域链接`);
}

/**
* 检查链接是否已存在（双向：A__B 或 B__A 任一存在即视为已链接，
* 否则 sprout/pollinate 交替运行时会为同一对实体创建正反两条重复链接）
*/
function linkExists(sourceId, targetId) {
  return fs.existsSync(path.join(CONFIG.linksDir, `${sourceId}__${targetId}.md`)) ||
         fs.existsSync(path.join(CONFIG.linksDir, `${targetId}__${sourceId}.md`));
}

/**
* 创建链接
*/
function createLink(sourceId, targetId, suggestion) {
  const linkPath = path.join(CONFIG.linksDir, `${sourceId}__${targetId}.md`);
  
  const linkContent = `---
source: ${sourceId}
target: ${targetId}
type: cross_domain_pollination
creativity: ${suggestion.creativity.toFixed(2)}
similarity: ${suggestion.similarity.toFixed(2)}
created: ${new Date().toISOString()}
method: pollination
tags:
  - cross-domain
  - creative
---

# Cross-Domain Link: ${sourceId} ↔ ${targetId}

- **Source**: [[${sourceId}]] (${suggestion.type1})
- **Target**: [[${targetId}]] (${suggestion.type2})
- **Type**: cross_domain_pollination
- **Creativity**: ${(suggestion.creativity * 100).toFixed(1)}%
- **Similarity**: ${(suggestion.similarity * 100).toFixed(1)}%
- **Shared Keywords**: ${suggestion.sharedKeywords.join(', ') || '无'}
- **Created**: ${new Date().toISOString()}
- **Method**: 授粉引擎跨域发现
`;
  
  fs.writeFileSync(linkPath, linkContent, 'utf8');
  console.log(`   ✅ 跨域链接: [[${sourceId}]] (${suggestion.type1}) ↔ [[${targetId}]] (${suggestion.type2})`);
}

// CLI 入口
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const creative = parseFloat((args.find(a => a.startsWith('--creative=')) || '').slice(11));

if (creative) {
  CONFIG.creativeThreshold = creative;
}

if (apply) {
  applySuggestions();
} else {
  const groups = groupEntitiesByType();
  const suggestions = generatePollinationSuggestions(groups);
  outputSuggestions(suggestions);
}
