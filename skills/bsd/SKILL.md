---
description: Build Spec Development - Automate spec implementation with skeptical review and structured bug fixing
---

# BSD - Build Spec Development

> Automate spec implementation with skeptical review and structured bug fixing.

## Overview

BSD transforms tasks.md into automated execution with a planner → researcher → executor → reviewer pipeline. It includes a **mode system** that restricts tools when orchestrating, preventing the agent from editing files directly.

## Mode System

BSD operates in two modes that toggle availability of BSD tools and block destructive tools:

| Command | Action |
|---------|--------|
| `/bsd-on` | Activate orchestrator mode (BSD tools visible, edit/write/mcp blocked) |
| `/bsd-off` | Deactivate mode, restore normal tools |
| `/bsd-execute <feature>` | Activate mode + start execution pipeline |
| `/bsd-continue` | Resume interrupted execution |
| `/bsd-bug [<feature>: <desc>]` | Activate bugfix mode + create bug report |
| `/bsd-bug-abort` | Cancel active bugfix session |
| `/bsd-bug-status` | Show active bugfix session status |
| `/bsd-status` | Show current progress |
| `/bsd-reset` | Reset execution state and deactivate mode |

## Pipeline (Orchestrator Mode)

```
planner → researcher (if needed) → executor → reviewer
```

## Pipeline (BugFix Mode)

```
intake → diagnose → fix-plan → fix-execute → verify
```

## BSD Tools

14 custom tools registered by the extension:

| Tool | Purpose |
|------|---------|
| `bsd_status` | Show execution progress from history.jsonl |
| `bsd_history` | Record pipeline execution step |
| `bsd_state` | Read or update STATE.md |
| `bsd_branch_create` | Create git branch per task |
| `bsd_branch_merge` | Merge approved task to main |
| `bsd_branch_checkout` | Switch to existing task branch |
| `bsd_branch_list` | List branches for a feature |
| `bsd_branch_status` | Show current git branch info |
| `bsd_worktree` | [DEPRECATED] Legacy worktree support |
| `bsd_detect_files` | Get modified files after executor |
| `bsd_roadmap_update` | Mark feature done/in-progress/pending |
| `bsd_reconstruct_state` | Rebuild STATE.md from history |
| `bsd_save_artifact` | Save subagent output as artifact |
| `bsd_get_tasks` | Get tasks in dependency order |

## How Mode Control Works

- **Outside BSD mode**: All 14 BSD tools are **invisible** to the agent. The `session_start` hook filters them from active tools. The `tool_call` hook blocks any direct call.
- **Inside BSD mode**: Only `read`, `subagent`, `bash`, and the 14 BSD tools are active. `edit`, `write`, and `mcp` are **blocked** — the orchestrator must delegate all implementation to subagents.
- **Safety net**: The `tool_call` hook enforces restrictions even if a tool is somehow called.

## Agents

- `bsd-planner` — Evaluates task, decides if research is needed
- `bsd-researcher` — Finds and consolidates context
- `bsd-executor` — Implements the task
- `bsd-reviewer` — Skeptically reviews against acceptance criteria
- `bsd-bug-inspector` — Diagnoses bugs (root cause, files affected, fix direction)
- `bsd-fix-executor` — Applies atomic bug fixes

## State Files

- `.bsd/history.jsonl` — Append-only execution log (source of truth)
- `.specs/project/STATE.md` — Human-readable state summary
- `.specs/features/<name>/bugs/BUG-N.md` — Bug reports (YAML frontmatter)
- `.specs/features/<name>/execution/` — Execution artifacts per task

## References

- `prompts/pipeline-templates.md` — Output templates for each phase
- `references/review-criteria.md` — Criteria for the skeptical reviewer
- `references/research-strategy.md` — When and how to research
