---
tags: [aing-v2, spec, 核心代谢, compress, 压缩, 换锚, M1, spec:8, compress:8]
description: M1.11 compress spec——活跃度锚定 last_access，长期未访问且内容够长才压成籽；重新访问即解压（active=0），可逆、幂等、不碰 last_access
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.1 §2.4 修订 C, SPEC-0.4 AC-6, SPEC-1.8]
---

# SPEC-1.11 · compress（换锚：last_access）

> 旧院 compress 锚 `last_access`，但 import 从不刷新它 → 年轻语料恒不满足 30 天闸，36 轮零籽（核读 §2.4）。
> v2 换锚之后语义不变，但要求**可逆**：重新访问的实体必须自动解压，籽不是删除，是可撤销的归档标记。

---

## 一、目标

把长期未访问且内容够长的有效实体压成籽（`compressed_seeds`），重新访问即解压。

## 二、行为（spec 即契约）

### 2.1 压成籽
- 有效实体、`content` 长度 ≥ 50、`last_access` 非空且早于 `inactiveDays`（默认 30 天）
- 写入 `compressed_seeds`：`content_hash`（sha1 内容）、`last_access_at` 抄录、`active=1`
- 实体本身**不改**（不删内容、不改 status）

### 2.2 解压
- 已有籽但 `last_access` 已晚于阈值（重新被访问）→ `active=0`
- 不物理删籽行

### 2.3 幂等
- 状态未变 → 不写；第二趟 `seeded=0、revived=0`

### 2.4 铁律
- 不碰 `last_access`/`invalid_at`/`status`；无物理删

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 旧长实体入籽 | last_access 早于 30 天 + ≥50 字 → active=1，hash 与内容一致 |
| AC-2 | 新近访问不入籽 | last_access=now → 无籽 |
| AC-3 | 短内容不入籽 | <50 字 → 无籽 |
| AC-4 | 可逆 | 入籽后刷新 last_access → 第二趟 active=0 |
| AC-5 | 幂等 | 第二趟 seeded=0、revived=0 |
| AC-6 | 铁律 | last_access 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不做正文压缩/摘要（籽只是归档标记 + 指纹）
- 不做 prune（1.13）
- 不做检索回读

## 五、契约

- 组件 id `compress`，strand `wiki`，band `background`，reads `['entities']`，writes `['compressed_seeds']`，budgetTick 1，reversible true
- 入口：`async compressStep(store, { inactiveDays = 30, minLength = 50 }) -> { scanned, seeded, revived, skipped }`

## 六、依赖

- 上游：SPEC-0.1 修订 C、SPEC-0.4 AC-6（last_access 唯一写者）
- 消费者：2.10 守恒闸
