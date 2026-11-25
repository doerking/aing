---
tags: [aing-v2, deployment, 部署, 接线, must-read:8, deployment:8, ops:7]
description: aing-v2 部署与接线指南——用户拉取代码后的环境构建、Agent 意识神经接线（memo 读口 / 事件写口）、运维自检与关键路径映射
date: 2026-11-22
status: draft
---

# aing-v2 部署与接线指南 (Deployment Guide)

本指南描述用户拉取 `aing-v2` 代码后，如何快速构建环境并将其接入 Agent (如 Cindy/Pi) 的意识神经回路。

## 1. 快速部署 (Quick Start)

### 1.1 环境准备
- **Node.js**: v18+
- **依赖安装**:
  ```bash
  npm install
  ```

### 1.2 数据库初始化
`aing-v2` 默认使用 `sql.js` (SQLite WASM)。
- **真库位置**: `data/knowledge.db`
- **初始化**: 首次启动时，若 `data/` 目录下无数据库，系统将根据 `spec/` 规格自动初始化空库。
- **注意事项**: 数据库文件较大，请确保 `.gitignore` 已将其排除，勿将其提交至 Git。

### 1.3 运行验证
执行全量测试以确认部署环境正确：
```bash
npm test
# 预期结果: 179 档 / 1194 条断言 ALL GREEN
```

---

## 2. Agent 接线配置 (Harness Integration)

要让 Agent 能够使用 `aing-v2` 驱动其思维代谢，需在 Agent 的 `AGENTS.md` 或系统提示词中配置以下两个核心接线口：

### 2.1 读口：意识层备忘录 (Memo Briefing)
Agent 每次出场的第一步必须读取备忘录，以同步待办、健康状态与派单建议。

- **调用命令**:
  ```bash
  node src/cli.js memo --json
  ```
- **预期输出**: 一个包含 `user` (待办), `swarm` (派单), `pulse` (指标) 三块的 JSON 对象。
- **纪律**: 读表不扰表，严禁在读 memo 时执行写入操作。

### 2.2 写口：神经事件喂送 (Neural Event Feed)
当 Agent 完成关键动作（验证红绿、拍板落地、发现缺陷、收队）时，必须向引擎喂送事件。

- **调用方式 (PowerShell/Windows)**:
  由于 PowerShell 会剥离 JSON 字符串的引号，必须使用 `spawn` 模式（不经 shell）。
  **推荐使用 runner**:
  ```bash
  node .mimosa/feed-event-cli.js <event_file.json>
  ```
- **底层命令 (Unix/Bash)**:
  ```bash
  node src/neural.js event '{"channel":"anomaly","target":"task-123","source":"hana","strength":7,"note":"事实证据"}'
  ```
- **合法通道**: `structure`, `semantic`, `temporal`, `kespi`, `behavior`, `feedback`, `anomaly`, `intent`, `generic`。

---

## 3. 运维与自检 (Maintenance)

### 3.1 门禁验证 (Verify Deploy)
在进行版本升级或大规模重构后，运行门禁脚本检查 C0-C21 核心能力是否受损：
```bash
node verify-deploy.js
# 预期结果: 33 项 ALL GREEN
```

### 3.2 指标异常处置
若 `memo --json` 中的 `pulse` 出现异常，按以下对应动作处理：

| 指标 | 状态 | 处置动作 |
|---|---|---|
| `consciousness.state` | `stagnant` | `node src/run-metabolism.js` (触发代谢) |
| `distillDebt` | `> 0` | `node src/distill.js` (执行提炼) |
| `vectorSearch` | `offline` | `node src/index-vectors.js --semantic --reindex` |
| `health.verdict` | `degraded` | 检查 `reasons[]` 逐项修复 |

---

## 4. 关键路径映射 (Path Mapping)

- **核心逻辑**: `src/` (知识库、代谢引擎、API 接口)
- **命令行工具**: `src/cli.js` (统一入口)
- **辅助工具**: `tools/` (归档、报表、探针)
- **规格定义**: `spec/` (Source of Truth)
- **验证集**: `test/` (Baseline 与断言)
