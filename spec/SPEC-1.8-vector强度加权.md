---
tags: [aing-v2, spec, 核心代谢, vector, 强度加权, M1, spec:8, vector:8]
description: M1.8 vector spec——确定性哈希向量（64 维，无外部模型依赖）落 entity_vectors，检索按余弦×强度权重排序，内容变才重建，退役不索引
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.1 §2.4, SPEC-1.4, SPEC-0.6]
---

# SPEC-1.8 · vector（强度加权检索）

> 旧院向量步依赖 384 维语义模型，缺模型时回退哈希。M1 先做**确定性哈希向量**：无模型依赖、可复现、可测；
> 语义模型作为可选升级位留空。检索分 = 余弦相似度 × 强度权重——**强节点在同等语义下优先**，这是 9 段第一次真正参与排序。

---

## 一、目标

为有效实体建立 64 维哈希向量，提供强度加权检索；内容指纹未变不重建。

## 二、行为（spec 即契约）

### 2.1 向量化
- 模型 `hash-64`：CJK 单字 + 双字组合、拉丁词切分后 FNV-1a 哈希落 64 桶，带符号累加，L2 归一
- 指纹 `checksum` = sha1(name + content + tags)
- 有效实体（`invalid_at IS NULL`）才索引

### 2.2 重建策略
- 无向量 → 建；指纹变 → 重建；指纹同 → 跳过（`rebuilt = 0`）
- 不物理删；实体退役后保留旧向量，检索时过滤

### 2.3 检索
- `search(store, query, { k })`：query 同法向量化
- 分 = `cosine × (0.5 + 0.5 × strength / 9)`；强度越高权重越大（3 段 ≈ 0.67 倍，9 段 = 1.0 倍）
- 只返回有效实体，按分降序取前 k

### 2.4 铁律
- 不碰 `last_access`、`tolaria_strength`、`invalid_at`；无物理删

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 建表幂等 | `entity_vectors` 存在，连跑 2 趟不炸 |
| AC-2 | 有效实体全索引 | 两有效 + 一退役 → indexed=2，退役无向量 |
| AC-3 | 幂等重建 | 第二趟 rebuilt=0，向量 JSON 不变 |
| AC-4 | 内容变重建 | 改 content → rebuilt=1，向量变化 |
| AC-5 | 检索命中 | query「苹果手机」命中「苹果手机发布」实体 |
| AC-6 | 强度加权 | 同文同查询，strength 9 排 strength 3 前 |
| AC-7 | 铁律 | last_access/strength/invalid_at 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不接语义模型（升级位留空）
- 不做倒排索引/ANN
- 不改实体表
- 不做检索命中写 last_access（读端职责，后续期）

## 五、契约

- 组件 id `vector`，strand `wiki`，band `background`，reads `['entities']`，writes `['entity_vectors']`，budgetTick 1，reversible true
- 入口：`async vectorStep(store, opts) -> { scanned, indexed, rebuilt, skipped }`；查询：`search(store, query, opts)`

## 六、依赖

- 上游：SPEC-0.1 §2.4（表）、SPEC-1.4（镜像）
- 消费者：检索面、2.12
