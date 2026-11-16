---
tags: [aing-v2, spec, 检索, 向量后端, 测试口径, M5, spec:8, vector:8]
description: M5.1 spec——向量后端可插拔（hash-64 默认 + 可注册语义后端）+ 测试开关 + 混用防护，并钉死「测完要自己复核是否适合自己语料」的口径
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-1.8, SPEC-0.1 §2.4]
---

# SPEC-5.1 · 向量后端可插拔与测试口径

> 起因：发布包里的 `hash-64` 是**确定性字面级**向量——可复现、可测、零模型依赖，但对粤语口语与同义改写基本无法分辨。
> 语义模型（多语蒸馏 / e5 系）在中英混排长文上更强，但在短实体名 + 粤语口语上未必更好，**换与不换必须由数据说话**。
> 本 spec 只做三件事：把后端做成**可插拔**、给测试留**只供测试的开关**、把「测完必须自己复核」写进文档。
> 铁律：默认路径行为一字不改；不同后端的向量**永不互比**。

---

## 一、目标

1. `src/vector.js` 的向量化从「硬编码 hash-64」改为「后端可注册」，内置 `hash-64` 仍为默认。
2. 提供**只供测试/评测**的开关（环境变量 + 调用参数），发布默认值不变。
3. 检索时按 `model` + `dim` 过滤，杜绝跨后端比对产生的假命中。
4. 文档写明：测试后端是否适合，**由使用者用自己的语料复核**，不得因为「测试跑绿」就改发布默认。

## 二、行为（spec 即契约）

### 2.1 后端契约

```js
{ name: 'e5-base-768', dim: 768, model: 'e5-base-768', embed(text) => number[] }
```

- `dim` 正整数；`embed` 必须是函数；返回数组长度必须 == `dim`，且全为有限数，否则抛错（**不许静默降级**）。
- `name` 唯一；同名重复注册按「后注册覆盖」处理（评测脚本可来回切）。
- 内置后端 `hash-64`（dim 64，model `hash-64`）**不可被覆盖**——尝试覆盖抛错。

### 2.2 解析与开关（只供测试）

- `resolveBackend(name?)`：显式名 → 已注册后端；未给 → `process.env.AING_VECTOR_BACKEND` → 缺省 `hash-64`。
- 名字未知：**回退 `hash-64`**，返回对象带 `{ requested, fallback: true }`，并 `console.warn` 一次（同一进程同名只警告一次）。
- 发布默认：`AING_VECTOR_BACKEND` 未设 → `hash-64`。发布包不设该变量，也不把测试后端写进默认值。

### 2.3 向量化

- `vectorOf(text)` 与 `vectorOf(text, { backend })`：`backend` 可为后端名或后端对象；不传即默认后端。
- 默认后端下输出与 SPEC-1.8 **逐位一致**（特征化锁定，见 AC-1）。

### 2.4 建向量

- `vectorStep(store, opts)`：`opts.backend` 同 2.3；写入 `entity_vectors.dim` / `model` 取实际后端。
- 跳过条件收紧为：`checksum` 相同 **且** `model` 相同 **且** `dim` 相同；后端换了就重建，不留旧后端向量冒充。

### 2.5 检索（混用防护）

- `search(store, query, opts)`：query 用同一后端向量化；**只比对 `model` 与 `dim` 都等于当前后端**的行。
- 其余行跳过，不参与排序，也不因「相似度低」混进来。
- 强度加权公式不变：`cosine × (0.5 + 0.5 × strength / 9)`。

### 2.6 铁律

- 不碰 `last_access` / `tolaria_strength` / `invalid_at`；无物理删。
- 默认调用路径（不传 backend、不设环境变量）行为与 SPEC-1.8 完全一致。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 默认路径不变 | `vectorOf('苹果手机')` 与锁定快照逐位相等；`DIM=64`、`MODEL='hash-64'` |
| AC-2 | 自定义后端可用 | 注册 8 维探针后端后，`vectorOf(text, { backend })` 返回 8 维 |
| AC-3 | 环境变量开关 | 设 `AING_VECTOR_BACKEND` → `resolveBackend()` 取到该后端 |
| AC-4 | 未知后端回退 | 未知名 → 回退 hash-64，`fallback === true`，`requested` 保留原名 |
| AC-5 | 非法后端拒收 | 缺 `embed` / `dim` 非法 / 内置名被覆盖 → 抛错 |
| AC-6 | 建向量记后端 | `entity_vectors` 行 `dim`/`model` 与后端一致 |
| AC-7 | 换后端重建 | 换后端再跑不跳过，全部 rebuilt，行维度随之变 |
| AC-8 | 混用防护 | 同库混有两后端行时，各自检索只出自己的行 |
| AC-9 | 铁律 | 源码无 `DELETE FROM`；`last_access`/`strength`/`invalid_at` 不变 |

## 四、Non-Goals

- 不内置任何语义模型，不新增 npm 依赖，不把模型权重塞进发布包。
- 不改排序公式，不改表结构，不做 ANN/倒排。
- 不提供「自动选后端」——选型由评测数据 + 使用者复核决定。

## 五、契约

- 导出：`vectorStep`、`search`、`vectorOf`、`tokens`、`DIM`、`MODEL`（保持原签名，新增可选参数）
- 新增导出：`registerBackend`、`resolveBackend`、`listBackends`
- 环境变量：`AING_VECTOR_BACKEND`（**只供测试/评测**，发布默认不设）

## 六、依赖

- 上游：SPEC-1.8（向量步与检索）、SPEC-0.1 §2.4（`entity_vectors` 表）
- 消费者：`src/predict.js`、编排器 `vector` 组件（不传 backend，走默认）

## 七、测试口径与自检（**换后端前必读**）

1. 评测集固定、版本化、**冻结后只增不改**（见 `docs/Engineering/EMBEDDING-BENCH-2026-11-16.md`）。
2. 指标至少四项：`P@10`、`R@10`、假边率、二跳污染率；粤语口语样本单列。
3. 同一份评测集跑多个后端，结果**全部记录**，不许只留赢家。
4. **测完必须由使用者用自己的真实语料复核**：测试集上的胜负不能直接推出「我的库会变好」。
   发布默认值只按「你的语料复核结果」改，不按测试集排名改。
5. 换后端后必须整库重建向量并复跑全档测试——`search` 已按 `model`/`dim` 过滤，旧后端行不会冒充新结果，但不清库会留下无用行。
