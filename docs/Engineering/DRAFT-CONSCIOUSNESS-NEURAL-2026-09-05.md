---
tags: ["aing", "意识神经", "Tolaria", "内部协议", "设计稿", "多通道", "共振", "状态机"]
---

# DRAFT：意识神经独立层 × Tolaria 内部协议（2026-09-05 设计稿）

> 状态：**设计稿，未接线**。依据 DoerOne 2026-09-05 架构方案精编，经长机仲裁修正（虚构组件已清除、公式缺陷已修、fs.watch 禁令已并入）。仲裁全文：`REVIEW-CONSCIOUSNESS-ARCH-2026-09-05.md`。能力声明遵守绿灯解锁制——本文件描述的是目标架构，不是现有能力。

## 一、核心定义

意识神经 = **独立协调层**，不是"结构路+语义路"的读取封装。结构/语义只是它七个输入通道中的两个。

```
秩序脑（组织知识） 生长脑（演化知识）
        └──────┬──────┘
      七通道感知 → 意识神经 → 注意力/唤醒/抑制 → DoerOne（执行）
                             ↘ 456（业务学习）  元认知（校正意识判断）
                             ↘ raw/（Tolaria MD 持久化回流）
```

四分工：意识神经管"什么值得处理"；456 管"怎么做得更好"；aing 管编译建链代谢评分；DoerOne 管推理执行验证交付。元认知在意识神经之后，校正其判断（通道可信度、唤醒阈值）。

## 二、七通道

| 通道 | 读取 | 解决 | 现状锚点 |
|---|---|---|---|
| 结构 | 父子/章节/实体/脚本/数据表/links | 它属于谁、连着谁 | gap-detector、auto-link |
| 语义 | 向量/关键词/标签/跨域/历史经验 | 与什么相似、旧知识再激活 | query、tri-path、semantic-vector |
| 时间 | mtime/活跃时间/衰减/胶囊 wake_at | 新发生、沉寂、该唤醒、在衰退 | 导链 recency（现为临时计算，需独立成通道） |
| KESPI | 八维分数/变化/连续下降/失衡 | 哪维在塌陷、什么类型的问题 | show-kespi、kespi-check |
| 行为 | 任务/工具/路线/成功率/重试/纠正 | 过去怎么做最好 | **零起点——层 4 轨迹表从零建** |
| 反馈 | 用户接受/否定、测试结果、退出码、候选效果 | 判断对不对 | 候选区+四门 |
| 异常 | 断链/重复实体/ID 冲突/未编译 raw/KESPI 突降/连续空产出 | 结构性疼痛 | 代谢告警 |

异常通道不得与普通新知识共用注意力权重：新知识=普通兴奋，断链=结构疼痛，KESPI 突降=状态异常，用户纠正=高价值反馈，连续空产出=神经疲劳。

## 三、核心机制

### 意识事件（总线内存态 JSON，持久化才转 MD 节点）

```json
{ "eventId": "…", "timestamp": "…", "source": "kespi", "channel": "state",
  "target": "entity-id", "signalType": "dimension-drop",
  "intensity": 0.82, "confidence": 0.76,
  "evidence": [], "relatedEntities": [], "suggestedAction": "verify", "status": "observed" }
```

边界（进治理）：**总线内事件是易失的；写 raw/ 的必须经筛选（低频高价值）。观察≠结论，结论≠规则，候选≠能力，意识事件≠DoerOne 决策。**

### 共振分级

resonance = 命中通道数/总通道数 × 信号一致性 × 历史可信度。单通道→记录观察；双通道→普通注意；三通道→重点聚焦；四通道以上→意识唤醒。多通道同指一目标时才是高置信度意识事件，这是意识神经区别于"扫描器"的本质。

### 注意力（修正后的公式）

兴奋 − 抑制 = 有效注意力。兴奋：新变化/用户关注/KESPI 突变/多通道共振/高价值异常/历史失败复现。抑制：重复事件/已处理无新证据/低置信度推断/候选未验证/连续空转/已知无效路径/资源不足。

> 仲裁修正：方案乘法公式有零吸收缺陷（任一因子→0 全局归零），采用 **乘法+每因子下限钳制 [floor,1]** 或加法基线×乘法调制；全部权重/阈值迁 growth.config.js（envNum）——现公式权重硬编码于 neural-guide-chain.js，属阈值唯一来源的既有违规，升级时一并修复。

### 意识状态机（持久化 data/consciousness/state.json）

idle / sensing / integrating / focused / aroused / deliberating / acting / waiting / reflecting / inhibited / stagnant。stagnant 规则：连续三次无有效产出 → 剪链 + 生成 MetaKnowledge 回流 raw/（"为什么这条链无效"转化为可检索知识）。

## 四、Tolaria Markdown 内部协议

MD 节点 = 神经元载体：frontmatter 承载身份（id/type/status/source/origin/parent_id/lineage/confidence）+ 关系（tags/relation）+ 生命周期。**MD 为真源，knowledge.db 为派生索引**（不得双真源）。

节点类型族：Knowledge / Episode / RouteKnowledge / MemoryRouting / ConsciousnessEvent / KespiAssessment / ImprovementCandidate / MetaKnowledge / Feedback。

origin 标签区分：observed（人）/ derived（aing）/ proposal（456）/ feedback / meta——raw/ 是全部合法输入的生态入口，不是低级数据。

生命周期：raw → observed → classified → linked → indexed → activated → verified → trusted → decaying → pruned → recalled/rejected；各状态对应意识神经不同处理强度（candidate 低强度观察不执行、trusted 才可参与路线推荐等）。

同一节点多重身份：秩序脑里是组件文档、意识神经里是结构信号、456 里是路线经验、生长脑里是候选知识——一套数据，靠 type+relation 区分，不复制四套。

## 五、456 在意识神经中的位置

- **4（Agents 2.0）**：意识神经的行为模式记忆——"面对这类信号过去哪条路线最好"。输入意识事件+通道+历史，输出推荐路线/成功率/失败风险。
- **5（MemR³）**：意识神经的记忆调度器——"当前意识该唤醒什么记忆"。动作集 answer/retrieve/reflect/verify/ask + suppress/defer/replay/escalate（后四个为本稿扩展）。
- **6（Gödel Agent）**：候选适应与策略演化器——处理重复异常、路线无解、系统性缺陷，输出候选（路线/规则/Skill/架构修改），经 元认知+独立测试+基线比较+人工确认 四门才可晋升 candidate→tested→promoted，未验证不得 active。

## 六、实施阶段（与 M4 合并顺序见仲裁文件第三节）

阶段一：事件总线 + 状态持久化 + 现有三脚本接统一接口（兼容保留）；阶段二：多通道接入（先规则聚合，不上复杂模型）；阶段三：共振+抑制+去重+断链（从扫描器变状态系统）；阶段四：456 接入反馈环；阶段五：元认知校正闭环（通道可信度/唤醒阈值/抑制时长）。

## 七、实施纪律

影子 SOP 五步；感知一律 mtime 轮询禁 fs.watch；阈值全部 growth.config.js；行为通道数据表先于算法；本稿任何能力在影子双证据验证+GREEN-LIST 解锁前，对外声明一律"设计稿/在库未接线"。
