---
tags: [aing-v2, spec, 门禁, C0-C9, verify-deploy, M3, spec:9, gate:9]
description: M3.7 门禁 C0–C9 适配——目录/测试计数/schema/文档/架构五道基础闸之外，补向量冒烟、KESPI 读数、基因谱系、盘符扫描、登记簿双向一致、文档引用与用户面 schema
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.6, SPEC-1.15, SPEC-1.8, SPEC-1.12, SPEC-2.15]
---

# SPEC-3.7 · 门禁 C0–C9 适配

> v2 目录结构与旧院唔同，门禁编号沿用语义、实现全部重写；每道闸都指向 v2 真组件，
> 唔照抄旧脚本。C1/C2 会反向跑全库（含门禁测试自身），所以门禁测试只跑其余项，C1/C2 由外层全量覆盖。

---

## 一、目标

C0–C9 十二项在 v2 全绿；每项都有可复跑的真断言，唔靠注释声称。

## 二、闸表（v2 映射）

| # | 判据 | 实现 |
|---|---|---|
| C0 | 目录结构 src/test/spec/package.json | 文件在位 |
| C1 | 全库测试全绿 | `test/run-all.js` |
| C2 | test 计数只加唔减 | `test/count-guard.js` |
| C3 | schema 三表 + 三轴列 + 幂等 | `test-1.1-dataschema.js` |
| C4 | 全仓 md Tolaria 9 段 | `tools/doc-tags-lint.js` |
| C5 | 组件唔直连 store | `tools/arch-lint.js` |
| C6 | 向量/词面检索冒烟 | `test-1.8-vector.js` |
| C7a | KESPI 八维读数一致 | `test-1.12-kespi.js` |
| C7b | 基因谱系可回滚 | `test-2.15-evolution-cycle.js` |
| C8 | 硬编码盘符扫描（src/test/spec/tools） | 正则零命中 |
| C9a | 登记簿 ↔ STEPS 双向一致 + 入口存在 | `metabolism.js` |
| C9b | STATUS 引用 spec 路径全在位 | 文件存在 |
| C9c | 用户面 schema（buildMemo + systemLine≤80） | `memo.js` 契约 |

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 十一项全在 | `VD_ONLY` 跑 C0/C3/C4/C5/C6/C7a/C7b/C8/C9a/C9b/C9c 逐个 ✅ |
| AC-2 | 无红 | 退出码 0 |
| AC-3 | 部分跑不写验收登记 | 输出含「部分跑」，不含「部署验收通过」 |

## 四、Non-Goals

- C10+ 归 3.8–3.10
- 唔复刻旧院模型下载类检查（v2 无本地大模型依赖）

## 五、契约

- `VD_ONLY=<ids> node verify-deploy.js` 部分跑
- 全量 `node verify-deploy.js` 才写验收登记

## 六、依赖

- 上游：SPEC-0.6、SPEC-1.15、SPEC-1.8、SPEC-1.12、SPEC-2.15
- 消费者：3.10（C19 计数单源）
