---
tags: [aing-v2, spec, 向量后端, 默认切换, 语义检索, M5, spec:9, vector:9, backend:9]
description: M5.9 默认后端切换 spec——SPEC-5.6 对照单 24/24 判语义好后，owner 拍板把缺省后端从 hash-64w2 换成 onnx-e5-small；未注册不静默回退、CLI 开机注册、真库冷备重建
date: 2026-11-17
status: 实装
owner: hana
upstream: [SPEC-5.1, SPEC-5.3, SPEC-5.5, SPEC-5.6, SPEC-5.7]
---

# SPEC-5.9 · 默认后端切换为语义（onnx-e5-small）

> 状态：实装（2026-11-17）
> 上游：SPEC-5.5（预留「复核后再切」）、SPEC-5.6（对照单 24 条全判语义好）
> 定位：把缺省后端从字面 `hash-64w2` 换成语义 `onnx-e5-small`；切换不是「评测排名说了算」，是 owner 在自己语料上逐条判完再拍板。

---

## 一、依据

- SPEC-5.6 实跑：真库副本 320 实体 / 24 条真问题（含粤语口语），owner 判定 **24 条全为「语义好」**，语义胜率 100%（24/24）。
- SPEC-5.5 §一 立的规矩：默认值由使用者在自己的语料上复核后再切。复核已完成（2026-11-17），owner 明确拍板「切」。

## 二、契约（spec 即契约）

| # | 契约 |
|---|---|
| R1 | `vector.DEFAULT_BACKEND = 'onnx-e5-small'`；`resolveBackend()` 缺省按它解析 |
| R2 | **未注册不静默**：语义后端在本进程未注册时，缺省解析返回字面后端 `hash-64w2`，但必须带 `fallback: true`、`requested: 'onnx-e5-small'`，并告警一次；memo 据此出 `backend-fallback` 告警 |
| R3 | `AING_VECTOR_BACKEND` 环境变量与 `opts.backend` 仍优先（测试/对照/回退用） |
| R4 | CLI 开库前按缺省注册语义后端：`ensureRequestedBackend` 的 want 缺省取 `DEFAULT_BACKEND`；注册失败只告警并继续用字面后端，不拦开库 |
| R5 | 真库切换必须**冷备份 + 全量 `vectorStep` 重建**；向量按 `model` + `dim` 隔离，旧后端行不得冒充（沿用 SPEC-5.1 §2.4） |
| R6 | 冻结集评测基线此后按语义后端记；字面后端数字作为历史对照保留，不删 |

## 三、不变量

- 检索结果去重口径不变（SPEC-5.3 基名 + SPEC-5.7 内容指纹）。
- 检索三路融合权重不变（SPEC-6.3）；实体表只读。
- 语义后端加载失败不抛（SPEC-5.5 §三），只是回退并留告警。

## 四、验收（`test/test-5.9-default-backend.js`）

| AC | 断言 |
|---|---|
| AC-1 | 误注册前：`resolveBackend()` 给 `requested='onnx-e5-small'`、`fallback=true`、实际用 `hash-64w2`（不静默） |
| AC-2 | 注册语义后端后（测试用桩）：缺省解析即 `onnx-e5-small`，`fallback=false` |
| AC-3 | `AING_VECTOR_BACKEND=hash-64w2` 仍能压过缺省（对照开关不失效） |
| AC-4 | 显式 `opts.backend='hash-64w2'` 仍可切回字面（历史对照可复现） |
| AC-5 | memo 向量行缺省态报 `onnx-e5-small`，切后旧 model 行计入 stale |
| AC-6 | 隔离库按缺省 `vectorStep` 建行，`entity_vectors.model` 全为 `onnx-e5-small`、`dim=384` |

## 五、Non-Goals

- 不删旧向量行、不迁移实体（重建即覆盖同表）。
- 不改融合权重、不改去重口径、不改阈值。
- 不做多后端热切换（切换即全量重建，沿用 SPEC-5.5）。
- 不预置模型缓存打包：首次使用仍需联网取模（约 118MB），离线机器按 SPEC-5.5 §七 预置缓存。
