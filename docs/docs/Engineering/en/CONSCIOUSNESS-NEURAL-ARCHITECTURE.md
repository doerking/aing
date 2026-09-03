# Consciousness Neural Architecture

> Implements the "感知 → 传导 → 输出" metaphor: Sensory Endings → Neural Guide Chain → Consciousness Layer.
> All three layers are implemented in code as standalone Node.js scripts.

## 1. Three Layers

```
🌿 Sensory Endings (sensing layer)   →   🔗 Neural Guide Chain (routing layer)   →   🧠 Consciousness (output layer)
    gather signals                        compute attention                         emit insight
```

| Layer | Script | Role |
|---|---|---|
| **Sensory Endings** 🌿 | `sensory-ends.js` | File system polling (5s interval), detects new/modified .md files |
| **Neural Guide Chain** 🔗 | `neural-guide-chain.js` | Attention scoring, ranks entities by priority |
| **Consciousness** 🧠 | `consciousness-layer.js` | Generates briefing: hotspots, alerts, recommendations |

## 2. Sensory Endings (sensory-ends.js)

File system polling (NOT chokidar):
- Polls `raw/` directory every 5 seconds
- Detects new and modified `.md` files
- Emits events for the guide chain to process

> ⚠️ This is **not** chokidar-based file watching. It's a simple polling loop.

## 3. Neural Guide Chain (neural-guide-chain.js)

Attention scoring formula:

```
attention = vitality × 0.3 + recency × 0.25 + connectionDensity × 0.2 + anomaly × 0.15 + userInterest × 0.1
```

- Ranks entities by attention score
- High-attention entities enter the consciousness layer
- Low-attention entities stay pending

## 4. Consciousness Layer (consciousness-layer.js)

Generates a briefing with:
- **Hotspots** — most active/important entities
- **Alerts** — entities needing attention (low KESPI, anomalies)
- **Recommendations** — suggested actions (sprout, pollinate, compress, prune)

## 5. What Does NOT Exist

The following features are described in older docs but **do not exist in code**:

- **trace_id system** — no global trace ID propagation
- **Shared Graph API** — no Express HTTP API server
- **chokidar file watching** — uses polling instead
- **Git hook integration** — no post-commit hooks
- **Webhook integration** — no webhook endpoints
- **Cron scheduling** — no scheduled triggers
- **better-sqlite3** — uses sql.js (in-memory SQLite)
- **fts5 full-text search** — not implemented
- **jiezi table** — not implemented
- **kespi_snapshot table** — not implemented
- **trigger_log table** — not implemented

## 6. Metacognition Layer (metacognition-layer.js)

Three-layer self-reflection:
1. **Self-check** — validate own reasoning
2. **Evaluate** — assess output quality
3. **Adjust** — modify approach based on evaluation

## 7. Tri-Path Orchestrator (tri-path-orchestrator.js)

Three parallel paths with circuit breaker:
- **EXPLORE** — discover new connections
- **VERIFY** — validate existing knowledge
- **OPTIMIZE** — improve structure

Circuit breaker: failureThreshold=5, resetTimeout=60000ms, halfOpenMax=3

> ⚠️ **Current state**: `runPath()` returns mock data (`['候选 A', '候选 B', '候选 C']`). Real path execution is not yet implemented.
