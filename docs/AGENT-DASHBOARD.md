---
tags: [docs:8]
---

# aing Agent 控制面板

一站式知识库管理面板，集成会话入库、语义检索、意识神经和生长决策。

## 快速启动

```bash
# 本机模式（无认证）
node src/agent-dashboard.js

# 指定端口
node src/agent-dashboard.js --port 8080

# 启用认证
node src/agent-dashboard.js --port 3789 --api-key your-secret-key

# 或使用脚本
./scripts/dashboard.sh 3789 my-secret
.\scripts\dashboard.ps1 3789 my-secret
```

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/status` | GET | 知识状态 |
| `/api/entities` | GET | 实体列表 |
| `/api/entity/<id>` | GET | 实体详情 |
| `/api/query?q=...` | GET | 语义检索 |
| `/api/ingest` | POST | 会话入库 |
| `/api/briefing` | GET | 意识简报 |
| `/api/deliberate` | POST | 维护决策 |
| `/api/growth-decision` | GET | 生长决策 |
| `/api/metacognition` | GET | 元认知状态 |
| `/api/consciousness` | GET | 意识神经状态 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `KB_ROOT` | `.` | 知识库根目录 |
| `AING_API_PORT` | `3789` | API 端口 |
| `AING_API_KEY` | `null` | API 密钥（启用认证） |

## 使用示例

### 入库会话

```bash
curl -X POST http://localhost:3789/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "agentId": "hermes",
    "messages": [
      {"role": "user", "content": "今天天气怎么样？"},
      {"role": "assistant", "content": "今天晴天，25 度"}
    ]
  }'
```

### 语义检索

```bash
curl "http://localhost:3789/api/query?q=知识代谢&limit=5"
```

### 查看意识简报

```bash
curl http://localhost:3789/api/briefing
```

### 获取生长决策

```bash
curl http://localhost:3789/api/growth-decision
```

## 组件说明

- **HermesAingAdapter**: 会话入库 + 检索 + 简报
- **ConsciousnessKernel**: 意识神经协调层
- **GrowthDirector**: 生长决策器（前额叶）
- **MetacognitionLayer**: 元认知三层模型

## 认证模式

- **本机模式**: 未设置 `AING_API_KEY`，所有请求无需认证
- **认证模式**: 设置 `AING_API_KEY`，所有请求需要 `Authorization: Bearer <key>`
