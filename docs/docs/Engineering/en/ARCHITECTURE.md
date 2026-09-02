# Architecture

> aing is a collection of standalone Node.js scripts (CommonJS `.js`), not a TypeScript project.
> No `src/` directory, no build step, no `package.json` with npm scripts.

## 1. Directory Layout

```
aing-deploy/
├── scripts/
│   ├── compile.js              # Order Brain: raw/*.md → wiki/entities/*.md
│   ├── sprout.js               # Sprouting: keyword similarity, link suggestions
│   ├── pollinate.js            # Cross-domain pollination (Jaccard)
│   ├── compress.js             # Mustard seed compression (text slicing)
│   ├── prune.js                # Pruning (90-day inactive threshold)
│   ├── shared-spine.js         # Compile validation (minKespi=0.65)
│   ├── kespi-check.js          # KESPI self-check (8-dim weighted)
│   ├── run-metabolism.js       # Orchestrator (shells out to scripts)
│   ├── neural-architecture.js  # Consciousness neural 3-layer
│   ├── tri-path-orchestrator.js # Tri-path with circuit breaker
│   ├── metacognition-layer.js  # Metacognition 3-layer
│   ├── consciousness-layer.js  # Consciousness output layer
│   ├── sensory-ends.js         # Sensory layer (file polling, 5s interval)
│   ├── neural-guide-chain.js   # Guide chain (attention scoring)
│   ├── knowledge-store.js      # sql.js in-memory SQLite
│   ├── vector-search.js        # 64-dim char n-gram hash
│   ├── kespi-enhance.js        # KESPI enhancement (5-dim)
│   ├── self-growth.js          # Self-growth core
│   ├── error-handler.js        # Error code action table
│   ├── growth.config.js        # Config (kespi + jiezi only)
│   └── ... (test/debug scripts)
├── raw/                        # Input: raw Markdown files
├── wiki/
│   ├── entities/               # Compiled entity files (*.md)
│   ├── links/                  # Link files (*.md)
│   ├── type-index/             # Type index files (*.md)
│   └── index.md                # Main wiki index
├── mustard-seeds/
│   └── compressed/             # Compressed mustard seed index.json
├── pruned/
│   └── archive/                # Pruned entity archive
├── knowledge.db                # sql.js SQLite database
└── logs/                       # Log files
```

## 2. Storage Layer

aing uses **dual storage**:

| Layer | Mechanism | Used By |
|---|---|---|
| **fs-based** | Markdown files in `wiki/entities/`, `wiki/links/`, `mustard-seeds/`, `pruned/` | compile, sprout, pollinate, compress, prune, shared-spine, kespi-check, run-metabolism, neural-architecture, tri-path, metacognition, consciousness, sensory-ends, neural-guide-chain |
| **sql.js** | In-memory SQLite via `require('sql.js')` | knowledge-store.js, self-growth.js, kespi-enhance.js, vector-search.js |

> **No better-sqlite3** (except sql-migrate.js which is a standalone migration utility).
> **No chokidar, no Express, no sqlite-vec, no fts5.**

## 3. KESPI Scoring System

aing has a **dual KESPI system**:

### 8-Dimensional (growth.config.js + kespi-check.js)

**Current implementation**: `kespi-check.js` reads entities from database (`knowledge-store.js`), computes 8-dim scores via `calcKQ~calcKB()`, writes to `kespi_history.dimension_scores` (JSON), updates `entity_metadata.kespi_score`.

| Code | Name | Weight | Calculation |
|---|---|---|---|
| KQ | Quality | 0.15 | confidence × 0.7 + content_length_bonus × 0.3 |
| KG | Growth | 0.12 | exponential decay from `updated_at` (24h half-life) |
| KA | Assetization | 0.13 | tags count × 0.15 + source_file bonus 0.3 |
| KM | Metabolism | 0.12 | `last_checked_at` recency (7d=1.0, 30d=0.0) |
| KD | Density | 0.13 | inverse of link count (0=1.0/orphan, 5+=0.0/healthy) |
| KC | Retrieval | 0.10 | embedding presence 0.8 + content length bonus 0.2 |
| KR | Response | 0.15 | content structure (code, refs, headings) + length |
| KB | Block | 0.10 | pending error count (0=0.0, 1=0.5, 3+=1.0) |

Thresholds: greenLight=0.80, yellowLight=0.65

**Storage**: `kespi_history` table — each check appends a row with `dimension_scores` (JSON). Latest row per entity = current 8-dim scores.

### 5-Dimensional (kespi-enhance.js + knowledge-store.js entity_metadata)

| Dimension | Source |
|---|---|
| originality | kespi-enhance.js |
| relevance | kespi-enhance.js |
| consistency | kespi-enhance.js |
| provability | kespi-enhance.js |
| utility | kespi-enhance.js |

### Compile-time KESPI (compile.js)

compile.js generates KESPI scores using **Math.random()** (placeholder values):
- freshness: 0.7–1.0
- relevance: 0.7–1.0
- originality: 0.8–1.0
- consistency: 0.8–1.0
- provability: 0.7–1.0
- overall: 0.7–1.0

> ⚠️ These are random placeholder scores, not real analysis.

## 4. Consciousness Neural Architecture

Three layers implemented in code:

```
Sensory Endings (sensory-ends.js)
  → file system polling (5s interval, NOT chokidar)
  → detects new/modified .md files

Neural Guide Chain (neural-guide-chain.js)
  → attention scoring: vitality×0.3 + recency×0.25 + connectionDensity×0.2 + anomaly×0.15 + userInterest×0.1
  → ranks entities by attention score

Consciousness Layer (consciousness-layer.js)
  → generates briefing: hotspots, alerts, recommendations
```

## 5. Metacognition Layer

Three-layer self-reflection (metacognition-layer.js):
1. **Self-check** — validate own reasoning
2. **Evaluate** — assess output quality
3. **Adjust** — modify approach based on evaluation

## 6. Tri-Path Orchestrator

Three parallel paths with circuit breaker (tri-path-orchestrator.js):
- **EXPLORE** — discover new connections
- **VERIFY** — validate existing knowledge
- **OPTIMIZE** — improve structure

Circuit breaker: failureThreshold=5, resetTimeout=60000ms, halfOpenMax=3

> ⚠️ **Current state**: `runPath()` returns mock data (`['候选 A', '候选 B', '候选 C']`). Real path execution is not yet implemented.

## 7. Metabolism Pipeline

run-metabolism.js orchestrates the pipeline by **shelling out to individual scripts** via `execSync`:

```
shared-spine → compile → sprout → pollinate → compress → kespi → prune
```

> **No SQL-based pipeline.** Each step is a separate Node.js process.

## 8. Vector Search

vector-search.js implements **64-dim char n-gram hash** (NOT 768-dim all-MiniLM-L6-v2):
- Simple hash function for character n-grams
- Cosine similarity for matching
- getStatus() reports `model: 'char-ngram-hash-64'`

## 9. Compression

compress.js uses **text slicing** (NOT LLM-based semantic compression):
- `content.slice(0, 200).trim()` — takes first 200 characters
- inactiveDaysThreshold = 30
- minContentLength = 50
- maxCompressedSize = 1000

## 10. Pruning

prune.js:
- **inactiveDaysThreshold = 90** (NOT 7)
- minKespiScore = 0.5
- move_to_archive = true

## 11. Language Support

sprout.js and pollinate.js use **English-only stop words**:
`the, a, an, is, are, was, were, in, on, at, to, for, of, and, or, but`

> ⚠️ **No Chinese/Japanese/Korean support** in keyword extraction.

## 12. What Does NOT Exist

The following features are described in older docs but **do not exist in code**:
- chokidar file watching
- Express HTTP API server
- trace_id system
- scheduler/cron
- config hot-reload
- multi-model AI routing
- multi-agent data chain
- IGrowthEngine interface
- Shared Graph API
- fts5 full-text search
- sqlite-vec extension
- Tolaria integration
- LLM-based compression
- 768-dim vector embeddings
- src/ TypeScript directory
- package.json with npm scripts
- 7-day pruning threshold
- BEFORE triggers
- meta_knowledge_capsule table
- jiezi table
- pollination_log table
- expiry_event table
- kespi_snapshot table
- trigger_log table
