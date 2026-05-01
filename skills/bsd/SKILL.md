---
description: Build Spec Development - Automate spec implementation with skeptical review
---

# BSD - Build Spec Development

> Automate spec implementation with skeptical review and context research.

## Overview

BSD transforms `tasks.md` into automated execution with a research → execute → review pipeline. It bridges the gap between spec-driven planning and actual implementation.

## Commands

- `/bsd-execute <feature>` — Start BSD pipeline for a feature
- `/bsd-continue` — Resume interrupted execution
- `/bsd-status` — Show current progress
- `/bsd-reset` — Reset execution state

## Pipeline

```
planner → researcher (if needed) → executor → reviewer
```

## Agents

- `bsd-planner` — Evaluates task, decides if research is needed
- `bsd-researcher` — Finds and consolidates context
- `bsd-executor` — Implements the task
- `bsd-reviewer` — Skeptically reviews against acceptance criteria

## State Files

- `.bsd/history.jsonl` — Append-only execution log (source of truth)
- `.specs/project/STATE.md` — Human-readable state summary
- `.bsd/worktrees/` — Isolated sessions for retry attempts

## How It Works

When you run `/bsd-execute <feature>`:

1. The extension activates **orchestrator mode** — the main agent becomes a coordinator
2. Orchestrator tools are restricted to: `read`, `subagent`, `bsd_status`, `bsd_history`, `bsd_state`, `bsd_worktree`
3. The orchestrator reads the feature's `spec.md`, `design.md`, and `tasks.md`
4. For each task, it spawns specialized agents via `subagent`:
   - `bsd-planner` evaluates if research is needed
   - `bsd-researcher` (if needed) gathers context
   - `bsd-executor` implements the task
   - `bsd-reviewer` checks against acceptance criteria
5. After each phase, progress is recorded in `history.jsonl`
6. If rejected, the executor retries (max 2 attempts) in a clean worktree
7. After each task, `STATE.md` is updated

## Orchestrator Rules

- NEVER edit files directly — always delegate to subagents
- NEVER skip pipeline phases
- ALWAYS record progress via `bsd_history`
- ALWAYS update `STATE.md` after each completed task
- PAUSE and ask the user if 2 retries fail

## References

- `prompts/pipeline-templates.md` — Output templates for each phase
- `references/review-criteria.md` — Criteria for the skeptical reviewer
- `references/research-strategy.md` — When and how to research
