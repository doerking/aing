---
name: agent-harness
description: |
  Agent Work Framework. Unified entry thinking framework + workflow Skill.
  Integrated with routing protocol (task→framework matching), output protocol (engineering-grade delivery), and review criteria protocol.
  
  Trigger Words (Thinking Modes):
  research, plan, design, think, pattern, process, step, review, score, analyze,
  evaluate, compare, survey, solution, feasibility, summary, deep research,
  research report, task decomposition, multi-agent, parallel execution,
  context compression, long-task planning
default-enabled: true
---

# Agent Harness + 三合一协议

> **One-line summary**: Route the task to the right framework, execute layer by layer, output engineering-grade deliverables with review criteria.
> 
> **Core Pipeline**:
> ```
> ① ROUTE → ② EXECUTE (OODA + WORKFLOWS) → ③ OUTPUT (top-tier format + review criteria)
> Route = task type → framework match
> Execute = Pipeline + WORKFLOWS
> Output = conclusion-first + actionable plan + review criteria
> ```

---

## ⚠️ Phase 0: Route (Must Do First, ~30 seconds)

### Route Judgment

```
1. Task type classification:
   - Analysis (地缘/政策/文本/趋势)  →  route to framework
   - Decision (方案/战略/选择)        →  route to framework  
   - Execute (执行/实现/编码)         →  route to framework
   - Diagnosis (诊断/排查/根因)       →  route to framework
   - Quick Q&A (单点问答/已知信息)    →  direct answer, skip route

2. Framework match:
   - See routing table below

3. Information adequacy check:
   L1(充足) → full execution
   L2(有缺口) → execute with marked assumptions
   L3(关键缺失) → stop, ask 2-3 blocking questions
   L4(空白) → degrade to best judgment with confidence note
```

### Routing Table

| Task Type | Primary Framework | Alternative | Blade Recommendation |
|-----------|-----------------|-------------|---------------------|
| 地缘/政策/趋势分析 | yue-wenshu + 文正 | diverge-converge | Marx+Zizek+Taleb |
| 技术架构/架构判断 | quiet-musing | first-principles | Musk+Karpathy |
| 战略推演/情景规划 | diverge-converge | thinking-framework(sceanario) | Taleb+Munger |
| 文本/文章/报告解剖 | yue-wenshu | wenshu-skill | Lu Xun+Wang Xiaobo |
| 人物/组织拆解 | nvwa-creation | seven-layers(humanity) | relationship-blades |
| 方案制定/执行规划 | Pipeline + OUTPUT-PROTOCOL | diverge-converge | Naval+PGraham |
| 问题诊断/排查 | thinking-framework(5Whys/TOC) | quiet-musing | Mao Zedong |
| 工具/技能测评 | Pipeline + research | evaluation-framework | Feynman+engineering |
| 信息收集/调研 | agent-reach + research | multi-search | Feynman+Munger |
| 简单问答 | direct (no routing) | - | - |

### Correction Protocol

If framework doesn't fit mid-execution:
1. Stop immediately
2. State what was done + what blocked
3. Return to routing table, select alternative
4. State the switch reason

---

## Layer Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   Layer Execution Order                       │
│                                                               │
│  Step 1 ──→ Step 2 ──→ Step 3 ──→ Step 4 ──→ Step 5      │
│     │           │           │           │           │        │
│     ▼           ▼           ▼           ▼           ▼        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│  │Decision│→│Pipeline │→│WORKFLOW│→│Template│→│Quality │     │
│  │01-     │ │02-      │ │03-     │ │04-     │ │05-     │     │
│  │DECISION│ │PIPELINE │ │WORKFLOWS│ │TEMPLATE│ │QUALITY │     │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘     │
│                                                               │
│  Decision Tree decides "which combination",                  │
│  Pipeline decides "universal execution flow",                │
│  WORKFLOWS decides "specific work content"                   │
└─────────────────────────────────────────────────────────────┘
```

### Analogy

```
🍳 Cooking Scenario:
- Decision Tree = Customer orders ("spicy today")
- Pipeline = Cooking method (heat pan first, no matter what)
- WORKFLOWS = Specific recipe (how to make fish-flavored pork)
- Template = Plating style (how to arrange the plate)

💻 Software Scenario:
- Decision Tree = Task classification ("this is a research task")
- Pipeline = Execution flow (decompose first, no matter the research)
- WORKFLOWS = Research method (4-step method)
- Template = Report format (title-abstract-body-conclusion)
```

---

## Execution Flow

### Step 1 — Decision (Load 01-DECISION.md)

```
[Step 1] Read references/01-DECISION.md
         Decide: Pipeline + which WORKFLOWS

Common Combinations:
- Pipeline + research    → Research tasks
- Pipeline + subagent    → Coordination tasks
- Pipeline + context     → Compression tasks
- Pipeline + analysis    → Analysis tasks
```

### Step 2 — Execution Framework (Load 02-PIPELINE.md)

```
[Step 2] Read references/02-PIPELINE.md
         Understand: Universal 4-step execution flow

Pipeline Steps:
Step 1: Plan
Step 2: Execute
Step 3: Summarize
Step 4: Check
```

### Step 3 — Specific Content (Load 03-WORKFLOWS/{name}.md)

```
[Step 3] Read references/03-WORKFLOWS/{corresponding workflow}.md
         Execute: Specific work content

research = 4-step research (decompose→research→synthesize→report)
subagent = 4-step coordination (analyze→decompose→parallel→merge)
context  = 4-step compression (assess→strategy→execute→verify)
analysis = 4-step analysis (decompose→collect→compare→conclude)
```

### Step 4 — Output Template (Load 04-TEMPLATES/{name}.md)

```
[Step 4] Read references/04-TEMPLATES/{corresponding template}.md
         Generate: Structured final output
```

### Step 5 — Engineering-Grade Output (Protocol Built-in)

Skip the generic quality check. Use the output protocol below:

```
**[One-line conclusion: judgment + strongest reason]**

[Why this path wins, which obvious path it rejects, what trade-off it accepts]

## Problem
[Real bottleneck vs surface problem; what wasting](2-4 sentences)

## Evidence
[Known facts, assumptions made, which missing info would flip the conclusion]
[Source tagging: A=primary/B=secondary/C=partisan/D=speculation]

## First Move
[What starts in 24 hours: who→with what input→does what→produces what→for whom]

## Execution Plan
1. First action (builds trust or makes irreversible progress)
2. Executor + input + action + output + pass criteria
3. First 24-hour action, or minimum immediate action
4. Stop condition (don't waste further)
5. Why this beats the obvious alternative

## Review Criteria (always included)
Pass: what signal means done
Stop: what signal means abort
Hypothesis: what this round tests
Gap: what's missing to continue confidently
Review: anchor for next round
```

### Output Discipline
- **Conclusion first**: the first screen shows judgment, no preamble
- **Smart person test**: "would a smart person already know this?" If yes, narrow it
- **Review criteria is mandatory**, not optional
- **Breathing paragraphs**: 2-4 sentences per block, max 6 items per list
- **Bold only for conclusion sentences or short labels**

---

## Quick Reference: Common Combinations

| Task Type | Combination | Description |
|-----------|-------------|-------------|
| 📝 Deep Research Report | Pipeline + **research** | Multi-step research flow |
| 🤖 Multi-Agent Coordination | Pipeline + **subagent** | Decompose+parallel+merge |
| 📦 Long-Task Compression | Pipeline + **context** | Context management strategy |
| ⚖️ Competitive Analysis | Pipeline + **analysis** | Multi-dimensional comparison |
| ❓ Unclear Requirements | **Inversion** (standalone) | Gather requirements first |

---

## Forbidden Behaviors

- ❌ **Skip Steps**: Go to Step 3 without completing Step 1
- ❌ **Mix Layers**: Treat Pipeline and WORKFLOWS as the same thing
- ❌ **Missing Template**: Output content but format is chaotic
- ❌ **Missing Check**: End without quality verification

---

## Completion Flag

```
[agent-harness execution complete]
✓ Steps 1-5 completed
✓ Combination: Pipeline + WORKFLOWS/{name}
✓ Forbidden behaviors check: Passed
```

---

## File Index

| File | Role | Load Time |
|------|------|-----------|
| `SKILL.md` | Entry + Layer Description | On trigger |
| `references/01-DECISION.md` | Decision Tree | Step 1 |
| `references/02-PIPELINE.md` | Execution Framework | Step 2 |
| `references/03-WORKFLOWS/research.md` | Research Content | Step 3 |
| `references/03-WORKFLOWS/subagent.md` | Coordination Content | Step 3 |
| `references/03-WORKFLOWS/context.md` | Compression Content | Step 3 |
| `references/03-WORKFLOWS/analysis.md` | Analysis Content | Step 3 |
| `references/04-TEMPLATES/research-report.md` | Research Template | Step 4 |
| `references/04-TEMPLATES/analysis-report.md` | Analysis Template | Step 4 |
| `references/06-INVERSION.md` | Requirements Clarification | When unclear |
| `references/05-QUALITY.md` | Quality Check | Pipeline Step 4 |

---

_Last updated: 2026-04-07 by neltharion11 | https://github.com/neltharion11/skill-agent-harness_
