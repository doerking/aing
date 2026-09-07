---
tags: ["aing", "训练", "SkillOpt", "技能文档", "KESPI", "训练副本"]
---

# Training Group: SkillOpt-Style Training Loop

## Core idea (think before acting)

In the aing system, **the agent is the host (organism); skill documents are the trainable parameters**. Model weights stay frozen; growth comes from iteratively editing skill docs and proving improvement with verification scores. That means: training = edit doc + run verification + keep winners and cull losers — a loop any agent can execute. That's exactly why "a customer agent gains a training group by installing this skill".

## Training-site roles

| Role | Location | Notes |
|---|---|---|
| Host/organism | aing (<repo-root> or a deployment machine) | Carrier of behavior; absorbs, is never edited directly |
| Trainable parameter | skill doc | The only entry point; self-compiling |
| Training site | `<opt-copy>` (training copy) | All training / simulation / experiments here; never in the source package |
| Trainer | `SkillOpt-full` | Full trainer; **not part of the aing deploy package**; third-party deployments don't have it by default |

## Standard loop (with trainer)

1. Define a training goal (one measurable behavior delta, e.g. "retrieval hit rate" or "repair-debt rate").
2. Edit the corresponding skill-doc section → run smoke/eval task packs in OPT.
3. Gate with KESPI soft metrics (candidate score must beat the current baseline, else culled).
4. Keep best_skill; record score trajectories within three generations. Training that doesn't raise scores is spinning — stop and find out why.

## Degraded loop (no trainer on third-party deployments)

Document-level training works without the trainer; minimal loop: edit skill doc → execute 2–3 real tasks with that doc → score against task outcomes → keep the better version with versioned records. Same discipline: scores must come from real task outcomes; self-invented metrics are forbidden.

## Red lines

- Training-site artifacts (ckpt, runs, __pycache__) stay in OPT, never enter the source package.
- Training conclusions book under dual evidence: doc change + verification score; missing either means "not trained".
- The aing knowledge base (knowledge-base) Q&A archive is source material, not training itself.
