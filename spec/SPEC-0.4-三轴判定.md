---
tags: [aing-v2, spec, 三轴判定, 加载门, M0, spec:9, must-read:8, tri-axis:7]
description: M0.4 三轴判定 spec——strength≥7 + 配对合法表 isTypePairingLegal + invalid_at 真值表，带完整真值表 acceptance criteria
date: 2026-11-13
status: draft（待 owner review）
owner: ring
upstream: [ARCHITECTURE-全架构重写图纸-DNA双铰链-从零实现-2026-11-13.md §五, 全景图 §四, SPEC-0.1]
---

# SPEC-0.4 · 三轴夹出加载判定

> M0 纯设计零码。核心机制 = **单旋钮、多重约束取交集**（硬件综合工具的成熟线程范式，此处只借范式不点名）：**边进检索入口 = 强度轴 AND 类型专一轴 AND 时效轴**。
> 决策默认（内置）：**P1 采用配对矩阵**（`isTypePairingLegal` 显式合法表），弃 interchange-router 模糊路由。
> 依赖 SPEC-0.1（links 表 strength/invalid_at 列）。

---

## 一、目标

钉死三轴判定的**判定函数 + 配对合法表 + invalid_at 真值表 + 度上限 + 命中写回**，让 M1 任务 1.2/1.6 failing test 能锁「哪个边准进检索入口」这个核心行为。

## 二、判定函数 `src/tri-axis-gate.js`
```js
function shouldEnterRetrieval(edge): boolean {
  return (
    edge.strength >= 7 &&           // 强度轴
    isTypePairingLegal(edge) &&     // 类型专一轴
    edge.invalid_at === null        // 时效轴
  );
}
```

## 三、类型配对合法表 `isTypePairingLegal`（配对矩阵）

显式白名单（DNA 专一配对启发：A-T / C-G，唔係两两乱连）：

| source\target | Concept | Conversation | Todo | MetaKnowledge |
|---|---|---|---|---|
| **Concept** | ✅ | ✅ | ❌ | ✅ |
| **Conversation** | ✅ | ✅ | ✅ | ✅ |
| **Todo** | ❌ | ✅ | ✅ | ❌ |
| **MetaKnowledge** | ✅ | ✅ | ❌ | ✅ |

> 合法 = ✅ 进白名单。未列类型默认 ❌（fail-closed，对齐 tag-gate 白名单哲学）。
> Todo 只从 Conversation 进（Todo→Concept 治理上不该硬连）。

## 四、invalid_at 真值表（时效轴）

| invalid_at | 语义 | 进检索入口？ |
|---|---|---|
| NULL | 有效边 | ✅（若另两轴也过） |
| 非 NULL（有戳） | 逻辑退役边 | ❌ 永不进（可逆：清戳即复活） |

## 五、度上限 + 命中写回

- **度上限**：每节点有效边 ≤ `degreeCap`（借 interchange-router top-K；degreeCap 值 M1 任务 1.6 定，本 spec 只锁机制）。
- **命中写回**：检索命中刷新 `last_access`（recency = `0.995^hoursSinceLastAccess`）；**compile 永不碰 last_access**（P0 换锚铁律）。

## 六、Acceptance Criteria（真值表齐，可客观检验）

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 强度轴 | strength=7→过、6→不过（边界钉死 ≥7） |
| AC-2 | 类型轴 | Concept→Conversation=✅过；Todo→Concept=❌不过（按 §三白名单逐格测） |
| AC-3 | 时效轴 | invalid_at=NULL→过；invalid_at=非NULL→不过 |
| AC-4 | 三轴 AND | 三轴全过才 true；任一不过即 false（造 8 种组合测全） |
| AC-5 | fail-closed | 未列入 §三白名单的类型对（如 Novel→Todo）→ isTypePairingLegal=false（默认拒） |
| AC-6 | 命中写回 | 检索命中某实体 → 该实体 last_access 更新为 now；compile 跑后 last_access 不变（P0 铁律双向证） |
| AC-7 | 度上限 | 造 1 节点 20 条有效边 → 入口只取 top degreeCap 条（degreeCap 生效） |

## 七、Non-Goals

- **不定 degreeCap 具体值**——机制在此，数值 M1 任务 1.6 用数据复评后定。
- **不做 interchange-router**——决策默认配对矩阵，弃模糊路由（owner 可改回，但默认矩阵）。
- **不实现**——M0 零码，实现属 M1 任务 1.6（tri-axis-link.js）。
- **不碰库迁移**——strength/invalid_at 列已在 SPEC-0.1 建表时内建，本 spec 只锁判定逻辑。

## 八、依赖

- **上游**：SPEC-0.1（links 表列）、全景图 §四（三轴机制）
- **被依赖**：SPEC-0.2（②③接口用判定）、M1 任务 1.2（failing test）、1.6（实现）、M3 门禁 C10b（link_count 口径 WHERE invalid_at IS NULL）

---

> **M0 门**：四份 spec（0.1/0.2/0.3/0.4）齐 + owner 拍板 → 开 M1 failing test 先行。