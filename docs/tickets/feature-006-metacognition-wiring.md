---
tags: [ticket, feature, metacognition, phase-2.6, tickets:8]
priority: P2
status: open
created: 2026-09-08
source: deep-analysis-report, green-list
---

# 工单 #006：元认知接线（Phase 2.6）

## 问题描述

**现状**：`metacognition-layer.js` 组件在库，但未接入代谢管线，仅 advisory（建议不执行）。

**GREEN-LIST 状态**：⬜ 元认知接管线（Phase 2.6） — 组件在库未接代管

**影响**：
- 无法自动调参（threshold auto-tuning）
- 代谢策略固定，无法自优化
- 与"自己养自己"愿景有差距

## 影响范围

- `metacognition-layer.js`（现有）
- `growth-director.js`（决策器）
- `run-metabolism.js`（代谢主循环）
- `growth.config.js`（阈值配置）

## 修复方案

### 方案 A：接线到 GrowthDirector（推荐）

```javascript
// growth-director.js
async perceive() {
  // ... 现有逻辑 ...
  
  // 新增：元认知自检
  const metaReview = this.metacognition.reviewConsciousness(signals);
  if (metaReview.adjustments) {
    this._applyAdjustments(metaReview.adjustments);
  }
}

_applyAdjustments(adjustments) {
  for (const [key, value] of Object.entries(adjustments)) {
    if (this._isSafeToAdjust(key)) {
      this._updateThreshold(key, value);
    }
  }
}

_isSafeToAdjust(key) {
  // B5 治理红线：禁止自修改回路
  const safeKeys = ['kespi.greenLight', 'kespi.yellowLight', 'triPath.exploreAgree'];
  return safeKeys.includes(key);
}
```

### 方案 B：元认知输出到简报

```javascript
// consciousness-layer.js
generateBriefing() {
  const briefing = this._collectSignals();
  
  // 新增：元认知建议
  const metaSuggestions = this.metacognition.generateSuggestions(briefing);
  
  return {
    ...briefing,
    metacognition: {
      suggestions: metaSuggestions,
      requiresApproval: true, // 不自动执行
      confidence: 0.75
    }
  };
}
```

### 方案 C：阈值热重载

```javascript
// growth.config.js
fs.watch(CONFIG_PATH, () => {
  delete require.cache[require.resolve('./growth.config')];
  console.log('✅ 配置热重载');
});
```

## 验收标准

- [ ] 元认知建议输出到简报
- [ ] 阈值调整需人工审批（非自动）
- [ ] B5 治理红线检查（禁止自修改回路）
- [ ] 单元测试覆盖元认知逻辑
- [ ] GREEN-LIST 更新为绿灯

## 优先级

**P2** — 功能增强，不阻塞核心流程

## 负责人

待定

## 截止日期

2026-10-30

---

*来源：deep-analysis-report（2026-09-08）*
*关联：GREEN-LIST.md, AGENTS.md 纪律 #3（禁止伪勾选）*
