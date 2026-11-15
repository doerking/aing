---
tags: [aing-v2, spec, M0, index, spec:9, must-read:9, dna:7]
description: aing-v2 spec 索引——M0 架构 spec（0.1-0.8）与 M1 代谢步 spec（1.1/1.2/1.4/1.13-1.15），每份含 AC/Non-Goals
date: 2026-11-13
status: draft（待 owner 拍板）
owner: ring
---

# aing-v2 · M0 全架构 spec 索引

> M0 = spec-first 纯设计零码。四份 spec = 完整 M0 交付包，owner 拍板后才开 M1 failing test 先行。
> 上游：`三版通杀/docs/架构/` 四份子文档（总规划 MASTER + 功能盘点 + 架构图纸 + 任务规划）+ 工程规范 v1.1。

---

## 一、四份 spec（读序 = 依赖序）

| # | Spec | 内容 | 依赖 | 状态 |
|---|---|---|---|---|
| 0.1 | [数据模型](./SPEC-0.1-数据模型.md) | entities/links/meko_cycles 三表 DDL，三轴列内建 | 无（底座） | draft |
| 0.2 | [meko四顶接口](./SPEC-0.2-meko四顶接口.md) | HydrogenBond/HistoneLayer/StarlinkOrchestrator/HelixCrosscheck 签名 | 0.1 | draft |
| 0.3 | [星闪调度协议](./SPEC-0.3-星闪调度协议.md) | SLB/SLE 双模 + G 节点 + T_bound 算法 | 0.1, 0.2 | draft |
| 0.4 | [三轴判定](./SPEC-0.4-三轴判定.md) | strength≥7 + 配对矩阵 + invalid_at 真值表 | 0.1 | draft |
| 0.5 | [内外蜂群接线](./SPEC-0.5-内外蜂群接线与部署重设.md) | 两套不桥接 + 内蜂群自洽部署 | 0.1,0.2 | draft |
| **0.6** | **[meko 贯彻全架构 × 中间三段星闪场域](./SPEC-0.6-meko贯彻全架构-中间三段星闪场域.md)** | 组件契约 + 三带 + 场域动作/不变量 + Tolaria 9 段 | 0.1-0.4 | **拍板（2026-11-16 owner）** |
| **0.7** | **[双系统运行协议](./SPEC-0.7-双系统运行协议-成长闭环与预案.md)** | 本能/决策/预判 + 会话三源成长闭环 + memo 用户面 + 预案 | 0.6 | **拍板（2026-11-16 缘起）** |
| **0.8** | **[进化团入驻 meko × 全程多维维护](./SPEC-0.8-进化团入驻meko-全程多维维护.md)** | 五成员契约注册 + 四时点×六维 + 外派三分编组 + 双相循环/决策闸对齐 | 0.6,0.7 | **拍板（2026-11-16）** |

## 一乙、M1 代谢步 spec（垂直切片，每步 spec + failing test + ALL GREEN）

| # | Spec | 内容 | 状态 |
|---|---|---|---|
| 1.1 | [compile 编译步](./SPEC-1.1-compile编译步.md) | raw 解旋入 entities，幂等，不碰 last_access | 实现绿 |
| 1.2 | [link 同步步](./SPEC-1.2-link同步步.md) | 三轴夹出建边 + invalid_at 退役 | 实现绿 |
| 1.4 | [import 双链写入](./SPEC-1.4-import双链写入.md) | raw→wiki 镜像 + 氢键，保差分，幂等 | 实现绿 |
| 1.5 | [distill 复制链保真](./SPEC-1.5-distill复制链保真.md) | pending→active，原文逐字保真入镜像 | 实现绿 |
| 1.7 | [link-sync 双链边一致](./SPEC-1.7-link-sync双链边一致.md) | raw 内部边镜像到 wiki，缺端点不建幽灵边 | 实现绿 |
| 1.8 | [vector 强度加权](./SPEC-1.8-vector强度加权.md) | 64 维哈希向量 + 余弦×强度权重，内容变才重建 | 实现绿 |
| 1.9 | [sprout 发芽](./SPEC-1.9-sprout发芽.md) | 三类证据成种，场域带 4–6 段，每轮 2–4 粒 | 实现绿 |
| 1.10 | [pollinate 授粉](./SPEC-1.10-pollinate授粉.md) | 跨类型按跨域+标签/关键词成粒，4–6 段 | 实现绿 |
| 1.11 | [compress 换锚](./SPEC-1.11-compress换锚.md) | last_access 锚定，压成籽可逆（重新访问解压）| 实现绿 |
| 1.13 | [prune 逻辑退役](./SPEC-1.13-prune逻辑退役.md) | 三条件 AND + 可逆退役 | 实现绿 |
| 1.14 | [meko 螺旋编排](./SPEC-1.14-meko编排螺旋推进.md) | raw→cross→wiki 逐轮，meko_cycles | 实现绿 |
| 1.15 | [场域骨架 + 组件契约门禁](./SPEC-1.15-场域骨架与组件契约门禁.md) | 契约注册 + C5 arch-lint | 实现绿 |

## 二、每份 spec 的结构契约（工程规范 §三 spec quality = output quality）

每份 spec 必含：
- **目标**（一句，要咩）
- **Schema/接口/算法**（spec 即契约，code 是 spec 结果）
- **Acceptance Criteria**（可客观检验，非「合理/清晰」主观词——隔离假院真跑判）
- **Non-Goals**（明确不做，防 scope creep）
- **决策默认值**（内置，owner 可改）
- **依赖**（上游/被依赖）

## 三、三道待拍板（已按总监判断内置默认，owner 可改）

| # | 待拍项 | 内置默认 | 出处 |
|---|---|---|---|
| 1 | meko 扩覆盖面 | **全并入 aing 双链编排**（非只借哲学） | 全景图 §6.2-1 |
| 2 | P1 解法 | **配对矩阵** isTypePairingLegal（弃 interchange-router 模糊路由） | 0.4 §一 |
| 3 | 9段星闪重铺 | **存量渐进**（统一 spec 语义，存量逐批迁，不一次性翻 tag-taxonomy） | 全景图 §6.2-4 |

> 9段重铺落点：统一语义已在 0.4（strength 段位）+ 0.3（SLB/SLE 分流），存量迁移策略 M1/M3 门禁适配期定。

## 四、M0 门（验收）

四份 spec 齐（✅ 已落）+ owner 拍板 → 开 M1：
- M1 第一刀 = 任务 1.1 knowledge-store.js（按 0.1 建表）+ 1.2 failing test（p1-test-helix.js，3 红）
- 每期 failing test 先行 + ALL GREEN + 假院真跑（工程规范 R1 + 验收铁律）

## 五、目录

```
aing-v2/
├── spec/          ← M0 四份 spec + 本索引（纯设计）
├── src/           ← M1 起填（knowledge-store.js / helix-* / meko-* / tri-axis-gate.js）
├── tools/         ← M3 起（verify-deploy.js 适配）
├── docs/          ← 工程文档
└── .temp/         ← failing test + 假院探针（不进 git）
```

---

> **一句话**：四份 spec = aing-v2 M0 完整交付包，spec-first 零码，owner 拍板三道默认值即开 M1。