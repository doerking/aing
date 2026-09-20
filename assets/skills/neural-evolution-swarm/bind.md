# Bind — 神经进化团队约束

## Resource Constraints

| 约束 | 值 | 说明 |
|---|---|---|
| max_parallel_teammates | 2 | 仅第 4 步 trainer ∥ analyst 并行，其余串行 |
| total_wall_clock_budget | 45 分钟 | 超时触发降级（见 Failure Handling） |
| total_token_budget | 300k | 六属性评审与训练历史是大头，按需截断证据摘录 |
| neuro-theorist 单轮上限 | 15k tokens | 评审报告聚焦缺口，不复述设计稿 |
| skill-trainer 单 epoch 上限 | 40 任务 | 任务包超限时采样而非全量 |

## Behavioral Constraints

- Leader 不写实现代码、不生产补丁——Leader 只做编排、集成与终报
- 队友之间不直接互看产出：theorist 的缺口清单只给 Leader 与 engineer，analyst 的处方只给 Leader 与 engineer；trainer 与 analyst 互相隔离（对抗盲区保留在训练/体检之间）
- Leader 不调解角色间的结论矛盾——矛盾在终报中原样呈现
- 熔断规则：连续 2 个任务包训练无提升 → trainer 停止训练转影子留档；analyst 判 INTERVENE → 处方必须转工程工单，不得只写报告了事
- 每个角色的证据要求只读优先：analyst/trainer 不得执行任何写操作

## Failure Handling

### (a) 队友失败

- **超时**：单角色超过 12 分钟 → 中止该轮，重试 1 次（附更窄的任务边界）；再失败 → 降级（见下）
- **输出畸形**（不符合 Output Schema）→ 重试 1 次并在派发提示中附上 Schema 违规点；再失败按该角色缺失处理
- **角色缺失时的降级**：
  - 缺 theorist → Leader 以 inline persona 自评，但终报必须标注"理论门禁降级为自评，对抗性损失"
  - 缺 trainer → 第 4 步只跑体检，训练闭环标记 SKIP
  - 缺 analyst → 第 4 步只跑训练，拓扑体检标记 SKIP 并警示回炉泄漏风险未检测
  - 缺 engineer → 整个运行降级为"设计 + 评审 + 训练"纯产出模式，不触碰代码

### (b) 输入过规模降级

- 设计稿 > 5000 字 → Leader 先输出摘要版供 theorist 评审，全文留档
- 任务包 > 500 条 → trainer 按确定性种子采样 500 条内子集，报告中标注采样率
- 知识库实体 > 5000 → analyst 分区采样体检（按类型分层抽样），报告标注覆盖范围
- 代码 diff > 2000 行 → 降级为 engineer 单角色模式（跳过训练与体检），仅交付实现与回归
