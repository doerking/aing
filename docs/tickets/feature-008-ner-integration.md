---
tags: [ticket, feature, ner, auto-ingest, transformers, tickets:8]
priority: P2
status: open
created: 2026-09-08
source: deep-analysis-report
---

# 工单 #008：NER 集成

## 问题描述

**现状**：`auto-ingest.js` 实体提取仅用正则（`## xxx`, `[[xxx]]`, `**xxx**`），NER 能力弱。

**影响**：
- 蒸馏质量依赖外部 Agent
- 无法自动识别专业术语、人名、地点
- 实体标准化能力不足

## 影响范围

- `src/auto-ingest.js`（实体提取；主线入库家族唯一持有 `extractEntities` 正则抽取器）
- `models/`（NER 模型）

## 修复方案

### 方案 A：集成 transformers.js NER pipeline（推荐）

```bash
# 下载 NER 模型
powershell -ExecutionPolicy Bypass -File setup-ner.ps1
```

```javascript
// src/auto-ingest.js
const { pipeline } = require('@xenova/transformers');

class EntityExtractor {
  constructor() {
    this.nerPipeline = null;
  }
  
  async init() {
    this.nerPipeline = await pipeline(
      'token-classification',
      'Xenova/bert-base-multilingual-cased-ner-hrl'
    );
  }
  
  async extract(content) {
    if (!this.nerPipeline) await this.init();
    
    const results = await this.nerPipeline(content);
    const entities = results
      .filter(r => r.entity && !r.entity.startsWith('O'))
      .map(r => ({
        text: r.word,
        type: r.entity.replace('B-', '').replace('I-', ''),
        confidence: r.score
      }));
    
    return entities;
  }
}
```

### 方案 B：混合提取策略

```javascript
async extractEntities(content, session) {
  const entities = new Set();
  const tags = new Set();
  
  // 1. 正则提取（快速，高置信度）
  const regexEntities = this._extractByRegex(content);
  entities.addAll(regexEntities);
  
  // 2. NER 提取（慢，补充专业术语）
  if (this.nerPipeline) {
    const nerEntities = await this._extractByNER(content);
    entities.addAll(nerEntities.filter(e => !regexEntities.has(e.text)));
  }
  
  // 3. 标签提取
  const tagMatches = content.match(/#([\w-]+)/g);
  if (tagMatches) {
    tagMatches.forEach(t => tags.add(t.slice(1)));
  }
  
  session.entities.addAll(entities);
  session.tags.addAll(tags);
}
```

### 方案 C：蒸馏透传（现有机制增强）

```javascript
// POST /api/ingest 支持 distillation 字段
{
  "sessionId": "xxx",
  "messages": [{"role": "user", "content": "..."}],
  "distillation": {
    "entities": [
      {"name": "张三", "type": "Person", "confidence": 0.95},
      {"name": "北京", "type": "Location", "confidence": 0.92}
    ],
    "tags": ["person", "location"]
  }
}
```

## 验收标准

- [ ] NER 模型可下载（hf-mirror 镜像）
- [ ] 实体提取准确率 > 80%（对比人工标注）
- [ ] 提取延迟 < 500ms（本地模型）
- [ ] 向后兼容正则提取
- [ ] 文档更新（AUTO-INGEST.md）

## 优先级

**P2** — 功能增强，依赖外部模型

## 负责人

待定

## 截止日期

2026-10-30

---

*来源：deep-analysis-report（2026-09-08）*
*关联：auto-ingest.js, @xenova/transformers*
