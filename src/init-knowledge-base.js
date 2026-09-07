#!/usr/bin/env node
/**
 * init-knowledge-base.js — 知识库初始化脚本
 * 
 * 功能：创建知识库的完整目录结构
 * 
 * 使用：
 *   node init-knowledge-base.js                  # 初始化当前目录
 *   node init-knowledge-base.js /path/to/kb      # 指定路径
 *   node init-knowledge-base.js --git            # 初始化 Git
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const CONFIG = {
  directories: [
    'raw/articles',
    'raw/research',
    'raw/notes',
    'wiki/entities',
    'wiki/links',
    'wiki/capsules',
    'wiki/type-index',
    'schema',
    'mustard-seeds/compressed',
    'pruned/archive',
    'logs/metabolism',
    'logs/kespi-reports',
    'logs/sprouting-reports',
    'logs/pollination-reports',
    'src',
    'references',
    'guides'
  ],
  
  files: {
    'README.md': `# Knowledge Base

## 目录结构

\`\`\`
knowledge-base/
├── raw/                    # 原始资料（只读）
│   ├── articles/
│   ├── research/
│   └── notes/
│
├── wiki/                   # 编译后的知识
│   ├── entities/
│   ├── links/
│   ├── capsules/
│   └── type-index/
│
├── schema/                 # 编译规则
├── mustard-seeds/          # 芥子库
├── pruned/                 # 剪枝归档
├── logs/                   # 代谢日志
├── src/                    # 代谢引擎（compile.js、run-metabolism.js 等）
├── references/             # 参考文档
└── guides/                 # 使用指南
\`\`\`

## 快速开始

\`\`\`bash
# 放入第一份资料
echo "# 标题

内容...

---
name: test-entity
type: Concept
tags: [test]
status: active
" > raw/articles/test.md

# 运行编译
node src/compile.js

# 运行代谢
node src/run-metabolism.js
\`\`\`
`,
    'AGENTS.md': `# AGENTS.md — Agent 配置

## 双脑架构配置

\`\`\`yaml
order_brain:
  type: tolaria
  storage: markdown
  version_control: git
  
growth_brain:
  sprouting:
    enabled: true
    threshold: 0.7
  pollination:
    enabled: true
    creative_threshold: 0.85
  compression:
    enabled: true
    inactive_days: 30
  kespi:
    freshness: 0.7
    relevance: 0.7
    originality: 0.6
    consistency: 0.8
    provability: 0.7
\`\`\`
`,
    'references/error-handling.md': `# 错误码行动表

| 错误码 | 错误类型 | Agent 下一步 | 重试规则 |
|---|---|---|---|
| E001 | 编译失败 | 检查 YAML frontmatter | 最多 1 次 |
| E002 | 链接损坏 | 检查目标实体存在 | 不重试 |
| E003 | KESPI 过低 | 标记为待压缩 | 不重试 |
| E004 | 压缩失败 | 记录日志 | 最多 1 次 |
| E005 | 剪枝失败 | 恢复文件 | 最多 3 次 |
`,
    'references/quality-gates.md': `# 质量门禁规范

## KESPI 五维评估

| 维度 | 说明 | 阈值 |
|---|---|---|
| K - Freshness | 内容新鲜度 | ≥ 0.7 |
| E - Relevance | 相关性 | ≥ 0.7 |
| S - Originality | 原创性 | ≥ 0.6 |
| P - Consistency | 一致性 | ≥ 0.8 |
| I - Provability | 可验证性 | ≥ 0.7 |
| Overall | 综合评分 | ≥ 0.75 |

## 质量门禁流程

1. 编译后自动运行 KESPI 检查
2. 低于阈值的实体标记为"待优化"
3. 连续 3 次不通过则进入压缩队列
4. 90 天不活跃自动剪枝
`
  }
};

/**
 * 创建目录结构
 */
function createDirectories(baseDir) {
  console.log(`📁 创建目录结构: ${baseDir}\n`);
  
  for (const dir of CONFIG.directories) {
    const fullPath = path.join(baseDir, dir);
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`   ✓ ${dir}/`);
  }
  
  console.log('\n✅ 目录结构创建完成\n');
}

/**
 * 创建基础文件
 */
function createFiles(baseDir) {
  console.log('📄 创建基础文件...\n');
  
  for (const [file, content] of Object.entries(CONFIG.files)) {
    const filePath = path.join(baseDir, file);
    const dir = path.dirname(filePath);
    
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log(`   ✓ ${file}`);
  }
  
  console.log('\n✅ 基础文件创建完成\n');
}

/**
 * 初始化 Git
 */
function initGit(baseDir) {
  console.log('🔧 初始化 Git...\n');
  
  try {
    execSync('git init', { cwd: baseDir, stdio: 'ignore' });
    console.log('   ✓ Git 仓库已初始化');
    
    // 创建 .gitignore
    const gitignore = `node_modules/
*.log
.DS_Store
Thumbs.db
`;
    fs.writeFileSync(path.join(baseDir, '.gitignore'), gitignore, 'utf8');
    console.log('   ✓ .gitignore 已创建');
    
    // 首次 commit
    execSync('git add -A', { cwd: baseDir, stdio: 'ignore' });
    execSync('git commit -m "chore: initial knowledge base setup" --no-verify', {
      cwd: baseDir,
      stdio: 'ignore'
    });
    console.log('   ✓ 首次提交完成\n');
    
  } catch (e) {
    console.log('   ⚠️  Git 初始化跳过（可能不是 git 仓库）\n');
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const paths = args.filter(a => !a.startsWith('--'));
  const targetDir = paths[0] || '.';
  const withGit = flags.includes('--git');
  
  const baseDir = path.resolve(targetDir);
  
  console.log('🧬 aing 知识库初始化\n');
  console.log(`📍 目标目录: ${baseDir}\n`);
  
  // 创建目录
  createDirectories(baseDir);
  
  // 创建文件
  createFiles(baseDir);
  
  // 初始化 Git
  if (withGit) {
    initGit(baseDir);
  }
  
  console.log('🎉 知识库初始化完成！');
  console.log('\n📋 下一步:');
  console.log('   1. 放入原始资料到 raw/ 目录');
  console.log('   2. 运行编译: node src/compile.js');
  console.log('   3. 运行代谢: node src/run-metabolism.js');
}

main();
