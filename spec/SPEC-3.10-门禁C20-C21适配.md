---
tags: [aing-v2, spec, 门禁, C20-C21, 文档可执行, Tolaria, M3, spec:9, gate:9]
description: M3.10 门禁 C20–C21 适配——文档里标「✅ 可用」的命令必须路径在位且真可跑；Tolaria 9 段文档基线只增不减
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.6 §六, SPEC-3.7, SPEC-3.9]
---

# SPEC-3.10 · 门禁 C20–C21 适配

> 文档吹的命令跑唔到，就等于部署假绿。C20 把 AGENT.md 命令表当契约真跑；
> C21 把 Tolaria 9 段文档面钉成基线账，文档只许加唔许消失。

---

## 一、目标

文档声称可用的命令全部路径在位、CLI 真跑通；md 全绿且基线文档唔消失。

## 二、闸表

| # | 判据 | 实现 |
|---|---|---|
| C20 | AGENT.md 中 `✅ 可用` 行的 `node <path>` / `npm run <script>` 真在；`node src/neural.js` 真跑退出 0 | 解析 + 真跑 |
| C21 | 全仓 md 过 Tolaria 9 段 lint；`tools/doc-tags-baseline.json` 所列文档唔缺失（只增不减） | doc-tags-lint + 基线账 |

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 两项全在 | VD_ONLY=C20,C21 输出逐个 ✅ |
| AC-2 | 无红 | 退出码 0 |
| AC-3 | 基线账在位 | 基线文档数 >30 且缺失 0 |

## 四、Non-Goals

- 唔测外部依赖下载（v2 只有 sql.js）
- 唔强制新增文档登记基线（新增文档自动过 lint 即可；基线只防消失）

## 五、契约

- `tools/doc-tags-baseline.json` 形态：`{files: ["相对路径", ...]}`
- 文档新增无需改基线；文档删除须同步更新基线（并在 STATUS 登记原因）

## 六、依赖

- 上游：SPEC-0.6 §六、SPEC-3.7、SPEC-3.9
- 消费者：M4 总验收
