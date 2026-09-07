---
name: aing-operator
description: |
  Skill group for the aing knowledge organism: gives any agent a complete operating capability set — Ops group (deploy/verify, metabolism, resident services), Repair group (shadow discipline /定点同步 patch-sync), Governance group (dual-evidence / green-light unlocks / report panels), Training group (SkillOpt-style skill-doc training loop), Review group (4-role evolution team dispatch). Any task involving aing, E:\aing, E:\OPT, shadow directories, knowledge organisms, metabolism pipeline, KESPI, SkillOpt, mustard-seed recycle, or consciousness-neural (sensory-ends/guide-chain/consciousness-layer) MUST read this skill before acting — aing's governance red lines live in docs, not code; acting without reading them has historically caused 11 bugs and multiple false alarms.
  Use when: the user mentions any yard of the aing ecosystem (master package / training copy / shadow directory / simulator / second machine), asks to deploy, verify, operate, repair, train, or review aing, or the write target is inside an aing repo.
  Do NOT use for ordinary Node.js projects unrelated to aing (that's senior-developer's job).
version: "0.2"
tags: ["aing", "技能组", "院子地图", "治理", "训练", "评审", "运维", "修复"]
---

# aing Operator — Skill Group for the aing Knowledge Organism

With this skill installed you gain a capability set: **Ops, Repair, Governance, Training, Review**. Details of each group load on demand from `references/`; this file only carries the map and routing — by design: aing's rule sources live in repo docs (AGENTS.md / GREEN-LIST / module-handbook). This skill never copies their content, only points to them. Duplication causes dual-truth-source drift, the worst disease in aing's governance history.

## 1. Yard Map & Red Lines (memorize before acting)

| Yard | Path | What you may do | Red line |
|---|---|---|---|
| Master package | `E:\aing` | Read code, edit docs, run verify-deploy / metabolism / resident services | Never run training or experiments, leave no run traces (__pycache__/runs/ckpt); source changes must go through a shadow first |
| Training copy | `E:\OPT` | All training / simulation / experiments happen here | src frozen (read-only) during M3 shadow window |
| Shadow dirs | `E:\SQA\aing-shadow-*` | The site of all code changes & verification | Patch-sync only changed files back; keep shadows as audit evidence |
| Simulator | EvoX chassis (Group A) | EvoX thinks, aing remembers | Never move EvoX run artifacts into the aing store |
| Second machine | Group B | Reports only, no direct access | B reports require dual-evidence arbitration before acceptance |

## 2. Truth-Source Pointers (rules live here; this skill only summarizes)

| Source | Path | When to read |
|---|---|---|
| New-agent onboarding (5 steps) | `E:\aing\docs\AGENT-ONBOARDING.md` | Before first aing operation |
| Agent discipline + one-command deploy | `E:\aing\AGENTS.md` | Before any hands-on work |
| Capability truth (green list) | `E:\aing\docs\GREEN-LIST.md` | Before claiming any capability |
| Module handbook (pits & iron rules) | `E:\aing\docs\module-handbook.md` | Before touching any module |
| Deploy triage prescriptions | `E:\aing\docs\DEPLOY-CHECK-2026-09-02.md` | When deploy/verify fails |
| Architecture & lineage | `E:\aing\docs\Engineering\` | Architecture discussions |

## 3. Task Routing & the Semi-Lazy Protocol

**Semi-lazy contract (hard rule, not a suggestion):**
- L0 resident: this skill's `description` (trigger judgment only, a few dozen words).
- L1 read-on-trigger: this SKILL.md (≤60 lines; yard map + red lines — always read in full).
- L2 pull-on-demand: the five `references/` files are **never read by default**; read one only when the task hits a tag below; at most 2 per task; never read them all "for a full picture".
- Light-Q&A exemption: pure concept questions ("what is X") answer from L1 alone; escalate to L2 only when L1 can't answer.

| Task | Group | One-line summary (decide from this column) | File |
|---|---|---|---|
| Deploy / verify / metabolism / API / query | Ops [tag:运维] | C1–C6 deploy prescriptions, daily commands, smoke discipline | [operations.md](../references/operations.md) |
| Bug fix / code change / feature | Repair [tag:修复] | 5-step shadow SOP + Windows pit list | [shadow-sop.md](../references/shadow-sop.md) |
| Verify claims / write doc statements / report / brief user on components | Governance [tag:治理] | 7 red lines (incl. transparency & zero-drift deploy), green panel, B-report arbitration posture | [governance.md](../references/governance.md) |
| Training / skill-doc optimization / SkillOpt | Training [tag:训练] | SkillOpt loop + degraded path without trainer | [training-group.md](../references/training-group.md) |
| Architecture design / health check / adversarial review | Review [tag:评审] | 4-role evolution team dispatch & gates | [evolution-team.md](../references/evolution-team.md) |

**Tag loading (Tolaria format, load-on-demand)**: every file in this skill carries frontmatter `tags`; tags are the unit of loading. Convention: `E:\aing\AGENTS.md` discipline rule 7.

Routing principle: when unsure, read governance.md first — know what you must not do before deciding how; it counts as your one L2 pull. Multi-group tasks (e.g. "fix bug and report") load serially Repair→Governance, still ≤2.

## 4. Reporting Discipline (shared by all groups)

After any deploy/modification, reports must attach the **complete verify-deploy.js green panel** (six ✅ items + ALL GREEN line). No panel = incomplete report. Panel template: `E:\aing\AGENTS.md` reporting section.

## 5. Version & Review

v0.2 (2026-09-04): task routing upgraded to a hard semi-lazy protocol (L2 off by default, ≤2 pulls per task, light-Q&A exemption), routing table gains a one-line summary column. v0.1 (09-03) first release. Review after M3 shadow window ends (09-05) and the step-11 mustard-seed recycle migration assessment; update routing per GREEN-LIST.md.

**Published snapshot**: this skill ships with the aing package at `assets/skills/aing-operator/` (`en/` is the English mirror, kept verbatim-aligned with the maintainer repo). Edit the repo first, then sync the snapshot — the snapshot is not the truth source.
