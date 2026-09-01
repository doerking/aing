#!/usr/bin/env node
/**
 * prune.js — 剪枝引擎
 * 
 * 功能：清理过期、低质量的知识
 * 
 * 剪枝策略：
 * 1. 移除超过 N 天未更新的实体
 * 2. 移除 KESPI 评分低于阈值的实体
 * 3. 断链清理
 * 4. 归档到 pruned/ 目录
 * 
 * 使用：
 *   node prune.js                    # 预览剪枝
 *   node prune.js --dry-run          # 只显示不执行
 *   node prune.js --force            # 强制执行
 *   node prune.js --days 60          # 60天未更新
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

// 配置
const CONFIG = {
  wikiDir: path.join(__dirname, '..', 'wiki'),
  entitiesDir: path.join(__dirname, '..', 'wiki', 'entities'),
  linksDir: path.join(__dirname, '..', 'wiki', 'links'),
  prunedDir: path.join(__dirname, '..', 'pruned', 'archive'),
  logsDir: path.join(__dirname, '..', 'logs'),
  
  // 剪枝参数
  inactiveDaysThreshold: 90,
  minKespiScore: 0.5,
  move_to_archive: true
};

// 状态
const stats = {
  entitiesScanned: 0,
  entitiesPruned: 0,
  linksRemoved: 0,
  archiveCreated: 0,
  bytesRecovered: 0,
  prunedIds: [], // 本次剪枝的实体 id，用于同步清理 DB（双脑契约：文件归档 + DB 清引用）
  startTime: Date.now()
};

/**
 * 检查实体是否应该被剪枝
 */
function shouldPrune(entityId, entityContent) {
  const checks = {
    inactive: false,
    lowQuality: false,
    brokenLinks: false,
    reasons: []
  };
  
  // 1. 检查不活跃时间
  try {
    const stats = fs.statSync(path.join(CONFIG.entitiesDir, `${entityId}.md`));
    const daysInactive = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysInactive >= CONFIG.inactiveDaysThreshold) {
      checks.inactive = true;
      checks.reasons.push(`不活跃 ${daysInactive.toFixed(1)} 天`);
    }
  } catch {
    checks.inactive = true;
    checks.reasons.push('文件不存在');
  }
  
  // 2. 检查 KESPI 质量（简化版）
  const freshnessMatch = entityContent.match(/freshness:\s*([\d.]+)/);
  const overallMatch = entityContent.match(/overall:\s*([\d.]+)/);
  
  if (overallMatch) {
    const overallScore = parseFloat(overallMatch[1]);
    if (overallScore < CONFIG.minKespiScore) {
      checks.lowQuality = true;
      checks.reasons.push(`KESPI 过低 (${(overallScore * 100).toFixed(1)}%)`);
    }
  }
  
  // 3. 检查断链
  const links = entityContent.match(/\[\[([^\]]+)\]\]/g) || [];
  for (const link of links) {
    const targetId = link.replace(/[\[\]]/g, '');
    const targetFile = path.join(CONFIG.entitiesDir, `${targetId}.md`);
    if (!fs.existsSync(targetFile)) {
      checks.brokenLinks = true;
      checks.reasons.push(`断链: [[${targetId}]]`);
      break;
    }
  }
  
  return checks;
}

/**
 * 执行剪枝
 */
function prune(dryRun = false, force = false) {
  console.log('✂️ 剪枝引擎启动\n');
  console.log('📋 参数:');
  console.log(`   不活跃阈值: ${CONFIG.inactiveDaysThreshold} 天`);
  console.log(`   最低 KESPI: ${CONFIG.minKespiScore}`);
  console.log(`   模式: ${dryRun ? '预览' : force ? '强制' : '正常'}`);
  console.log('');
  
  // 确保目录存在
  if (!dryRun) {
    fs.mkdirSync(CONFIG.prunedDir, { recursive: true });
    fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  }
  
  // 获取所有实体
  const entityFiles = fs.readdirSync(CONFIG.entitiesDir).filter(f => f.endsWith('.md'));
  stats.entitiesScanned = entityFiles.length;
  
  console.log(`📂 扫描 ${entityFiles.length} 个实体\n`);
  
  const toPrune = [];
  
  for (const file of entityFiles) {
    const entityId = file.replace('.md', '');
    const filePath = path.join(CONFIG.entitiesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const checks = shouldPrune(entityId, content);
    
    // 前向 [[链接]] 指向未创建的实体属正常状态，断链不作为独立剪枝条件
    // 仅 inactive 或 lowQuality 才剪枝；brokenLinks 只作提示
    if (checks.inactive || checks.lowQuality) {
      toPrune.push({
        id: entityId,
        file,
        path: filePath,
        checks,
        content
      });
    }
  }
  
  if (toPrune.length === 0) {
    console.log('✅ 无需剪枝');
    return;
  }
  
  console.log(`📝 发现 ${toPrune.length} 个待剪枝实体:\n`);
  
  for (const item of toPrune) {
    console.log(`🗑️  ${item.id}`);
    console.log(`   原因: ${item.checks.reasons.join(', ')}`);
  }
  
  if (!dryRun) {
    console.log('\n✂️ 执行剪枝...\n');
    
    for (const item of toPrune) {
      pruneEntity(item, force);
    }
    
    // 清理断链
    cleanupBrokenLinks();
    
    printStats();
  } else {
    console.log('\n💡 预览模式，未执行实际剪枝');
  }
}

/**
 * 剪枝单个实体
 */
function pruneEntity(item, force) {
  if (!force) {
    console.log(`   ⏭️  跳过（需 --force）: ${item.id}`);
    return;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(CONFIG.prunedDir, timestamp);
  
  // 创建归档目录
  fs.mkdirSync(archivePath, { recursive: true });
  stats.archiveCreated++;
  
  // 移动文件
  const destPath = path.join(archivePath, item.file);
  fs.copyFileSync(item.path, destPath);
  fs.unlinkSync(item.path);
  
  stats.prunedIds.push(item.id);
  stats.entitiesPruned++;
  stats.bytesRecovered += item.content.length;
  
  console.log(`   ✅ 已归档: ${item.id} → ${archivePath}`);
}

/**
 * 清理断链
 */
function cleanupBrokenLinks() {
  console.log('\n🧹 清理断链...\n');
  
  const linkFiles = fs.readdirSync(CONFIG.linksDir).filter(f => f.endsWith('.md'));
  let removed = 0;
  
  for (const file of linkFiles) {
    const content = fs.readFileSync(path.join(CONFIG.linksDir, file), 'utf8');
    
    // 提取 source 和 target（实体 ID 含连字符，\w 不够）
    const sourceMatch = content.match(/source:\s*([\w.-]+)/);
    const targetMatch = content.match(/target:\s*([\w.-]+)/);
    
    if (sourceMatch && targetMatch) {
      const sourceExists = fs.existsSync(path.join(CONFIG.entitiesDir, `${sourceMatch[1]}.md`));
      const targetExists = fs.existsSync(path.join(CONFIG.entitiesDir, `${targetMatch[1]}.md`));
      
      if (!sourceExists || !targetExists) {
        fs.unlinkSync(path.join(CONFIG.linksDir, file));
        removed++;
        stats.linksRemoved++;
      }
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ 已移除 ${removed} 个断链`);
  } else {
    console.log('   ✅ 无断链');
  }
}

/**
 * 打印统计
 */
function printStats() {
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log('\n📊 剪枝统计:');
  console.log(`   扫描实体: ${stats.entitiesScanned}`);
  console.log(`   剪枝实体: ${stats.entitiesPruned}`);
  console.log(`   移除链接: ${stats.linksRemoved}`);
  console.log(`   创建归档: ${stats.archiveCreated}`);
  console.log(`   恢复空间: ${(stats.bytesRecovered / 1024).toFixed(2)} KB`);
  console.log(`   耗时: ${duration}s`);
}

/**
 * 同步清理 DB：被剪枝实体的行全部移除（双脑契约：文件归档 + DB 清引用，
 * 否则被剪知识仍可被语义检索命中，且下轮 import 永不清理）
 */
async function purgePrunedFromDB() {
  if (!stats.prunedIds.length) return;
  try {
    const store = new KnowledgeStore(path.join(__dirname, '..', 'knowledge.db'));
    await store.init();
    let purged = 0;
    for (const id of stats.prunedIds) {
      // 先清子表引用，再删主行
      store.run('DELETE FROM entity_metadata WHERE entity_id = ?', [id]);
      store.run('DELETE FROM entity_embeddings WHERE entity_id = ?', [id]);
      store.run('DELETE FROM kespi_history WHERE entity_id = ?', [id]);
      store.run('DELETE FROM links WHERE source_id = ? OR target_id = ?', [id, id]);
      store.run('DELETE FROM type_index WHERE entity_id = ?', [id]);
      store.run('DELETE FROM entities WHERE id = ?', [id]);
      purged++;
    }
    store.close();
    console.log(`\n🗄️  DB 同步清理: ${purged} 个被剪实体已从数据库移除`);
  } catch (e) {
    console.error(`\n⚠️  DB 同步清理失败: ${e.message}`);
    process.exitCode = 1;
  }
}

// CLI 入口
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--force');
const force = args.includes('--force');
const daysMatch = args.find(a => a.startsWith('--days='));

if (daysMatch) {
  CONFIG.inactiveDaysThreshold = parseInt(daysMatch.slice(7));
}

(async () => {
  prune(dryRun, force);
  if (!dryRun) await purgePrunedFromDB();
})();
