---
tags: [aing-v2, spec, 接口, 访问事件, 时钟, prune, kespi, 晋级, M6, spec:9, access:9]
description: M6.7 spec——补访问事件接口：access_hits 只追加事实表，宿主/CLI 在内容被真正消费后回报；prune/compress/field-promote/KESPI 四处消费同一时钟，检索与 memo 仍纯读
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.4, SPEC-1.11, SPEC-1.12, SPEC-1.13, SPEC-2.13, SPEC-6.6]
---

# SPEC-6.7 · 访问事件接口（access_hits）

> 上一轮诊断的根节点：v2 的衰减锚 `last_access` 没有任何写者——检索按 6.3 不写，
> 场域件也不写，于是 prune 的「90 天未动」退化成「入库年龄」，KESPI 的 KA 恒为 0.2，
> 晋级拿不到 access 证据。补法不是让检索重新写（破坏纯读），而是把「被消费」这件事
> 变成一条独立的、只追加的事实。

---

## 一、接口四问

| 问 | 答 |
|---|---|
| 对谁？ | `entity_id`——与实体同一身份 |
| 凭什么对？ | 一次消费事件 `(entity_id, hit_at, source)`，来源必须可归因 |
| 差多少算对？ | 各消费者自己的窗口：prune 90 天、compress 配置值、promote 30 天、KESPI 30 天衰减 |
| 对不上怎么办？ | 再追加一条事件；不改旧行、不删行、不碰 `last_access` |

**边界**：检索、memo、T2 仍纯读；写只发生在「内容真的被消费」的调用方（CLI / 宿主适配器）。

---

## 二、数据

```sql
CREATE TABLE IF NOT EXISTS access_hits (
  entity_id TEXT NOT NULL,
  hit_at    DATETIME NOT NULL,
  source    TEXT DEFAULT 'unknown'
);
CREATE INDEX IF NOT EXISTS idx_access_entity ON access_hits(entity_id, hit_at);
```

- 只追加；无主键去重（同一实体可多次命中）。
- 不写 `entities.last_access`；不物理删除。
- 只为已存在的实体记事件；未知 id 跳过并计入 `skipped`。

---

## 三、契约

`src/access.js`：

```js
recordAccess(store, ids, opts) -> {recorded, skipped}
// opts: {source='unknown', at=now ISO}
latestHitMap(db) -> Map<entity_id, hit_at>
lastActivityDays(db, entityId, now?) -> number|null   // min(距 last_access, 距最近 hit)
recentActivity(db, entityId, days=30) -> boolean
```

消费侧（同一时钟，四处）：

| 消费者 | 现口径 | 新口径 |
|---|---|---|
| `prune.listCandidates` | `last_access` 旧于 90 天或 NULL | 同上，但**最近 90 天内有 hit 的不入选**（只救不杀；NULL 语义不变） |
| `compress.compressStep` | `last_access` 旧于配置天数 | `last_access` 与最近 hit **都**旧才算停滞 |
| `field-promote.evidenceFor` | `last_access` 30 天内 | 最近 hit 30 天内同样算 `access` 证据（不重复计） |
| `kespi.kespiStep` | KA 只看 `last_access` | KA 取两者中更近的一次 |

CLI：`access --ids "a,b" --source cli`，走 `cmdAccess`，与 memo/ingest 同级。

---

## 四、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 表与索引 | 建表 + `idx_access_entity`；同实体两次记录得两行（只追加） |
| AC-2 | 记录契约 | 已存在 id 记录成功；未知 id 进 `skipped`；`last_access` 不变 |
| AC-3 | prune 只救不杀 | 背景带 + 旧 `last_access` + 近 90 天 hit → 不入选；hit 过期 → 仍入选 |
| AC-4 | compress 双锚 | 旧 `last_access` + 近 hit → 不压；无 hit → 照压 |
| AC-5 | 晋级证据 | 无 `last_access` 但有近 hit → `access` 证据成立 |
| AC-6 | KESPI KA | 无 `last_access` + 近 hit → KA 明显高于 0.2 |
| AC-7 | CLI 接线 | `cmdAccess` 导出并真写；未知 id 不写 |
| AC-8 | 铁律 | `recordAccess` 前后 entities 指纹一致；源码无 `DELETE FROM`、无直连 knowledge-store |

## 五、Non-Goals

- 不让检索或 memo 写访问事件（纯读不变）。
- 不改 prune 的 NULL 语义（无 hit 的新实体仍按原规则处理）。
- 不做宿主适配器、不做事件聚合视图（后续按发布范围）。
- 不动 `last_access` 本身（保留迁移值与外部写入的兼容）。

## 六、依赖与后续

- 上游：SPEC-0.4（三轴/命中语义）、SPEC-1.13（prune）、SPEC-1.12（KESPI）、SPEC-2.13（晋级证据）
- 后续：6.8 洞察血缘接口（候选 → 正式知识的派生边）；6.9 宿主边界接口（触发/呈现/批量）
- 旧院对照：v1 `query.js` 在检索命中时写 `last_access`；本件把同一次写从读路径挪到消费方，语义同、边界清。
