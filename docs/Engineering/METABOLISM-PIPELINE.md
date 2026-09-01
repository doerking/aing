# Metabolism Pipeline / 代谢流水线

> run-metabolism.js orchestrates the metabolism pipeline by **shelling out to individual scripts** via `execSync`.
> This is NOT a SQL-based pipeline. Each step is a separate Node.js process.

## Pipeline Steps

```
shared-spine → compile → sprout → pollinate → compress → kespi → prune
```

| Step | Script | What it does |
|---|---|---|
| 1. Shared Spine | `shared-spine.js` | Validates compiled entities against KESPI threshold (minKespi=0.65), writes audit.jsonl |
| 2. Compile | `compile.js` | Reads raw/*.md, parses YAML frontmatter, creates wiki/entities/*.md and wiki/links/*.md, does git commit |
| 3. Sprout | `sprout.js` | Calculates keyword/tag/title similarity, generates link suggestions (English-only) |
| 4. Pollinate | `pollinate.js` | Cross-domain pairing by entity type, creativity scoring (English-only) |
| 5. Compress | `compress.js` | Mustard seed compression via text slicing (first 200 chars, NOT LLM) |
| 6. KESPI | `kespi-check.js` | 8-dim weighted KESPI self-check, 3-color light status |
| 7. Prune | `prune.js` | Prunes entities inactive for 90+ days, moves to archive |

## How It Works

run-metabolism.js uses `execSync` to run each script sequentially:

```javascript
execSync(`node ${scriptPath}`, { cwd: rootDir, stdio: 'inherit' });
```

Each script is a standalone Node.js CLI tool. They communicate via the filesystem:
- compile.js writes to `wiki/entities/` and `wiki/links/`
- sprout.js reads from `wiki/entities/` and writes suggestions
- pollinate.js reads from `wiki/entities/` and creates cross-domain links
- compress.js reads from `wiki/entities/` and writes to `mustard-seeds/compressed/`
- kespi-check.js reads from database (`knowledge-store.js`), computes 8-dim scores via `calcKQ~calcKB()`, writes to `kespi_history`
- prune.js reads from `wiki/entities/` and moves inactive ones to `pruned/archive/`

## Key Parameters

| Parameter | Value | Source |
|---|---|---|
| minKespi (shared-spine) | 0.65 | shared-spine.js |
| KESPI greenLight | 0.80 | growth.config.js |
| KESPI yellowLight | 0.65 | growth.config.js |
| compress inactiveDaysThreshold | 30 | compress.js |
| compress minContentLength | 50 | compress.js |
| compress maxCompressedSize | 1000 | compress.js |
| prune inactiveDaysThreshold | 90 | prune.js |
| prune minKespiScore | 0.5 | prune.js |

## What Does NOT Exist

- SQL-based pipeline (no SQL queries between steps)
- BEFORE triggers
- LLM-based compression (uses text slicing)
- 7-day pruning (actual is 90 days)
- jiezi transplant (not implemented)
- meta_knowledge_capsule (not implemented)
- trace_id propagation (not implemented)
- scheduler/cron (not implemented)
- chokidar file watching (not implemented)
