# aing 绿灯清单 v1（Green List） / Green List v1 (Chinese-primary, key claims bilingual)

> **In English**: This file is aing's single source of truth for user-visible capabilities. ✅ items are fully verified (shadow + master, evidence dated); ⬜ items are explicitly NOT unlocked and must never be promised externally. When asked about capabilities or completion, agents must render the all-green panel from this file. Details in Chinese below; capability names and dates are language-neutral.

> 绿灯解锁制：**能力只有在影子/主包全绿验证后才列入本清单**。
> 用户侧能力展示 = 本清单的绿灯子集渲染；未列出的能力一律不得对外承诺。
> 每个绿灯项必须带验证证据（命令 + 结果），可复现。

## 绿灯能力（截至 2026-09-03）

### 代谢链（10 步管线）
- ✅ 完整代谢 `node src/run-metabolism.js`：compile→import→auto-link→link-sync→index-vectors→sprout→pollinate→compress→kespi-check→prune
  - 证据：影子回归 10 步全过，总耗时 3.28s（2026-09-03）
- ✅ 断点续传 `--resume` / 单步重跑 `--step <name>` / 智能模式 `--smart`

### 检索
- ✅ 查询 CLI `node src/query.js "<关键词>"`：语义/关键词混合检索 + KESPI 附分
  - 证据：影子实测命中 3 条，KESPI 0.93 显示正确（2026-09-03）
- ✅ 语义检索 384 维（本地模型内置）+ 64 维哈希回退（删 models/ 自动回退，`--hash` 强制）
- ✅ 入库即可被语义召回：`index-vectors` 默认语义模式（2026-09-03 设计变更）
  - 证据：影子端到端——新档过代谢链后新实体直接 384 维，全量重建 13/13，语义召回命中（2026-09-03）

### 意识神经（高优先级唤醒，2026-09-03 修复后解锁）
- ✅ 导链路由优先级分级真实生效（high/medium/low），高优先级信号可唤醒意识简报
  - 证据：影子实测 attention 0.900 → high（修复前恒 low，bug#11）；真实数据 0.590 → medium（2026-09-03）

### 三路突击（tri-path，真实评分版）
- ✅ 探索/验证/优化三路真实执行（语义检索 / 链接佐证 / KESPI 均值，无 mock）+ 队正裁决 + 熔断
  - 证据：影子实测 run 788ms，裁决交叉校验 2/3 通过，状态落盘（2026-09-03；对比 mock 时代 8ms 硬编码结果）
- ✅ 阈值集中 growth.config.js `triPath` 段，`TRI_PATH_TH_*` 环境变量可覆盖

### 编译门禁（shared-spine，真实 KESPI 版）
- ✅ `node src/shared-spine.js compile`：库内实体真评分门禁；未入库实体标 PENDING 不误杀
  - 证据：影子实测 10 档：9 接受（0.83-0.85）+ 1 正确 PENDING；审计含八维明细（2026-09-03；旧启发式对同批实体 9/9 误拒收 0.42-0.54）

### 常驻服务
- ✅ 调度器 `npm run scheduler`：定时代谢 + raw/ 轮询触发（mtime 快照，非 fs.watch）+ 单实例互斥 + `--once`
  - 证据：影子实测 --once 全链 3.28s 正常退出 ×2（2026-09-03）
- ✅ HTTP API `npm run server`（端口 3789，零依赖）：
  - /health 公开；/api/entities、/api/entity/<id>、/api/query、/api/ingest 实测 200（2026-09-03）
  - 认证：设 `AING_API_KEY` 后缺凭据 401、带凭据 200（实测）
  - 安全：实体 ID 白名单阻断路径穿越（实测 400）；请求体 1MB 上限
  - 多租户：`X-Tenant-ID` 会话隔离，租户文件落盘实测（tenantA-*）

### 自动入库
- ✅ 内容指纹去重：同批次内容 SHA-1 账本（data/ingest-hashes.json），重发跳过
  - 证据：影子实测同内容两批，第二批「内容指纹命中已入库记录，跳过」（2026-09-03）
- ✅ 会话 ID 文件名净化（租户前缀冒号不再致 ENOENT）

## 明确未解锁（禁止对外承诺）

- ⬜ 元认知接管线（Phase 2.6）：组件在库、未接代谢管线，接线方案评估中
- ⬜ 热重载（require 缓存清除式）：未实现
- ⬜ 企业级多租户：现有租户隔离仅为会话级前缀，无独立库/配额/权限体系
- ⬜ B5 自修改回路 / 元认知配置写回：治理红线，明确不做

## 维护规则

1. 新绿灯项：影子验证全绿 → 同步主包 → 复验 → 才可追加本清单（附证据）。
2. 发现失效：立即摘除绿灯并降级到「未解锁」，在 DEPLOY-CHECK 记录失效原因。
3. 本清单是用户可见能力列表的唯一真源；README/AGENTS 中的能力声明与本清单冲突时，以本清单为准。
