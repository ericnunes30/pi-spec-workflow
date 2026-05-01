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
# Start BSD pipeline for a feature
/bsd-execute task-crud

# Check current progress
/bsd-status

# Resume interrupted execution
/bsd-continue

# Reset BSD state
/bsd-reset
```

## 📊 The Pipeline

```
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

- **bsd-planner**: Evaluates task, decides if research is needed
- **bsd-researcher**: Finds and consolidates context from the codebase
- **bsd-executor**: Implements the task (has full tool access)
- **bsd-reviewer**: Skeptically reviews against acceptance criteria

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `/bsd-execute <feature>` | Start BSD pipeline for a feature |
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

## 🔧 Custom Tools

| Tool | Purpose |
|------|---------|
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

When `/bsd-execute` is called:

1. **Mode activated**: Main agent becomes coordinator
2. **Tools restricted**: Only `read`, `subagent`, `bsd_*`, limited `bash`
3. **Blocked tools**: `edit`, `write`, `mcp` (orchestrator cannot edit code)
4. **System prompt injected**: Orchestrator instructions added

The orchestrator delegates all implementation to subagents.

## 📋 Example Session

```bash
$ cd my-project
$ pi

# Start execution
> /bsd-execute user-auth
Starting BSD pipeline for "user-auth"...

# T1: Setup
→ bsd-planner: "No research needed"
→ bsd-executor: Implements auth service
→ bsd-reviewer: APPROVED

# T2: Login endpoint
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
- Run `/bsd-execute <feature>` to start
- Or `/bsd-continue` to resume

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
