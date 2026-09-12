---
tags: [green-list, capabilities, verified]
last-updated: 2026-09-12
---

# aing 绿灯清单 / Green List（自动生成，勿手改）

> 真源：`docs/greenlist.json`（结构化）。本文件是生成视图；改动先改 JSON，再运行 `node tools/gen-greenlist.js`。
> Agents 渲染面板请直接读 JSON；未列出的能力一律不得对外承诺。

## 绿灯能力（19 项，截至 2026-09-12）

- ✅ **完整代谢（10 步）+ --resume/--step/--smart**
  - 证据：影子回归 10 步全过 3.28s（2026-09-03）
- ✅ **查询 CLI 语义+关键词混合检索 + KESPI 附分**
  - 证据：命中 3 条 KESPI 0.93 显示正确（2026-09-03）
- ✅ **384 维本地语义检索，64 维哈希自动回退**
  - 证据：全量重建 13/13 召回命中（2026-09-03）
- ✅ **导链路优先级分级生效（high/medium/low）**
  - 证据：attention 0.900→high；真实 0.590→medium（2026-09-03）
- ✅ **三路真实评分裁决（无 mock）**
  - 证据：run 788ms 交叉校验 2/3 落盘（2026-09-03）
- ✅ **编译门禁真实 KESPI 评分；未入库 PENDING 不误杀**
  - 证据：10 档 9 接受 1 正确 PENDING（2026-09-03）
- ✅ **常驻调度 + raw/ 轮询触发（mtime 快照）**
  - 证据：--once 全链 3.28s 退出 0 ×2（2026-09-03）
- ✅ **HTTP API（3789）/health 公开，其余 Bearer 认证，租户隔离**
  - 证据：5 端点实测 200；401/400 实测（2026-09-03）
- ✅ **内容指纹去重 + 会话 ID 净化**
  - 证据：同内容二批跳过实测（2026-09-03）
- ✅ **KESPI 生命周期 pending→computed + 关键步骤熔断（P0-P2）**
  - 证据：三包演练：翻转 8/8、无蒸馏优雅降级、退出码 1 熔断（2026-09-07）
- ✅ **verify-deploy C7 运行时产品断言（一致性+指纹）**
  - 证据：负向测试：注入腐坏→红，清除→绿（2026-09-07）
- ✅ **会话自动入库（对话即知识）**
  - 证据：每轮对话自动写入 raw/，编译进 wiki/，KESPI 自检，全程留痕（2026-09-08）
- ✅ **KQ consistency 字段修复（从链接推导）**
  - 证据：一致性从双向链接共同引用比例推导，八维评估结果合理（2026-09-08）
- ✅ **风险工单全部修复（P0-P2）**
  - 证据：8/8 工单已修复，verify-deploy.js ALL GREEN，C7 负向测试门禁有效（2026-09-12）
- ✅ **配置热重载支持**
  - 证据：src/config-hotreload.js 创建，监听 growth.config.js 变更自动重载（2026-09-12）
- ✅ **单元测试框架**
  - 证据：tests/ 目录创建，jest 配置完成，4/4 新增测试通过（compile-consistency, kespi-kq-consistency, pid-alive, verify-deploy-c7c）（2026-09-12）
- ✅ **元认知接线（Phase 2.6）**
  - 证据：GrowthDirector 构造函数集成 MetacognitionLayer，输出建议到简报（2026-09-12）
- ✅ **NER 集成指南**
  - 证据：docs/NER-INTEGRATION.md 创建，setup-ner.ps1 安装脚本已提供（2026-09-12）
- ✅ **consciousness-neural-full 意识神经系统完整接入**
  - 证据：13 模块全加载，G1-G8 验收门禁全绿（2026-09-08）

## 明确未解锁（2 项，禁止承诺）

- ⬜ 企业级多租户（独立库/配额/权限） — 现有隔离仅为会话级
- ⬜ B5 自修改回路 / 元认知配置写回 — 治理红线，明确不做

## 维护规则

1. 新绿灯项：影子验证全绿 → 同步主包 → 复验 → 改 JSON（附证据）→ 重生成本文件。
2. 发现失效：立即把该项移入 locked，并在 DEPLOY-CHECK 记录失效原因。
3. 本清单是用户可见能力列表的唯一真源；README/AGENTS 的能力声明与之冲突时，以 JSON 为准。
