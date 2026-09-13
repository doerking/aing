---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'e0868bc4-799f-4361-bc07-c4c86e242ba0'
  PropagateID: 'e0868bc4-799f-4361-bc07-c4c86e242ba0'
  ReservedCode1: 'f8bb2609-3e7a-4c4a-9e50-d093b926c878'
  ReservedCode2: 'f8bb2609-3e7a-4c4a-9e50-d093b926c878'
---

# aing 绿灯清单 / Green List（自动生成，勿手改）

> 真源：`docs/greenlist.json`（结构化）。本文件是生成视图；改动先改 JSON，再运行 `node tools/gen-greenlist.js`。
> Agents 渲染面板请直接读 JSON；未列出的能力一律不得对外承诺。

## 绿灯能力（12 项，截至 2026-09-07）

- ✅ **完整代谢（11 步，含 distill 蒸馏器）+ --resume/--step/--smart**
  - 证据：影子回归 11 步全过 7.6s（2026-09-13 M4 验证）
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
- ✅ **意识神经系统完整接入（13 模块：事件协议/神经核/感知/导链/意识层/元认知/成长闭环/hermes 适配器，控制面板接口标准四件套，预留接口池 IF-002~006+开放池）**
  - 证据：2026-09-08 G1-G8 验收门禁全绿：13/13加载+事件7/7+kernel去重抑制持久化+全链路briefing+元认知边界+adapter四命令+origin血统(source=IF-TEST::g6-test, confidence=0)+verify-deploy回归ALL GREEN+SELF-TEST ALL GREEN；锚点提交 7b54471（git merge-base --is-ancestor 实测在 master 谱系）（2026-09-08）

## 明确未解锁（3 项，禁止承诺）

- ⬜ 热重排（require 缓存清除） — 未实现
- ⬜ 企业级多租户（独立库/配额/权限） — 现有隔离仅为会话级
- ⬜ B5 自修改回路 / 元认知配置写回 — 治理红线，明确不做

## 维护规则

1. 新绿灯项：影子验证全绿 → 同步主包 → 复验 → 改 JSON（附证据）→ 重生成本文件。
2. 发现失效：立即把该项移入 locked，并在 DEPLOY-CHECK 记录失效原因。
3. 本清单是用户可见能力列表的唯一真源；README/AGENTS 的能力声明与之冲突时，以 JSON 为准。