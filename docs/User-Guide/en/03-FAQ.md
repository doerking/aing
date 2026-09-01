# FAQ

> The 10 most-asked questions. Still stuck? Open an Issue on the repo.

## 1. Do I have to install Tolaria?

No. aing doesn't depend on any note-taking app. A plain text editor + Git + Node runs the full metabolism loop. Tolaria / Obsidian / VS Code / vim are all optional front-end shells.

## 2. Can I use Obsidian?

Yes. aing isn't picky about the front end — point your Obsidian vault at the aing directory. But aing doesn't depend on any Obsidian features — it just reads Markdown files.

## 3. Will it delete my files?

Never. "Pruning" only moves entities to `pruned/archive/`. The original MD file is always preserved — in `raw/`, and in Git history. Prune ≠ delete.

## 4. Do I need to be online all the time?

No. aing is a pure local Node.js script. It never goes online unless you manually configure a cloud API.

## 5. Do I need Docker / PostgreSQL / Redis?

None of them. The graph is stored as Markdown files (`wiki/entities/`, `wiki/links/`), with some data in sql.js (in-memory SQLite). Backup is just copying the `knowledge.db` file.

## 6. Will a normal PC run it?

Yes. The target hardware is an ordinary home / budget PC: 2 GB RAM + mechanical HDD is enough. Vector search uses 64-dim char n-gram hash — very lightweight.

## 7. Do I need to tune those numbers (80/65/75)?

Defaults are fine — run it for 3 months first. For what they mean, see the [KESPI Threshold Guide](./02-KESPI-Threshold-Guide.md). Tuning is just 3 fields in `scripts/growth.config.js`, restart the script to apply (no hot-reload currently).

## 8. Do I have to watch it every day?

99% of the time, no. Only 4 cases need you: KESPI red 3 runs in a row, a core-logic contradiction found during cross-domain pollination, threshold changes, or regen-cooldown rule changes. Everything else is automatic.

## 9. Can a team use it?

Current version is a single-user local tool. There is no HTTP API server, no multi-client sync. For team collaboration, set up your own Git workflow.

## 10. How does this relate to Karpathy's LLM Wiki?

Not a fork — a paradigm upgrade. LLM Wiki = knowledge compilation (ingest → compile → query, linear, static). aing = layered metabolism on top of those three layers (raw/wiki/schema): sprouting, pollination, mustard seed, regeneration, expiry — from "static asset" to "living ecosystem." Details in the [Architecture doc](../Engineering/ARCHITECTURE.md).

---

> Prev: [KESPI Threshold Guide](./02-KESPI-Threshold-Guide.md) ｜ Next: [The Knowledge Base Perceives, Thinks & Reports](./04-Consciousness-Neural.md)
