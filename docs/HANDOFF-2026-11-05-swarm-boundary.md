---
tags: [handoff, swarm, boundary, deploy, must-read]
description: 蜂群两面规类收工交接——AGENTS.md + README.md 守内面/对外派工面分区写清，全量 32 项 ALL GREEN
date: 2026-11-05
status: done
---

# 蜂群两面规类收工交接（2026-11-05）

## 一、本場任務

用戶指令：「把自維護同外派蜂群喺文檔裏規類好，喺 README 同 AGENTS 兩份文檔上區分嚟寫，唔要混埋。」

邊界真源：`docs/Engineering/SWARM-RESEARCH-2026-11-03.md §〇`（所有者設計邊界，四條明示）。本場只係喺兩份操作面文檔補邊界語 + 分區寫清，**未造第二份真源**。

## 二、改動清單

### AGENTS.md（三刀）

| 刀 | 位置 | 內容 |
|---|---|---|
| ① | 原「Neural Evolution Swarm」章節前 | 新增 `## Swarm Boundary / 蜂群兩面邊界（自維護 vs 對外派工）`——兩面對照表（主體/觸發源/載體/規模/生命周期），四點設計要點，回指 SWARM-RESEARCH §〇 |
| ② | 原章節改名 + 頭注改口 | 改名 `## Self-Maintenance Swarm (Half-Lifted) / 守內面：神經進化團隊（半拉起）`；頭注加「係守內面（自維護）專用——觸發源全係 aing 自身健康讀數，唔係對外派工入口」 |
| ③ | 「按數據指標自動維護流程」圖後、Agent Discipline 前 | 新增 `## External Dispatch Swarm / 對外派工面（宿主運行時動態子代理）`——定位宿主運行時動態子代理，本包無代碼無承諾；機制共享（patch-12 對頭 persona）但入口唔共享 |

### README.md（三刀）

| 刀 | 位置 | 內容 |
|---|---|---|
| ① | 自動化邊界表右列 | 「神經進化團隊半拉起」行改標「守內面·神經進化團隊派單（按 aing 自身健康讀數觸發，見下節）」 |
| ② | 表後新段落 | 新增 `### Swarm Two Faces / 蜂群兩面（守內自維護 vs 對外派工）`——兩面對照表 + 四點邊界說明，回指 SWARM-RESEARCH §〇 |
| ③ | `memo --dispatch` 命令註 | 改為「只問要唔要派神經進化團隊（**守內面·自維護專用**；對外派工走宿主運行時，見下節『蜂群兩面』）」 |

## 三、驗收狀態

| 驗收 | 結果 |
|---|---|
| `VD_ONLY="C19,C20" node verify-deploy.js`（部分跑） | ✅ 兩項全綠 |
| 全量 `node verify-deploy.js` 首跑 | ❌ C10b 紅（面板過期 21h > 6h） |
| `node src/metabolism-panel.js` 重生成 | ✅ 面板刷新 |
| 全量 `node verify-deploy.js` 復跑 | ✅ **32 項 ALL GREEN**（@4e6e801） |
| 最後一米 L1 備忘錄已讀 | ✅ state=integrating / semantic-384 / 蒸餾債 0 |
| 最後一米 L2 入庫 | ✅ `swarm-boundary-2026-11-05` user + assistant 兩條成檔，WAL 餘 0 |
| 最後一米 L3 復跑 | ✅ 面板重生成 → 全量仍 ALL GREEN |

## 四、未收口項 / 下一個 agent 接手要睇嘅

1. **git 未 commit**：AGENTS.md + README.md 改動喺工作區，`git status` 會見到兩份 modified。用户明言 GitHub 倉庫唔再推進，本地 main 合入即可；若要做留痕，`git add AGENTS.md README.md && git commit -m "docs: swarm two-face boundary (AGENTS+README)"`。
2. **C10b 面板過期係常規維護**：每次收工前如果 `data/panel.json` 過期 > 6h，先 `node src/metabolism-panel.js` 再跑 `verify-deploy.js`。唔係本場引入嘅問題。
3. **蜂群邊界真源維護**：如果日後要改兩面邊界語（例如對外派工面加咗宿主運行時新能力），**改 `docs/Engineering/SWARM-RESEARCH-2026-11-03.md §〇`**，然後同步 AGENTS.md 同 README.md 嘅回指段；唔好直接喺操作面文檔改邊界定義。
4. **`docs/AGENT-ONBOARDING.md:65` 附贈註**：本場未改（用戶只點咗 README + AGENTS 兩份）。如果後人覺得 ONBOARDING 都要補邊界語，同上面三刀同形，加半句「團隊只關自維護，對外工單唔走呢套」即可。
5. **1 個受阻 goal**（`goal-20261101T17234-检索-mrr-0-50-0-80-s:round-limit`）：備忘錄 11-05 22:16 讀到，唔係本場引入，留待下場處理。

## 五、一句話

兩份操作面文檔（AGENTS.md + README.md）嘅蜂群邊界已分區寫清：守內面（自維護，包內代碼 + 資產）同對外派工面（宿主運行時，本包無代碼）各佔一章，互不橋接，真源指返工程研究檔 §〇。全量 32 項 ALL GREEN，驗收登記已刷新。
