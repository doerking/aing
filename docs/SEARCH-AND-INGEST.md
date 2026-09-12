# 搜索即入库系统（Search & Ingest）

## 核心理念

**用户和 Agent 之间最珍贵的资产是"资料收集 + 显示"这个过程。**

每次搜索、读取、研究，结果自动入库，成为持久知识。

---

## 流程

```
你：帮我搜索 "aing 知识代谢"
    ↓
我：执行搜索
    ↓
我：显示结果给你
    ↓
我：自动入库到 aing
    ↓
结果：成为知识网络的一部分
```

**你不需要说"入库"，我说"搜索"时就已经在入库了。**

---

## 使用方式

### 1. 搜索并入库

```bash
node src/search-and-ingest.js "aing 知识代谢" 5
```

### 2. Web 搜索并入库

```bash
node src/search-and-ingest.js --web "AI agents memory"
```

### 3. 读取网页并入库

```bash
node src/search-and-ingest.js --page "https://example.com/article"
```

---

## 入库内容

每次搜索/读取后，自动生成：

```markdown
---
tags: [search, research]
source: search
query: "aing 知识代谢"
created: 2026-09-08T19:39:00Z
---

# 搜索记录: aing 知识代谢

## 查询

搜索词: aing 知识代谢

## 结果摘要

### 1. aing 知识代谢引擎介绍 (95.2%)
**URL:** https://example.com/aing
**摘要:** aing 是交叉时态双脑知识代谢引擎...
**相关度:** 95.2%

### 2. ...

## 实体提取
*待代谢后填充*

## 标签
- search
- research
```

---

## 技术实现

### 文件位置
- `src/search-and-ingest.js` — 核心模块
- `docs/SEARCH-AND-INGEST.md` — 本文档

### 入库流程

1. **搜索执行** — 调用搜索工具
2. **结果解析** — 提取标题、URL、摘要、相关度
3. **Markdown 生成** — 格式化输出
4. **文件写入** — 保存到 `raw/search-*.md`
5. **触发代谢** — 自动编译→导入→向量索引

### 自动入库触发点

| 操作 | 触发入库 |
|------|---------|
| `web_search` | ✅ 自动 |
| `read_webpage` | ✅ 自动 |
| `image_search` | ✅ 自动 |
| `encyclopedia_search` | ✅ 自动 |
| `entity_search` | ✅ 自动 |

---

## 价值

### 对 Agent

- 每次搜索都积累知识
- 历史检索可复用
- 形成个人知识图谱

### 对用户

- 无需手动保存
- 搜索结果自动沉淀
- 下次直接检索，无需重复搜索

### 对 aing

- 知识库持续增长
- 语义网络不断扩展
- 代谢流水线有持续输入

---

## 示例

### 场景 1：研究某个主题

```
你：帮我研究一下 aing 的知识代谢架构
    ↓
我：
  1. 搜索 "aing 知识代谢 架构"
  2. 显示 5 条结果
  3. 自动入库到 raw/search-*.md
  4. 触发代谢，成为知识网络的一部分
  
下次你问 "aing 架构" 时，我可以直接检索这次的研究结果。
```

### 场景 2：读取某篇文章

```
你：帮我看一下这篇文章 https://example.com/ai-memory
    ↓
我：
  1. 读取网页内容
  2. 显示摘要
  3. 自动入库到 raw/webpage-*.md
  4. 提取实体和标签
  
文章成为 aing 的知识资产。
```

---

## 一句话总结

> **搜索即入库。用户和 Agent 之间最珍贵的资产是资料收集 + 显示这个过程，每次检索都自动沉淀为知识。**

---

*版本：v1.0.0*
*创建时间：2026-09-08*
