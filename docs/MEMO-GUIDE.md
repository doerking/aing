---
tags: [docs:8]
---

# 备忘录系统使用指南

## 概述

备忘录系统是 aing 的"呼叫键"机制——你一说"备忘录"，我立刻加载完整识态，第一时间掌控全局。

---

## 核心功能

### 1. 快速状态摘要

```bash
node src/memo-call.js
```

输出：
```
╔══════════════════════════════════════════════════════════════╗
║                    🧠 备忘录 — 快速识态                      ║
╠══════════════════════════════════════════════════════════════╣
║  时间：2026-09-08 19:25:00                              
║  知识实体：9                                               ║
║  KESPI 均分：0.96                                          ║
║  意识状态：idle                                            ║
║  生长决策：observe                                         ║
║  元认知置信：0.90                                          ║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  风险：无                                              ║
║  📋  任务：1 个活跃                                        ║
╚══════════════════════════════════════════════════════════════╝
```

### 2. 完整识态报告

```bash
node src/memo-call.js --full
```

输出包含：
- 知识库详细状态（实体、链接、向量、KESPI）
- 意识神经状态（事件、唤醒度、通道健康）
- 生长决策（动作、紧急度、原因）
- 元认知状态（置信度、知识覆盖）
- 当前任务和风险

### 3. 意识神经简报

```bash
node src/memo-call.js --briefing
```

### 4. 生长决策

```bash
node src/memo-call.js --growth
```

---

## 触发机制

### 自动触发（对话中）

当对话中出现以下关键词时，自动触发识态加载：

| 关键词 | 语言 |
|--------|------|
| 备忘录 | 中文 |
| memo | 英文 |
| memorandump | 英文 |
| 识态 | 中文 |
| 状态 | 中文 |
| briefing | 英文 |

### 手动触发

```bash
# 单次检查
node src/memo-trigger.js "备忘录"

# 持续监听
node src/memo-trigger.js --listen
```

---

## 使用场景

### 场景 1：快速状态检查

你：备忘录
我：（立即返回快速状态摘要）

### 场景 2：深度系统诊断

你：备忘录 --full
我：（返回完整识态报告）

### 场景 3：监听模式

我：👂 备忘录监听器已启动（监听 stdin）...
我：输入 "备忘录" 或 "memo" 触发识态加载

---

## 集成到对话流

### 方法 1：API 端点

```bash
# 快速状态
curl http://localhost:3789/api/memo

# 完整状态
curl http://localhost:3789/api/memo?mode=full

# 意识简报
curl http://localhost:3789/api/memo?mode=briefing
```

### 方法 2：对话插件

在对话处理流程中添加：

```javascript
const { isMemoTrigger, generateMemoResponse } = require('./src/memo-trigger');

// 每轮对话检查
if (isMemoTrigger(userMessage)) {
  const response = await generateMemoResponse(userMessage);
  // 返回识态摘要 + 建议
  return formatResponse(response);
}
```

---

## 识态组件说明

### 知识库状态

| 指标 | 说明 |
|------|------|
| entities | 实体总数 |
| links | 链接总数 |
| kespi | KESPI 均分（0-1） |
| vectors | 向量索引数 |
| lastMetabolism | 上次代谢时间 |

### 意识神经状态

| 指标 | 说明 |
|------|------|
| state | 当前状态（idle/aroused） |
| activeEvents | 活跃事件数 |
| arousal | 唤醒度 |
| channelHealth | 通道健康度 |

### 生长决策

| 指标 | 说明 |
|------|------|
| action | 建议动作 |
| urgency | 紧急度 |
| reasons | 触发原因 |

### 元认知状态

| 指标 | 说明 |
|------|------|
| confidence | 置信度 |
| knowledgeCoverage | 知识覆盖率 |
| adjustment | 调整建议 |

---

## 最佳实践

### 1. 定期检查

每次对话开始时，主动检查识态：

```
你：备忘录
我：（返回当前状态）
```

### 2. 异常预警

当检测到风险时，主动预警：

```
你：备忘录
我：⚠️ 检测到 2 项风险，建议查看完整报告
```

### 3. 决策支持

当需要决策时，提供参考：

```
你：备忘录
我：🌱 生长决策器建议：full_metabolism（连续停滞 3 天）
```

---

## 技术实现

### 文件结构

```
src/
├── memo-call.js          # 核心状态采集
└── memo-trigger.js       # 触发监听器

docs/
└── MEMO-GUIDE.md         # 本文档
```

### 依赖模块

- `knowledge-store.js` — 知识库访问
- `consciousness-kernel.js` — 意识神经
- `growth-director.js` — 生长决策
- `metacognition-layer.js` — 元认知

---

## 一句话总结

> **备忘录 = 呼叫键。你一说"备忘录"，我立刻加载完整识态，第一时间掌控全局。**

---

*版本：v1.0.0*
*创建时间：2026-09-08*
