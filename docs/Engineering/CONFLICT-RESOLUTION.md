# Conflict Resolution / 冲突仲裁

> Defines priority when different components or decisions conflict.
> Based on actual code behavior, not hypothetical scenarios.

## Arbitration Priority (high → low)

| Scenario | Winner | Handling logic |
|---|---|---|
| KESPI red light vs growth task | **KESPI wins** | All non-critical growth pauses; resolve the blocker first |
| Cross-domain pollination tension vs existing graph | **Tension first** | Contradiction → generate `verify_conflict` action, never force-merge |
| Manual file edit vs automated compilation | **Manual wins** | compile.js skips files where entity mtime > source mtime |
| Pruning vs high-confidence entities | **High confidence wins** | prune.js skips entities with kespi_score >= minKespiScore (0.5) |

## Human Intervention Boundary

The following scenarios require human intervention:

1. KESPI stays red for 3 consecutive runs with no auto-recovery
2. Cross-domain pollination finds a core-logic contradiction (fundamental theory conflict)
3. Assetization threshold adjustment (`transplantThreshold` change)
4. Regeneration cooldown rule change

> Everything else is handled automatically by the scripts.

## What Does NOT Exist

The following conflict resolution mechanisms are described in older docs but **do not exist in code**:

- Tolaria Schema constraints
- BEFORE triggers in SQLite
- LLM.wiki generated content validation
- Shared Graph API conflict resolution
- trace_id-based conflict tracking
