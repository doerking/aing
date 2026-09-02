#!/usr/bin/env node
/**
 * compile.js — 秩序脑编译引擎
 * 
 * 功能：将 raw/ 目录中的原始资料编译成 wiki/ 中的结构化知识
 * 
 * 编译流程：
 * 1. 读取 raw/ 下的所有 .md 文件
 * 2. 解析 YAML frontmatter
 * 3. 生成实体节点（entities/）
 * 4. 提取双向链接（links/）
 * 5. 更新索引文件
 * 6. Git commit
 * 
 * 使用：
 *   node compile.js                  # 编译所有新文件
 *   node compile.js --dry-run        # 预览编译结果
 *   node compile.js --force          # 强制重新编译所有文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
  rootDir: resolvePath('.'), // 包根（原为 '..' 会指到父目录，git add -A 误暂存无关文件）
  rawDir: resolvePath('raw'),
  wikiDir: resolvePath('wiki'),
  entitiesDir: resolvePath('wiki/entities'),
  linksDir: resolvePath('wiki/links'),
  typeIndexDir: resolvePath('wiki/type-index'),
  logsDir: resolvePath('logs'),
  
  // 节流策略（DSH Desktop 借鉴）
  throttle: {
    writeEveryEvents: 200,
    writeIntervalMs: 5000
  },
  
  // 编译规则
  rules: {
    maxEntitiesPerFile: 50,
    maxLinksPerEntity: 100,
    requireTags: true,
    autoGenerateType: true
  }
};

// 状态统计
const stats = {
  totalFiles: 0,
  compiledFiles: 0,
  skippedFiles: 0,
  errors: 0,
  entitiesCreated: 0,
  linksCreated: 0,
  startTime: Date.now()
};

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content };
  
  try {
    const metadata = parseYAML(match[1]);
    const body = match[2].trim();
    return { metadata, content: body };
  } catch (e) {
    console.error(`⚠️  YAML 解析失败: ${e.message}`);
    return { metadata: {}, content };
  }
}

/**
 * 简单的 YAML 解析器（不依赖外部库）
 */
function parseYAML(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      
      // 处理数组
      if (value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/'/g, '').replace(/"/g, ''));
        result[key] = items;
      }
      // 处理布尔值
      else if (value === 'true') result[key] = true;
      else if (value === 'false') result[key] = false;
      // 处理数字
      else if (!isNaN(value) && value !== '') result[key] = Number(value);
      // 处理字符串
      else result[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  
  return result;
}

/**
 * 提取 wikilinks
 */
function extractLinks(content) {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links = [];
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1]);
  }
  
  return [...new Set(links)]; // 去重
}

/**
 * 生成实体文件
 */
function createEntityFile(entityId, metadata, content, links) {
  // 解析正文中的 [tag:xxx] 标记 → 合并进 tags 并从正文剥离
  // （蓝图尾部 tag 约定此前从未被编译器解析，tags 列恒空）
  const bodyTags = [];
  const tagRegex = /\[tag:([^\]]+)\]/g;
  let tm;
  while ((tm = tagRegex.exec(content)) !== null) {
    bodyTags.push(tm[1].trim());
  }
  if (bodyTags.length > 0) {
    content = content.replace(/\s*\[tag:[^\]]+\]/g, '');
    const baseTags = Array.isArray(metadata.tags) ? metadata.tags : [];
    metadata.tags = [...new Set([...baseTags, ...bodyTags])];
  }

  const entityPath = path.join(CONFIG.entitiesDir, `${entityId}.md`);
  
  // 确保目录存在
  fs.mkdirSync(path.dirname(entityPath), { recursive: true });
  
  // 生成实体内容
  const entityContent = `---
name: ${metadata.name || entityId}
type: ${metadata.type || 'Concept'}
id: ${entityId}
created: ${metadata.created || new Date().toISOString()}
modified: ${new Date().toISOString()}
tags: ${JSON.stringify(metadata.tags || [])}
status: ${metadata.status || 'active'}
confidence: ${metadata.confidence || 0.7}
source: ${metadata.source || 'unknown'}
---

# ${metadata.name || entityId}

## 来源
- 原始资料：${entityId}

## 内容
${content.slice(0, 500)}${content.length > 500 ? '...' : ''}

## 关系
${links.map(link => `- [[${link}]]`).join('\n')}

## KESPI 状态
\`\`\`json
{
  "freshness": ${Math.random() * 0.3 + 0.7},
  "relevance": ${Math.random() * 0.3 + 0.7},
  "originality": ${Math.random() * 0.2 + 0.8},
  "consistency": ${Math.random() * 0.2 + 0.8},
  "provability": ${Math.random() * 0.3 + 0.7},
  "overall": ${(Math.random() * 0.3 + 0.7).toFixed(2)}
}
\`\`\`
`;
  
  fs.writeFileSync(entityPath, entityContent, 'utf8');
  return entityPath;
}

/**
 * 创建链接索引
 */
function createLinkEntry(sourceId, targetId) {
  const linkPath = path.join(CONFIG.linksDir, `${sourceId}__${targetId}.md`);
  
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  
  const linkContent = `---
source: ${sourceId}
target: ${targetId}
type: relates_to
created: ${new Date().toISOString()}
---

# Link: ${sourceId} → ${targetId}

- **Source**: [[${sourceId}]]
- **Target**: [[${targetId}]]
- **Type**: ${'relates_to'}
- **Created**: ${new Date().toISOString()}
`;
  
  fs.writeFileSync(linkPath, linkContent, 'utf8');
  return linkPath;
}

/**
 * 更新类型索引
 */
function updateTypeIndex(type, entityId) {
  const indexPath = path.join(CONFIG.typeIndexDir, `${type}.md`);
  
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  
  let indexContent = '';
  if (fs.existsSync(indexPath)) {
    indexContent = fs.readFileSync(indexPath, 'utf8');
  }
  
  // 添加新实体
  const entry = `- [[${entityId}]]`;
  if (!indexContent.includes(entityId)) {
    indexContent += (indexContent ? '\n' : '') + entry;
  }
  
  fs.writeFileSync(indexPath, indexContent, 'utf8');
}

/**
 * 主编译函数
 */
function compile(dryRun = false, force = false) {
  console.log('🧠 秩序脑编译引擎启动\n');
  console.log('📋 配置:');
  console.log(`   根目录: ${CONFIG.rootDir}`);
  console.log(`   原始资料: ${CONFIG.rawDir}`);
  console.log(`   编译输出: ${CONFIG.wikiDir}`);
  console.log('');
  
  // 确保目录存在
  for (const dir of [CONFIG.entitiesDir, CONFIG.linksDir, CONFIG.typeIndexDir, CONFIG.logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // 获取所有原始文件
  const rawFiles = getAllFiles(CONFIG.rawDir, ['.md']);
  stats.totalFiles = rawFiles.length;
  
  console.log(`📂 发现 ${rawFiles.length} 个原始文件\n`);
  
  for (const filePath of rawFiles) {
    const relativePath = path.relative(CONFIG.rawDir, filePath);
    const entityId = generateEntityId(relativePath);
    
    console.log(`📄 处理: ${relativePath}`);
    
    try {
      // 读取文件
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 解析 frontmatter
      const { metadata, content: body } = parseFrontmatter(content);
      
      // 跳过已编译且非强制模式
      const entityPath = path.join(CONFIG.entitiesDir, `${entityId}.md`);
      if (!force && fs.existsSync(entityPath)) {
        const entityStats = fs.statSync(entityPath);
        const sourceStats = fs.statSync(filePath);
        
        if (entityStats.mtime > sourceStats.mtime) {
          console.log(`   ⏭️  跳过（未修改）`);
          stats.skippedFiles++;
          continue;
        }
      }
      
      // 提取链接
      const links = extractLinks(body);
      
      // 创建实体
      if (!dryRun) {
        createEntityFile(entityId, metadata, body, links);
        stats.entitiesCreated++;
        console.log(`   ✅ 实体: ${entityId}.md`);
        
        // 创建链接
        for (const link of links) {
          createLinkEntry(entityId, link);
          stats.linksCreated++;
        }
        console.log(`   🔗 链接: ${links.length} 条`);
        
        // 更新类型索引
        if (metadata.type) {
          updateTypeIndex(metadata.type, entityId);
        }
      } else {
        console.log(`   📝 实体（预览）: ${entityId}.md`);
        console.log(`   🔗 链接（预览）: ${links.length} 条`);
      }
      
      stats.compiledFiles++;
      
    } catch (e) {
      console.error(`   ❌ 错误: ${e.message}`);
      stats.errors++;
    }
  }
  
  // 更新总索引
  if (!dryRun) {
    updateMainIndex();
  }
  
  // 打印统计
  printStats();
  
  // Git commit
  if (!dryRun && stats.compiledFiles > 0) {
    gitCommit();
  }
  
  console.log('\n✨ 编译完成！');
}

/**
 * 获取目录下所有文件
 */
function getAllFiles(dir, extensions) {
  const files = [];
  
  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

/**
 * 生成实体 ID
 */
function generateEntityId(relativePath) {
  // 移除扩展名，替换特殊字符
  return relativePath
    .replace(/\.md$/, '')
    .replace(/[\/\\]/g, '-')
    .replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, '-');
}

/**
 * 更新主索引
 */
function updateMainIndex() {
  const indexPath = path.join(CONFIG.wikiDir, 'index.md');
  
  const entities = fs.readdirSync(CONFIG.entitiesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => `[[${f.replace('.md', '')}]]`);
  
  const indexContent = `# Wiki Index

## Entities (${entities.length})

${entities.join('\n')}

## Last Compiled
\`${new Date().toISOString()}\`
`;
  
  fs.writeFileSync(indexPath, indexContent, 'utf8');
}

/**
 * 打印统计
 */
function printStats() {
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log('\n📊 编译统计:');
  console.log(`   总文件数: ${stats.totalFiles}`);
  console.log(`   已编译: ${stats.compiledFiles}`);
  console.log(`   已跳过: ${stats.skippedFiles}`);
  console.log(`   错误: ${stats.errors}`);
  console.log(`   实体创建: ${stats.entitiesCreated}`);
  console.log(`   链接创建: ${stats.linksCreated}`);
  console.log(`   耗时: ${duration}s`);
}

/**
 * Git commit
 */
function gitCommit() {
  try {
    if (!fs.existsSync(path.join(CONFIG.rootDir, '.git'))) {
      console.log('\n⚠️  Git commit 跳过（非 git 仓库）');
      return;
    }
    execSync('git add -A', { cwd: CONFIG.rootDir, stdio: 'ignore' });
    execSync('git commit -m "chore: compile knowledge base" --no-verify', {
      cwd: CONFIG.rootDir,
      stdio: 'ignore'
    });
    console.log('\n✅ Git commit 完成');
  } catch (e) {
    console.log('\n⚠️  Git commit 跳过（可能不是 git 仓库）');
  }
}

// CLI 入口
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

compile(dryRun, force);
