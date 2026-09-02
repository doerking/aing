# ADR-001: From Compilation to Metabolism

- **Status:** Accepted (2026-07)
- **Decider:** @doerking

## Context

Karpathy's LLM Wiki established the "knowledge compilation" paradigm: Raw → Wiki → query, compiled once, static thereafter.

- **Breakthrough:** knowledge compounds
- **Limitation:** growth is linear, no liveness, no self-correction

## Decision

Overlay an **active metabolism layer** on the Order Brain:

- Keep Karpathy's three layers (raw/wiki/schema) as the **Order Brain**
- Add **Growth Brain**: sprouting, pollination, mustard seed, tissue culture, expiry, regeneration
- Introduce **KESPI** (8-dimension self-check) as the metabolism health dashboard

## Consequences

### Positive

- Knowledge moves from "static asset" → "living ecosystem"
- Theoretically unbounded (graph + vector + mustard compression + metabolic pruning)
- "90-day-no-activity → prune → green-light" enables automatic purification

### Negative / Open

- Complexity rises (maintaining the metabolism loop, calibrating thresholds)
- KESPI weights & transplant readiness need ~3 months of data to stabilize
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

## References

- Karpathy A. "LLM Wiki: An idea file..." 2026
- Project Wiki: 《双脑架构完整设计》
