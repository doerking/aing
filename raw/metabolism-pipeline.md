# 代谢流水线

## 执行顺序

代谢流水线串联所有代谢引擎，执行完整的双脑代谢流程：

```
① Shared Spine 编译验证
② 秩序脑编译 (raw → wiki)
③ 生长脑发芽 (发现新关联)
④ 生长脑授粉 (跨域连接)
⑤ 生长脑压缩 (低频知识归档)
⑥ KESPI 自检 (质量门禁)
⑦ 剪枝清理 (过期知识归档)
```

## 各引擎说明

### 编译引擎 (compile.js)

- 输入: raw/*.md
- 输出: wiki/entities/*.md + DB
- 功能: 实体识别、元数据提取、类型分类

### 发芽引擎 (sprout.js)

- 发现实体间新关联
- 生成链接建议
- 写入 links 表

### 授粉引擎 (pollinate.js)

- 跨类型知识融合
- 概念映射表
- 知识图谱扩展

### 压缩引擎 (compress.js)

- 低频知识 → 芥子库
- 文本切片保存
- 保留召回能力

### KESPI 检查 (kespi-check.js)

- 八维质量评估
- 阈值检查
- 告警生成

### 剪枝引擎 (prune.js)

- 90天不活跃实体
- 归档到 pruned/
- 保留元数据

## 闭环机制

```
代谢前快照 → 执行代谢 → 代谢后快照
                ↓
          Delta 计算 (KESPI 变化)
                ↓
          Auto Tuner 参数调整
                ↓
          回写 growth.config.js
```

## 使用方式

```bash
# 完整流程
node src/run-metabolism.js

# 单步执行
node src/run-metabolism.js --step=compile
node src/run-metabolism.js --step=kespi

# 断点续传
node src/run-metabolism.js --resume
```

[tag:metabolism] [tag:pipeline] [tag:automation]
