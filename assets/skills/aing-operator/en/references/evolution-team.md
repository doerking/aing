---
tags: ["aing", "评审", "进化团队", "五角色", "对抗结构", "拓扑"]
---

# Review Group: 5-Role Evolution Team Dispatch (internal/self-maintenance face)

## When to dispatch a team, when to go solo

Solo: code reading, small fixes, docs, deploy verification — governance red lines are enough constraint.
Dispatch a team: architecture design, systematic health checks, training-loop assessment — these tasks' blind spot is "one agent being both athlete and referee". Engineers lean toward "it runs, ship it"; theorists lean toward "if the mechanism doesn't hold, it's idle motion". Only separate roles expose that conflict.

**Ownership: internal face (self-maintenance dispatch)** — triggers come from aing's own health readings (selfAssessment / verify red / gaps / distillDebt), not from external work orders; external dispatch goes to host-runtime dynamic sub-agents with a separate entry point.

## Preferred: dispatch neural-evolution-swarm

When installed (`<skills-dir>\neural-evolution-swarm\`), dispatch five roles per its workflow.md:

| Role | Duty | Gate |
|---|---|---|
| neuro-theorist | 6-attribute computational consciousness + GWT/Hebb mapping review | ✓ ≥4 of 6 attributes, no critical ✗ |
| senior-engineer | semantic-level implementation & debugging | all regressions pass, no new lint |
| skill-trainer | SkillOpt-style training loop | candidate score > current baseline |
| plasticity-analyst | topology health & recycle-loop integrity | conservation ratio 0.8–1.5 and closed loop |
| adversarial-reviewer | consensus-convergence adversarial review (rebut only, never fix) | consensus passes only with zero critical/major rebuttals |

Run its Pre-flight before dispatching: verify dependencies per dependencies.yaml; if all skills are missing, degrade to inline-persona mode.

## Degraded: inline 5 roles (swarm not installed)

Play the five roles serially within the same task, but **preserve the adversarial structure**: theory review before implementation, health check after implementation, role contradictions presented as-is without mediation; before a consensus is issued, run one adversarial-reviewer round (filled inline by the Leader's persona — the gate is never skipped). Lazily merging roles = back to the single-referee blind spot; better to run theory review alone than to merge.

## aing-specific review inputs

When reviewing aing-related designs, feed the theorist two things: `docs/Engineering/` architecture docs (carrying the think/remember-separation lineage) and the GREEN-LIST capability boundary (prevents false positives like reviewing "capabilities that don't exist"). Health-check reports land in <sqa-root>; conclusions go through dual-evidence arbitration.
