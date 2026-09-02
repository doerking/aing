#!/usr/bin/env node
/**
 * shared-spine.js — Shared Spine 编译验证引擎
 * 
 * 功能：
 * 1. 编译前 KESPI 门槛检查
 * 2. 验证实体完整性
 * 3. 低分实体自动拒收
 * 4. 编译审计日志
 * 
 * 借鉴：Kore.ai 生产架构 Shared Spine 模式
 * 
 * 使用：
 *   node shared-spine.js compile    # 编译验证
 *   node shared-spine.js audit      # 审计日志
 *   node shared-spine.js fix        # 自动修复
 */

const fs = require('fs');
const path = require('path');
const { KnowledgeStore } = require('./knowledge-store');
const { checkKespi, getLightStatus } = require('./kespi-check');
const growthConfig = require('./growth.config');

// 配置
const CONFIG = {
  rawDir: path.join(__dirname, '..', 'raw'),
  wikiDir: path.join(__dirname, '..', 'wiki'),
  entitiesDir: path.join(__dirname, '..', 'wiki', 'entities'),
  logsDir: path.join(__dirname, '..', 'logs', 'shared-spine'),
  auditLog: path.join(__dirname, '..', 'logs', 'shared-spine', 'audit.jsonl')
};

// 编译规则
const COMPILE_RULES = {
  minKespi: 0.65,           // 最低 KESPI 门槛
  requireTags: true,        // 必须有关键词
  requireLinks: false,      // 不强制要求链接
  requireContent: 200,      // 最小内容长度
  autoReject: true          // 自动拒收低分实体
};

/**
 * 生成实体 ID
 */
function generateEntityId(relativePath) {
  return relativePath
    .replace(/\.md$/, '')
    .replace(/[\/\\]/g, '-')
    .replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, '-')
    .toLowerCase();
}

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content };
  
  try {
    const lines = match[1].split('\n');
    const metadata = {};
    for (const line of lines) {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (m) metadata[m[1]] = m[2].trim();
    }
    return { metadata, content: match[2].trim() };
  } catch (e) {
    return { metadata: {}, content };
  }
}

/**
 * 提取 wikilinks
 */
function extractLinks(content) {
  const links = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}

/**
 * 计算实体评分
 */
function estimateEntityScore(metadata, content) {
  const tags = metadata.tags || [];
  const hasCode = content.includes('```');
  const hasRefs = content.includes('来源') || content.includes('参考') ||
    /##\s*(References|Sources|Source)\b/i.test(content);
  const hasScenario = content.includes('使用场景') ||
    /##\s*(Usage|Example|Scenario|Use Cases?)\b/i.test(content);
  
  const scores = {
    KQ: 0.7 + (hasCode ? 0.1 : 0) + (hasRefs ? 0.05 : 0),
    KG: tags.length > 0 ? 0.6 : 0.3,
    KA: hasCode && hasRefs ? 0.7 : 0.5,
    KM: tags.length >= 3 ? 0.6 : 0.4,
    KD: extractLinks(content).length > 0 ? 0.6 : 0.3,
    KC: tags.length > 0 ? 0.7 : 0.4,
    KR: hasScenario ? 0.7 : 0.5,
    KB: 0
  };
  
  // 加权计算
  const weights = growthConfig.kespi.weights;
  let total = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    total += (scores[dim] || 0) * weight;
  }
  
  return {
    scores,
    total: Math.min(1.0, total)
  };
}

/**
 * 验证实体
 */
function validateEntity(entityId, metadata, content, score) {
  const issues = [];
  
  // KESPI 门槛检查
  if (score.total < COMPILE_RULES.minKespi) {
    issues.push({
      type: 'LOW_KESPI',
      severity: 'ERROR',
      message: `KESPI ${score.total.toFixed(2)} < ${COMPILE_RULES.minKespi}`,
      action: 'REJECT'
    });
  }
  
  // 标签检查
  if (COMPILE_RULES.requireTags && (!metadata.tags || metadata.tags.length === 0)) {
    issues.push({
      type: 'MISSING_TAGS',
      severity: 'WARNING',
      message: '缺少关键词',
      action: 'ADD_TAGS'
    });
  }
  
  // 内容长度检查
  if (content.length < COMPILE_RULES.requireContent) {
    issues.push({
      type: 'SHORT_CONTENT',
      severity: 'WARNING',
      message: `内容过短 (${content.length} < ${COMPILE_RULES.requireContent})`,
      action: 'EXPAND'
    });
  }
  
  return {
    valid: issues.filter(i => i.severity === 'ERROR').length === 0,
    issues
  };
}

/**
 * 写入审计日志
 */
function writeAuditLog(entry) {
  const logDir = CONFIG.logsDir;
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry
  };
  
  fs.appendFileSync(CONFIG.auditLog, JSON.stringify(logEntry) + '\n', 'utf8');
  return logEntry;
}

/**
 * 编译验证
 */
async function compileVerify(options = {}) {
  console.log('🕸️  Shared Spine 编译验证引擎\n');
  console.log('📋 配置:');
  console.log(`   最低 KESPI: ${COMPILE_RULES.minKespi}`);
  console.log(`   自动拒收: ${COMPILE_RULES.autoReject ? '是' : '否'}`);
  console.log('');
  
  // 确保目录存在
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  
  // 获取所有原始文件
  const rawFiles = getAllFiles(CONFIG.rawDir);
  console.log(`📂 发现 ${rawFiles.length} 个原始文件\n`);
  
  const results = {
    accepted: [],
    rejected: [],
    warned: [],
    startTime: Date.now()
  };
  
  for (const filePath of rawFiles) {
    const relativePath = path.relative(CONFIG.rawDir, filePath);
    const entityId = generateEntityId(relativePath);
    
    console.log(`🔍 验证: ${relativePath}`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { metadata, content: body } = parseFrontmatter(content);
      const links = extractLinks(body);
      
      // 估算评分
      const score = estimateEntityScore(metadata, body);
      const validation = validateEntity(entityId, metadata, body, score);
      
      // 记录审计
      const auditEntry = writeAuditLog({
        action: validation.valid ? 'ACCEPT' : 'REJECT',
        entityId,
        source: relativePath,
        kespi: score.total,
        issues: validation.issues,
        tags: metadata.tags || [],
        links: links.length
      });
      
      if (validation.valid) {
        console.log(`   ✅ 接受 (KESPI: ${score.total.toFixed(2)})`);
        results.accepted.push({ entityId, path: filePath, score: score.total });
      } else {
        const hasError = validation.issues.some(i => i.severity === 'ERROR');
        if (hasError && COMPILE_RULES.autoReject) {
          console.log(`   ❌ 拒收 (KESPI: ${score.total.toFixed(2)})`);
          validation.issues.forEach(i => console.log(`      - ${i.type}: ${i.message}`));
          results.rejected.push({ entityId, path: filePath, score: score.total, issues: validation.issues });
        } else {
          console.log(`   ⚠️  警告 (KESPI: ${score.total.toFixed(2)})`);
          validation.issues.forEach(i => console.log(`      - ${i.type}: ${i.message}`));
          results.warned.push({ entityId, path: filePath, score: score.total, issues: validation.issues });
        }
      }
      
    } catch (e) {
      console.error(`   ❌ 错误: ${e.message}`);
      results.errors = (results.errors || 0) + 1;
    }
  }
  
  // 打印统计（总数为 0 时避免除零产生 NaN%）
  const duration = ((Date.now() - results.startTime) / 1000).toFixed(2);
  const acceptRate = rawFiles.length > 0
    ? (results.accepted.length / rawFiles.length * 100).toFixed(1)
    : 'N/A';
  console.log('\n📊 验证统计:');
  console.log(`   总文件数: ${rawFiles.length}`);
  console.log(`   接受: ${results.accepted.length} (${acceptRate}%)`);
  console.log(`   拒收: ${results.rejected.length}`);
  console.log(`   警告: ${results.warned.length}`);
  console.log(`   耗时: ${duration}s`);
  
  // 写入汇总报告
  const reportPath = path.join(CONFIG.logsDir, `verify-${new Date().toISOString().replace(/:/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n📝 报告已保存: ${reportPath}`);
  
  return results;
}

/**
 * 审计日志
 */
async function auditLog() {
  console.log('📋 Shared Spine 审计日志\n');
  
  if (!fs.existsSync(CONFIG.auditLog)) {
    console.log('无审计日志');
    return;
  }
  
  const logs = fs.readFileSync(CONFIG.auditLog, 'utf8').split('\n').filter(Boolean);
  console.log(`共 ${logs.length} 条记录\n`);
  
  // 统计
  const stats = { accept: 0, reject: 0, byType: {} };
  for (const line of logs) {
    try {
      const entry = JSON.parse(line);
      stats[entry.action.toLowerCase()]++;
      if (!stats.byType[entry.entityId]) {
        stats.byType[entry.entityId] = { accept: 0, reject: 0 };
      }
      stats.byType[entry.entityId][entry.action.toLowerCase()]++;
    } catch (e) {}
  }
  
  console.log('📊 统计:');
  console.log(`   接受: ${stats.accept}`);
  console.log(`   拒收: ${stats.reject}`);
  const passRate = (stats.accept + stats.reject) > 0
    ? ((stats.accept / (stats.accept + stats.reject)) * 100).toFixed(1) + '%'
    : 'N/A';
  console.log(`   通过率: ${passRate}\n`);
  
  console.log('📋 最近记录:');
  logs.slice(-10).forEach(line => {
    try {
      const entry = JSON.parse(line);
      console.log(`  ${entry.timestamp} | ${entry.action} | ${entry.entityId} | KESPI: ${entry.kespi.toFixed(2)}`);
    } catch (e) {}
  });
}

/**
 * 自动修复
 */
async function autoFix() {
  console.log('🔧 Shared Spine 自动修复\n');
  
  // 获取所有原始文件
  const rawFiles = getAllFiles(CONFIG.rawDir);
  let fixed = 0;
  
  for (const filePath of rawFiles) {
    const relativePath = path.relative(CONFIG.rawDir, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const { metadata, content: body } = parseFrontmatter(content);
    
    // 检查是否需要修复
    let needsFix = false;
    let fixes = [];
    
    if (!metadata.tags || metadata.tags.length === 0) {
      needsFix = true;
      fixes.push('添加默认标签');
    }
    
    if (body.length < 200) {
      needsFix = true;
      fixes.push('内容过短');
    }
    
    if (needsFix) {
      console.log(`🔧 修复: ${relativePath}`);
      console.log(`   问题: ${fixes.join(', ')}`);
      
      // 添加标签
      if (!metadata.tags || metadata.tags.length === 0) {
        metadata.tags = ['auto-tagged'];
      }
      
      // 更新内容
      const newContent = `---
name: ${metadata.name || relativePath}
type: ${metadata.type || 'Concept'}
tags: ${JSON.stringify(metadata.tags)}
status: active
confidence: 0.7
source: ${relativePath}
---

${body}
`;
      
      fs.writeFileSync(filePath, newContent, 'utf8');
      fixed++;
    }
  }
  
  console.log(`\n✅ 修复完成: ${fixed} 个文件`);
}

/**
 * 获取目录下所有文件
 */
function getAllFiles(dir) {
  const files = [];

  // 目录不存在时返回空集，而不是直接 ENOENT 崩溃（首次运行 raw/ 可能尚未创建）
  if (!fs.existsSync(dir)) {
    return files;
  }

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// CLI
const args = process.argv.slice(2);
const action = args[0];

switch (action) {
  case 'compile':
    compileVerify();
    break;
  case 'audit':
    auditLog();
    break;
  case 'fix':
    autoFix();
    break;
  default:
    console.log('用法:');
    console.log('  node shared-spine.js compile  # 编译验证');
    console.log('  node shared-spine.js audit    # 审计日志');
    console.log('  node shared-spine.js fix      # 自动修复');
}