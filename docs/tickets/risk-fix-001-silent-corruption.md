---
tags: [ticket, risk, fix, c7, patch-layer]
priority: P0
status: open
created: 2026-09-08
source: deep-analysis-report
---

# 工单 #001：静默腐坏风险（C7 补丁层指纹）

## 问题描述

**历史事故（09-07）**：补丁层 v3 重放时缺失 v1 定义，导致 `markEntityKespiComputed`/`hasDistillation` 引用悬空。错误被 `try/catch` 吞掉，面板照样显示 ALL GREEN，造成"假全绿"。

**根因**：同源性验证（C7a）只证明输入血缘，对补丁层完整性零证明力。C1-C6 全是环境/结构检查，DB 与 wiki 静默分叉时照样全绿。

## 影响范围

- 部署验收可能假阳性
- 补丁层不完整时静默失败
- 运行时产品状态不可信

## 修复方案

### 方案 A：负向测试门禁（推荐）

```javascript
// verify-deploy.js 新增 C7-negative 检查
function testSilentCorruption() {
  // 1. 注入一个缺失定义的补丁
  // 2. 运行代谢
  // 3. 确认门禁会红（exit code 1）
  // 4. 清除腐坏，确认恢复绿
}
```

### 方案 B：补丁层指纹验证

```javascript
// 枚举全部座舱层的 patch 清单
const patchLayers = ['v1', 'v2', 'v3'];
for (const layer of patchLayers) {
  const defs = extractDefinitions(layer);
  const calls = extractCallSites(layer);
  if (defs.length === 0) throw new Error(`v1 defs missing in layer ${layer}`);
  for (const call of calls) {
    if (!defs.includes(call.name)) throw new Error(`Undefined reference: ${call.name}`);
  }
}
```

### 方案 C：运行时断言增强

```javascript
// consciousness-kernel.js 添加定义检查
function ensureDefinitionsLoaded() {
  const required = ['markEntityKespiComputed', 'hasDistillation'];
  for (const name of required) {
    if (typeof global[name] !== 'function') {
      throw new Error(`Missing required definition: ${name}`);
    }
  }
}
```

## 验收标准

- [ ] 注入腐坏样本后，verify-deploy.js 返回红色
- [ ] 清除腐坏后，verify-deploy.js 恢复绿色
- [ ] 补丁层指纹验证通过（v1→v3 定义完整性）
- [ ] 运行时断言生效（缺失定义立即报错）

## 优先级

**P0** — 直接影响部署可信度，必须修复

## 负责人

待定

## 截止日期

2026-09-15

---

*来源：deep-analysis-report（2026-09-08）*
*关联：AGENTS.md Pitfall 7, verify-deploy.js C7*
