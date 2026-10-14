# 一周剪断代谢链路 | Weekly Auto-Prune Pipeline

> 补现有 Wiki「Metabolism / 代谢」章节的流程留白。补全「一周无活动 → 剪断 → 亮绿灯」完整逻辑。

## 完整流水线

```
定时触发器（每日凌晨运行）
    ↓
扫描links表：筛选 `last_activated < NOW() - INTERVAL '7 DAY'` 的知识边
    ↓
BEFORE触发器：DDD审查
    ├─ 若为核心知识（confidence≥0.8/被高频引用）：跳过剪断，标记为「保护状态」
    └─ 若为普通知识：进入剪断流程
    ↓
执行剪断：删除links表中对应记录，将原内容移入pending_prune临时区
    ↓
芥子压缩：调用Mustard Seed Compressor生成jiezi记录
    ↓
元知识匹配：关联meta_knowledge_capsule表，插入对应胶囊
    ↓
次日KESPI快照：评估新生成jiezi的transplant_readiness
    ├─ ≥0.75：自动亮绿灯，移入有用知识队列，更新links表
    └─ <0.75：保持pending状态，等待后续授粉/再生
    ↓
日志记录：写入expiry_event表，关联trace_id
```

## 设计说明

- **剪断不是删除**：原 MD 文件仍保留在 Tolaria 中，仅删除图谱关联边，避免数据丢失
- **亮绿灯不是人工审批**：由 KESPI 自动判定，无需人工介入，符合「升级版不用出手」的使用习惯
- **可回收性**：即使剪断后亮绿灯失败，仍可通过手动触发 `regenerate_expired` 任务重新激活

---

*版本：v1.0 | 日期：2026-07-16*
