# 芥子组培完整逻辑 | Mustard Seed & Tissue Culture

> 补现有 Wiki「Growth Brain / 生长脑」章节的过程定义留白。明确低频知识 → 芥子 → 再生资产的完整链路。

## 1. 核心 Schema 定义

```sql
-- 芥子表：存储压缩后的微观知识单元
CREATE TABLE jiezi (
    id TEXT PRIMARY KEY,
    source_link_id TEXT REFERENCES links(id), -- 关联的原有知识边
    compressed_content TEXT NOT NULL, -- 压缩后的核心信息（≤500 tokens）
    domain_tags JSON NOT NULL, -- 所属领域标签（用于跨域授粉匹配）
    transplant_readiness REAL DEFAULT 0.0, -- 移植就绪度（0~1，≥0.75可进入有用队列）
    regen_count INTEGER DEFAULT 0, -- 已再生次数（上限3次）
    cooldown_until DATE, -- 再生冷却截止日（30/90/365天梯度）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 元知识胶囊表：芥子匹配的锚点
CREATE TABLE meta_knowledge_capsule (
    id TEXT PRIMARY KEY,
    capsule_type TEXT NOT NULL, -- 胶囊类型：methodology/concept/fact/rule
    anchor_keywords JSON NOT NULL, -- 锚点关键词（用于芥子匹配）
    confidence_threshold REAL DEFAULT 0.7, -- 准入置信度阈值
    valid_to DATE -- 有效期（过期自动触发再生）
);
```

## 2. 组培全流程

```
低频旧知识（≥30天无访问）
    ↓
芥子压缩器（Mustard Seed Compressor）
    ↓ 提取核心信息，剔除冗余，压缩至≤500tokens
    ↓
匹配元知识胶囊（按anchor_keywords命中）
    ↓
生成jiezi记录，transplant_readiness初始值=0.3
    ↓
KESPI周期性评估（每周一次）
    ↓ 达标（transplant_readiness≥0.75）
进入有用知识队列，可被检索/调用
    ↓ 未达标
继续冷却，等待下一次授粉/再生
```

## 3. 再生冷却规则

| 已再生次数 | 冷却期 | 说明 |
|-----------|--------|------|
| 0 次 | 30 天 | 首次再生，快速验证有效性 |
| 1 次 | 90 天 | 二次再生，延长验证周期 |
| ≥2 次 | 365 天 | 多次再生无效，标记为永久归档，不再参与代谢 |

---

*版本：v1.0 | 日期：2026-07-16*
