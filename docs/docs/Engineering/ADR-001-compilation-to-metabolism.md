# ADR-001: Compilation to Metabolism

## Status

Accepted

## Context

aing started as a knowledge compilation tool (raw → wiki). The evolution to "metabolism" adds sprouting, pollination, compression, and pruning on top of compilation.

## Decision

Move from a static compilation model to an active metabolism model:

1. **Compilation** (compile.js): raw/*.md → wiki/entities/*.md + wiki/links/*.md
2. **Sprouting** (sprout.js): keyword similarity → link suggestions
3. **Pollination** (pollinate.js): cross-domain pairing → new connections
4. **Compression** (compress.js): text slicing (first 200 chars) → mustard seeds
5. **Pruning** (prune.js): 90-day inactive threshold → archive

## Consequences

### Positive
- Knowledge base actively maintains itself
- Inactive content is compressed, not deleted
- Cross-domain connections are discovered automatically

### Negative
- Compression is text slicing, not semantic (no LLM involved)
- Sprouting and pollination are English-only
- No scheduler — pipeline must be run manually

## Implementation

- compile.js: reads raw/*.md, creates wiki/entities/*.md and wiki/links/*.md
- sprout.js: keyword similarity, English-only stop words
- pollinate.js: Jaccard similarity, English-only stop words
- compress.js: `content.slice(0, 200).trim()`
- prune.js: inactiveDaysThreshold = 90
- run-metabolism.js: orchestrates all steps via execSync

## What Does NOT Exist

- LLM-based compression (uses text slicing)
- 7-day pruning (actual is 90 days)
- sqlite-vec extension
- fts5 full-text search
- Tolaria dependency (aing is shell-agnostic)
