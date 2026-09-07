---
tags: ["aing", "运维", "部署", "验收", "代谢", "常驻服务", "冒烟"]
---

# Ops Group: Deploy, Verify & Daily Running

## One-command deploy (in order, no skipping; details in `E:\aing\AGENTS.md`)

```bash
# at the aing package root
npm install              # installs sql.js / @xenova/transformers / sharp in one shot
node verify-deploy.js    # machine-judged acceptance; exit 0 = ALL GREEN (or npm run verify)
```

Checks C1–C6: Node ≥18, the three dependencies, raw/ sources, DB & vector index, local semantic model, real semantic-search hits. Any ❌ → fix per AGENTS.md triage table and rerun until green; bypassing is forbidden.

## Known deploy pitfalls (details in AGENTS.md "Known pits")

Never install sharp with `--ignore-scripts`; model downloads must go through hf-mirror.com; .ps1 files must keep their BOM; always a single `npm install`, never split into per-package installs.

## Daily running

```bash
node src/run-metabolism.js --smart                # metabolism main loop (smart mode)
node src/index-vectors.js --semantic --reindex    # semantic rebuild after content changes (semantic by default when model present, --hash forces hash fallback)
npm run scheduler                                 # resident scheduler (interval metabolism + raw/ polling, default 30min)
npm run server                                    # HTTP API (default 3789; set AING_API_KEY for 0.0.0.0 + Bearer)
node src/query.js "keyword" [--limit N] [--names] # query CLI (semantic+fuzzy fusion, with KESPI score)
npm run verify                                    # re-verify anytime; must stay ALL GREEN
```

## Script map

All 43 src modules are catalogued in `E:\aing\README.md`'s categorized script tables (core pipeline / decision layer / consciousness-neural / resident services / repair & maintenance). Check the table before using a script; don't guess parameters.

## Smoke discipline

Read-only scripts (query, generate-analysis-report, metabolism-log) can be smoke-run directly; mutating tools (fix-kespi / fix-tags / kespi-enhance / init-knowledge-base / sql-migrate) get syntax checks only in the master package — actually running them mutates the DB baseline and breaks verify-deploy reproducibility. To really run them, go to a shadow directory.
