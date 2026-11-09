---
tags: [docs:8]
---

# NER 集成指南

## 现状
auto-ingest.js 实体提取仅用正则（## xxx, [[xxx]], **xxx**），NER 能力弱。

## 集成方案
使用 @xenova/transformers.js 的 NER pipeline：

```bash
# 安装依赖
npm install @xenova/transformers

# 下载模型（走 hf-mirror 镜像）
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
