---
tags: [docs:8]
---

# YAML 解析升级指南

## 现状
compile.js 使用手写简易 YAML 解析器，仅支持简单键值对。

## 升级方案
引入 js-yaml 库：

```bash
npm install js-yaml
```

```javascript
// compile.js
const yaml = require('js-yaml');

function parseFrontmatter(content) {
  const match = content.match(/^---
([sS]*?)
---
([sS]*)$/);
  if (!match) return { metadata: {}, content };
  
  try {
    const metadata = yaml.load(match[1]);
    const body = match[2].trim();
    return { metadata, content: body };
  } catch (e) {
    console.error('YAML 解析失败：' + e.message);
    return { metadata: {}, content };
  }
}
```
