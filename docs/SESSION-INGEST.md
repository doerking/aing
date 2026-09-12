# 会话完整入库系统

## 核心问题

之前的 `auto-ingest.js` 只入库了用户消息，没有入库 Agent 的分析和答复。

**问题**：用户的知识积累只记录了"我问了什么"，没有记录"我学到了什么"。

---

## 解决方案

创建 `session-ingest.js`，完整入库对话双方内容：

| 内容 | 入库 |
|------|------|
| 用户消息 | ✅ |
| Agent 分析 | ✅ |
| Agent 答复 | ✅ |
| 实体提取 | ✅ |
| 标签提取 | ✅ |

---

## 使用方式

### 方式 1：管道输入

```bash
echo '{"sessionId":"user-123","role":"user","content":"帮我研究 aing"}' | node src/session-ingest.js
echo '{"sessionId":"user-123","role":"assistant","content":"aing 是知识代谢引擎..."}' | node src/session-ingest.js
```

### 方式 2：文件输入

```bash
node src/session-ingest.js --file session.json
```

### 方式 3：集成到对话流

```javascript
const { SessionStore } = require('./src/session-ingest');

const store = new SessionStore();

// 用户消息
store.addMessage('session-123', {
  role: 'user',
  content: '帮我研究 aing'
});

// Agent 分析
store.addMessage('session-123', {
  role: 'assistant',
  content: 'aing 是交叉时态双脑知识代谢引擎...'
});

// 自动入库（达到阈值或手动触发）
store.ingestSession('session-123');
```

---

## 入库格式

```markdown
---
name: 会话-2026-09-08T19:41:00
type: Conversation
tags: [aing, 知识代谢, 双脑]
status: active
confidence: 0.9
source: hermes-session
sourceType: conversation
distillationStatus: pending
created: "2026-09-08T19:41:00Z"
messageCount: 2
---

# 会话-2026-09-08

## 蒸馏摘要
待 Agent 蒸馏

## 消息记录

### 👤 用户
帮我研究 aing

### 🤖 Agent
aing 是交叉时态双脑知识代谢引擎，核心设计包括：
- 秩序脑：编译入库
- 生长脑：发芽授粉
- KESPI 八维评估

## 提取实体
- aing
- 知识代谢
- 双脑架构
- KESPI

## 标签
[tag:aing]
[tag:知识代谢]
[tag:双脑]
```

---

## 与 auto-ingest.js 的关系

| 模块 | 职责 |
|------|------|
| `auto-ingest.js` | 基础会话存储、去重、触发代谢 |
| `session-ingest.js` | 完整对话入库（用户+Agent） |

**建议**：使用 `session-ingest.js` 替代 `auto-ingest.js` 作为主要入库入口。

---

## 一句话

> **用户和 Agent 的对话双方都应入库。分析、答复、决策过程都是知识资产。**

---

*版本：v1.0.0*
*创建时间：2026-09-08*
