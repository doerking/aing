#!/usr/bin/env node
/**
 * compress.js — 芥子压缩引擎
 * 
 * 功能：将低频知识压缩为可组培的微观单元
 * 
 * 算法：
 * 1. 扫描所有实体
 * 2. 计算访问频率/更新时间
 * 3. 识别低频实体
 * 4. 压缩为芥子格式
 * 5. 存储到 mustard-seeds/
 * 
 * 使用：
 *   node compress.js                  # 压缩低频知识
 *   node compress.js --threshold 30   # 30天未更新
 *   node compress.js --mode selective # 选择性压缩
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  wikiDir: path.join(__dirname, '..', 'wiki'),
  entitiesDir: path.join(__dirname, '..', 'wiki', 'entities'),
  seedsDir: path.join(__dirname, '..', 'mustard-seeds', 'compressed'),
  logsDir: path.join(__dirname, '..', 'logs'),
  
  // 压缩参数
  inactiveDaysThreshold: 30,
  minContentLength: 50,
  maxCompressedSize: 1000
};

// 状态
const stats = {
  entitiesScanned: 0,
  entitiesCompressed: 0,
  seedsCreated: 0,
  bytesSaved: 0,
  startTime: Date.now()
};

/**
 * 计算实体活跃度
 */
function calculateActivity(entityFile, entityContent) {
  // 提取修改时间
  const stats = fs.statSync(entityFile);
  const modifiedTime = stats.mtime;
  const now = new Date();
  const daysInactive = (now - modifiedTime) / (1000 * 60 * 60 * 24);
  
  // 提取标签
  const tagMatch = entityContent.match(/tags:\s*\[([^\]]+)\]/);
  const tags = tagMatch ? tagMatch[1].split(',').map(t => t.trim()) : [];
  
  // 计算内容长度
  const contentLength = entityContent.length;
  
  // 活跃度评分（0-1，越低表示越不活跃）
  const timeScore = Math.max(0, 1 - daysInactive / CONFIG.inactiveDaysThreshold);
  const sizeScore = Math.min(1, contentLength / CONFIG.minContentLength);
  const tagScore = tags.length > 0 ? 0.5 : 0.2;
  
  const activityScore = timeScore * 0.5 + sizeScore * 0.3 + tagScore * 0.2;
  
  return {
    daysInactive,
    contentLength,
    tags,
    activityScore,
    needsCompression: daysInactive >= CONFIG.inactiveDaysThreshold && contentLength >= CONFIG.minContentLength
  };
}

/**
 * 压缩实体为芥子
 */
function compressToSeed(entityId, entityContent, activity) {
  // 提取关键信息
  const frontmatterMatch = entityContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;
  
  const [, frontmatter, body] = frontmatterMatch;
  
  // 生成压缩摘要
  const summary = generateSummary(body);
  
  // 构建芥子格式
  const seed = {
    id: entityId,
    originalType: extractType(entityContent),
    compressedAt: new Date().toISOString(),
    inactiveDays: activity.daysInactive,
    originalSize: entityContent.length,
    metadata: {
      title: extractTitle(entityContent),
      tags: activity.tags,
      activityScore: activity.activityScore
    },
    summary,
    // 存储完整内容的精简版
    preserved: {
      frontmatter: frontmatter,
      bodyPreview: body.slice(0, 500) + (body.length > 500 ? '...' : '')
    }
  };
  
  // 自引用字段：对象构建完成后再计算压缩后大小
  seed.compressedSize = Buffer.byteLength(JSON.stringify(seed));
  
  return seed;
}

/**
 * 生成内容摘要
 */
function generateSummary(content) {
  // 简单摘要：取前200个字符
  return content.slice(0, 200).trim();
}

/**
 * 提取实体类型
 */
function extractType(content) {
  const match = content.match(/type:\s*(\w+)/);
  return match ? match[1] : 'Unknown';
}

/**
 * 提取标题
 */
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : 'Untitled';
}

/**
 * 主压缩函数
 */
function compress() {
  console.log('🌰 芥子压缩引擎启动\n');
  console.log('📋 参数:');
  console.log(`   不活跃天数阈值: ${CONFIG.inactiveDaysThreshold}`);
  console.log(`   最小内容长度: ${CONFIG.minContentLength}`);
  console.log('');
  
  // 确保目录存在
  fs.mkdirSync(CONFIG.seedsDir, { recursive: true });
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  
  // 获取所有实体文件
  const entityFiles = fs.readdirSync(CONFIG.entitiesDir).filter(f => f.endsWith('.md'));
  stats.entitiesScanned = entityFiles.length;
  
  console.log(`📂 扫描 ${entityFiles.length} 个实体文件\n`);
  
  const seeds = [];
  
  for (const file of entityFiles) {
    const entityId = file.replace('.md', '');
    const filePath = path.join(CONFIG.entitiesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 计算活跃度
    const activity = calculateActivity(filePath, content);
    
    if (activity.needsCompression) {
      console.log(`🌰 压缩: ${entityId} (${activity.daysInactive.toFixed(1)} 天未更新)`);
      
      // 压缩为芥子
      const seed = compressToSeed(entityId, content, activity);
      if (seed) {
        seeds.push(seed);
        stats.entitiesCompressed++;
        stats.bytesSaved += seed.originalSize - seed.compressedSize;
      }
    } else {
      console.log(`   ✓ ${entityId} (活跃)`);
    }
  }
  
  // 保存芥子库
  if (seeds.length > 0) {
    saveSeeds(seeds);
  }
  
  // 打印统计
  printStats(seeds.length);
}

/**
 * 保存芥子库
 */
function saveSeeds(seeds) {
  const indexPath = path.join(CONFIG.seedsDir, 'index.json');
  
  // 读取现有索引
  let existingSeeds = [];
  if (fs.existsSync(indexPath)) {
    existingSeeds = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }
  
  // 合并并去重
  const allSeeds = [...existingSeeds, ...seeds];
  const uniqueSeeds = allSeeds.filter((seed, index, self) =>
    index === self.findIndex(s => s.id === seed.id)
  );
  
  // 保存
  fs.writeFileSync(indexPath, JSON.stringify(uniqueSeeds, null, 2), 'utf8');
  
  stats.seedsCreated = uniqueSeeds.length;
  
  console.log(`\n📦 芥子库已更新:`);
  console.log(`   新增: ${seeds.length}`);
  console.log(`   总计: ${uniqueSeeds.length}`);
}

/**
 * 打印统计
 */
function printStats(newSeeds) {
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log('\n📊 压缩统计:');
  console.log(`   扫描实体: ${stats.entitiesScanned}`);
  console.log(`   压缩实体: ${stats.entitiesCompressed}`);
  console.log(`   新增芥子: ${newSeeds}`);
  console.log(`   总芥子数: ${stats.seedsCreated}`);
  console.log(`   节省空间: ${(stats.bytesSaved / 1024).toFixed(2)} KB`);
  console.log(`   耗时: ${duration}s`);
}

// CLI 入口
compress();
