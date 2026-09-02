#!/usr/bin/env node
/**
 * import-from-wiki.js — 从 wiki 导入数据到 SQLite
 * 
 * 功能：
 * 1. 扫描 wiki/entities/ 目录
 * 2. 解析每个实体文件
 * 3. 导入到 knowledge.db
 * 
 * 使用：
 *   node import-from-wiki.js --base-dir .
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
  const match = content.match(frontmatterRegex);
  
  if (!match) return { data: {}, content };
  
  const fmContent = match[1];
  const body = content.slice(match[0].length);
  
  const data = {};
  for (const line of fmContent.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      data[key] = value;
    }
  }
  
  return { data, content: body };
}

async function importEntities(baseDir) {
  const store = new KnowledgeStore(path.join(baseDir, 'knowledge.db'));
  await store.init();
  const entitiesDir = path.join(baseDir, 'wiki', 'entities');
  
  if (!fs.existsSync(entitiesDir)) {
    console.log('❌ wiki/entities/ 目录不存在');
    store.close();
    return;
  }
  
  const files = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.md'));
  let imported = 0;
  let skipped = 0;
  
  console.log(`📦 开始导入 ${files.length} 个实体...\n`);
  
  for (const file of files) {
    const filePath = path.join(entitiesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const { data, content: body } = parseFrontmatter(content);
    
    const id = data.id || path.basename(file, '.md');
    const name = data.name || path.basename(file, '.md');
    const type = data.type || 'Concept';
    // compile 写入的是 JSON 数组格式（tags: ["a", "b"]），兼容旧行逗号分隔
    let tags = [];
    if (Array.isArray(data.tags)) {
      tags = data.tags;
    } else if (data.tags) {
      try {
        const parsed = JSON.parse(data.tags);
        tags = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        tags = String(data.tags).split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
    }
    const status = data.status || 'active';
    const confidence = parseFloat(data.confidence) || 0.0;
    
    // 清理 body 中的 frontmatter
    const cleanBody = body.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
    
    try {
      store.saveEntity({
        id,
        name,
        type,
        content: cleanBody,
        tags,
        status,
        confidence,
        source_file: `wiki/entities/${file}`
      });
      
      // 同时创建元数据（仅首次建行；已有行的 KESPI 分不覆盖归零，等 kespi-check 刷新）
      store.run(
        `INSERT INTO entity_metadata 
         (entity_id, originality, relevance, consistency, provability, utility, kespi_score)
         VALUES (?, ?, ?, ?, ?, ?, 0.0)
         ON CONFLICT(entity_id) DO NOTHING`,
        [id, 0.7, 0.7, confidence, 0.6, 0.7]
      );
      
      console.log(`  ✅ ${name} (${type}, confidence=${confidence})`);
      imported++;
    } catch (err) {
      console.error(`  ❌ ${name}: ${err.message}`);
      skipped++;
    }
  }
  
  console.log(`\n✅ 导入完成: ${imported} 成功, ${skipped} 失败`);
  
  const stats = store.getStats();
  console.log(`\n📊 知识库统计:`);
  console.log(`   实体总数: ${stats.entities}`);
  console.log(`   链接总数: ${stats.links}`);
  
  store.close();
}

// 主逻辑
const args = process.argv.slice(2);
const baseDir = args.includes('--base-dir') ? args[args.indexOf('--base-dir') + 1] : '.';

importEntities(baseDir).catch(err => {
  console.error('❌ 导入失败:', err.message);
  process.exit(1);
});
