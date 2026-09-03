# Auto-Ingest / 会话自动入库

> Every Q&A in a session is automatically ingested as evidence.

## One Line

Conversation is knowledge. Every Q&A is auto-written to `raw/`, compiled into `wiki/`, self-checked by KESPI — fully traceable.

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minMessageLength` | 20 | Minimum message length (chars), shorter messages are skipped |
| `maxMessagesPerBatch` | 5 | Max messages per batch |
| `batchIntervalMs` | 30000 | Batch interval (30 seconds) |
| `autoCompile` | true | Auto-compile after ingest |
| `autoSprout` | false | Auto-sprout after ingest (disabled by default) |

## Ingest Flow

```
User message (>=20 chars)
    ↓
SessionStore collects
    ↓
[Every 5 messages OR every 30s] triggers ingest
    ↓
Generate Markdown file → raw/
    ↓
compile.js compiles → wiki/
    ↓
kespi-check.js self-check
```

## Entity Extraction

Automatically extracts from messages:
- `# tag` → tags
- `[[entity]]` → entities
- `**bold**` → entities

## File Layout

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

## Manual Trigger

```bash
# Single message ingest
node src/auto-ingest.js <session-id> "message content"

# Compile all
node src/compile.js --base-dir knowledge-base

# Full metabolism
# Full metabolism (package-root based; --base-dir is not supported here)
node src/run-metabolism.js --force
```

## Core Class

`auto-ingest.js` exports `SessionStore` and `CONFIG`:

| Method | Description |
|--------|-------------|
| `addMessage(sessionId, message)` | Add message, auto-check ingest trigger |
| `extractEntities(content, session)` | Extract entities and tags from message |
| `checkAndIngest(sessionId)` | Check trigger conditions, ingest if met |
| `ingestSession(sessionId)` | Generate MD file to raw/, trigger compile |
| `triggerCompile(rawPath)` | Call compile.js to compile |
