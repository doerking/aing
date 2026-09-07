# 意识神经架构

## 三层模型

意识神经模块是双脑架构的"大脑皮层"，负责感知、决策、协调。

### 感知层 (Sensory Endings)

- 文件变更监控
- KESPI 变化检测
- 知识缺口扫描
- 时间节律触发

### 导链层 (Neural Guide Chain)

- 信号路由：事件 → 执行器映射
- 优先级排序：0=最高优先级
- 短路机制：高优先级成功可跳过后续

### 意识层 (Consciousness Layer)

- 系统健康简报
- 异常告警检测
- 趋势分析（7/14/30天）
- 状态输出：healthy / warning / critical

## 前额叶决策器

综合信号 + 评估结果，决定下一步动作：

| 动作 | 优先级 | 触发条件 |
|------|--------|----------|
| emergency_fix | 0 | KESPI 骤降 + 紧急度 critical |
| full_metabolism | 0 | 连续 3 次停滞 |
| targeted_pollinate | 1 | 高优先级知识缺口 |
| compile | 1 | 检测到新文件变化 |
| maintain | 3 | 连续 3 次健康 |
| observe | 5 | 无显著信号 |

## 多Agent蜂群

关键决策点 spawn 多个子Agent竞争择优：

- **分析型Agent**：深入诊断根因
- **行动型Agent**：快速响应执行
- **策略型Agent**：长期趋势规划

裁决模式：best / merge / council

## 信息流

```
感知信号 → 路由翻译 → 蜂群决策 → 执行调用 → 反馈学习
```

[tag:consciousness] [tag:neural] [tag:decision]
