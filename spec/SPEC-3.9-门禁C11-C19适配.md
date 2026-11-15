---
tags: [aing-v2, spec, 门禁, C11-C19, 意识层, 读端, 旋钮, M3, spec:9, gate:9]
description: M3.9 门禁 C11–C19 适配——最后一米无 server 可用、memo 三块、代谢零提交、意识层闭环、控制面真接、读端纯读、旋钮单源、依赖不虚报、计数单源
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-3.1, SPEC-3.2, SPEC-3.11, SPEC-3.4, SPEC-2.18]
---

# SPEC-3.9 · 门禁 C11–C19 适配

> 这九道闸守的是「唔靠服务器都跑得通」同「读数可复核」：
> 最后一米、memo 三块、零提交写端、闭环自爬、控制面真接、纯读、旋钮单源、依赖不虚报、计数单源。

---

## 一、目标

C11–C19 九项全绿；每项断言都直指 v2 模块或文件真值。

## 二、闸表（v2 映射）

| # | 判据 | 实现 |
|---|---|---|
| C11 | memo / 入库模块无 server 直用 | `test-3.11` + `test-3.13` |
| C12 | memo 三块（以往/未闭环/模式） | `test-3.11-memo.js` |
| C13 | 代谢零 git 提交/子进程写端 | src 扫描 `child_process`/`git commit` 零命中 |
| C14 | 意识层闭环写端（停滞自爬） | `test-3.1-consciousness-kernel.js` |
| C15 | 控制面真接（CLI + HTTP 四路由） | `test-3.2-control-plane.js` |
| C16 | 读端纯读（读表不扰表） | `test-3.11` AC-6/AC-6c |
| C17 | 离散旋钮单源（改即生效） | `test-3.4-config-runtime.js` |
| C18 | 随包依赖不虚报 + 编组三件齐 | require ↔ dependencies 比对 |
| C19 | 文档数字 = 验收器真值 | run-all 计数 ↔ STATUS/AGENT/baseline 三处一致 |

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 八项全在（C19 由外层全量覆盖） | VD_ONLY 跑 C11–C18 逐个 ✅ |
| AC-2 | 无红 | 退出码 0 |
| AC-3 | 写端边界守住 | 输出含「零提交写端」与「纯读绿」 |

## 四、Non-Goals

- C19 唔在门禁测试内重入（会反向跑全库），由全量 verify 跑一次
- 唔做旧院技能资产落盘检查（v2 无技能随包层）

## 五、契约

- 门禁测试只跑 VD_ONLY 子集，唔跑 C1/C2/C19
- 全量 `node verify-deploy.js` 是唯一总入口

## 六、依赖

- 上游：SPEC-3.1、SPEC-3.2、SPEC-3.11、SPEC-3.4、SPEC-2.18
- 消费者：3.10（文档面闸）
