# 会话自动入库 / Auto-Ingest

> 会话中一问一答即刻入库，作为呈堂证供。

## 一句话

对话即知识。每次问答自动写入 `raw/`，编译进 `wiki/`，KESPI 自检，全程留痕。

## 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `minMessageLength` | 20 | 最小消息长度（字符），低于此值跳过 |
| `maxMessagesPerBatch` | 5 | 每批最多处理消息数 |
| `batchIntervalMs` | 30000 | 批处理间隔（30 秒） |
| `autoCompile` | true | 入库后自动编译 |
| `autoSprout` | false | 入库后自动发芽（默认关闭） |

## 入库流程

```
用户消息 (>=20字符)
    ↓
SessionStore 收集
    ↓
[每5条 OR 每30秒] 触发入库
    ↓
生成 Markdown 文件 → raw/
    ↓
compile.js 编译 → wiki/
    ↓
kespi-check.js 自检
```

## 实体提取

自动从消息中提取：
- `# 标签` → tags
- `[[实体]]` → entities
- `**加粗**` → entities

## 文件位置

```
knowledge-base/
├── raw/
│   └── session-xxx-2026-08-24Txx-xx-xx.md
├── wiki/
│   ├── entities/
│   ├── links/
│   └── type-index/
└── logs/
    ├── daily-ingest.json
    └── compile-errors.log
```

## 手动触发

```bash
# 单条入库
node src/auto-ingest.js <session-id> "消息内容"

# 编译全部
node src/compile.js --base-dir knowledge-base

# 完整代谢（以包根为基准，run-metabolism 不支持 --base-dir）
node src/run-metabolism.js --force
```

## 核心类

`auto-ingest.js` 导出 `SessionStore` 和 `CONFIG`：

| 方法 | 说明 |
|------|------|
| `addMessage(sessionId, message)` | 添加消息，自动检查是否触发入库 |
| `extractEntities(content, session)` | 从消息提取实体和标签 |
| `checkAndIngest(sessionId)` | 检查触发条件，满足则入库 |
| `ingestSession(sessionId)` | 生成 MD 文件写入 raw/，触发编译 |
| `triggerCompile(rawPath)` | 调用 compile.js 编译 |
