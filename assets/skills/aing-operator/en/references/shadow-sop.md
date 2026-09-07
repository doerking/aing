---
tags: ["aing", "修复", "影子", "SOP", "定点同步", "Windows坑"]
---

# Repair Group: Shadow Discipline SOP

Any change to aing source code goes through five steps, none skipped:

1. **Copy a shadow**: robocopy the master package to `<sqa-root>/aing-shadow-<date>-<topic>\` (don't hand-pick files — verifying half the code in a shadow equals verifying nothing).
2. **Edit & verify inside the shadow**: all edits, unit tests, smoke runs, regressions happen there. Pass = module regression + shadow verify-deploy.
3. **Patch-sync**: copy back only the specific changed files (single-file robocopy or targeted copy). **Never move shadow run data** (knowledge.db, logs/, snapshots/, data/, __pycache__…) — run data is the shadow's autopsy site; mixing it into master pollutes the baseline.
4. **Master re-verify**: rerun master `verify-deploy.js`, paste the full green panel to the user.
5. **Bookkeeping**: bug ledger (<sqa-root>) event, qa.js archive, daily memory update.

## Windows pits at shadow sites (handbook iron rules; violating them = crash)

- **fs.watch is banned**: unreliable on Windows (sensory-ends lesson); monitoring features must use mtime-snapshot polling.
- **No `:` in filenames**: session IDs containing `::` cause ENOENT; sanitize with an `[a-zA-Z0-9\-_\u4e00-\u9fff]` whitelist before writing.
- **Never pipe long-running processes to `Select-Object -First N` in PowerShell**: pipe breakage kills the process tree; redirect long tasks to a file and read it.
- **KnowledgeStore is a direct export**: `const { KnowledgeStore } = require(...)` yields undefined; use `require('./knowledge-store')` directly.
- **getLatestKespi's score field is `overall_score`**, not `overall`.

## Dual-evidence posture for bug fixes

Reproduce bugs via real data paths first; when real data can't reach a threshold, monkey-patching deterministic input is allowed (e.g. bug#11: `_getVitality=()=>0.9` pushed attention to 0.900), but you must declare it a constructed scenario and re-verify with real data after the fix.
