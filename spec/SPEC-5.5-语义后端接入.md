---
tags: [aing-v2, spec, 向量后端, 语义接入, onnx, 回退, M5, spec:9, vector:9, backend:8]
description: M5.5 语义后端接入 spec——把旁路量过的 e5-small（384 维）接成可选后端：开关切换、query/doc 前缀分流、加载失败回退 hash-64w2，发布默认不动
date: 2026-11-17
status: 实装
owner: hana
upstream: [SPEC-5.1, SPEC-5.3, SPEC-5.4, docs/Engineering/EMBEDDING-BENCH-2026-11-16.md]
---

# SPEC-5.5 · 语义后端接入（可选开关 + 回退）

> 状态：实装（2026-11-17）
> 上游：SPEC-5.1（后端可插拔）、SPEC-5.3（排序修正）、SPEC-5.4（旁路实测：顶 1 58.8% → 83.8%）
> 定位：把量过的语义后端**接成可选后端**，用开关切；发布默认仍是 `hash-64w2`。

---

## 一、为什么不是直接换默认

SPEC-5.4 的量法证明语义后端在冻结集上顶 1 高 25 个点，但换默认要付三样代价：模型 118MB、原生推理依赖、首载 1.5s。按宪法「发布默认不按评测排名改」，本件只交付**能力 + 开关**，默认值由使用者在自己的语料上复核后再切。

## 二、契约扩展（SPEC-5.1 修订）

| # | 契约 |
|---|---|
| R1 | 后端对象**可选**提供 `embedQuery(text)`：题侧编码走它，文档侧仍走 `embed(text)`。缺省时题侧回落到 `embed`，老后端零改动 |
| R2 | `embed` / `embedQuery` **可返回 Promise**：async 路径（`vectorStep` / `search`）一律 `await`；同步路径 `vectorOf` 的对外契约不变（只吃同步后端） |
| R3 | 新增 `vectorOfAsync(text, opts)`：后端返回 Promise 时解析后再做与 `vectorOf` 完全相同的校验（非数组 / 维度不符 / 非有限数）|
| R4 | 向量落库仍按 `model` + `dim` 隔离（SPEC-5.1 §2.5）：换后端必然全量重建，旧后端行不冒充 |

## 三、接入（`src/onnx-backend.js`）

- `ensureRegistered(opts)`：懒加载 `@xenova/transformers`，注册后端 `onnx-e5-small`（`dim=384`，`model='onnx-e5-small'`）。
  - 文档侧前缀 `passage: `，题侧前缀 `query: `——E5 系列的口径，不是可选优化（SPEC-5.4 §七）。
  - 模型名与主机可由 `AING_ONNX_MODEL` / `AING_HF_HOST` 给出，缺省 `Xenova/multilingual-e5-small`。
- 失败形态**不抛**：模块缺失、模型取不到、首次下载失败，一律返回 `{ ok:false, reason }`；调用方回退 `hash-64w2` 并留告警（memo 的 `backend-fallback` 一类）。
- 一次性：同进程内重复调用复用已注册后端，不重复加载模型。

## 四、开关

| 方式 | 写法 |
|---|---|
| 环境变量 | `AING_VECTOR_BACKEND=onnx-e5-small` |
| 调用参数 | `opts.backend = 'onnx-e5-small'`（`vectorStep` / `search` / `predict` / `cli`）|
| 缺省 | 仍是 `hash-64w2`（发布默认不动，R4）|

切后端后必须重跑 `vectorStep` 全量重建：`on` 与 `off` 两套向量各自只在同 `model` 同 `dim` 的行之间比较。

## 五、验收（`test/test-5.5-onnx-wiring.js`）

| AC | 断言 |
|---|---|
| AC-1 | 同步后端下 `vectorOf` 行为逐位不变（默认快照不破） |
| AC-2 | `vectorOfAsync` 能解析 Promise，且维度不符 / 非有限数 / 非数组三种坏值都抛错 |
| AC-3 | 后端给了 `embedQuery` 时，`search` 走题侧、`vectorStep` 走文档侧（假后端记录调用次数） |
| AC-4 | 换后端后 `vectorStep` 全量重建（model 字段不同，旧行零复用） |
| AC-5 | `ensureRegistered` 在模块不可用时返回 `{ok:false}` 不抛；`resolveBackend` 回退 `hash-64w2` 并带 `fallback:true` |
| AC-6 | 默认 `MODEL` 仍是 `hash-64w2`（不因本件改变全局默认） |

## 六、Non-Goals

- 不把默认值改成语义后端（等使用者按自己语料复核）。
- 不在本件里做模型量化调参、不换模型（换模型走 SPEC-5.4 的旁路复测）。
- 不做多后端并存的热切换：切换即全量重建。
- 不保证手机端性能：原生推理在目标设备上能跑与否由实机验证，跑不动就回退字面后端。

## 七、已知边界

- 首次使用要联网取模型（约 118MB），之后走本地缓存；离线环境需先预置缓存目录。
- 模型加载约 1.5s、单条 24ms、16 条一批 86ms（桌面实测，SPEC-5.4）。
- 语义后端的负例命中率更高（近义干扰项被拉近），排序指标以顶 1 与 R@10 为准。
