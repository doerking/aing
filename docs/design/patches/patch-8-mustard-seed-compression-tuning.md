---
tags: [design-docs:8]
---

# 芥子压缩差异化策略 | Mustard Seed Compression Tuning

> 补现有 Wiki「代谢层」章节的留白。明确 500 tokens 压缩上限的领域差异化调参方案。

## 默认压缩策略

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大压缩比 | 10:1 | 原始内容 : 压缩后内容 |
| 绝对上限 | 500 tokens | 单条芥子内容的 token 上限 |
| 最小保留率 | 70% | 压缩后必须保留原始信息的最低百分比 |
| 领域标签数 | 3-5 个 | 每条芥子关联的 domain_tags |

## 领域差异化调参

不同领域的知识特性不同，统一 500 tokens 上限不够灵活。以下是按领域的差异化配置：

| 领域 | 压缩上限 | 压缩比 | 说明 |
|------|---------|--------|------|
| **事实型**（Fact） | 200 tokens | 15:1 | 事实信息密集，可大幅压缩 |
| **方法型**（Methodology） | 800 tokens | 5:1 | 步骤和细节重要，需保留更多上下文 |
| **概念型**（Concept） | 600 tokens | 8:1 | 定义和关系需要一定篇幅 |
| **规则型**（Rule） | 300 tokens | 12:1 | 规则通常简洁，压缩率高 |
| **对比型**（Comparison） | 1000 tokens | 4:1 | 对比需要保留双方特征 |
| **通用**（General） | 500 tokens | 8:1 | 默认策略 |

## 调参依据

### 压缩上限确定因素

1. **信息密度**：事实类信息密度高，可压缩；方法论需要步骤描述，压缩空间小
2. **上下文依赖**：高上下文依赖的知识（如算法推导）不适合过度压缩
3. **检索频率**：高频检索的知识保留更多细节，低频知识可大胆压缩

### 压缩质量评估

压缩后的芥子内容必须通过以下三项检验：

| 检验项 | 要求 | 不通过的处置 |
|--------|------|-------------|
| **信息完整性** | 原始核心信息保留率 ≥ 70% | 降低压缩比，重新压缩 |
| **语义一致性** | 压缩后语义与原意偏差 ≤ 10% | 人工审核，标记为低置信度 |
| **可检索性** | 压缩后仍可被关键词和向量检索命中 | 调整 domain_tags，补充锚点关键词 |

## 人工调参接口

用户可以通过以下方式调整特定领域的压缩策略：

```json
{
  "compression_profiles": {
    "methodology": {
      "max_tokens": 1000,
      "max_ratio": 4:1,
      "min_retention": 75%
    },
    "fact": {
      "max_tokens": 150,
      "max_ratio": 20:1,
      "min_retention": 65%
    }
  }
}
```

## 压缩日志格式

```markdown
## [2026-07-16T14:00:00Z] mustard_seed | compression
- Source: wiki/entities/transformer-attention-mechanism.md
- Domain: methodology
- Original tokens: 3200
- Compressed tokens: 620 (ratio 5.2:1)
- Retention rate: 78%
- Confidence: high
- jiezi_id: jiezi_20260716_001
```

---

*版本：v1.0 | 日期：2026-07-16*
