---
tags: [aing-v2, spec, 控制面, W2, inhibit, event, status, verify, M3, spec:9, control:9]
description: M3.2 控制面 spec——意识层四条路由（event/inhibit/status/verify）CLI 与 HTTP 同源；inhibit 只有到期自解、无撤销接口；status 纯读；event 只认 hana 身份
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-3.1, SPEC-3.6, SPEC-2.16, 核读 §3.2, C16]
---

# SPEC-3.2 · 意识层控制面（CLI + HTTP 四路由）

> 意识层如果只有自动循环，人同 agent 就冇合法入口去「临时封住误报源」或「投一条事件」。
> v2 把控制面收成**四个动作**，CLI 与 HTTP 共用同一份实现（唔各写一套）：
> `event`（投事件）/ `inhibit`（抑制）/ `status`（读态）/ `verify`（查闸）。
> 控制面**只转发**，阈值与默认值仍归组件自己那处（C17 单源）。

---

## 一、目标

四动作可经 CLI 与 HTTP 两条入口调用且行为一致；inhibit 无撤销口；status/verify 纯读。

## 二、行为（spec 即契约）

### 2.1 同一实现（`src/control-plane.js`）
`runAction(store, name, args)` 分派四动作，CLI 与 HTTP 都只调它。

### 2.2 event（写）
- 入参：`{type, target?, payload?, source}`
- `source` 必须 `hana`（3.6 身份闸），否则抛 `identity-rejected`
- `type` 必填，否则抛 `event-type-required`
- 落 `events` 表（`source/type/target/payload_json/created_at`）
- 返回 `{accepted:true, id, at}`

### 2.3 inhibit（写）
- 入参：`{target, reason?, hours?}`
- `target` 必填，否则抛 `target-required`
- 到期时间 `until = now + hours*3600e3`；`hours` 缺省取 `config-runtime` 的 `kernel.inhibitHours`（缺省 1）
- 落 `config` 表：key `kernel.inhibit:<target>`，值 JSON `{target, reason, until, created_at}`
- 返回 `{target, reason, until, isInhibited:true}`
- **无撤销接口**：模块唔导出 revoke/release；唯一清除路径 = 到期

### 2.4 status（纯读）
- 返回 `{kernel:{state, attention, stagnation_count, breaker}, factors, inhibitions:[{target, reason, until, active}], events: N}`
- `active` 按 `now < until` 计算；到期项自动视为失效
- 唔写任何表、唔投事件

### 2.5 verify（纯读）
- 入参：`{subject, kind?='promote'}`
- 用 `omni-gate.hasPassingGate` 查闸；有 → `{ok:true, gate}`，无 → `{ok:false, reason:'gate-required'}`
- 唔写 `gate_records`、唔改 `kernel_state`

### 2.6 HTTP（`src/api-server.js`）
- `POST /api/consciousness/event`
- `POST /api/consciousness/inhibit`
- `GET  /api/consciousness/status`
- `POST /api/consciousness/verify`
- 请求体 JSON；错误统一 `{error}` + 4xx/5xx

### 2.7 CLI（`src/neural.js`）
- `node src/neural.js event <type> [--target t] [--payload json]`
- `node src/neural.js inhibit <target> [--reason r] [--hours N]`
- `node src/neural.js status [--json]`
- `node src/neural.js verify <subject> [--kind promote]`
- 库路径取 `AING_DB`，缺省 `data/knowledge.db`

### 2.8 铁律
- 唔碰 `last_access`；无物理 DELETE
- 内部术语唔入包（发布名词）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | event 身份闸 | source≠hana → `identity-rejected` 且 events 数不变；hana → 落库增 1 |
| AC-2 | inhibit 到期自解 | 注入 now：未到期 active=true；越过 until 后 active=false，status 唔再列 active |
| AC-3 | 无撤销口 | 模块导出键无 revoke/release/clear；同 target 再抑制只延后到期 |
| AC-4 | status 纯读 | 调两次前后库指纹（表计数 + kernel 行 + config 行）一致 |
| AC-5 | verify 纯读且真判 | 无闸 → ok=false；有闸记录 → ok=true；前后 `gate_records` 计数不变 |
| AC-6 | HTTP 四路由 | 起临时端口，event/inhibit/status/verify 逐个真请求，码与体都对 |
| AC-7 | CLI 同源 | `neural.js status --json` 子进程真跑，输出 JSON 且与 API 同字段 |

## 四、Non-Goals

- 不做审批执行（W2 审批归 2.16）
- 不做 UI
- 不做事件归档衰减（后续）
- 唔做旧 `deliberate/record/lineage` 路由（v2 无对应组件）

## 五、契约

- `runAction(store, name, args, opts?) -> result`
- `listActions() -> ['event','inhibit','status','verify']`
- `startServer({store, port=0, host='127.0.0.1'}) -> {server, port, close()}`
- `isInhibited(store, target, now?) -> bool`

## 六、依赖

- 上游：SPEC-3.1（kernel）、SPEC-3.6（身份闸）、SPEC-2.16（闸记录）、SPEC-3.4（旋钮单源）
- 消费者：M3 门禁 3.9、memo 系统行
