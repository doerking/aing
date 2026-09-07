# The Knowledge Base That Perceives, Thinks, and Reports

> "Consciousness neural" sounds mystical. It's really just three things: it notices changes, it prioritizes, it tells you the conclusion.

## One Line

You don't have to ask — it reports anyway. Like a steward that patrols on its own, judges on its own, and writes up a report on its own.

## Three Layers, Plain English

```
🌿 Sensory Endings (sensing)  →  🔗 Guide Chain (routing)  →  🧠 Consciousness (output)
    it notices change             it picks what matters         it gives you the result
```

| Layer | What it does | Familiar analogy |
|---|---|---|
| 🌿 Sensory endings | polls filesystem every 5s, detects new/modified .md files | skin, eyes, ears |
| 🔗 Guide chain | computes attention score, ranks priority | nerves, spinal cord |
| 🧠 Consciousness | summarizes → hotspots / alerts / recommendations | brain, mouth |

## 🌿 Sensory Endings: how it "perceives"

Sensory endings (sensory-ends.js) polls the `raw/` directory every 5 seconds, detecting new or modified files.

> Note: This is file polling, not chokidar-based real-time watching.

You don't write code or click buttons. Dropping a file in a folder is telling it.

## 🔗 Guide Chain: how it "thinks"

The guide chain (neural-guide-chain.js) does one thing: compute attention scores.

```
attention = vitality × 0.3 + recency × 0.25 + connectionDensity × 0.2 + anomaly × 0.15 + userInterest × 0.1
```

High score → enters the consciousness layer. Low score → waits. It doesn't try to do everything — that's why it doesn't collapse.

## 🧠 Consciousness: how it "reports"

The consciousness layer (consciousness-layer.js) generates a briefing with:

| Output | Content |
|---|---|
| Hotspots | Most active/important entities |
| Alerts | Entities needing attention (low KESPI, anomalies) |
| Recommendations | Suggested actions (sprout, pollinate, compress, prune) |

In other words — it yells on red, stays quiet on green. This is the "99% of the time you ignore it" promise.

## A Full Example

You edit `raw/AI-2026-01.md` one day and forget about it.

1. **Sensory endings**: polls after 5s, sees the change
2. **Guide chain**: computes attention score, puts it in the queue
3. **Consciousness**:
   - Order Brain compiles it into `wiki/`, updates the graph, Git commit
   - Growth Brain notices it links to "RAG vs Metabolism" → creates a new link
   - KESPI runs → 0.87, green, all good
4. **Report**: says nothing (because nothing was wrong)

You did exactly one thing the whole time: edit a file.

## Metacognition Layer

The metacognition layer (metacognition-layer.js) does three-layer self-reflection:
1. **Self-check** — validate own reasoning
2. **Evaluate** — assess output quality
3. **Adjust** — modify approach based on evaluation

## Tri-Path Orchestrator

The tri-path orchestrator (tri-path-orchestrator.js) runs three paths in parallel:
- **Explore** — discover new connections
- **Verify** — validate existing knowledge
- **Optimize** — improve structure

With circuit breaker protection: pauses for 60s after 5 failures.

> ⚠️ Current state: `runPath()` returns mock data. Real path execution is not yet implemented.

## Side by Side

| Concern | How it handles it |
|---|---|
| "It won't notice my edit" | sensory endings poll every 5s; editing triggers it |
| "It might change things recklessly" | Git-rollbackable |
| "I'm too busy to check" | green = silent, red = it calls you |
| "If it breaks I can't trace why" | error log records in error_log table |
| "I want to plug in other systems" | plain MD files, any tool can read them |

## Summary

Consciousness neural = perceive (notice change) + think (prioritize) + report (tell the conclusion).

Not mysticism — an observable, extensible engineering mechanism. It turns you from "watching the knowledge base every day" into "only looking when it wakes you up with a red light."

> Series complete. Recap: [01 Cleans Up After Itself](./01-Tolaria-How-It-Works.md) · [02 The Two Numbers](./02-KESPI-Threshold-Guide.md) · [03 FAQ](./03-FAQ.md)
