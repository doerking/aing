---
tags: ["aing", "治理", "红线", "双证据", "绿灯解锁", "汇报面板"]
---

# Governance Group: Red Lines, Dual Evidence & Report Panels

The full rules live in `E:\aing\AGENTS.md` (Agent discipline section) — read that; this file only explains why.

## Five red lines

1. **Green-light unlocks**: a capability may be written into docs and reports only after all-green verification. Every claim must answer "where is the verification record". Component-in-repo ≠ capability-available (metacognition and recycle step-11 are both "in repo, unwired" — that's the only way to phrase them).
2. **Dual evidence**: judging master truth requires code close-reading + shadow test. Historical lesson: grep-only judging misfired twice (tri-path mock reported as real; growth-director reported as sick when healthy).
3. **No fake checkboxes**: Roadmap `[x]` must be real; a fake check is immediately reverted to `[ ]` with current status noted.
4. **No heuristic score fakes**: gate scores must come from real data sources (KESPI computed from actual store entities); hand-rolled scoring functions are a bug category, not an implementation choice.
5. **Single threshold source**: all thresholds live in growth.config.js; no hardcoding inside components; env overrides are implemented only in that file (envNum pattern).
6. **Component transparency (AGENTS.md rule 8, added 2026-09-04)**: on first introduction of aing to a user, or when the user wants to implement/enable features, present the basic component list in **plain text, one line each** (name + what it does for the user + status: live / in-library-unwired / in-design) and let the user pick what to implement. Never default the scope to "everything on", never show only live parts while hiding unwired ones. Plain-text template: `E:\aing\docs\AGENT-ONBOARDING.md` Step 6; status source: GREEN-LIST.md.
7. **Deploy exactly what the source says (AGENTS.md rule 9, added 2026-09-04)**: deployed artifacts = source; no code edits or hot-fixes on deployed instances. Context matters: shadow-SOP repair is the maintainer-yard flow (don't impose it on downstream); downstream git-clone deployments fix via source-branch patches + diff merge-back. Lesson (2026-09-04): the word "shadow" appeared in public docs without context, and a downstream agent started building its own before being stopped — mechanism vocabulary in public docs must carry its context or be explicitly marked maintainer-side.

## Report panel (mandatory)

After any deploy/modification, paste the complete verify-deploy report:

```
✅ C1 Node.js runtime
✅ C2 three dependencies
✅ C3 raw/ sources
✅ C4 DB integrity & vector index
✅ C5 local semantic model
✅ C6 semantic search smoke
🟢 ALL GREEN —— deploy verified
```

Missing this panel = incomplete report. Historical lesson: Group B's self-score drifted 80%→93%→98% precisely because self-reported progress had no machine panel anchoring.

## Arbitration posture for external reports

For any third-party report (e.g. Group B), check three things first: do claims contradict the code (e.g. "tenant isolation" vs "write protection" in the same doc), are metrics self-invented, do they cross governance red lines (bypass wiring, config write-back). Only dual evidence settles arbitration; a report itself is not evidence.
