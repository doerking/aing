# Knowledge Base

## 目录结构

```
knowledge-base/
├── raw/                    # 原始资料（只读）
│   ├── articles/
│   ├── research/
│   └── notes/
│
├── wiki/                   # 编译后的知识
│   ├── entities/
│   ├── links/
│   ├── capsules/
│   └── type-index/
│
├── schema/                 # 编译规则
├── mustard-seeds/          # 芥子库
├── pruned/                 # 剪枝归档
├── logs/                   # 代谢日志
├── scripts/                # 代谢引擎
├── references/             # 参考文档
└── guides/                 # 使用指南
```

## 快速开始

```bash
# 放入第一份资料
echo "# 标题

内容...

---
name: test-entity
type: Concept
tags: [test]
status: active
" > raw/articles/test.md

# 运行编译
node scripts/compile.js

# 运行代谢
node scripts/run-metabolism.js
```
