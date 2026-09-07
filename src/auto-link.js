#!/usr/bin/env node
/**
 * auto-link.js — 自动发现并创建实体间链接
 * 
 * 策略：
 *   1. 共享标签 → 强关联 (0.8)
 *   2. 内容关键词重叠 → 中关联 (0.6)
 *   3. 类型相同 → 弱关联 (0.4)
 * 
 * 使用：
 *   node src/auto-link.js              # 发现并创建链接
 *   node src/auto-link.js --dry-run    # 只显示不创建
 */

const KnowledgeStore = require('./knowledge-store');

function extractKeywords(content) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
    'of', 'and', 'or', 'but', 'this', 'that', 'it', 'with', 'as', 'by', 'from',
    '的', '是', '在', '和', '与', '或', '有', '了', '不', '也', '就', '人', '我', '他', '她', '它',
    '们', '这', '那', '个', '中', '大', '小', '上', '下', '来', '去', '出', '到', '时', '地', '得'
  ]);
  
  const text = (content || '').toLowerCase();
  const words = text
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w));
  
  return [...new Set(words)];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  const store = new KnowledgeStore();
  await store.init();
  
  const entities = store.getEntities({ status: 'active' });
  
  console.log(`🔗 自动链接发现 (${entities.length} 个实体)${dryRun ? ' [DRY RUN]' : ''}\n`);
  
  let linksCreated = 0;
  const existingLinks = new Set();
  
  // 获取已有链接
  const existing = store.all('SELECT source_id, target_id FROM links');
  existing.forEach(l => {
    existingLinks.add(`${l.source_id}__${l.target_id}`);
    existingLinks.add(`${l.target_id}__${l.source_id}`);
  });
  
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      
      let confidence = 0;
      let reason = '';
      
      // 1. 共享标签
      let tagsA = [], tagsB = [];
      try { tagsA = JSON.parse(a.tags || '[]'); } catch (e) {}
      try { tagsB = JSON.parse(b.tags || '[]'); } catch (e) {}
      
      const sharedTags = tagsA.filter(t => tagsB.includes(t));
      if (sharedTags.length > 0) {
        confidence = Math.max(confidence, 0.6 + sharedTags.length * 0.1);
        reason = `共享标签: ${sharedTags.join(', ')}`;
      }
      
      // 2. 关键词重叠
      const kwA = extractKeywords(a.content);
      const kwB = extractKeywords(b.content);
      const sharedKw = kwA.filter(k => kwB.includes(k));
      
      if (sharedKw.length >= 3) {
        confidence = Math.max(confidence, 0.5 + sharedKw.length * 0.05);
        reason = reason || `关键词重叠: ${sharedKw.slice(0, 3).join(', ')}`;
      }
      
      // 3. 类型相同
      if (a.type === b.type && confidence === 0) {
        confidence = 0.3;
        reason = `同类型: ${a.type}`;
      }
      
      // 创建链接
      if (confidence >= 0.3) {
        const linkKey = `${a.id}__${b.id}`;
        
        if (!existingLinks.has(linkKey)) {
          if (!dryRun) {
            store.run(
              'INSERT OR IGNORE INTO links (source_id, target_id, relation, confidence) VALUES (?, ?, ?, ?)',
              [a.id, b.id, 'related', Math.min(confidence, 1.0)]
            );
          }
          
          const nameA = (a.name || a.id).substring(0, 15);
          const nameB = (b.name || b.id).substring(0, 15);
          console.log(`  ${nameA} ↔ ${nameB} (${confidence.toFixed(2)}) ${reason}`);
          
          linksCreated++;
        }
      }
    }
  }
  
  console.log(`\n${'='.repeat(40)}`);
  if (dryRun) {
    console.log(`📋 DRY RUN: 发现 ${linksCreated} 个潜在链接`);
  } else {
    console.log(`✅ 创建 ${linksCreated} 个新链接`);
  }
}

main().catch(err => {
  console.error('❌ 链接失败:', err.message);
  process.exit(1);
});
