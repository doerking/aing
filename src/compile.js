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
    console.error(`⚠️  YAML 解析失败: ${e.message} / YAML parse failed`);
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
        const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/'/g, '').replace(/"/g, '')).filter(Boolean);
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

function formatKespiPending() {
  return JSON.stringify({
    status: 'pending',
    reason: '等待 kespi-check.js 首次真实评估',
    overall: null,
    dimensions: {}
  }, null, 2);
}

/**
 * 生成实体文件
 */
function createEntityFile(entityId, metadata, content, links) {
  // 解析正文中的 [tag:xxx] 或 [tag:xxx:N] 标记 → 合并进 tags 并从正文剥离
  // N 为 1-9 的九段数值，表示该标签对实体的关联强度（1 最弱 → 9 最强）
  // 不带 :N 的 [tag:xxx] 默认中位值 5（向后兼容）
  const bodyTags = [];
  const tagRegex = /\[tag:([^\]]+?)(?::([1-9]))?\]/g;
  let tm;
  while ((tm = tagRegex.exec(content)) !== null) {
    const tagName = tm[1].trim();
    const tagVal = tm[2] ? parseInt(tm[2], 10) : 5;
    bodyTags.push(`${tagName}:${tagVal}`);
  }
  if (bodyTags.length > 0) {
    content = content.replace(/\s*\[tag:[^\]]+\]/g, '');
  }
  // 始终 normalize tags：frontmatter + body 合并，纯字符串标签默认 5
  {
    const baseTags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const tagMap = new Map();
    for (const t of [...baseTags, ...bodyTags]) {
      const m = String(t).match(/^(.+):([1-9])$/);
      if (m) {
        const name = m[1], val = parseInt(m[2], 10);
        tagMap.set(name, Math.max(tagMap.get(name) || 0, val));
      } else {
        tagMap.set(String(t), Math.max(tagMap.get(String(t)) || 0, 5));
      }
    }
    metadata.tags = [...tagMap.entries()].map(([name, val]) => `${name}:${val}`);
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
kespi_status: ${metadata.kespi_status || 'pending'}
confidence: ${metadata.confidence !== undefined ? metadata.confidence : 0.0}
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
${formatKespiPending()}
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
  console.log('🧠 秩序脑编译引擎启动\n / Order-Brain compile engine started');
  console.log('📋 配置: / Config:');
  console.log(`   根目录: ${CONFIG.rootDir} / Root dir:`);
  console.log(`   原始资料: ${CONFIG.rawDir} / Raw source:`);
  console.log(`   编译输出: ${CONFIG.wikiDir} / Compile output:`);
  console.log('');
  
  // 确保目录存在
  for (const dir of [CONFIG.entitiesDir, CONFIG.linksDir, CONFIG.typeIndexDir, CONFIG.logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // 获取所有原始文件
  const rawFiles = getAllFiles(CONFIG.rawDir, ['.md']);
  stats.totalFiles = rawFiles.length;
  
  console.log(`📂 发现 ${rawFiles.length} 个原始文件 / raw files found\n`);
  
  for (const filePath of rawFiles) {
    const relativePath = path.relative(CONFIG.rawDir, filePath);
    
    console.log(`📄 处理: ${relativePath} / Processing:`);
    
    try {
      // 读取文件
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 解析 frontmatter
      const { metadata, content: body } = parseFrontmatter(content);
      
      // 实体 id 归属规则（2026-09-14 影子实测定，两次踩坑换来的）：
      // · 会话档（sourceType: conversation）尊重档内声明 id —— 入库产物挪到 raw/inbox/ 后，
      //   按路径推导会给 id 平白加 inbox- 前缀，与 raw 文件名干脱钩，consciousness-layer 拿 raw 名
      //   去 wiki/entities 找实体必然找不到，刷出成片「原始资料尚未编译到 wiki/」假告警。
      // · 人工档仍按路径推导 —— 实测本包 19/20 篇人工档根本没有声明 id，若一并"尊重声明值"，
      //   String(undefined) 会得到真值 "undefined"，19 篇当场并成一个 undefined 实体互相覆盖。
      // · 声明值必须是像样的字符串：空串、undefined、null 字样一律视为没声明。
      const declaredId = metadata && typeof metadata.id === 'string' ? metadata.id.trim() : '';
      const usableId = declaredId && declaredId !== 'undefined' && declaredId !== 'null';
      const isConversation = metadata && String(metadata.sourceType || '').trim() === 'conversation';
      // 入库产物一律落在 raw 的子目录（默认 raw/inbox/），人工知识源在 raw 顶层——用这个位置
      // 事实把"尊重声明 id"限定到最小面：影子实测仅按 sourceType 分流时，raw 顶层一条声明 id
      // 与文件名干不一致的历史会话档会在重编译时多造一个重复实体（22 vs 期望 21）。
      const inIngestSubdir = /[\\/]/.test(relativePath.replace(/\.md$/, ''));
      const entityId = (isConversation && inIngestSubdir && usableId) ? declaredId : generateEntityId(relativePath);
      
      // 跳过已编译且非强制模式
      const entityPath = path.join(CONFIG.entitiesDir, `${entityId}.md`);
      if (!force && fs.existsSync(entityPath)) {
        const entityStats = fs.statSync(entityPath);
        const sourceStats = fs.statSync(filePath);
        
        if (entityStats.mtime > sourceStats.mtime) {
          console.log(`   ⏭️  跳过（未修改） / Skipped (unmodified)`);
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
        console.log(`   ✅ 实体: ${entityId}.md / Entity:`);
        
        // 创建链接
        for (const link of links) {
          createLinkEntry(entityId, link);
          stats.linksCreated++;
        }
        console.log(`   🔗 链接: ${links.length} 条 / Links:`);
        
        // 更新类型索引
        if (metadata.type) {
          updateTypeIndex(metadata.type, entityId);
        }
      } else {
        console.log(`   📝 实体（预览）: ${entityId}.md / Entity (preview):`);
        console.log(`   🔗 链接（预览）: ${links.length} 条 / Links (preview):`);
      }
      
      stats.compiledFiles++;
      
    } catch (e) {
      console.error(`   ❌ 错误: ${e.message} / Error:`);
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
  
  console.log('\n✨ 编译完成！ / Compile done!');
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
  
  console.log('\n📊 编译统计: / Compile stats:');
  console.log(`   总文件数: ${stats.totalFiles} / Total files:`);
  console.log(`   已编译: ${stats.compiledFiles} / Compiled:`);
  console.log(`   已跳过: ${stats.skippedFiles} / Skipped:`);
  console.log(`   错误: ${stats.errors} / Errors:`);
  console.log(`   实体创建: ${stats.entitiesCreated} / Entities created:`);
  console.log(`   链接创建: ${stats.linksCreated} / Links created:`);
  console.log(`   耗时: ${duration}s / Elapsed:`);
}

/**
 * Git commit
 */
function gitCommit() {
  if (process.env.AING_NO_AUTOCOMMIT === '1') {
    console.log('\n⏭️  Git commit 跳过（AING_NO_AUTOCOMMIT=1，供 seed-demo 等临时数据往返使用）');
    return;
  }
  try {
    if (!fs.existsSync(path.join(CONFIG.rootDir, '.git'))) {
      console.log('\n⚠️  Git commit 跳过（非 git 仓库） / Git commit skipped (not a git repo)');
      return;
    }
    execSync('git add -A', { cwd: CONFIG.rootDir, stdio: 'ignore' });
    execSync('git commit -m "chore: compile knowledge base" --no-verify', {
      cwd: CONFIG.rootDir,
      stdio: 'ignore'
    });
    console.log('\n✅ Git commit 完成 / Git commit done');
  } catch (e) {
    console.log('\n⚠️  Git commit 跳过（可能不是 git 仓库） / Git commit skipped (may not be a git repo)');
  }
}

// CLI 入口
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

compile(dryRun, force);
