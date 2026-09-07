# KESPI Threshold Guide: The Two Numbers 80 and 65

> Ordinary users only need to remember two numbers. This explains what they control, where to change them, and what happens when you raise or lower them.

## The Short Answer

| Number | Meaning | Default | Raise it to be stricter / Lower it to be looser |
|---|---|---|---|
| **0.80** | Green line (`greenLight`) | 0.80 | stricter → 0.85 ; looser → 0.75 |
| **0.65** | Red line (`yellowLight`) | 0.65 | same logic |
| **0.75** | Mustard-seed revival line (`transplantThreshold`) | 0.75 | same logic |

> The middle band (0.65 ~ 0.80) = yellow — sub-healthy, aing fixes it itself, you do nothing.

## What Is KESPI

An 8-check self-check that you run manually, outputting a 0~1 score:

| Code | English | 中文 |
|---|---|---|
| KQ | Quality | 质量 |
| KG | Growth | 生长 |
| KA | Assetization | 资产化 |
| KM | Metabolism | 代谢 |
| KD | Density | 密度 |
| KC | Retrieval | 检索 |
| KR | Response | 回答 |
| KB | Block | 阻断 |

Weights: `{KQ:0.15, KG:0.12, KA:0.13, KM:0.12, KD:0.13, KC:0.10, KR:0.15, KB:0.10}`

Generally don't touch the weights — run for 3 full months first, then revisit.

## The Three Colors

```
score ≥ 0.80  ──▶  🟢 GREEN : healthy, do nothing
0.65 < score < 0.80 ──▶  🟡 YELLOW : sub-healthy, self-correcting
score ≤ 0.65  ──▶  🔴 RED  : pauses non-critical growth, waits for you
```

### What happens at red

- Pauses non-critical growth tasks (sprouting, pollination)
- Focuses on the blocker (usually KD diversity or KB backup)
- Red 3 runs in a row with no recovery → one of the 4 cases where you step in

## What 0.80 Controls

The green line decides: "Does this check count as healthy?"

| Raise it (stricter) | Lower it (looser) |
|---|---|
| 0.80 → 0.85 | 0.80 → 0.75 |
| easier to hit yellow/red | easier to stay green |
| good when: library is mature, you want high quality | good when: just starting, few materials |

Most users leave it. 0.80 is the experience-based default. Only raise it if you've been "green when nothing's wrong" for months.

## What 0.65 Controls

The red line decides: "When should we pause growth to fix the problem?"

| Raise | Lower |
|---|---|
| 0.65 → 0.70 | 0.65 → 0.60 |
| red triggers sooner (more sensitive) | red triggers later (less sensitive) |
| good when: data is precious, can't afford mistakes | good when: just experimenting |

## What 0.75 Controls (don't confuse it with the other two)

0.75 is NOT a check score — it's mustard-seed readiness.

Here's the flow:

```
link untouched 90 days → truncated to "mustard seed" (first 200 chars, initial readiness 0.3)
        ↓ next KESPI score
   readiness ≥ 0.75  →  🟢 reconnected to graph (revived)
   readiness < 0.75  →  stays pending, waits for pollination / regeneration
```

So 0.75 = "qualified to re-enter the active library." Raise to 0.85 and revival is rare (leaner library); lower to 0.65 and everything comes back (more complete, more cluttered).

## Where to Change Them

Open `src/growth.config.js` and edit these three fields:

```javascript
const config = {
  kespi: {
    greenLight: 0.80,   // ← green line
    yellowLight: 0.65,  // ← red line
    weights: { /* usually leave alone */ },
  },
  jiezi: {
    transplantThreshold: 0.75,  // ← mustard-seed revival line
    // ...
  },
};
```

Restart the script to apply changes (no hot-reload currently).

## One-Line Summary

- **0.80 / 0.65** → control "is the check healthy" (three colors)
- **0.75** → controls "is pruned knowledge ready to revive" (mustard seed)
- **Raise = stricter & leaner, lower = looser & more complete**

> Can't decide? Don't change it. Run the defaults for 3 months.
> Prev: [How the Knowledge Base Cleans Up After Itself](./01-Tolaria-How-It-Works.md) ｜ Next: [FAQ](./03-FAQ.md)
