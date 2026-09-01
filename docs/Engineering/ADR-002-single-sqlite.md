# ADR-002: Single SQLite Storage

## Status

Accepted

## Context

aing needs a lightweight, portable storage layer that works on budget hardware (2 GB RAM, mechanical HDD).

## Decision

Use **dual storage**:

1. **Primary: fs-based Markdown files** — Most scripts read/write `.md` files directly in `wiki/entities/`, `wiki/links/`, `mustard-seeds/`, `pruned/`.
2. **Secondary: sql.js in-memory SQLite** — `knowledge-store.js` uses `require('sql.js')` for structured entity/link/metadata storage.

## Consequences

### Positive
- No external database server needed
- Works on any machine with Node.js
- Markdown files are human-readable and Git-friendly
- sql.js requires no compilation (pure JS)

### Negative
- sql.js is in-memory — data must be saved to disk after each operation
- No FTS5 full-text search
- No sqlite-vec extension
- No better-sqlite3 (except in standalone sql-migrate.js utility)

## Implementation

- knowledge-store.js: `require('sql.js')`, creates tables on init
- Tables: entities, links, type_index, entity_metadata, entity_embeddings, error_log, kespi_history
- Vector search: 64-dim char n-gram hash (vector-search.js)
- Most scripts: fs-based, no SQLite at all

## What Does NOT Exist

- better-sqlite3 as primary storage (only in sql-migrate.js)
- sqlite-vec extension
- fts5 full-text search
- 384-dim or 768-dim vector embeddings
- compile-time extension loading
