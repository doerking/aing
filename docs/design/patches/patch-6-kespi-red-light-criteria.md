---
tags: [design-docs:8]
---

# KESPI 自检红灯定义 | KESPI Red Light Criteria

> 补现有 Wiki「自检层」章节的留白。明确 KESPI 触发红灯的具体指标和阈值。

## KESPI 指标体系

KESPI（Knowledge Engine Self-Protection Index）是双脑系统的健康度自检引擎，通过以下**四维指标**评估系统状态：

### 1. 矛盾密度（Contradiction Density）

```
矛盾密度 = 活跃矛盾数 / 总知识页数
```

| 状态 | 阈值 | 处理 |
|------|------|------|
| 绿灯 | ≤ 0.5% | 正常代谢 |
| 黄灯 | 0.5% ~ 2.0% | 增加 Lint 频率至每日两次 |
| **红灯** | **> 2.0%** | 暂停所有生长任务，启动矛盾消解流程 |

### 2. 断裂边比例（Broken Link Ratio）

```
断裂边比例 = 指向不存在页面的链接数 / 总链接数
```

| 状态 | 阈值 | 处理 |
|------|------|------|
| 绿灯 | ≤ 1% | 正常代谢 |
| 黄灯 | 1% ~ 5% | 启动孤儿页面修复流程 |
| **红灯** | **> 5%** | 暂停 Sprouting，优先修复断裂边 |

### 3. 再生失败率（Regeneration Failure Rate）

```
再生失败率 = 连续30天内transplant_readiness未达标次数 / 总再生尝试次数
```

| 状态 | 阈值 | 处理 |
|------|------|------|
| 绿灯 | ≤ 30% | 正常代谢 |
| 黄灯 | 30% ~ 60% | 降低 Sprouting 频率，收紧 Mustard Seed 压缩策略 |
| **红灯** | **> 60%** | 暂停芥子组培流程，审查压缩器质量 |

### 4. 知识新鲜度（Knowledge Freshness）

```
知识新鲜度 = 近7天新增知识 / 总知识页数
```

| 状态 | 阈值 | 处理 |
|------|------|------|
| 绿灯 | ≥ 0.5% | 正常代谢 |
| 黄灯 | 0.1% ~ 0.5% | 提示用户增加原始素材摄入 |
| **红灯** | **< 0.1%** | 启动主动探索模式，Agent 自主寻找新素材 |

## 红灯触发规则

- **单指标红灯**：该指标对应的代谢模块暂停，其他模块正常运行
- **双指标红灯**：所有生长任务暂停，仅保留 Lint 和 Decay
- **三指标及以上红灯**：系统进入「保守模式」，仅执行 Ingest 和 Query，所有代谢操作挂起

## 恢复机制

| 条件 | 处理 |
|------|------|
| 红灯指标连续3天低于黄灯阈值 | 自动恢复绿灯 |
| 红灯指标连续7天低于黄灯阈值 | 发送恢复通知，标记自检通过 |
| 人工干预后指标改善 | 立即恢复对应模块 |

## 日志格式

```markdown
## [2026-07-16T14:00:00Z] kespi | snapshot
- contradiction_density: 0.8% [YELLOW]
- broken_link_ratio: 1.2% [YELLOW]
- regeneration_failure_rate: 15% [GREEN]
- knowledge_freshness: 0.3% [YELLOW]
- overall_status: YELLOW (3 indicators)
- actions_taken: Increased lint frequency to 2x/day
```

---

*版本：v1.0 | 日期：2026-07-16*
