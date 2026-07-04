# Pi Spec Workflow

> Complete development workflow: **Spec-Driven** planning + **BSD** automated execution with skeptical review.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ SPEC-DRIVEN  │ ──→ │   TASKS.MD   │ ──→ │       BSD        │
│              │     │              │     │                  │
│ Specify →    │     │ Granular     │     │ Execute → Review │
│ Design →     │     │ atomic tasks │     │ with retries     │
│ Tasks        │     │ with deps    │     │                  │
└──────────────┘     └──────────────┘     └──────────────────┘
```

## Two Skills, One Complete Workflow

### spec-driven
Creates structured planning artifacts:
- `PROJECT.md` — Vision, goals, tech stack
- `ROADMAP.md` — Milestones and features
- `features/<name>/spec.md` — Requirements with acceptance criteria
- `features/<name>/design.md` — Architecture and components
- `features/<name>/tasks.md` — Granular, atomic tasks

### BSD (Build Spec Development)
Automates execution from `tasks.md` with a structured pipeline:
- **Pipeline**: `frontend-designer → planner → researcher → executor → reviewer`
- **BugFix pipeline**: Intake → Diagnose → Fix → Verify
- **Skeptical review** against acceptance criteria
- **Automated retries** with isolated branches (`bsd/<feature>/<taskId>`)
- **Progress tracking** in `.bsd/history.jsonl` (append-only)
- **Project rules** in `.bsd/rules/*.md` (auto-injected into every agent)
- **Unified file tool** `bsd_file` for orchestrator filesystem access
- **Orchestrator restrictions**: edit/write/mcp blocked in BSD mode

## Requirements

- [pi-coding-agent](https://github.com/badlogic/pi-mono)
- **[@tintinweb/pi-subagents](https://www.npmjs.com/package/@tintinweb/pi-subagents)** — Required for BSD pipeline (install first!)
  ```bash
  pi install npm:@tintinweb/pi-subagents
  ```
- **[@juicesharp/rpiv-ask-user-question](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question)** — Required for `/bsd-spec` Socratic flow
  ```bash
  pi install npm:@juicesharp/rpiv-ask-user-question
  ```
- Git

## Installation

### 1. Install Required Extensions

BSD requires two extensions:

```bash
# 1. pi-subagents — spawns planner/researcher/executor/reviewer agents
pi install npm:@tintinweb/pi-subagents

# 2. rpiv-ask-user-question — powers the /bsd-spec Socratic flow
pi install npm:@juicesharp/rpiv-ask-user-question
```

### 2. Install Spec Workflow

#### Via Git (Recommended)

```bash
# Install from GitHub
pi install git:github.com/ericnunes30/pi-spec-workflow

# Reload to activate
/reload
```

#### Manual Installation

```bash
# Clone the repository
git clone https://github.com/ericnunes30/pi-spec-workflow.git ~/.pi/agent/skills/spec-workflow

# Reload pi
/reload
```

### 3. Verify Installation

After `/reload`, confirm:
- `[Extensions] pi-subagents` appears
- `[Extensions] bsd` appears
- `[Agents] bsd-planner, bsd-researcher, bsd-frontend-designer, bsd-executor, bsd-reviewer` appear
- `[Agents] bsd-bug-inspector, bsd-fix-executor` appear (BugFix mode)

## Quick Start

### 1. Initialize a Project

```bash
pi
> Initialize project
```

Answer the questions to create:
- `.specs/project/PROJECT.md`
- `.specs/project/ROADMAP.md`

### 2. Specify a Feature

```bash
> Specify feature user-authentication
```

Creates:
- `.specs/features/user-authentication/spec.md`
- `.specs/features/user-authentication/design.md`
- `.specs/features/user-authentication/tasks.md`

### 3. Execute with BSD

```bash
> /bsd-on
```

Then the orchestrator reads `ROADMAP.md` via `bsd_file` and dispatches the pipeline for each task. The orchestrator uses `bsd_file` to navigate the spec tree and `Agent` to spawn the right subagent per phase.

> **Why no `/bsd-execute`?** In v2, BSD removed the explicit per-feature command. The orchestrator now auto-discovers work from `ROADMAP.md` once mode is active.

## Project Structure

```
.specs/
├── project/
│   ├── PROJECT.md      # Vision, goals, constraints
│   ├── ROADMAP.md      # Milestones and features
│   └── STATE.md        # Decisions, blockers, learnings
│
└── features/
    └── <feature-name>/
        ├── spec.md     # Requirements + acceptance criteria
        ├── design.md   # Architecture + components
        ├── tasks.md    # Granular atomic tasks
        ├── history/    # Snapshots (01-name.md, 02-name.md, ...)
        └── execution/  # BSD execution artifacts
            ├── T1/
            │   ├── plan.md
            │   ├── research.md
            │   └── review.md
            └── T2/
                └── ...

.bsd/
├── history.jsonl       # Append-only execution log (source of truth)
├── worktrees/          # Isolated sessions for retry attempts
└── rules/              # Project rules (auto-injected into every agent)
    ├── product.md
    ├── tech.md
    ├── structure.md
    ├── conventions.md
    ├── testing.md
    └── architecture.md
```

## BSD Commands

| Command | Description |
|---------|-------------|
| `/bsd-on` | Activate BSD orchestrator mode (enables `bsd_file`, restricts tools) |
| `/bsd-off` | Deactivate BSD mode and restore default tools |
| `/bsd-continue` | Resume interrupted execution |
| `/bsd-status` | Show current progress |
| `/bsd-reset` | Reset execution state |
| `/bsd-bug <feature>: <description>` | Report bug and start BugFix pipeline |
| `/bsd-bug-abort` | Cancel active BugFix session |
| `/bsd-bug-status` | Show current BugFix session status and open bugs |

## Spec-Driven Commands

| Trigger | Description |
|---------|-------------|
| `Initialize project` | Create PROJECT.md |
| `Specify feature` | Create spec.md + design.md + tasks.md |
| `Map codebase` | Analyze existing project |
| `Resume work` | Continue previous session |

## Project Rules (.bsd/rules/)

BSD injects project rules into every agent's system prompt automatically — both the orchestrator and every subagent spawned via `Agent`.

Six starter files are included as templates:

| File | Purpose |
|------|---------|
| `product.md` | Vision, goals, non-goals, users, success metrics |
| `tech.md` | Stack (languages, frameworks, DB, auth, testing, tooling) |
| `structure.md` | Project layout, module boundaries, naming, import rules |
| `conventions.md` | Code style, type safety, function and commit conventions |
| `testing.md` | Testing philosophy, coverage targets, patterns |
| `architecture.md` | Architectural principles, layers, data flow, observability |

Edit these files via `bsd_file` to customize agent behavior for your project.

## Unified File Tool (bsd_file)

A single tool for all file operations inside `.bsd/` and `.specs/`. Replaces the previous `bsd_rules_*` trio and the planned `bsd_spec_*` suite.

### Actions

| Action | Description |
|--------|-------------|
| `read` | Read a file (returns content + size + mtime) |
| `write` | Create or update a file (requires `content`; pass `overwrite:true` to replace) |
| `list` | List a directory (returns entries with size) |
| `delete` | Delete a file (directories must be empty) |
| `mkdir` | Create a directory |
| `history` | List snapshots in `.specs/features/<feature>/history/` |
| `restore` | Restore a snapshot by filename |

### Path safety

Every `path` argument MUST resolve inside `.bsd/` or `.specs/`. The tool rejects:
- Absolute paths
- Path traversal (`..`)
- Symlinks pointing outside the allowed roots

## Workflow Example

```
You: Initialize project
      → Creates .specs/project/PROJECT.md

You: Specify feature api-crud
      → Creates spec.md, design.md, tasks.md

You: /bsd-on
      → Orchestrator reads ROADMAP.md
      → T1: Create model
        → bsd-planner: "No research needed"
        → bsd-executor: Implements
        → bsd-reviewer: APPROVED
      → T2: Create service
        → bsd-frontend-designer: (skipped, not UI)
        → bsd-planner: "Needs research - check existing patterns"
        → bsd-researcher: Finds existing service patterns
        → bsd-executor: Implements
        → bsd-reviewer: REJECTED (missing validation)
      → T2 Retry (worktree):
        → bsd-executor: Fixes validation
        → bsd-reviewer: APPROVED
      → ✅ All tasks complete
      → ROADMAP.md updated: api-crud → done

You: /bsd-off
      → Tools restored
```

## Files Included

```
pi-spec-workflow/
├── package.json
├── README.md
├── install.sh
├── extensions/
│   └── bsd/
│       └── index.ts           # BSD extension (mode system + tools)
├── skills/
│   ├── spec-driven/
│   │   └── SKILL.md           # Planning methodology
│   └── bsd/
│       ├── SKILL.md           # Execution methodology
│       ├── README.md          # BSD documentation
│       ├── prompts/
│       │   └── pipeline-templates.md
│       ├── references/
│       │   ├── diagnose-strategy.md
│       │   ├── research-strategy.md
│       │   ├── review-criteria.md
│       │   └── verify-guide.md
│       └── templates/
│           └── rules/         # Project rules (auto-injected)
│               ├── architecture.md
│               ├── conventions.md
│               ├── product.md
│               ├── structure.md
│               ├── tech.md
│               └── testing.md
```

## License

MIT

---

**Happy building!** 🚀
