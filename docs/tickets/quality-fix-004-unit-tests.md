---
tags: [ticket, quality, fix, test, coverage, tickets:8]
priority: P1
status: open
created: 2026-09-08
source: deep-analysis-report
---

# 工单 #004：单元测试覆盖

## 问题描述

**现状**：项目无单元测试，仅靠影子回归和 verify-deploy.js 门禁。

**风险**：
- 重构时回归风险高
- 边界条件未被覆盖
- 文档与实现可能漂移

## 影响范围

- 所有核心模块（compile, kespi-check, tri-path-orchestrator）
- 部署门禁可信度
- 开发者信心

## 修复方案

### 方案 A：添加 Jest 测试套件（推荐）

```bash
npm install --save-dev jest
```

```javascript
// tests/compile.test.js
const { compile } = require('../src/compile.js');
const fs = require('fs');
const path = require('path');

describe('compile.js', () => {
  test('should compile raw/*.md to wiki/entities/*.md', () => {
    // 测试逻辑
  });
  
  test('should skip unmodified files', () => {
    // 测试增量编译
  });
  
  test('should extract wikilinks', () => {
    // 测试链接提取
  });
});
```

### 方案 B：测试核心模块优先级

| 模块 | 优先级 | 测试重点 |
|------|--------|----------|
| `compile.js` | P0 | 文件编译、链接提取、frontmatter 解析 |
| `kespi-check.js` | P0 | 八维计算、阈值判定、历史写入 |
| `tri-path-orchestrator.js` | P1 | 三路裁决、熔断器状态机 |
| `auto-ingest.js` | P1 | 指纹去重、会话隔离 |
| `consciousness-kernel.js` | P2 | 事件去重、共振计算 |

### 方案 C：CI/CD 集成

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm test
```

## 验收标准

- [ ] Jest 测试套件配置完成
- [ ] compile.js 测试覆盖核心逻辑（>80%）
- [ ] kespi-check.js 测试覆盖八维计算
- [ ] tri-path-orchestrator 测试覆盖裁决逻辑
- [ ] CI/CD 集成测试流程
- [ ] 测试覆盖率报告生成

## 优先级

**P1** — 影响长期可维护性，需尽快完成

## 负责人

待定

## 截止日期

2026-09-30

---

*来源：deep-analysis-report（2026-09-08）*
*关联：项目整体质量，AGENTS.md 纪律 #2（双证据制度）*
