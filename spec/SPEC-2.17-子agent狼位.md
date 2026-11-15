---
tags: [aing-v2, spec, 子agent, 狼位, 观察层, M2, spec:9, wolves:9]
description: M2.17 子agent 单元 spec——五角色身份职责一字不动，每位自带 ≤2 狼位；狼位只读采样、零写权、完即弃只回一行残渣；D1–D5 观察缺口由狼位覆盖
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.8 §九 修订 A, SPEC-2.14, SPEC-2.15]
---

# SPEC-2.17 · 子agent 单元（狼位）

> owner 拍板：**5 位角色和职责不能乱**，允许每位自带同设定子agent。
> 所以子agent 不是新角色，是**临时眼睛**：只读采样、零写权、完即弃，只回一行残渣。
> 观察层的缺口（D1–D5）由这些眼睛补，编制上限 5×3=15 席不动。

---

## 一、目标

五角色身份快照可校验；每位可启停 ≤2 狼位；狼位零写权、完即弃；D1–D5 各有可测采样。

## 二、行为（spec 即契约）

### 2.1 身份快照（AC-1 的凭据）
- `IDENTITY_SNAPSHOT`：五员 `id / name / role / reads / writes` 的深拷贝（冻结）
- `assertIdentitiesUnchanged()`：与当前 `MEMBERS` 逐字段比对；任一改动即抛错
- 加狼位**唔改** `MEMBERS` 本身

### 2.2 启停编制
- 每单元长 ≤2 狼位：`spawn` 第 3 只抛错
- 狼位 `id = 'wolf-<owner>-<dim>-<n>'`；`dimension ∈ {D1..D5}`
- `retire(wolfId)` → 返回残渣 `{wolfId, dimension, sample, residue}` 并移出编制

### 2.3 零写权
- 狼位对象 `writes: []`；`sample()` 只读
- 狼位持有 `write()` → 调用即抛 `wolf-no-write`

### 2.4 完即弃
- `retire` 后 `snapshot()` 唔再含该狼
- 同一 id 唔复用（再 spawn 递增序号）
- 残渣只一行：`{dimension, sample, at}` + 一句 `residue`

### 2.5 采样口径（D1–D5）
| 维 | 采样 |
|---|---|
| D1 结构 | 双链同位缺口数 |
| D2 强度 | 越带动作数（demote/promote）|
| D3 度量 | KESPI 均值 |
| D4 时序 | 连续无动作轮数 |
| D5 成员 | 活跃 gene 数 |

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 五角色身份不变 | `assertIdentitiesUnchanged()` 为真；篡改快照副本不影响；对 `MEMBERS` 字段与快照逐项相等 |
| AC-2 | 每角色 ≤2 狼位 + 零写权 | 第 3 只抛错；狼位 `writes` 空；`write()` 抛 `wolf-no-write` |
| AC-3 | 完即弃只回残渣 | `retire` 后编制减一、残渣含 dimension/sample/residue；同 id 不再出现 |
| AC-4 | D1–D5 各有采样 | 五维各 spawn 一只 → `sample()` 均返回数值，且各维口径不同 |

## 四、Non-Goals

- 不做外派蜂群（2.18）
- 不做狼位模型/提示词设定（运行期由角色自设）
- 不改五角色职责

## 五、契约

- `IDENTITY_SNAPSHOT`、`assertIdentitiesUnchanged()`
- `class WolfUnits { constructor({members}) ; spawn(ownerId, {dimension}) ; retire(wolfId) ; snapshot() ; sample(wolfId) }`
- `WOLF_DIMENSIONS = ['D1','D2','D3','D4','D5']`、`WOLVES_PER_OWNER = 2`

## 六、依赖

- 上游：SPEC-0.8 §九、SPEC-2.14（成员册）、SPEC-2.15（六维口径）
- 消费者：2.18 外派
