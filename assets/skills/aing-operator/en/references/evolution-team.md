---
tags: ["aing", "评审", "进化团队", "四角色", "对抗结构", "拓扑"]
---

# Review Group: 4-Role Evolution Team Dispatch

## When to dispatch a team, when to go solo

Solo: code reading, small fixes, docs, deploy verification — governance red lines are enough constraint.
Dispatch a team: architecture design, systematic health checks, training-loop assessment — these tasks' blind spot is "one agent being both athlete and referee". Engineers lean toward "it runs, ship it"; theorists lean toward "if the mechanism doesn't hold, it's idle motion". Only separate roles expose that conflict.

## Preferred: dispatch neural-evolution-swarm

When installed (`<skills-dir>\neural-evolution-swarm\`), dispatch four roles per its workflow.md:

| Role | Duty | Gate |
|---|---|---|
| neuro-theorist | 6-attribute computational consciousness + GWT/Hebb mapping review | ✓ ≥4 of 6 attributes, no critical ✗ |
| senior-engineer | semantic-level implementation & debugging | all regressions pass, no new lint |
| skill-trainer | SkillOpt-style training loop | candidate score > current baseline |
| plasticity-analyst | topology health & recycle-loop integrity | conservation ratio 0.8–1.5 and closed loop |

Run its Pre-flight before dispatching: verify dependencies per dependencies.yaml; if all skills are missing, degrade to inline-persona mode.

## Degraded: inline 4 roles (swarm not installed)

Play the four roles serially within the same task, but **preserve the adversarial structure**: theory review before implementation, health check after implementation, role contradictions presented as-is without mediation. Lazily merging roles = back to the single-referee blind spot; better to run theory review alone than to merge.

## aing-specific review inputs

When reviewing aing-related designs, feed the theorist two things: `docs/Engineering/` architecture docs (carrying the think/remember-separation lineage) and the GREEN-LIST capability boundary (prevents false positives like reviewing "capabilities that don't exist"). Health-check reports land in <sqa-root>; conclusions go through dual-evidence arbitration.
