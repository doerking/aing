# How the Knowledge Base Cleans Up After Itself

> For people who don't want to read the architecture. After this you'll know why you never have to babysit it.

## One Line

You dump material in, it organizes itself. Something sits untouched for 90 days, it cleans itself up. You regret deleting it, it can still find it.

You do nothing.

## Three Pictures

### Picture 1 — You dump in a mess

Today you clipped a webpage, copied a note, saved some text from an image. Toss it in `raw/` and walk away.

The Order Brain (compile.js) automatically:
- reads the content
- assigns a Type (category)
- links it up to what's already there (bidirectional links)
- records it in the graph (entities / links)
- makes a Git commit (with a trace number, fully traceable)

When you come back, `wiki/` already has new organized pages. You only dump, it sorts.

### Picture 2 — 90 days later, nobody touched it

The Growth Brain (prune.js) scans:

> "This link hasn't been clicked in 90 days..."

It doesn't delete. It does three steps:
1. Compress to a "mustard seed" — truncate content to first 200 characters (text slicing, not semantic compression)
2. Move to pending — the original file stays, only the graph "edge" is temporarily cut
3. Wait for KESPI — next self-check decides if it's worth reviving

This is "metabolism": not deletion, but recycle and reuse.

### Picture 3 — Three months later you want it back

You suddenly remember that pruned piece. Two cases:

- **Still alive** (readiness ≥ 0.75) → already reconnected to the graph, just search
- **Truly eliminated** (failed to revive multiple times) → the original MD was never deleted — find it in `raw/` or Git history

So it can never truly lose your stuff. What it cuts is the "link," not the "content."

## So What Do You Do?

Basically nothing. But there are 4 cases where you step in (everything else is automatic):

| Case | What you do |
|---|---|
| KESPI red 3 runs in a row, won't recover | take a look at the error |
| Cross-domain pollination finds a core contradiction | you decide which theory wins |
| Want to change "how long until expiry" | change one config number |
| Want to change the regen cooldown rule | change one config number |

Besides those 4, 99% of the time you ignore it.

## How Does the Score Manage Things?

Run KESPI manually (8 checks), outputs a 0~1 score:

- **≥ 0.80 (green)** → all good, go drink coffee
- **0.65 < score < 0.80 (yellow)** → sub-healthy, it fixes itself
- **≤ 0.65 (red)** → something's wrong, blocks related tasks, waits for you

What those 8 items are and how to tune the numbers: see [./02-KESPI-Threshold-Guide.md](./02-KESPI-Threshold-Guide.md).

## Side by Side

| What you do now | aing |
|---|---|
| Bookmark a pile, never revisit | auto-recycles untouched stuff into mustard seeds |
| Use Obsidian, install plugins for types/relations | plain MD + Git, types and relations built-in |
| Afraid to delete anything | only cuts links, never content; Git rollback |
| Switch computers and it breaks | plain MD + Git, switch freely |

## Summary

aing is the roommate who cleans up after itself:
- You drop stuff, it puts it away (Order Brain)
- Stuff untouched too long goes in a storage bin (Growth Brain / mustard seed)
- You think it threw something out → it pulls it from the bin or history (recoverable)
- Only yells for you when something's really wrong (4 intervention cases)

The rest, let it run.

> Next: [./02-KESPI-Threshold-Guide.md](./02-KESPI-Threshold-Guide.md)
