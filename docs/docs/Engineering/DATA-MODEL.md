# Data Model / 数据模型

> aing uses **dual storage**: fs-based Markdown files (primary) + sql.js in-memory SQLite (secondary).
> This document describes both.

## 1. fs-Based Storage (Primary)

Most aing scripts use the filesystem directly. No SQLite is involved.

### wiki/entities/*.md

Each compiled entity is a Markdown file with YAML frontmatter:

```yaml
---
name: Entity Name
type: Concept
id: entity-id
created: 2026-01-01T00:00:00.000Z
modified: 2026-01-01T00:00:00.000Z
tags: ["tag1", "tag2"]
status: active
confidence: 0.7
source: source-file.md
---
```

Body contains:
- Source reference
- Content (first 500 chars)
- Relations (wikilinks)
- KESPI status (JSON block — legacy 5-dim format; current code computes 8-dim KQ/KG/KA/KM/KD/KC/KR/KB from database)

### wiki/links/*.md

Each link is a Markdown file:

```yaml
---
source: source-entity-id
target: target-entity-id
type: relates_to
created: 2026-01-01T00:00:00.000Z
---
```

### wiki/type-index/*.md

Type index files listing entities by type:
```
- [[entity-id-1]]
- [[entity-id-2]]
```

### mustard-seeds/compressed/index.json

Compressed mustard seed index (text slicing, first 200 chars).

### pruned/archive/

Archived pruned entities (90-day inactive threshold).

## 2. sql.js Storage (Secondary)

Only `knowledge-store.js` uses SQLite (via `require('sql.js')`, in-memory).

### entities

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | Entity ID |
| name | TEXT | Entity name |
| type | TEXT | Entity type |
| content | TEXT | Entity content |
| tags | TEXT | JSON array of tags |
| status | TEXT | 'active' by default |
| confidence | REAL | 0.0 by default |
| source_file | TEXT | Source file path |
| created_at | DATETIME | Creation time |
| updated_at | DATETIME | Update time |

### links

| Column | Type | Description |
|---|---|---|
| source_id | TEXT | Source entity ID |
| target_id | TEXT | Target entity ID |
| relation | TEXT | Relation type |
| confidence | REAL | 0.0 by default |
| created_at | DATETIME | Creation time |
| PK | (source_id, target_id) | Composite primary key |

### type_index

| Column | Type | Description |
|---|---|---|
| entity_type | TEXT | Entity type |
| entity_id | TEXT | Entity ID |
| created_at | DATETIME | Creation time |
| PK | (entity_type, entity_id) | Composite primary key |

### entity_metadata

| Column | Type | Description |
|---|---|---|
| entity_id | TEXT PK | Entity ID (FK to entities) |
| originality | REAL | 5-dim KESPI score |
| relevance | REAL | 5-dim KESPI score |
| consistency | REAL | 5-dim KESPI score |
| provability | REAL | 5-dim KESPI score |
| utility | REAL | 5-dim KESPI score |
| kespi_score | REAL | Average of 5 dims |
| last_checked_at | DATETIME | Last check time |
| metadata | TEXT | JSON metadata |

### entity_embeddings

| Column | Type | Description |
|---|---|---|
| entity_id | TEXT PK | Entity ID (FK to entities) |
| embedding | BLOB | 64-dim char n-gram hash vector |
| dimension | INTEGER | Vector dimension (64) |
| model | TEXT | 'char-ngram-hash-64' |
| created_at | DATETIME | Creation time |

### error_log

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK AUTO | Auto-increment ID |
| error_code | INTEGER | Error code |
| error_type | TEXT | Error type |
| entity_id | TEXT | Related entity |
| message | TEXT | Error message |
| context | TEXT | JSON context |
| retries | INTEGER | Retry count |
| max_retries | INTEGER | Max retries (3) |
| status | TEXT | 'pending' / 'resolved' |
| created_at | DATETIME | Creation time |
| resolved_at | DATETIME | Resolution time |

### kespi_history

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK AUTO | Auto-increment ID |
| entity_id | TEXT | Entity ID (FK to entities) |
| overall_score | REAL | Weighted 8-dim overall score |
| dimension_scores | TEXT | JSON: {KQ, KG, KA, KM, KD, KC, KR, KB, rawOverall, decayFactor, overall} |
| created_at | DATETIME | Check timestamp |

Each KESPI check appends a new row. Latest row per entity = current 8-dim scores.

## 3. KESPI Dimensions

### 8-Dimensional (growth.config.js + kespi-check.js)

**Current implementation**: `kespi-check.js` reads entities from database, computes 8-dim scores via `calcKQ~calcKB()`, writes to `kespi_history.dimension_scores`, updates `entity_metadata.kespi_score`.

| Code | Name | Weight | Yellow Threshold | Red Threshold | Action |
|---|---|---|---|---|---|
| KQ | Quality / 质量 | 0.15 | < 0.70 | = 0.00 | verify_conflict |
| KG | Growth / 生长 | 0.12 | < 0.05 | = 0.00 | pollinate_orphan |
| KA | Assetization / 资产化 | 0.13 | < 0.60 | = 0.00 | transplant_remind |
| KM | Metabolism / 代谢 | 0.12 | 0.60–0.74 | ≥ 0.75 | regenerate_expired |
| KD | Density / 密度 | 0.13 | > 0.20 | = 0.00 | link_suggest |
| KC | Retrieval / 检索 | 0.10 | < 0.70 | = 0.00 | optimize_index |
| KR | Response / 回答 | 0.15 | < 0.85 | = 0.00 | fine_tune |
| KB | Block / 阻断 | 0.10 | = 0.00 | ≥ 1 | freeze_writes |

Overall thresholds: greenLight=0.80, yellowLight=0.65

**Calculation logic**:
- **KQ**: confidence × 0.7 + content_length_bonus × 0.3
- **KG**: exponential decay from `updated_at` (24h half-life)
- **KA**: tags count × 0.15 + source_file bonus 0.3
- **KM**: based on `last_checked_at` recency (7d=1.0, 30d=0.0)
- **KD**: inverse of link count (0 links=1.0/orphan, 5+=0.0/healthy)
- **KC**: embedding presence 0.8 + content length bonus 0.2
- **KR**: content structure (code blocks, refs, headings) + length
- **KB**: pending error count (0=0.0, 1=0.5, 3+=1.0)

### 5-Dimensional (legacy, entity_metadata table)

| Dimension | Description |
|---|---|
| originality | Originality score |
| relevance | Relevance score |
| consistency | Consistency score |
| provability | Provability score |
| utility | Utility score |

kespi_score = average of 5 dimensions. This is the legacy format stored in `entity_metadata`. The current `kespi-check.js` writes 8-dim scores to `kespi_history` and updates `entity_metadata.kespi_score` with the 8-dim weighted overall.

## 4. Entity Types

Entity types are determined by YAML frontmatter `type` field in raw/*.md files.
compile.js auto-generates type if not specified (defaults to 'Concept').

Type index files are created in `wiki/type-index/` for each type.

## 5. Link Types

All links created by compile.js have type `relates_to`.
sprout.js generates link suggestions based on keyword similarity.
pollinate.js creates cross-domain links based on Jaccard similarity.

## 6. What Does NOT Exist

The following tables/concepts are described in older docs but **do not exist in code**:
- meta_knowledge_capsule
- jiezi (as a database table)
- pollination_log
- expiry_event
- kespi_snapshot
- trigger_log
- fts5_content (FTS5 virtual table)
- sqlite-vec extension
- trace_id column in any table
- vitality / attention columns in entities
- is_active / last_activated columns in links
