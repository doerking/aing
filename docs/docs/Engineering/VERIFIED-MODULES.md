# Verified Modules / 已验证模块

> These modules have been implemented and tested in the aing codebase.
> Test environment: Node.js single process + fs-based storage + sql.js in-memory SQLite.

## 1. Order Brain Compiler (compile.js)

- Reads `raw/*.md` files, parses YAML frontmatter
- Creates `wiki/entities/*.md` with structured content
- Creates `wiki/links/*.md` for bidirectional links
- Creates `wiki/type-index/*.md` for type-based indexing
- Performs Git commit after compilation
- Generates KESPI scores using Math.random() (placeholder values)

✅ Verified: compiles raw MD files into structured wiki entities and links.

## 2. Sprouting Engine (sprout.js)

- Calculates keyword similarity between entities
- Generates link suggestions based on shared keywords
- English-only stop words: `the, a, an, is, are, was, were, in, on, at, to, for, of, and, or, but`

✅ Verified: generates link suggestions for English content.
⚠️ Limitation: does not support Chinese/Japanese/Korean keywords.

## 3. Cross-Domain Pollination (pollinate.js)

- Pairs entities across different types/domains
- Uses Jaccard similarity for matching
- Creativity scoring for cross-domain connections
- English-only stop words (same as sprout.js)

✅ Verified: creates cross-domain links between entities.
⚠️ Limitation: does not support Chinese/Japanese/Korean keywords.

## 4. Mustard Seed Compression (compress.js)

- Text slicing: `content.slice(0, 200).trim()`
- inactiveDaysThreshold = 30
- minContentLength = 50
- maxCompressedSize = 1000

✅ Verified: compresses entity content by taking first 200 characters.
⚠️ Note: This is text slicing, NOT LLM-based semantic compression.

## 5. Pruning (prune.js)

- inactiveDaysThreshold = 90
- minKespiScore = 0.5
- move_to_archive = true

✅ Verified: prunes entities inactive for 90+ days, moves to archive.

## 6. KESPI Self-Check (kespi-check.js)

- 8-dimensional weighted scoring (KQ/KG/KA/KM/KD/KC/KR/KB) via `calcKQ~calcKB()`
- Reads entities from database (`knowledge-store.js`), not from `.md` files
- Writes 8-dim scores to `kespi_history.dimension_scores` (JSON)
- Updates `entity_metadata.kespi_score` with weighted overall
- 3-color light status: 🟢 ≥0.80, 🟡 ≥0.65, 🔴 <0.65
- Dimension-specific thresholds and triggers from `growth.config.js`

✅ Verified: 17/17 entities pass, avg 0.75. 8-dim scores computed and stored in `kespi_history`.

## 7. Consciousness Neural Architecture

Three layers implemented:

### Sensory Endings (sensory-ends.js)
- File system polling (5s interval)
- Detects new/modified .md files

### Neural Guide Chain (neural-guide-chain.js)
- Attention scoring: vitality×0.3 + recency×0.25 + connectionDensity×0.2 + anomaly×0.15 + userInterest×0.1

### Consciousness Layer (consciousness-layer.js)
- Generates briefing: hotspots, alerts, recommendations

✅ Verified: 3-layer neural architecture implemented and functional.

## 8. Metacognition Layer (metacognition-layer.js)

- Self-check → Evaluate → Adjust
- Three-layer self-reflection

✅ Verified: metacognition layer implemented.

## 9. Tri-Path Orchestrator (tri-path-orchestrator.js)

- Three paths: EXPLORE, VERIFY, OPTIMIZE
- Circuit breaker: failureThreshold=5, resetTimeout=60000ms, halfOpenMax=3

✅ Implemented.
⚠️ **Current state**: `runPath()` returns mock data (`['候选 A', '候选 B', '候选 C']`). Real path execution is not yet implemented.

## 10. Knowledge Store (knowledge-store.js)

- sql.js in-memory SQLite
- Tables: entities, links, type_index, entity_metadata, entity_embeddings, error_log
- Entity CRUD, link management, KESPI score storage, error logging

✅ Verified: SQLite storage layer functional.

## 11. Vector Search (vector-search.js)

- 64-dim char n-gram hash
- Cosine similarity
- getStatus() reports `model: 'char-ngram-hash-64'`

✅ Verified: vector search with 64-dim hash vectors.

## Verification Summary

| Module | Status | Notes |
|---|---|---|
| Order Brain Compiler | ✅ | fs-based, Git commit |
| Sprouting Engine | ✅ | English-only |
| Cross-Domain Pollination | ✅ | English-only |
| Mustard Seed Compression | ✅ | Text slicing (not LLM) |
| Pruning | ✅ | 90-day threshold |
| KESPI Self-Check | ✅ | 8-dim weighted |
| Consciousness Neural | ✅ | 3-layer |
| Metacognition | ✅ | 3-layer |
| Tri-Path Orchestrator | ⚠️ | Mock data only |
| Knowledge Store | ✅ | sql.js |
| Vector Search | ✅ | 64-dim hash |

## What Does NOT Exist

The following features are described in older docs but **do not exist in code**:
- Multi-model AI Provider routing
- Neural Guide Chain with trace_id
- Multi-Agent Data Chain
- chokidar file watching
- Express HTTP API server
- scheduler/cron
- config hot-reload
- fts5 full-text search
- sqlite-vec extension
- Tolaria integration
- LLM-based compression
- 768-dim vector embeddings
