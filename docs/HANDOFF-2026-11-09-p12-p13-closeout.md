---
tags: [handoff, swarm, p12, p13, c18, deploy, must-read, docs:8]
description: P12/P13 两套功能设定收口交接——宿主载体括注清除、P12 归守内面·内派、C18 五角色+实测件数追平，全量 33 项 ALL GREEN @fa65d1b
date: 2026-11-09
status: done
---

# P12/P13 功能设定收口交接（2026-11-09）

## 一、本场任务

用户指令序列：① P12/P13 两套功能设定；② 删「sclaw / ZCode」宿主载体括注（关联文件全仓查）；③ P12 定性写「守内面·内派」；④ 远端一并清；⑤ 记低的 C18 门禁/绿名单代差「改完去」上推。

## 二、改动清单（4 个 commit，全部已推 origin/main）

| commit | 内容 | 推远端 |
|---|---|---|
| `f096cf7` | 宿主载体括注清除：README/AGENTS/HANDOFF-11-05/SWARM-RESEARCH 共 12 组行，统一改「宿主运行时动态子代理」中性表述 | ✅ |
| `de24ef4` | P12 归属定性：patch-12 设计稿头 + SUMMARY_ARCH 索引补「守内面·内派——触发源是 aing 自身健康读数，不接对外工单」 | ✅ |
| `abe768c` | aing-operator 中英 4 份关联档补齐 P12 第 5 角色（adversarial-reviewer + Gate5），「四角色」→「五角色」，评审组明标守内面·内派 | ✅ |
| `fa65d1b` | C18 门禁追平：角色循环 4→5 角色（缺 `adversarial-reviewer.md` 必红，负向自证已过）；资产件数由手抄「20 件」改实算 walk（坑 19）；greenlist.json C18 项五角色/21 件/证据日期 2026-11-09；gen-greenlist 重生成 | ✅ |

工作树 CLEAN；`origin/main` 本地/远端齐平（领先 0）。

## 三、P12/P13 功能设定（收口后口径，真源以本表为准）

### P12 对抗审查（commit `c28fe46`，patch-12）

- **归属：守内面·内派**——自维护内部派工，触发源＝aing 健康读数（selfAssessment / verify 红 / gaps / distillDebt），**不接对外工单**；对外派工走宿主运行时动态子代理，入口不共享、互不桥接（边界真源 SWARM-RESEARCH §〇）
- 第 5 角色 `adversarial-reviewer` 挂**共识收敛节点**（出共识要人批前）：只反驳不修复，输出 `rebuttals[]`（severity：critical/major/minor）
- 收敛判据（aing 侧扩展，非 dsh 原样）：无 critical/major 反驳才放行，有则回炉 ≤1 轮
- 执行面：aing 无 subagent 运行时 → inline-persona 降级；只有 `inRuntimeSurface=true` 才许报 `swarm-skill`（C18 钉）
- 门禁影响：0（不动 C0–C20 计数、不动 11 步代谢）

### P13 持久化 goal（commit `33466e2`，patch-13）

- 归属：守内面（备忘录 Todo 面升级），非派工角色
- `entities(type='Goal')`（落地时纠正设计稿假前提：无 todos 子表 → 不迁移不加列，避开 C10c/C10e）
- 4 相状态机（active/paused/blocked/complete）＋7 操作＋CLI 8 子命令；到顶自动 `blocked(round-limit)` 不硬停可 resume；`block` 缺 code/message 必拒；`resume` revision+1；`clear` 留痕不删行
- 执行面：**人工 `memo goal round` 或一次代谢触发，不搬 dsh 自动驱动器**（唯一执行面差异）
- 健康接线：blocked Goal → `goal-blocked` 健康账 → C12 派单路由（blocked_code 机器路由 analyst）；gap-detector 排除 Goal
- 旋钮单源：`growth.config.js convergence = { maxRoundsDefault: 5, blockedCodes: ['round-limit','manual-blocked','dep-waiting'] }`（src+example 同构，C10d 钉）

## 四、门禁与验收证据

- 全量 `node verify-deploy.js`：**🟢 ALL GREEN，33 项（C0–C20）@`fa65d1b`**，登记 `data/last-verify.json` 已刷新
- C18 真值：「包内 21 件技能资产在位」（实测 walk 计数，swarm 9 + operator 12）；派单读数 `inRuntime=true / bundled=true / mode=swarm-skill`
- 负向自证：移走 `adversarial-reviewer.md` → C18 必红；还原复绿；`VD_ONLY=C10a,C18,C19` 三门全绿
- 小插曲：全量首跑 C10b 红（面板过期 36.8h > 6h 上限，非计数漂移）→ `node src/metabolism-panel.js` 重生成即绿

## 五、留档未动（有意保留，勿误改）

1. **dated 历史实录**：`M4-DATA-COLLECTION` L6/L17「20 件资产」、`greenlist.json` C12 limits「四角色说明书」、`verify-deploy.js`/`verify-sibling-roots.js` 注释「漏 20 件资产」——全部是 2026-09-14 实读数，坑 21 口径不改历史
2. **`.sclaw` 代码探测面**：`src/memo.js:678`、`verify-deploy.js:1554`、AGENTS 坑 18 的 `.sclaw/agent/skills 35 项`——代码/实录真名，非文档括注
3. **greenlist C18 证据串里的 `.sclaw` 实测描述**：门禁证据面，改动需连 C18 负向自证一起走
4. `C12 limits` 的「swarm 实际装在 ~\.claude|.agents\skills」——本机实态描述，非载体括注

## 六、下一步（如有后续）

- 三臂检索三臂实测复跑（换多语模型后「中文 OOV」短板已解除，待确认检索质量）
- C18 负向自证脚本化（本轮手工 move 做，可沉到 `tools/negatives/` 套件）
- OPT/Tip 院际对齐时：C18 五角色口径需随 `verify-deploy.js` 一起换血，否则别院 C18 会因缺第 5 份 roles 档而红
- 面板过期是日常运行态：收工前跑 `node src/metabolism-panel.js` 防 C10b 红（6h 上限）
