# BSD - Build Spec Development

> Automate spec implementation with skeptical review and context research.

BSD transforms your `tasks.md` into automated execution with a **research → execute → review** pipeline, bridging the gap between spec-driven planning and actual implementation.

## 🎯 What is BSD?

The `spec-driven` skill creates excellent planning artifacts but **stops at `tasks.md`**. After that:
- You manually orchestrate each task
- No verification against acceptance criteria
- No skeptical review
- No context research before implementing
- Progress is lost between sessions

**BSD fills the gap:** it transforms `tasks.md` into automated execution with a structured pipeline.

## 🚀 Quick Start

### Prerequisites

- pi-coding-agent installed
- A project with `.specs/` directory (created by spec-driven skill)
- `spec-driven` artifacts: `ROADMAP.md`, `features/<name>/spec.md`, `design.md`, `tasks.md`

### Installation

BSD is automatically available when placed in `~/.pi/agent/skills/bsd/` and `~/.pi/agent/extensions/bsd/`.

```bash
# Reload pi to pick up the extension
pi
/reload
```

### Basic Usage

```bash
# Activate BSD orchestrator mode (enables bsd_file, restricts tools)
/bsd-on

# Check current progress
/bsd-status

# Resume interrupted execution
/bsd-continue

# Deactivate orchestrator mode
/bsd-off

# Reset BSD state
/bsd-reset
```

Once activated, the orchestrator reads `.specs/project/ROADMAP.md` and `.specs/features/<feature>/tasks.md` directly via `bsd_file` and dispatches the pipeline (`frontend-designer → planner → researcher → executor → reviewer`) for each task.

## 📊 The Pipeline

```
┌───────────────────┐
│ FRONTEND-DESIGNER  │
│ (if UI/frontend)   │ ──→ feeds design context into EXECUTOR
│ Designs UI/CSS     │
└───────────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PLANNER   │ ──→ │ RESEARCHER  │ ──→ │  EXECUTOR   │ ──→ │  REVIEWER   │
│             │     │ (if needed) │     │             │     │             │
│ Decides if  │     │ Searches    │     │ Implements  │     │ Skeptical   │
│ research    │     │ context     │     │ the code    │     │ review vs   │
│ is needed   │     │             │     │             │     │ acceptance  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                              REJECTED? → Create worktree
                                              (max 2x)    and retry
                                              APPROVED? → Next task
```

### Agents

- **bsd-frontend-designer**: Designs UI/components/CSS before implementation (multimodal: can analyze screenshots and mockups)
- **bsd-planner**: Evaluates task, decides if research is needed
- **bsd-researcher**: Finds and consolidates context from the codebase
- **bsd-executor**: Implements the task (has full tool access)
- **bsd-reviewer**: Skeptically reviews against acceptance criteria

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `/bsd-on` | Activate BSD orchestrator mode (enables `bsd_file`, restricts tools) |
| `/bsd-off` | Deactivate orchestrator mode and restore default tools |
| `/bsd-continue` | Resume interrupted execution |
| `/bsd-status` | Show current execution progress |
| `/bsd-reset` | Reset BSD execution state |

## 📁 State Files

| File | Purpose |
|------|---------|
| `.bsd/history.jsonl` | Append-only execution log (source of truth) |
| `.specs/project/STATE.md` | Human-readable state summary |
| `.specs/features/<name>/execution/` | **Artifacts**: `plan.md`, `research.md`, `review.md` |
| `.bsd/worktrees/` | Isolated sessions for retry attempts |

### Artifacts Structure

```
.specs/features/task-crud/execution/
├── T1/
│   ├── plan.md          # Planner's evaluation
│   ├── research.md      # Researcher's findings (if needed)
│   └── review.md        # Reviewer's assessment
├── T2/
│   ├── plan.md
│   ├── research.md
│   └── review.md
└── T4-retry-2/          # Retry artifacts
    └── review.md
```

## 🛠️ Unified File Tool (bsd_file)

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

### Examples

```typescript
// Read ROADMAP
bsd_file action=read path=.specs/project/ROADMAP.md

// Read tasks for a feature
bsd_file action=read path=.specs/features/01.user-auth/tasks.md

// List all features
bsd_file action=list path=.specs/features

// Write an updated spec
bsd_file action=write path=.specs/features/01.user-auth/spec.md content="..." overwrite=true

// Edit a project rule
bsd_file action=write path=.bsd/rules/product.md content="..." overwrite=true

// List snapshots of a feature
bsd_file action=history path=.specs/features/01.user-auth

// Restore a snapshot
bsd_file action=restore path=.specs/features/01.user-auth snapshot=01-initial.md
```

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

Use `bsd_file` to read or update rule files. Changes take effect on the next agent turn.

## 🔧 Custom Tools

| Tool | Purpose |
|------|---------|
| `bsd_file` | Unified file ops for `.bsd/` and `.specs/` (read, write, list, delete, mkdir, history, restore) |
| `bsd_status` | Check execution progress |
| `bsd_history` | Record pipeline execution steps |
| `bsd_state` | Read/update project STATE.md |
| `bsd_worktree` | Create isolated worktrees for retries |
| `bsd_worktree_apply` | Copy files from worktree back to project |
| `bsd_detect_files` | Detect files modified by executor |
| `bsd_get_tasks` | Get tasks in dependency order |
| `bsd_save_artifact` | Save subagent outputs to execution/ folder |
| `bsd_roadmap_update` | Update feature status in ROADMAP.md |
| `bsd_reconstruct_state` | Reconstruct STATE.md from history |

## 🔄 Retry Flow

When a task is rejected:

1. **Worktree created**: `.bsd/worktrees/T2-retry-2/`
2. **Clean session**: Executor runs in worktree (no access to previous attempt)
3. **Fixes applied**: Based on reviewer feedback
4. **Re-review**: Reviewer evaluates worktree code
5. **If approved**: Files copied back to main project
6. **If rejected (2x)**: Pipeline pauses for user decision

## 📝 Task Dependencies

Add dependencies to your `tasks.md`:

```markdown
## T1: Create Task model
Create the Task interface...

## T2: Create TaskService
Depends on: T1
Implement CRUD operations...

## T3: Add validation
Depends on: T1, T2
Add input validation...
```

BSD uses topological sort to execute tasks in correct order.

## 🎛️ Orchestrator Mode

When `/bsd-on` is called:

1. **Mode activated**: Main agent becomes coordinator
2. **Tools restricted**: Only `read`, `Agent`, `bash` (read-only), `bsd_*`
3. **Blocked tools**: `edit`, `write`, `mcp` (orchestrator cannot edit code)
4. **System prompt injected**: Orchestrator instructions + project rules from `.bsd/rules/*.md`
5. **Filesystem access**: Orchestrator can read/write `.bsd/` and `.specs/` via `bsd_file`

The orchestrator delegates all implementation to subagents.

## 📋 Example Session

```bash
$ cd my-project
$ pi

# Activate orchestrator mode
> /bsd-on
BSD mode ACTIVATED. Tools restricted to orchestrator mode.

# Orchestrator reads ROADMAP via bsd_file and starts the pipeline for the next pending feature
# (No /bsd-execute needed — orchestrator uses bsd_file action=read to find work)

# T1: Setup
→ bsd-planner: "No research needed"
→ bsd-executor: Implements auth service
→ bsd-reviewer: APPROVED

# T2: Login UI (frontend task)
→ bsd-frontend-designer: Designs login form layout, CSS, component structure
→ bsd-planner: "No research needed"
→ bsd-executor: Implements login form with design context
→ bsd-reviewer: APPROVED

# T3: Login endpoint
→ bsd-planner: "Needs research - check JWT patterns"
→ bsd-researcher: Finds existing JWT implementation
→ bsd-executor: Implements login
→ bsd-reviewer: REJECTED - missing validation

# T2: Retry
→ bsd-worktree: Creates T2-retry-2/
→ bsd-executor: Fixes validation
→ bsd-reviewer: APPROVED

# Complete
✅ All tasks completed
ROADMAP.md updated: user-auth → done
```

## 🔍 Architecture

```
~/.pi/agent/
├── skills/bsd/
│   ├── SKILL.md              # Orchestrator methodology
│   ├── prompts/
│   │   └── pipeline-templates.md
│   └── references/
│       ├── review-criteria.md
│       └── research-strategy.md
│
├── extensions/bsd/
│   └── index.ts              # Extension implementation
│
└── agents/
    ├── bsd-frontend-designer.md # UI/component design (if frontend task)
    ├── bsd-planner.md        # Task evaluation
    ├── bsd-researcher.md     # Context research
    ├── bsd-executor.md       # Implementation
    └── bsd-reviewer.md       # Skeptical review
```

## ⚙️ Configuration

No configuration required. BSD works out-of-the-box with your existing `.specs/` directory.

Optional environment variables:
- `BSD_MAX_RETRIES=2` - Maximum retry attempts (default: 2)

## 🐛 Troubleshooting

### "Feature not found"
- Check that `.specs/features/<name>/` exists
- Verify `spec.md`, `design.md`, `tasks.md` are present

### "No BSD execution in progress"
- Run `/bsd-on` to activate orchestrator mode
- The orchestrator will then read `.specs/project/ROADMAP.md` via `bsd_file` and dispatch the pipeline
- Or `/bsd-continue` to resume a previous session

### Status not updating
- Run `/reload` to refresh the extension
- Check `.bsd/history.jsonl` exists

### Worktree issues
- Run `/bsd-reset` to clean up worktrees
- Check git is available: `git worktree --help`

## 🤝 Integration with spec-driven

BSD is designed to work seamlessly with the spec-driven skill:

1. **spec-driven**: Creates `PROJECT.md`, `ROADMAP.md`, features with `spec.md`, `design.md`, `tasks.md`
2. **BSD**: Executes `tasks.md` with automated pipeline

Use spec-driven for planning, BSD for execution.

## 📈 Future Features

- [ ] Parallel task execution
- [ ] Custom agent definitions
- [ ] Performance metrics dashboard
- [ ] Integration with external CI/CD

## 📝 License

BSD is part of the pi-coding-agent ecosystem.

---

**Happy building!** 🚀
