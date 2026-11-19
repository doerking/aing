---
tags: [aing-v2, spec, meko-bridge, 信号, 回单, 桥, engineering:7, capability:6, delivery:7, must-read:6]
description: SPEC-6.50 meko-bridge——aing→memo 只发差量信号（指纹+水位，幂等），meko→memo 只交回单；待核只给计数，核过才进摘要；读端纯读
date: 2026-11-19
status: 已落地（test-6.50-meko-bridge 8/8）
owner: hana
upstream: [STATUS.md §七 D20, STATUS.md §七 D17, STATUS.md §七 D12, docs/COVERAGE-旧院功能面覆盖判定-2026-11-18.md]
---

# SPEC-6.50 · meko-bridge

> **一句话**：旧院每天在用的「物业回单面」在 v2 只剩边界重述、没有实现。本件把结合部补齐：**aing 只往 memo 发差量信号，meko 只往 memo 交回单**，两边不互相读内部。

## 一、口径（D20 / D17 推定读法，owner 2026-11-19 确认）

### 1.1 三条铁律（承旧院，不重新发明）

1. **单向**：信号只从 aing 出（指纹 + 水位，幂等）；回单只从 meko 进。桥不读 meko 内部状态，meko 不读 aing 内部表。
2. **核单后入视野**：回单落 `pending-verify` 时 `summarize` **只给计数**；`verified` 才进摘要。
3. **失败可见**：`pending-verify` 超时计 `stalePending`，不静默当「没单」。

### 1.2 落点

两张表（追加进核心 schema，`IF NOT EXISTS` 增量）：

```
bridge_signals (fp PRIMARY KEY, face, code, target, round, note, sent_at)
bridge_returns (fp PRIMARY KEY, head_id, layer, status, payload_json, summary,
                returned_at, verified_at, verify_note)
```

水位落 `config` 表 `bridge.watermark`（`{sent:{fp:sentAt}, updatedAt}`）——与信号表同源，重开库可续发。

### 1.3 接口

```
publishSignals(store, signals)            → { sent, skipped, duplicateFps[] }
submitReturn(store, ret)                  → { ok, fp, status }   // 重复提交同 fp → {ok:true, duplicate:true}
verifyReturn(store, fp, {ok, note})       → { ok, status, reason? }
summarize(store, {now?, ownLayer?})       → { verified[], rejected, pending, stalePending,
                                              staleHours, lastReturnAt, layers, own }
```

- `layer` 由 `headId` 推（注册表优先，其次关键词，兜底 `dormant`）。
- `ownLayer` 缺省 `consciousness`：`own` 是该层明细；`layers` 全层只带计数与 verified 列表（保留旧口径）。
- `STALE_HOURS = 24` 单源常量，可经 `opts.staleHours` 覆盖（测试用）。
- `summarize` **纯读**：不写库、不改 mtime。

### 1.4 幂等键

信号指纹 = `sha1(face + code + target + round)` 前 16 位；回单指纹 = `sha1(headId + returnedAt + payload摘要)` 前 16 位。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 同信号二发：`sent=1 → skipped=1`，表内 1 行 |
| AC-2 | 换 target / round 各落一行（指纹变）|
| AC-3 | 回单落 `pending-verify`；同 fp 重复提交不重复入库且报 `duplicate` |
| AC-4 | `summarize` 纯读：pending 不进 verified 列表、跑前后库 mtime 不变 |
| AC-5 | 核单后进 verified：`summary` 取 payload.summary 截 60 字；`rejected` 只计数 |
| AC-6 | `stalePending`：超 `staleHours` 未核计入并给出最长滞留小时数 |
| AC-7 | 分层：`own` 只出当前截面明细，其他层 `layers[x]` 有计数 |
| AC-8 | CLI：`status` / `publish <json>` / `verify <fp> [--reject]` 可跑，退出码 0/1/2 |

## 三、边界

- **不实现 meko 派单**：派单是 meko 的事（D17）。本件只做结合部的信号与回单。
- 不接外接屏、不做 UI。
- 不碰意识层 `events` 表（那是 aing 自己的神经事件面）。
