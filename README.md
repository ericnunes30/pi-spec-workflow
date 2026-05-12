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
Automates execution from `tasks.md`:
- **Pipeline**: Planner → Researcher → Executor → Reviewer
- **BugFix pipeline**: Intake → Diagnose → Fix → Verify
- **Skeptical review** against acceptance criteria
- **Automated retries** with isolated branches
- **Progress tracking** in `history.jsonl`
- **Mode system**: BSD tools only visible when mode is ON
- **Orchestrator restrictions**: edit/write/mcp blocked in BSD mode

## Requirements

- [pi-coding-agent](https://github.com/badlogic/pi-mono)
- [pi-subagents](https://www.npmjs.com/package/pi-subagents) — Required for BSD pipeline
  ```bash
  pi install npm:pi-subagents
  ```
- Git

## Installation

### 1. Install pi-subagents (Required)

BSD requires the `pi-subagents` extension to spawn planner/researcher/executor/reviewer agents:

```bash
pi install npm:pi-subagents
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
- `[Agents] bsd-planner, bsd-researcher, bsd-executor, bsd-reviewer` appear

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
> /bsd-execute user-authentication
```

BSD will:
1. Read `tasks.md` and create execution plan
2. For each task:
   - Planner evaluates if research is needed
   - Researcher gathers context (if needed)
   - Executor implements the code
   - Reviewer checks against acceptance criteria
3. On rejection: retry in clean worktree (max 2x)
4. Update ROADMAP.md when complete

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
        └── execution/  # BSD execution artifacts
            ├── T1/
            │   ├── plan.md
            │   ├── research.md
            │   └── review.md
            └── T2/
                └── ...
```

## BSD Commands

| Command | Description |
|---------|-------------|
| `/bsd-on` | Activate BSD orchestrator mode |
| `/bsd-off` | Deactivate BSD mode, restore tools |
| `/bsd-execute <feature>` | Start BSD pipeline |
| `/bsd-continue` | Resume interrupted execution |
| `/bsd-status` | Show progress |
| `/bsd-reset` | Reset execution state |
| `/bsd-bug [<feature>: <desc>]` | Report bug and start BugFix pipeline |
| `/bsd-bug-abort` | Cancel active BugFix session |
| `/bsd-bug-status` | Show active BugFix session status |

## Spec-Driven Commands

| Trigger | Description |
|---------|-------------|
| `Initialize project` | Create PROJECT.md |
| `Specify feature` | Create spec.md + design.md + tasks.md |
| `Map codebase` | Analyze existing project |
| `Resume work` | Continue previous session |

## Workflow Example

```
You: Initialize project
      → Creates .specs/project/PROJECT.md

You: Specify feature api-crud
      → Creates spec.md, design.md, tasks.md

You: /bsd-execute api-crud
      → T1: Create model → APPROVED
      → T2: Create service → APPROVED  
      → T3: Add validation → REJECTED
      
      → T3 Retry 1: Fixed validation → APPROVED
      
      → ✅ All tasks complete
      → ROADMAP.md updated: api-crud → done
```

## Files Included

```
pi-spec-workflow/
├── package.json
├── README.md
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
│       └── references/
│           ├── review-criteria.md
│           └── research-strategy.md
```

## Requirements

- [pi-coding-agent](https://github.com/badlogic/pi-mono)
- **[pi-subagents](https://www.npmjs.com/package/pi-subagents)** — Required for BSD pipeline (install first!)
  ```bash
  pi install npm:pi-subagents
  ```
- Git

## License

MIT

---

**Happy building!** 🚀
