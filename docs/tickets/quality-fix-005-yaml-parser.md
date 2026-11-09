---
tags: [ticket, quality, fix, yaml, parse, tickets:8]
priority: P2
status: open
created: 2026-09-08
source: deep-analysis-report
---

# 工单 #005：YAML 解析升级

## 问题描述

**现状**：`compile.js` 使用手写简易 YAML 解析器，仅支持简单键值对。

```javascript
function parseYAML(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      // 仅支持简单类型
    }
  }
  return result;
}
```

**问题**：
- 不支持嵌套结构（`tags: [a, b]` 解析错误）
- 不支持多行字符串
- 不支持注释
- 边界 case 处理不完善

## 影响范围

- raw/*.md 文件的 frontmatter 解析
- 复杂标签、数组、对象无法正确入库
- 用户输入格式限制

## 修复方案

### 方案 A：引入 js-yaml 库（推荐）

```bash
npm install js-yaml
```

```javascript
// compile.js
const yaml = require('js-yaml');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content };
  
  try {
    const metadata = yaml.load(match[1]); // 完整 YAML 解析
    const body = match[2].trim();
    return { metadata, content: body };
  } catch (e) {
    console.error(`⚠️  YAML 解析失败: ${e.message}`);
    return { metadata: {}, content };
  }
}
```

### 方案 B：保留手写解析器 + 增强

```javascript
function parseYAML(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let currentKey = null;
  let currentArray = null;
  
  for (const line of lines) {
    // 处理数组开始
    if (line.match(/^\s*-\s/)) {
      if (!currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
      }
      currentArray.push(line.replace(/^\s*-\s*/, '').trim());
      continue;
    }
    
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      currentKey = key;
      
      // 处理内联数组
      if (value.startsWith('[') && value.endsWith(']')) {
        result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
        currentArray = null;
      } else {
        result[key] = value.replace(/['"]/g, '');
        currentArray = null;
      }
    }
  }
  
  return result;
}
```

## 验收标准

- [ ] 支持嵌套对象解析
- [ ] 支持数组解析（`tags: [a, b, c]`）
- [ ] 支持多行字符串
- [ ] 向后兼容旧格式
- [ ] 添加单元测试

## 优先级

**P2** — 功能增强，不阻塞核心流程

## 负责人

待定

## 截止日期

2026-10-15

---

*来源：deep-analysis-report（2026-09-08）*
*关联：compile.js, auto-ingest.js*
