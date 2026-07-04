---
description: Build Spec Development - Automate spec implementation with skeptical review and structured bug fixing
---

# BSD - Build Spec Development

> Automate spec implementation with skeptical review, context research, and structured bug fixing.

## Prerequisites

Before using BSD, install **pi-subagents** and **rpiv-ask-user-question**:

```bash
# Subagents (required) — registers the Agent tool used by the orchestrator
pi install npm:@tintinweb/pi-subagents

# Ask-user-question (required) — registers the ask_user_question tool for /bsd-spec flow
pi install npm:@juicesharp/rpiv-ask-user-question
```

Then reload:
```
/reload
```

Confirm loaded:
- `[Extensions] pi-subagents` appears
- `[Extensions] bsd` appears
- `[Agents] bsd-planner, bsd-researcher, bsd-frontend-designer, bsd-executor, bsd-reviewer` appear
- `[Agents] bsd-bug-inspector, bsd-fix-executor` appear (for BugFix mode)

---

## 🏗️ Orchestrator Mode (Spec → Code)

Implementação de features a partir de specs.

### Commands

| Command | Description |
|---------|-------------|
| `/bsd-on` | Activate BSD orchestrator mode (enables `bsd_file`, restricts tools) |
| `/bsd-off` | Deactivate orchestrator mode and restore default tools |
| `/bsd-status` | Show current progress |
| `/bsd-continue` | Resume interrupted execution |
| `/bsd-reset` | Reset execution state |

### Pipeline

```
frontend-designer (if UI) → planner → researcher (if needed) → executor → reviewer
```

> **When to use `bsd-frontend-designer`:** The orchestrator spawns this agent
> **before** the planner whenever the task involves UI, components, CSS, or
> frontend work. Its output (design specs, component structure, styling
> guidance) is passed to the executor as additional context, ensuring the
> implementation follows a coherent visual design.

### Agents

- `bsd-frontend-designer` — Designs UI/components/CSS before implementation (multimodal: can analyze screenshots and mockups)
- `bsd-planner` — Evaluates task, decides if research is needed
- `bsd-researcher` — Finds and consolidates context
- `bsd-executor` — Implements the task
- `bsd-reviewer` — Skeptically reviews against acceptance criteria

### Branch Strategy

Each task gets its own Git branch:
- `bsd/<feature>/<taskId>` — Created from `main`
- After reviewer approval, merged into `main`
- If rejected, retry on same branch (max 2 attempts)

---

## 🔍 BugFix Mode (Bug → Fix)

Correção estruturada de bugs pós-implantação.

### Commands

| Command | Description |
|---------|-------------|
| `/bsd-bug <feature>: <description>` | Report a bug and start BugFix pipeline |
| `/bsd-bug-abort` | Cancel active BugFix session |
| `/bsd-bug-status` | Show current BugFix session status and open bugs |

### Pipeline

```
intake → diagnose → fix-plan → fix-execute → verify → revision-loop
```

1. **INTAKE** — Understand the bug via natural conversation (no ask_user)
2. **DIAGNOSE** — Spawn `bsd-bug-inspector` to find root cause (3+ hypotheses)
3. **FIX PLAN** — Present diagnosis to user, ask for approval
4. **FIX & TEST** — Spawn `bsd-fix-executor` to apply fix (atomic commit per bug)
5. **VERIFY** — Ask user to test and confirm in natural chat
6. **REVISION LOOP** — Max 3 attempts, escalate on failure

### Agents

- `bsd-bug-inspector` — Diagnoses root cause of bugs with 3+ independent hypotheses
- `bsd-fix-executor` — Applies surgical fixes with test verification

### Branch Strategy

Each bug gets its own Git branch:
- `bsd/<feature>/BUG-<N>` — Created from `main`
- Atomic fix per bug
- Commit: `fix(<feature>): resolve BUG-<N>`
- Merge after user verification

---

## 📁 Project Rules (.bsd/rules/)

BSD injects project rules into every agent's system prompt automatically — both the orchestrator and every subagent spawned via `Agent`.

### Templates

Six starter files live in `.bsd/rules/`:

| File | Purpose |
|------|---------|
| `product.md` | Vision, goals, non-goals, users, success metrics |
| `tech.md` | Stack (languages, frameworks, DB, auth, testing, tooling) |
| `structure.md` | Project layout, module boundaries, naming, import rules |
| `conventions.md` | Code style, type safety, function and commit conventions |
| `testing.md` | Testing philosophy, coverage targets, patterns |
| `architecture.md` | Architectural principles, layers, data flow, observability |

### Injection

When BSD mode is active, the `before_agent_start` hook reads all `.bsd/rules/*.md` and appends them to the system prompt. Works in:
- The orchestrator session (state check)
- Every subagent session (filesystem check via `.bsd/history.jsonl`)

### Editing

Use `bsd_file` to read or update rule files:

```typescript
bsd_file action=read path=.bsd/rules/product.md
bsd_file action=write path=.bsd/rules/product.md content="# Product\n..."
```

Changes take effect on the next agent turn.

---

## 🛠️ Unified File Tool (bsd_file)

A single tool for all file operations inside `.bsd/` and `.specs/`. Replaces the previous `bsd_rules_*` trio and the planned `bsd_spec_*` suite with one scoped interface.

### Actions

| Action | Description |
|--------|-------------|
| `read` | Read a file (returns content + size + mtime) |
| `write` | Create or update a file (requires `content`; pass `overwrite:true` to replace) |
| `list` | List a directory (returns entries with size) |
| `delete` | Delete a file (directories must be empty) |
| `mkdir` | Create a directory |
| `history` | List snapshots in `.specs/features/<feature>/history/` |
| `restore` | Restore a snapshot by filename (requires `snapshot` param) |

### Path safety

Every `path` argument MUST resolve inside `.bsd/` or `.specs/`. The tool rejects:
- Absolute paths
- Path traversal (`..`)
- Symlinks pointing outside the allowed roots

### Example workflow

```typescript
// 1. List features
bsd_file action=list path=.specs/features

// 2. Read tasks for a feature
bsd_file action=read path=.specs/features/01.user-auth/tasks.md

// 3. Read ROADMAP
bsd_file action=read path=.specs/project/ROADMAP.md

// 4. Write an updated spec
bsd_file action=write path=.specs/features/01.user-auth/spec.md content="..." overwrite=true

// 5. List snapshots
bsd_file action=history path=.specs/features/01.user-auth

// 6. Restore a snapshot
bsd_file action=restore path=.specs/features/01.user-auth snapshot=01-initial.md
```

---

## Shared Infrastructure

### State Files

- `.bsd/history.jsonl` — Append-only execution log (source of truth)
- `.specs/project/STATE.md` — Human-readable state summary (**auto-updated**)
- `.specs/project/ROADMAP.md` — Feature status (**auto-updated**)
- `.specs/features/<name>/execution/` — Auto-saved artifacts (plan.md, review.md)
- `.specs/features/<name>/bugs/` — Bug reports (BUG-01.md, BUG-02.md)

### TUI Widgets

| Mode | Widget | Status |
|------|--------|--------|
| Orchestrator | `🔒 BSD ORCHESTRATOR MODE` | `🔒 orchestrator` |
| BugFix | `🔍 BSD BUGFIX MODE` | `🔍 bugfix` |

### Custom Tools

| Tool | Description |
|------|-------------|
| `bsd_file` | Unified file ops for `.bsd/` and `.specs/` (read, write, list, delete, mkdir, history, restore) |
| `bsd_status` | Show current pipeline progress |
| `bsd_history` | Record pipeline execution step |
| `bsd_state` | Read/update STATE.md |
| `bsd_branch_create` | Create Git branch for task |
| `bsd_branch_merge` | Merge task branch into main |
| `bsd_branch_checkout` | Switch to task branch |
| `bsd_branch_list` | List all BSD branches |
| `bsd_branch_status` | Show current branch context |
| `bsd_detect_files` | Detect files modified by executor |
| `bsd_get_tasks` | Get tasks in dependency order |
| `bsd_save_artifact` | Save Agent output as artifact |
| `bsd_roadmap_update` | Update feature status in ROADMAP.md |
| `bsd_reconstruct_state` | Rebuild STATE.md from history |

### Orchestrator Rules (Both Modes)

- NEVER edit files directly — always delegate to subagents
- NEVER skip pipeline phases
- ALWAYS record progress via `bsd_history`
- STATE.md and ROADMAP.md are **auto-updated**
- PAUSE and ask the user if retries fail

## References

- `prompts/pipeline-templates.md` — Output templates for each phase
- `references/review-criteria.md` — Criteria for the skeptical reviewer
- `references/research-strategy.md` — When and how to research
- `references/diagnose-strategy.md` — Bug diagnosis strategy (BugFix mode)
- `references/verify-guide.md` — Fix verification guide (BugFix mode)
