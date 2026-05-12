import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// ─── State ───
// NOTA: Estado por sessão via pi.appendEntry, não variáveis globais
const BSD_STATE_KEY = "bsd-mode-state";

// Lista de todas as ferramentas BSD registradas pela extensão
// Usada para bloquear chamadas e filtrar tools quando modo orchestrator está OFF
const BSD_TOOL_NAMES = [
  "bsd_status",
  "bsd_history",
  "bsd_state",
  "bsd_branch_create",
  "bsd_branch_merge",
  "bsd_branch_checkout",
  "bsd_branch_list",
  "bsd_branch_status",
  "bsd_worktree",
  "bsd_detect_files",
  "bsd_roadmap_update",
  "bsd_reconstruct_state",
  "bsd_save_artifact",
  "bsd_get_tasks",
];

// Filtra nomes de ferramentas BSD de um array
function filterBSDTools(tools: string[]): string[] {
  return tools.filter(t => !BSD_TOOL_NAMES.includes(t));
}

interface BSDSessionState {
  active: boolean;
  originalTools: string[];
  featureName?: string;
  mode: "orchestrator" | "bugfix";
  currentBugId?: string;
  attemptCount: number;
}

type BugStatus = "open" | "diagnosing" | "fixing" | "verified" | "closed";
type Severity = "blocker" | "major" | "minor" | "cosmetic";

interface BugReport {
  id: string;
  feature: string;
  status: BugStatus;
  severity: Severity;
  created: string;
  expected?: string;
  actual?: string;
  steps?: string[];
  environment?: string;
  diagnosis?: {
    root_cause: string;
    files_affected: string[];
    fix_direction: string;
  };
  verification?: {
    tests_passed: boolean;
    user_confirmed: boolean;
  };
}

const ORCHESTRATOR_PROMPT = `## 🔒 BSD ORCHESTRATOR MODE (RESTRICTED)

You are a BSD (Build Spec Development) orchestrator operating in RESTRICTED MODE.

⚠️  CRITICAL: You CANNOT edit files or execute bash commands directly. You MUST delegate ALL implementation work to subagents.

### What You CAN Do (Available Tools)
- read: Read files ONLY (no modifications)
- subagent: Delegate to bsd-planner, bsd-researcher, bsd-executor, bsd-reviewer
- bsd_* tools: Use the BSD custom tools for orchestration
- bash: LIMITED to git status, ls, read-only commands

### What You CANNOT Do (BLOCKED)
- edit: ❌ BLOCKED - You cannot edit files
- write: ❌ BLOCKED - You cannot create/modify files
- mcp: ❌ BLOCKED - You cannot use MCP tools
- bash: ❌ RESTRICTED - Only read-only commands allowed

### Execution flow (Branch per Task)

When /bsd-execute is called:
1. ROADMAP is auto-updated to in-progress
2. Read .specs/project/ROADMAP.md to find the feature
3. Read .specs/features/<feature>/spec.md, design.md, tasks.md
4. Call bsd_get_tasks to get tasks in dependency order (topological sort)
5. Read .bsd/history.jsonl to check if there's existing progress
6. For each task in order from bsd_get_tasks:
   a. Call bsd_branch_create for this task (e.g., bsd/task-crud/T1) - EACH TASK GETS ITS OWN BRANCH FROM MAIN
   b. Call subagent with agent "bsd-planner", task = task content + design.md + spec.md
   b. Call bsd_save_artifact with phase="plan" and planner's full output
   c. Call bsd_history to record planner result
   d. If planner says needsResearch: 
      - Call subagent with agent "bsd-researcher", task = task + plan
      - Call bsd_save_artifact with phase="research" and researcher's full output
   e. Call bsd_history to record researcher result (or skip if not needed)
   f. Call subagent with agent "bsd-executor", task = task + context + acceptance_criteria + design
   g. Call bsd_detect_files to get list of modified files
   h. Call bsd_history to record executor result with files from bsd_detect_files
   i. Call subagent with agent "bsd-reviewer", task = task + code + acceptance_criteria + spec
   j. Call bsd_save_artifact with phase="review" and reviewer's full output (APPROVED or REJECTED)
   k. Call bsd_history to record reviewer result
   l. If reviewer REJECTED:
      - If attempt < 2:
        a. Stay on same branch (bsd/<feature>/<task>) - DO NOT create new branch
        b. Call subagent with agent "bsd-executor", task=task + reviewer_feedback + what_to_fix
        c. Call bsd_history to record executor result (attempt 2)
        d. Call subagent with agent "bsd-reviewer" again
        e. Call bsd_save_artifact with phase="review", attempt=2
        f. Call bsd_history to record reviewer result
        g. If approved: continue to merge (step n)
        h. If rejected again: PAUSE and ask user for decision (max 2 attempts)
      - If attempt >= 2: PAUSE and ask user for decision
   m. If reviewer APPROVED:
      - Call bsd_branch_merge to merge task branch into main
      - Main now includes this task's changes (main is always stable!)
      - STATE.md is auto-updated after each bsd_history call
      - Move to next task (which will create new branch from updated main)
7. After all tasks complete: ROADMAP is auto-updated to done. THEN check .specs/features/ directory for the NEXT pending feature and automatically continue executing it WITHOUT waiting for user input. Only stop and deactivate mode if there are no more pending features.

When /bsd-continue is called:
1. Call bsd_reconstruct_state to rebuild STATE.md from history.jsonl
2. Read reconstructed STATE.md to understand current position
3. Continue execution from where it left off

### Recording format (bsd_history)
Always record after each phase:
{ feature, task, phase, status, attempt, feedback?, files? }

### Rules
- NEVER edit files yourself — always use subagent
- NEVER skip phases — always planner → researcher → executor → reviewer
- ALWAYS create branch at start of each task (bsd_branch_create)
- ALWAYS merge to main after approval (bsd_branch_merge)
- ALWAYS record via bsd_history after each phase
- ALWAYS save artifacts via bsd_save_artifact after planner/researcher/reviewer
- ALWAYS update bsd_state after each complete task
- If you need user decision, PAUSE and ask explicitly
- When spawning subagent, pass the full context the agent needs in the task parameter
`;

const BUGFIX_ORCHESTRATOR_PROMPT = `## 🔍 BSD BUGFIX MODE (RESTRICTED)

You are a BSD BugFix orchestrator operating in RESTRICTED MODE.

⚠️  CRITICAL: You CANNOT edit files or execute bash commands directly. You MUST delegate ALL implementation work to subagents.

### What You CAN Do (Available Tools)
- read: Read files ONLY (no modifications)
- subagent: Delegate to bsd-bug-inspector, bsd-fix-executor
- bsd_* tools: Use the BSD custom tools for orchestration
- bash: LIMITED to git status, ls, read-only commands

### What You CANNOT Do (BLOCKED)
- edit: ❌ BLOCKED - You cannot edit files
- write: ❌ BLOCKED - You cannot create/modify files
- mcp: ❌ BLOCKED - You cannot use MCP tools
- bash: ❌ RESTRICTED - Only read-only commands allowed

### BugFix Pipeline

1. **INTAKE** — Understand the bug via natural conversation (no ask_user)
   - Ask clarifying questions until you have enough context
   - Infer severity from language automatically
   - The bug report has already been created by the /bsd-bug command

2. **DIAGNOSE** — Spawn bsd-bug-inspector agent
   - The inspector reads code, forms 3+ hypotheses
   - Returns: root_cause, files_affected, fix_direction

3. **FIX PLAN** — Present diagnosis to user
   - "Root cause: X in file.ts line N. Apply fix?"
   - Wait for explicit user approval before proceeding

4. **FIX & TEST** — Spawn bsd-fix-executor agent
   - Creates branch: bsd/<feature>/BUG-N
   - Applies atomic fix (only files indicated)
   - Runs tests
   - Commits: "fix(<feature>): resolve BUG-N"

5. **VERIFY** — Ask user to test and confirm
   - "Testa aí pra confirmar se funcionou!"
   - User confirms verbally in chat

6. **REVISION LOOP** — Max 3 attempts
   - If user says fix didn't work: re-diagnose with different hypotheses
   - If 3 attempts exhausted: escalate to user with summary
   - Stall detection: if bug count doesn't decrease, escalate early

### Recording format (bsd_history)
Always record after each pipeline step:
{ feature, task, phase, status, attempt, feedback? }

Accepted phases for bugfix: "intake", "diagnose", "fix-plan", "fix-execute", "verify"

### Rules
- NEVER edit files yourself — always use subagent
- NEVER use ask_user — converse naturally in chat
- NEVER skip pipeline phases
- ALWAYS create branch per bug (bsd_branch_create)
- ALWAYS merge to main after fix verified (bsd_branch_merge)
- ALWAYS record via bsd_history after each phase
- ALWAYS save artifacts via bsd_save_artifact after diagnose and verify
- If you need user decision, PAUSE and ask explicitly in chat
- When spawning subagent, pass the full context the agent needs
`;

// ─── BugFix Mode helpers ───



// ─── Bug Report CRUD ───

function getBugDir(cwd: string, feature: string): string {
  return path.join(cwd, ".specs", "features", feature, "bugs");
}

function getBugReportPath(cwd: string, feature: string, bugId: string): string {
  return path.join(getBugDir(cwd, feature), `${bugId}.md`);
}

function getNextBugId(cwd: string, feature: string): string {
  const dir = getBugDir(cwd, feature);
  if (!fs.existsSync(dir)) return "BUG-01";
  
  const files = fs.readdirSync(dir).filter(f => f.startsWith("BUG-") && f.endsWith(".md"));
  if (files.length === 0) return "BUG-01";
  
  const maxNum = files.reduce((max, f) => {
    const match = f.match(/^BUG-(\d+)\.md$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  
  return `BUG-${String(maxNum + 1).padStart(2, "0")}`;
}

function inferSeverity(description: string): Severity {
  const lower = description.toLowerCase();
  
  // Blocker: crash, cannot, broken, block
  if (/\b(crash|cannot|can't|broken|block|impossible|data loss|security)\b/.test(lower)) {
    return "blocker";
  }
  
  // Major: doesn't work, fails, wrong, incorrect, bug
  if (/\b(doesn't work|fails?|wrong|incorrect|bug|not working|error)\b/.test(lower)) {
    return "major";
  }
  
  // Cosmetic: typo, cosmetic, spelling, grammar, alignment, padding
  if (/\b(typo|cosmetic|spelling|grammar|alignment|padding|margin|color|font)\b/.test(lower)) {
    return "cosmetic";
  }
  
  // Default: minor
  return "minor";
}

function createBugReport(
  cwd: string,
  feature: string,
  description: string
): { bugId: string; filePath: string } {
  const dir = getBugDir(cwd, feature);
  fs.mkdirSync(dir, { recursive: true });
  
  const bugId = getNextBugId(cwd, feature);
  const filePath = getBugReportPath(cwd, feature, bugId);
  const severity = inferSeverity(description);
  const now = new Date().toISOString();
  
  const content = `---
id: ${bugId}
feature: ${feature}
status: open
severity: ${severity}
created: ${now}
---

## Description
${description}

## Expected
<!-- Describe what should happen -->

## Actual
<!-- Describe what actually happens -->

## Steps to Reproduce
1. 
2. 
3. 

## Environment
<!-- Browser, OS, device, etc. -->

## Diagnosis
<!-- Will be filled by bsd-bug-inspector -->
- root_cause:
- files_affected: []
- fix_direction:
`;
  
  fs.writeFileSync(filePath, content, "utf-8");
  
  return { bugId, filePath };
}

function readBugReport(cwd: string, feature: string, bugId: string): BugReport | null {
  const filePath = getBugReportPath(cwd, feature, bugId);
  if (!fs.existsSync(filePath)) return null;
  
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;
  
  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterMatch[1].split("\n")) {
    const sepIndex = line.indexOf(": ");
    if (sepIndex !== -1) {
      const key = line.slice(0, sepIndex).trim();
      const value = line.slice(sepIndex + 2).trim();
      frontmatter[key] = value;
    }
  }
  
  return {
    id: frontmatter["id"] || bugId,
    feature: frontmatter["feature"] || feature,
    status: (frontmatter["status"] as BugStatus) || "open",
    severity: (frontmatter["severity"] as Severity) || "minor",
    created: frontmatter["created"] || "",
  };
}

function listBugs(cwd: string, feature: string, status?: BugStatus): BugReport[] {
  const dir = getBugDir(cwd, feature);
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir).filter(f => f.startsWith("BUG-") && f.endsWith(".md"));
  const bugs: BugReport[] = [];
  
  for (const file of files) {
    const bugId = file.replace(".md", "");
    const bug = readBugReport(cwd, feature, bugId);
    if (bug) {
      if (!status || bug.status === status) {
        bugs.push(bug);
      }
    }
  }
  
  return bugs.sort((a, b) => a.id.localeCompare(b.id));
}

function updateBugReport(
  cwd: string,
  feature: string,
  bugId: string,
  updates: Partial<BugReport>
): void {
  const filePath = getBugReportPath(cwd, feature, bugId);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, "utf-8");
  
  // Update YAML frontmatter fields
  if (updates.status) {
    content = content.replace(/^status: .+$/m, `status: ${updates.status}`);
  }
  if (updates.severity) {
    content = content.replace(/^severity: .+$/m, `severity: ${updates.severity}`);
  }
  if (updates.diagnosis) {
    // Update root_cause, files_affected, fix_direction in the body
    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    if (bodyMatch) {
      let body = bodyMatch[1];
      
      if (updates.diagnosis.root_cause) {
        body = body.replace(/- root_cause:.*$/m, `- root_cause: ${updates.diagnosis.root_cause}`);
      }
      if (updates.diagnosis.files_affected) {
        body = body.replace(/- files_affected:.*$/m, `- files_affected: [${updates.diagnosis.files_affected.map(f => `"${f}"`).join(", ")}]`);
      }
      if (updates.diagnosis.fix_direction) {
        body = body.replace(/- fix_direction:.*$/m, `- fix_direction: ${updates.diagnosis.fix_direction}`);
      }
      
      const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---)\n/);
      if (frontmatterMatch) {
        content = frontmatterMatch[1] + "\n" + body;
      }
    }
  }
  
  fs.writeFileSync(filePath, content, "utf-8");
}

// ─── History (JSONL append-only) ───

interface HistoryEntry {
  feature: string;
  task: string;
  phase: "planner" | "researcher" | "executor" | "reviewer" | "intake" | "diagnose" | "fix-plan" | "fix-execute" | "verify";
  status: string;
  ts: number;
  duration?: number;
  attempt?: number;
  feedback?: string;
  files?: string[];
}

function getBSDDir(cwd: string): string {
  return path.join(cwd, ".bsd");
}

function getHistoryPath(cwd: string): string {
  return path.join(getBSDDir(cwd), "history.jsonl");
}

function appendHistory(cwd: string, entry: Omit<HistoryEntry, "ts">) {
  // DEBUG: write marker to prove this function executes
  const debugMarker = path.join(cwd, ".bsd", "__debug_history_marker__");
  try {
    fs.writeFileSync(debugMarker, `Called at ${new Date().toISOString()}\nfeature=${entry.feature}\nphase=${entry.phase}\ncwd=${cwd}\n`, "utf-8");
  } catch (e) { /* ignore */ }
  
  const historyPath = getHistoryPath(cwd);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  const fullEntry: HistoryEntry = { ...entry, ts: Math.floor(Date.now() / 1000) };
  const jsonLine = JSON.stringify(fullEntry) + "\n";
  fs.appendFileSync(historyPath, jsonLine, "utf-8");
  // Verify the write
  const size = fs.statSync(historyPath).size;
  if (size === 0) {
    console.error(`[BSD] CRITICAL: ${historyPath} is 0 bytes after append!`);
  }
}

function readLastHistoryEntry(cwd: string): HistoryEntry | null {
  const historyPath = getHistoryPath(cwd);
  if (!fs.existsSync(historyPath)) return null;
  try {
    const content = fs.readFileSync(historyPath, "utf-8").trim();
    if (!content) return null;
    const lines = content.split("\n");
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch (error) {
    console.error("Error reading history.jsonl:", error);
    return null;
  }
}

function readAllHistory(cwd: string): HistoryEntry[] {
  const historyPath = getHistoryPath(cwd);
  if (!fs.existsSync(historyPath)) return [];
  try {
    const content = fs.readFileSync(historyPath, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map((l) => JSON.parse(l)).filter((e): e is HistoryEntry => e && typeof e === "object");
  } catch (error) {
    console.error("Error reading history.jsonl:", error);
    return [];
  }
}

function readBSDStatus(cwd: string): {
  current: HistoryEntry | null;
  completedTasks: string[];
  totalEntries: number;
} {
  const entries = readAllHistory(cwd);
  if (entries.length === 0) {
    return { current: null, completedTasks: [], totalEntries: 0 };
  }

  const completedTasks = new Set<string>();
  for (const entry of entries) {
    if (entry.phase === "reviewer" && entry.status === "approved") {
      completedTasks.add(entry.task);
    }
  }

  return {
    current: entries[entries.length - 1],
    completedTasks: Array.from(completedTasks),
    totalEntries: entries.length,
  };
}

// ─── STATE.md ───

function getStatePath(cwd: string): string {
  return path.join(cwd, ".specs", "project", "STATE.md");
}

function readSTATE(cwd: string, section?: string): string {
  const statePath = getStatePath(cwd);
  if (!fs.existsSync(statePath)) return "STATE.md not found";
  const content = fs.readFileSync(statePath, "utf-8");
  if (!section) return content;
  const regex = new RegExp(`## ${section}\\s*([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1].trim() : `Section "${section}" not found`;
}

function updateSTATE(cwd: string, section: string, newContent: string) {
  // DEBUG: marker to prove this function executes
  const debugMarker = path.join(cwd, ".bsd", "__debug_state_marker__");
  try {
    fs.writeFileSync(debugMarker, `Called at ${new Date().toISOString()}\nsection=${section}\ncwd=${cwd}\n`, "utf-8");
  } catch (e) { /* ignore */ }
  
  const statePath = getStatePath(cwd);
  let content = fs.existsSync(statePath)
    ? fs.readFileSync(statePath, "utf-8")
    : "# Project State\n\n";

  const regex = new RegExp(`(## ${section}\\s*)[\\s\\S]*?(?=\\n## |$)`);
  if (content.match(regex)) {
    content = content.replace(regex, `$1\n${newContent}\n`);
  } else {
    content += `\n## ${section}\n${newContent}\n`;
  }

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, content);
}

// ─── Branch per Task ───

function getBranchName(feature: string, taskId: string): string {
  return `bsd/${feature}/${taskId}`;
}

function branchExists(cwd: string, branch: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function createTaskBranch(cwd: string, feature: string, taskId: string): string {
  const branch = getBranchName(feature, taskId);
  
  // If branch already exists, check it out
  if (branchExists(cwd, branch)) {
    execSync(`git checkout ${branch}`, { cwd, stdio: "ignore" });
    return branch;
  }
  
  // Create branch from main/master
  const baseBranch = getBaseBranch(cwd);
  execSync(`git checkout -b ${branch} ${baseBranch}`, { cwd, stdio: "ignore" });
  
  return branch;
}

function getBaseBranch(cwd: string): string {
  try {
    // Check if main exists
    execSync(`git show-ref --verify --quiet refs/heads/main`, { cwd, stdio: "ignore" });
    return "main";
  } catch {
    try {
      // Check if master exists
      execSync(`git show-ref --verify --quiet refs/heads/master`, { cwd, stdio: "ignore" });
      return "master";
    } catch {
      return "HEAD";
    }
  }
}

function mergeTaskBranch(cwd: string, feature: string, taskId: string): void {
  const branch = getBranchName(feature, taskId);
  const baseBranch = getBaseBranch(cwd);
  
  // Checkout main and merge
  execSync(`git checkout ${baseBranch}`, { cwd, stdio: "ignore" });
  execSync(`git merge --no-ff ${branch} -m "BSD: Complete ${taskId} for ${feature}"`, { cwd, stdio: "ignore" });
}

function deleteTaskBranch(cwd: string, feature: string, taskId: string): void {
  const branch = getBranchName(feature, taskId);
  try {
    execSync(`git branch -D ${branch}`, { cwd, stdio: "ignore" });
  } catch {
    // ignore
  }
}

function checkoutTaskBranch(cwd: string, feature: string, taskId: string): void {
  const branch = getBranchName(feature, taskId);
  execSync(`git checkout ${branch}`, { cwd, stdio: "ignore" });
}

function getCurrentBranch(cwd: string): string {
  try {
    return execSync("git branch --show-current", { cwd, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function listTaskBranches(cwd: string, feature: string): string[] {
  try {
    const output = execSync(`git branch --list "bsd/${feature}/*"`, { cwd, encoding: "utf-8" });
    return output.split("\n").map(b => b.trim().replace(/^\*?\s*/, "")).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Legacy Worktree (kept for reference) ───

function cleanupWorktrees(cwd: string) {
  const worktreesDir = path.join(getBSDDir(cwd), "worktrees");
  if (!fs.existsSync(worktreesDir)) return;

  const hasGit = fs.existsSync(path.join(cwd, ".git"));
  for (const dir of fs.readdirSync(worktreesDir)) {
    const fullPath = path.join(worktreesDir, dir);
    if (hasGit) {
      try {
        execSync(`git worktree remove "${fullPath}" --force`, { cwd, stdio: "ignore" });
      } catch {
        // ignore
      }
    }
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function resetBSD(cwd: string) {
  const historyPath = getHistoryPath(cwd);
  if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
  cleanupWorktrees(cwd);
}

// ─── Detect Modified Files ───

function getModifiedFiles(cwd: string, since?: number): string[] {
  const modified: string[] = [];
  
  // Try git first
  if (fs.existsSync(path.join(cwd, ".git"))) {
    try {
      const output = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000 });
      const lines = output.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        // Format: XY filename or XY "filename with spaces"
        const match = line.match(/^\s*\S+\s+(.+)$/);
        if (match) {
          const filename = match[1].replace(/^"(.+)"$/, "$1"); // Remove quotes if present
          modified.push(filename);
        }
      }
      return modified;
    } catch {
      // Fall through to file system method
    }
  }
  
  // Fallback: check .specs directory (common files that change)
  const specsDir = path.join(cwd, ".specs");
  if (fs.existsSync(specsDir)) {
    // This is a simplified check - in production, you might want to track more
    try {
      const featuresDir = path.join(specsDir, "features");
      if (fs.existsSync(featuresDir)) {
        const features = fs.readdirSync(featuresDir);
        for (const feature of features) {
          const executionDir = path.join(featuresDir, feature, "execution");
          if (fs.existsSync(executionDir)) {
            const entries = fs.readdirSync(executionDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isFile()) {
                modified.push(path.join(".specs", "features", feature, "execution", entry.name));
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  return modified;
}

// ─── ROADMAP.md Update ───

function getRoadmapPath(cwd: string): string {
  return path.join(cwd, ".specs", "project", "ROADMAP.md");
}

function updateRoadmapFeature(cwd: string, featureName: string, status: "done" | "in-progress" | "pending") {
  // DEBUG: write marker file to prove this function executes
  const debugMarker = path.join(cwd, ".bsd", "__debug_roadmap_marker__");
  try {
    fs.writeFileSync(debugMarker, `Called at ${new Date().toISOString()}\nfeature=${featureName}\nstatus=${status}\ncwd=${cwd}\n`, "utf-8");
  } catch (e) {
    // ignore
  }
  
  const roadmapPath = getRoadmapPath(cwd);
  if (!fs.existsSync(roadmapPath)) return;

  let content = fs.readFileSync(roadmapPath, "utf-8");
  
  // Map status to visual indicators used in tables
  const statusVisual = status === "done" ? "✅ Done" : status === "in-progress" ? "🔄 In Progress" : "⬜ Pending";
  const statusSimple = status; // "done" | "in-progress" | "pending"
  
  // --- Format 1: Markdown list format ---
  // "- [ ] feature-name: pending" or "- [x] feature-name: done"
  const featurePattern = new RegExp(`(- \\[.*?\\] )?${escapeRegex(featureName)}:`, "g");
  const checkbox = status === "done" ? "- [x] " : "- [ ] ";
  content = content.replace(featurePattern, `${checkbox}${featureName}:`);
  
  // --- Format 1b: Inline status ---
  // "feature-name: pending"
  const statusPattern = new RegExp(`(${escapeRegex(featureName)}: )(pending|in-progress|done)`, "g");
  content = content.replace(statusPattern, `$1${statusSimple}`);
  
  // --- Format 2: Markdown table format (by directory name) ---
  // "| 2 | Baileys Adapter (WhatsApp) | 6h | ⬜ Pending | 0, 1 |"
  // Match if the directory name appears anywhere in the row (e.g., "02-baileys-adapter")
  const tableByName = new RegExp(
    `^(\\|\\s*\\d+\\s*\\|\\s*[^\\|]*${escapeRegex(featureName)}[^\\|]*\\|[^\\|]*\\|\\s*)\\S[^\\|]*(\\s*\\|)`,
    "gim"
  );
  content = content.replace(tableByName, `$1${statusVisual}$2`);
  
  // --- Format 3: Markdown table format (by feature number) ---
  // Extract number from directory name: "02-baileys-adapter" → "2"
  const numMatch = featureName.match(/^(\d+)/);
  if (numMatch) {
    const featureNum = parseInt(numMatch[1]).toString(); // "3" (without leading zero, from "03-pi-sdk-bridge")
    // Match: | 2 | ... | ... | STATUS | ... |
    // Status is the 4th column (after 3 pipes following the number)
    const tableByNum = new RegExp(
      `^(\\|\\s*)${featureNum}(\\s*\\|\\s*[^\\|]*\\s*\\|\\s*[^\\|]*\\s*\\|\\s*)[^\\|]*(\\s*\\|)`,
      "gm"
    );
    content = content.replace(tableByNum, `$1${featureNum}$2${statusVisual} $3`);
  }
  
  fs.writeFileSync(roadmapPath, content);
}

// Helper to escape regex special characters in feature names
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Find Next Pending Feature ───

function findNextPendingFeatureDir(cwd: string, currentFeature: string): string | null {
  const featuresDir = path.join(cwd, ".specs", "features");
  if (!fs.existsSync(featuresDir)) return null;
  
  // Get all feature directories, sorted
  const features = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
  
  // Find current feature index
  const idx = features.indexOf(currentFeature);
  if (idx === -1) return null;
  
  // Return next feature (if any)
  if (idx + 1 < features.length) {
    const nextFeature = features[idx + 1];
    // Verify it has spec/design files (basic validation)
    const nextDir = path.join(featuresDir, nextFeature);
    if (fs.existsSync(nextDir)) {
      return nextFeature;
    }
  }
  
  return null;
}

// ─── STATE.md Reconstruction ───

function reconstructStateFromHistory(cwd: string): string {
  const entries = readAllHistory(cwd);
  if (entries.length === 0) return "No execution history.";

  const current = entries[entries.length - 1];
  const feature = current.feature;
  
  // Build pipeline progress
  const tasks = new Map<string, {
    planner?: HistoryEntry;
    researcher?: HistoryEntry;
    executor?: HistoryEntry;
    reviewer?: HistoryEntry;
  }>();
  
  for (const entry of entries) {
    if (entry.feature !== feature) continue;
    
    if (!tasks.has(entry.task)) {
      tasks.set(entry.task, {});
    }
    const task = tasks.get(entry.task)!;
    task[entry.phase] = entry;
  }
  
  // Build status lines
  const lines: string[] = [
    "## BSD Execution State",
    "",
    `Current feature: ${feature}`,
    `Current task: ${current.task} (${getTaskDescription(cwd, feature, current.task)})`,
    `Phase: ${current.phase} (attempt ${current.attempt ?? 1})`,
    "",
    "Pipeline:",
  ];
  
  // Current task pipeline
  const currentTask = tasks.get(current.task);
  if (currentTask) {
    const phases = ["planner", "researcher", "executor", "reviewer"];
    const phaseEmojis: Record<string, string> = {
      planner: "📋",
      researcher: "🔍",
      executor: "⚒️",
      reviewer: "👁️",
    };
    
    for (const phase of phases) {
      const entry = currentTask[phase as keyof typeof currentTask];
      if (entry) {
        const emoji = entry.status === "approved" || entry.status === "completed" 
          ? "✅" 
          : entry.status === "rejected" 
            ? "❌" 
            : "🔄";
        lines.push(`  ${emoji} ${phaseEmojis[phase]} ${phase}`);
      } else {
        lines.push(`  ⏳ ${phaseEmojis[phase]} ${phase}`);
      }
    }
  }
  
  // Completed tasks
  const completedTasks: string[] = [];
  for (const [taskId, task] of tasks) {
    if (task.reviewer?.status === "approved" && taskId !== current.task) {
      completedTasks.push(taskId);
    }
  }
  
  if (completedTasks.length > 0) {
    lines.push("", `Completed tasks: ${completedTasks.join(", ")}`);
  }
  
  // Failed retries
  const failedRetries = entries.filter(e => 
    e.feature === feature && e.status === "rejected" && (e.attempt ?? 1) >= 2
  ).length;
  
  if (failedRetries > 0) {
    lines.push(`Failed retries: ${failedRetries}`);
  }
  
  lines.push("", "Decisions during execution:");
  lines.push("  (none recorded)");
  lines.push("", "Blockers: None");
  
  return lines.join("\n");
}

function getTaskDescription(cwd: string, feature: string, taskId: string): string {
  try {
    const tasksPath = path.join(cwd, ".specs", "features", feature, "tasks.md");
    if (!fs.existsSync(tasksPath)) return "";
    
    const content = fs.readFileSync(tasksPath, "utf-8");
    const taskMatch = content.match(new RegExp(`## ${taskId}[:\\s](.+?)(?=\\n## |$)`, "s"));
    if (taskMatch) {
      return taskMatch[1].trim().split("\n")[0].substring(0, 50);
    }
  } catch {
    // ignore
  }
  return "";
}

// ─── Artifacts ───

function getArtifactsDir(cwd: string, feature: string, taskId: string, attempt?: number): string {
  const attemptSuffix = attempt && attempt > 1 ? `-retry-${attempt}` : "";
  return path.join(cwd, ".specs", "features", feature, "execution", `${taskId}${attemptSuffix}`);
}

function saveArtifact(
  cwd: string,
  feature: string,
  taskId: string,
  phase: "plan" | "research" | "review",
  content: string,
  attempt?: number
): string {
  const dir = getArtifactsDir(cwd, feature, taskId, attempt);
  fs.mkdirSync(dir, { recursive: true });
  
  const filePath = path.join(dir, `${phase}.md`);
  const timestamp = new Date().toISOString();
  
  const header = `---
phase: ${phase}
task: ${taskId}
feature: ${feature}
timestamp: ${timestamp}
attempt: ${attempt ?? 1}
---

`;
  
  fs.writeFileSync(filePath, header + content);
  return filePath;
}

// ─── Task Dependencies ───

interface Task {
  id: string;
  description: string;
  dependencies: string[];
}

function parseTasksWithDependencies(cwd: string, feature: string): Task[] {
  const tasksPath = path.join(cwd, ".specs", "features", feature, "tasks.md");
  if (!fs.existsSync(tasksPath)) return [];
  
  const content = fs.readFileSync(tasksPath, "utf-8");
  const tasks: Task[] = [];
  
  // Match each task section: ## T1: Description
  const taskRegex = /##\s+(T\d+)[:\s]*([^\n]*)\n([\s\S]*?)(?=\n##\s+T\d+|$)/g;
  let match;
  
  while ((match = taskRegex.exec(content)) !== null) {
    const id = match[1];
    const description = match[2].trim();
    const body = match[3];
    
    // Parse dependencies from body
    // Format: "Depends on: T1, T2" or "Depends: T1" or "After: T1"
    const depsMatch = body.match(/(?:depends on|depends|after):\s*([T\d,\s]+)/i);
    const dependencies = depsMatch 
      ? depsMatch[1].split(/,\s*/).map(d => d.trim()).filter(d => d.startsWith("T"))
      : [];
    
    tasks.push({ id, description, dependencies });
  }
  
  return tasks;
}

function topologicalSort(tasks: Task[]): Task[] {
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection
  const result: Task[] = [];
  
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  
  function visit(task: Task): void {
    if (visiting.has(task.id)) {
      throw new Error(`Circular dependency detected at task ${task.id}`);
    }
    if (visited.has(task.id)) return;
    
    visiting.add(task.id);
    
    // Visit dependencies first
    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (dep) {
        visit(dep);
      }
    }
    
    visiting.delete(task.id);
    visited.add(task.id);
    result.push(task);
  }
  
  // Visit all tasks
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task);
    }
  }
  
  return result;
}

function getTasksInOrder(cwd: string, feature: string): Task[] {
  const tasks = parseTasksWithDependencies(cwd, feature);
  if (tasks.length === 0) return [];
  
  // If no dependencies defined, return in order of T1, T2, T3...
  const hasDeps = tasks.some(t => t.dependencies.length > 0);
  if (!hasDeps) {
    return tasks.sort((a, b) => {
      const numA = parseInt(a.id.slice(1));
      const numB = parseInt(b.id.slice(1));
      return numA - numB;
    });
  }
  
  return topologicalSort(tasks);
}

// ─── Orchestrator Mode ───

function getBSDState(ctx: { sessionManager: ExtensionContext["sessionManager"] }): BSDSessionState | null {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === BSD_STATE_KEY) {
      return entry.data as BSDSessionState;
    }
  }
  return null;
}

function isBSDModeActive(ctx: { sessionManager: ExtensionContext["sessionManager"] }): boolean {
  return getBSDState(ctx)?.active ?? false;
}

function ensureBSDDir(pi: ExtensionAPI, cwd: string): void {
  const bsdDir = getBSDDir(cwd);
  if (!fs.existsSync(bsdDir)) {
    fs.mkdirSync(bsdDir, { recursive: true });
    pi.logger?.info(`Created .bsd/ directory at ${bsdDir}`);
  }
  
  const historyPath = getHistoryPath(cwd);
  if (!fs.existsSync(historyPath)) {
    // Initialize empty history file
    fs.writeFileSync(historyPath, "");
    pi.logger?.info(`Initialized history.jsonl at ${historyPath}`);
  }
}

function activateOrchestratorMode(
  pi: ExtensionAPI,
  ctx: { cwd: string; sessionManager: ExtensionContext["sessionManager"]; ui: ExtensionContext["ui"] },
  mode: "orchestrator" | "bugfix" = "orchestrator",
  featureName?: string,
  bugDescription?: string
) {
  // GUARDRAIL: Ensure .bsd/ directory and history.jsonl exist
  ensureBSDDir(pi, ctx.cwd);
  
  // Salva apenas as ferramentas atualmente ativas (não todas as registradas)
  const originalTools = pi.getActiveTools(); // string[]

  // STRICT: Only orchestrator tools visible to LLM
  // edit, write, mcp are HIDDEN (not in list)
  // bash is visible but RESTRICTED via tool_call hook
  pi.setActiveTools([
    // Core orchestration
    "read",
    "subagent",
    "bash",
    // All BSD custom tools (from BSD_TOOL_NAMES)
    ...BSD_TOOL_NAMES,
  ]);

  const state: BSDSessionState = {
    active: true,
    originalTools,
    featureName: featureName,
    mode,
    currentBugId: undefined,
    attemptCount: 0,
  };
  pi.appendEntry(BSD_STATE_KEY, state);
  pi.setSessionName(mode === "bugfix" ? "BSD: bugfix" : "BSD: orchestrator");

  // Visual indicator in TUI
  if (ctx.ui) {
    const t = ctx.ui.theme;
    if (mode === "bugfix") {
      ctx.ui.setWidget("bsd-mode-card", [
        t.fg("warning", t.bold("🔍 BSD BUGFIX MODE")),
        t.fg("dim", featureName ? `Feature: ${featureName}` : "Feature: (not specified)"),
        t.fg("dim", bugDescription ? `Bug: ${bugDescription}` : ""),
        t.fg("accent", "Delegate all implementation to subagents"),
      ]);
      ctx.ui.setStatus("bsd", t.fg("warning", "🔍 bugfix"));
      ctx.ui.notify(`🔍 BugFix pipeline activated${featureName ? ` for "${featureName}"` : ""}`, "info");
    } else {
      ctx.ui.setWidget("bsd-mode-card", [
        t.fg("warning", t.bold("🔒 BSD ORCHESTRATOR MODE")),
        t.fg("dim", "Tools: read | subagent | bsd_* | bash(read-only)"),
        t.fg("error", "BLOCKED: edit | write | mcp | bash(write)"),
        t.fg("accent", "Delegate all implementation to subagents"),
      ]);
      ctx.ui.setStatus("bsd", t.fg("warning", "🔒 orchestrator"));
      ctx.ui.notify("📂 .bsd/ initialized — history.jsonl ready for pipeline recording", "info");
    }
  }
}

function deactivateOrchestratorMode(pi: ExtensionAPI, ctx: { sessionManager: ExtensionContext["sessionManager"]; ui: ExtensionContext["ui"] }) {
  const state = getBSDState(ctx);
  if (state?.originalTools && state.originalTools.length > 0) {
    // Garantir que ferramentas BSD não vazem ao desativar o modo
    const cleanTools = filterBSDTools(state.originalTools);
    pi.setActiveTools(cleanTools);
  } else {
    // Fallback: restore default tools (excluindo BSD tools)
    pi.setActiveTools(["read", "bash", "edit", "write", "grep", "find", "ls"]);
  }
  pi.appendEntry(BSD_STATE_KEY, { active: false, originalTools: [] });
  // Don't pass undefined - use empty string to clear
  pi.setSessionName("");

  // Clear visual indicators
  if (ctx.ui) {
    ctx.ui.setWidget("bsd-mode-card", undefined);
    ctx.ui.setStatus("bsd", undefined);
  }
}

// ─── Extension ───

export default function (pi: ExtensionAPI) {
  // ─── Custom Tools ───

  pi.registerTool({
    name: "bsd_status",
    label: "BSD Status",
    description: "Show current BSD execution progress. Reads from .bsd/history.jsonl.",
    promptSnippet: "Display execution status from history",
    promptGuidelines: ["Use bsd_status to check where the pipeline is."],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const status = readBSDStatus(ctx.cwd);
      if (!status.current) {
        return {
          content: [{ type: "text", text: "No BSD execution in progress." }],
        };
      }

      const lines = [
        `Feature: ${status.current.feature}`,
        `Task: ${status.current.task}`,
        `Phase: ${status.current.phase}`,
        `Status: ${status.current.status}`,
        `Attempt: ${status.current.attempt ?? 1}`,
      ];
      if (status.completedTasks.length > 0) {
        lines.push(`Completed tasks: ${status.completedTasks.join(", ")}`);
      }
      lines.push(`Total log entries: ${status.totalEntries}`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  });

  pi.registerTool({
    name: "bsd_history",
    label: "BSD History",
    description: "Append execution entry to .bsd/history.jsonl.",
    promptSnippet: "Record pipeline execution step",
    promptGuidelines: ["Use bsd_history after each pipeline phase completes."],
    parameters: Type.Object({
      feature: Type.String(),
      task: Type.String(),
      phase: StringEnum(["planner", "researcher", "executor", "reviewer", "intake", "diagnose", "fix-plan", "fix-execute", "verify"] as const),
      status: Type.String(),
      duration: Type.Optional(Type.Number()),
      attempt: Type.Optional(Type.Number()),
      feedback: Type.Optional(Type.String()),
      files: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const historyPath = getHistoryPath(ctx.cwd);
      try {
        appendHistory(ctx.cwd, params);
        return {
          content: [{ type: "text", text: `Recorded: ${params.phase} → ${params.status} (→ ${historyPath})` }],
          details: { path: historyPath, cwd: ctx.cwd },
        };
      } catch (err) {
        pi.logger?.error(`bsd_history: Failed to write to ${historyPath}: ${err}`);
        return {
          content: [{ type: "text", text: `ERROR writing history to ${historyPath}: ${String(err)}` }],
        };
      }
    },
  });

  pi.registerTool({
    name: "bsd_state",
    label: "BSD State",
    description: "Read or update .specs/project/STATE.md.",
    promptSnippet: "Read or update project state",
    promptGuidelines: ["Use bsd_state to read/update project STATE.md."],
    parameters: Type.Object({
      action: StringEnum(["read", "update"] as const),
      section: Type.Optional(Type.String()),
      content: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (params.action === "read") {
        const state = readSTATE(ctx.cwd, params.section);
        return { content: [{ type: "text", text: state }] };
      } else {
        if (!params.section || params.content === undefined) {
          throw new Error("section and content are required for update");
        }
        const statePath = getStatePath(ctx.cwd);
        try {
          updateSTATE(ctx.cwd, params.section, params.content);
          return { content: [{ type: "text", text: `STATE.md updated (→ ${statePath})` }], details: { path: statePath, cwd: ctx.cwd } };
        } catch (err) {
          pi.logger?.error(`bsd_state: Failed to write to ${statePath}: ${err}`);
          return { content: [{ type: "text", text: `ERROR updating STATE.md at ${statePath}: ${String(err)}` }] };
        }
      }
    },
  });

  pi.registerTool({
    name: "bsd_branch_create",
    label: "BSD Branch Create",
    description: "Create a Git branch for a task (bsd/<feature>/<taskId>).",
    promptSnippet: "Create branch for task execution",
    promptGuidelines: [
      "Use bsd_branch_create at the START of each task.",
      "Each task gets its own branch: bsd/<feature>/T1, bsd/<feature>/T2, etc.",
      "Branch is created from main/master.",
    ],
    parameters: Type.Object({
      feature: Type.String({ description: "Feature name" }),
      task: Type.String({ description: "Task ID (e.g., T1)" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const branch = createTaskBranch(ctx.cwd, params.feature, params.task);
      if (ctx?.ui) {
        ctx.ui.notify(`🔀 Switched to branch: ${branch}`, "info");
      }
      return {
        content: [{ type: "text", text: `Created branch: ${branch}` }],
        details: { branch },
      };
    },
  });

  pi.registerTool({
    name: "bsd_branch_merge",
    label: "BSD Branch Merge",
    description: "Merge task branch into main after approval.",
    promptSnippet: "Merge completed task to main",
    promptGuidelines: [
      "Use bsd_branch_merge after reviewer APPROVES the task.",
      "Merges bsd/<feature>/<task> into main/master.",
      "Main always stays stable with approved tasks only.",
    ],
    parameters: Type.Object({
      feature: Type.String({ description: "Feature name" }),
      task: Type.String({ description: "Task ID (e.g., T1)" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      mergeTaskBranch(ctx.cwd, params.feature, params.task);
      deleteTaskBranch(ctx.cwd, params.feature, params.task);
      if (ctx?.ui) {
        ctx.ui.notify(`🔀 Merged bsd/${params.feature}/${params.task} → main`, "success");
      }
      return {
        content: [{ type: "text", text: `Merged bsd/${params.feature}/${params.task} to main` }],
      };
    },
  });

  pi.registerTool({
    name: "bsd_branch_checkout",
    label: "BSD Branch Checkout",
    description: "Checkout a task branch (for retry or rollback).",
    promptSnippet: "Switch to task branch",
    promptGuidelines: [
      "Use bsd_branch_checkout to go back to a previous task's branch.",
      "Useful when current task fails and you need to rollback.",
    ],
    parameters: Type.Object({
      feature: Type.String({ description: "Feature name" }),
      task: Type.String({ description: "Task ID to checkout" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      checkoutTaskBranch(ctx.cwd, params.feature, params.task);
      const current = getCurrentBranch(ctx.cwd);
      if (ctx?.ui) {
        ctx.ui.notify(`🔀 Checked out: ${current}`, "info");
      }
      return {
        content: [{ type: "text", text: `Checked out: ${current}` }],
        details: { branch: current },
      };
    },
  });

  pi.registerTool({
    name: "bsd_branch_list",
    label: "BSD Branch List",
    description: "List all BSD branches for a feature.",
    promptSnippet: "Show task branches",
    promptGuidelines: [
      "Use bsd_branch_list to see all branches for current feature.",
    ],
    parameters: Type.Object({
      feature: Type.String({ description: "Feature name" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const branches = listTaskBranches(ctx.cwd, params.feature);
      const current = getCurrentBranch(ctx.cwd);
      return {
        content: [{ 
          type: "text", 
          text: branches.length > 0 
            ? `Branches for ${params.feature}:\n${branches.map(b => `  ${b === current ? '* ' : '  '}${b}`).join("\n")}`
            : `No branches found for ${params.feature}`
        }],
        details: { branches, current },
      };
    },
  });

  pi.registerTool({
    name: "bsd_worktree",
    label: "BSD Worktree (Legacy)",
    description: "[DEPRECATED] Use bsd_branch_create instead. Kept for backward compatibility.",
    promptSnippet: "[DEPRECATED] Use branches instead",
    promptGuidelines: ["Use bsd_branch_create instead of worktrees."],
    parameters: Type.Object({
      action: StringEnum(["create", "remove", "cleanup"] as const),
      taskId: Type.Optional(Type.String()),
      attempt: Type.Optional(Type.Number()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return {
        content: [{ type: "text", text: "[DEPRECATED] Worktrees replaced by branches. Use bsd_branch_create." }],
      };
    },
  });

  pi.registerTool({
    name: "bsd_branch_status",
    label: "BSD Branch Status",
    description: "Show current git branch and BSD feature/task context.",
    promptSnippet: "Show current branch status",
    promptGuidelines: ["Use bsd_branch_status to verify which branch you're on."],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const branch = getCurrentBranch(ctx.cwd);
      const base = getBaseBranch(ctx.cwd);
      return {
        content: [{ type: "text", text: `Current branch: ${branch}\nBase branch: ${base}` }],
        details: { current: branch, base },
      };
    },
  });

  pi.registerTool({
    name: "bsd_detect_files",
    label: "BSD Detect Files",
    description: "Detect files modified by the executor (via git status or filesystem).",
    promptSnippet: "Get list of modified files after executor completes",
    promptGuidelines: [
      "Use bsd_detect_files AFTER executor completes to get the list of files that were modified.",
      "Pass the result to bsd_history as the 'files' parameter.",
    ],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const files = getModifiedFiles(ctx.cwd);
      return {
        content: [{ type: "text", text: files.length > 0 ? `Modified files:\n${files.join("\n")}` : "No modified files detected." }],
        details: { files },
      };
    },
  });

  pi.registerTool({
    name: "bsd_roadmap_update",
    label: "BSD ROADMAP Update",
    description: "Update feature status in ROADMAP.md (done, in-progress, pending).",
    promptSnippet: "Mark feature as done in ROADMAP",
    promptGuidelines: [
      "Use bsd_roadmap_update to mark feature as done after all tasks complete.",
      "Use bsd_roadmap_update status=in-progress when starting execution.",
    ],
    parameters: Type.Object({
      feature: Type.String({ description: "Feature name" }),
      status: StringEnum(["done", "in-progress", "pending"] as const),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const roadmapPath = getRoadmapPath(ctx.cwd);
      try {
        updateRoadmapFeature(ctx.cwd, params.feature, params.status);
        return {
          content: [{ type: "text", text: `ROADMAP.md updated: ${params.feature} → ${params.status} (→ ${roadmapPath})` }],
          details: { path: roadmapPath, cwd: ctx.cwd },
        };
      } catch (err) {
        pi.logger?.error(`bsd_roadmap_update: Failed to update ${roadmapPath}: ${err}`);
        return {
          content: [{ type: "text", text: `ERROR updating ROADMAP.md at ${roadmapPath}: ${String(err)}` }],
        };
      }
    },
  });

  pi.registerTool({
    name: "bsd_reconstruct_state",
    label: "BSD Reconstruct State",
    description: "Reconstruct STATE.md from history.jsonl (useful for recovery).",
    promptSnippet: "Reconstruct project state from history",
    promptGuidelines: [
      "Use bsd_reconstruct_state to rebuild STATE.md if it's missing or out of sync.",
      "Use bsd_reconstruct_state on /bsd-continue to ensure STATE is accurate.",
    ],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const state = reconstructStateFromHistory(ctx.cwd);
      updateSTATE(ctx.cwd, "BSD Execution State", state);
      return {
        content: [{ type: "text", text: "STATE.md reconstructed from history.jsonl" }],
      };
    },
  });

  pi.registerTool({
    name: "bsd_save_artifact",
    label: "BSD Save Artifact",
    description: "Save agent output to .specs/features/[name]/execution/T1/plan.md (or research.md, review.md).",
    promptSnippet: "Save subagent output as artifact",
    promptGuidelines: [
      "Use bsd_save_artifact after each subagent completes to save their output.",
      "Phase: 'plan' for planner, 'research' for researcher, 'review' for reviewer.",
      "Include the full output content from the subagent.",
    ],
    parameters: Type.Object({
      feature: Type.String({ description: "Feature name" }),
      task: Type.String({ description: "Task ID (e.g., T1)" }),
      phase: StringEnum(["plan", "research", "review"] as const),
      content: Type.String({ description: "Full output content from the agent" }),
      attempt: Type.Optional(Type.Number({ description: "Attempt number (for retries)" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const filePath = saveArtifact(ctx.cwd, params.feature, params.task, params.phase, params.content, params.attempt);
      return {
        content: [{ type: "text", text: `Artifact saved: ${filePath}` }],
        details: { path: filePath },
      };
    },
  });

  pi.registerTool({
    name: "bsd_get_tasks",
    label: "BSD Get Tasks",
    description: "Get tasks in dependency order from tasks.md (with topological sort).",
    promptSnippet: "Get ordered list of tasks",
    promptGuidelines: [
      "Use bsd_get_tasks to get tasks in correct execution order (respects dependencies).",
      "Tasks are returned sorted by dependencies (T1 before T2 if T2 depends on T1).",
    ],
    parameters: Type.Object({
      feature: Type.String({ description: "Feature name" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const tasks = getTasksInOrder(ctx.cwd, params.feature);
      if (tasks.length === 0) {
        return {
          content: [{ type: "text", text: "No tasks found for feature." }],
          details: { tasks: [] },
        };
      }
      
      const lines = tasks.map(t => {
        const deps = t.dependencies.length > 0 ? ` (depends on: ${t.dependencies.join(", ")})` : "";
        return `- ${t.id}: ${t.description}${deps}`;
      });
      
      return {
        content: [{ type: "text", text: `Tasks in execution order:\n${lines.join("\n")}` }],
        details: { tasks },
      };
    },
  });

  // ─── Commands ───

  pi.registerCommand("bsd-execute", {
    description: "Execute a feature from ROADMAP.md",
    handler: async (args, ctx) => {
      // Defensive: ensure args is a string
      const argsStr = typeof args === "string" ? args : "";
      if (!argsStr.trim()) {
        if (ctx?.hasUI) {
          ctx.ui.notify("Usage: /bsd-execute <feature-name>", "warning");
        }
        return;
      }

      const featureName = argsStr.trim();
      
      // Check for git repository (try multiple methods)
      const hasGit = fs.existsSync(path.join(ctx.cwd, ".git")) || 
                     (() => {
                       try {
                         execSync("git rev-parse --git-dir", { cwd: ctx.cwd, stdio: "ignore" });
                         return true;
                       } catch {
                         return false;
                       }
                     })();
      
      if (!hasGit) {
        ctx.ui.notify(`Git repository required.\nCWD: ${ctx.cwd}\nRun 'git init' in project directory.`, "error");
        return;
      }
      
      // Check git has commits
      try {
        execSync("git rev-parse HEAD", { cwd: ctx.cwd, stdio: "ignore" });
      } catch {
        ctx.ui.notify("Git repository has no commits. Run 'git add . && git commit -m \"Initial\"' first.", "error");
        return;
      }
      
      const specsPath = path.join(ctx.cwd, ".specs");
      if (!fs.existsSync(specsPath)) {
        ctx.ui.notify("No .specs/ directory found. Run spec-driven first.", "error");
        return;
      }

      const featurePath = path.join(specsPath, "features", featureName);
      if (!fs.existsSync(featurePath)) {
        ctx.ui.notify(`Feature "${featureName}" not found in .specs/features/`, "error");
        return;
      }

      activateOrchestratorMode(pi, ctx);
      
      // Auto-update ROADMAP to in-progress at start
      try {
        updateRoadmapFeature(ctx.cwd, featureName, "in-progress");
      } catch (err) {
        pi.logger?.error(`Failed to update ROADMAP: ${err}`);
      }

      pi.sendUserMessage(
        `Execute feature "${featureName}" using BSD pipeline. ` +
          `Read .specs/project/ROADMAP.md, find the feature, ` +
          `then execute each task in .specs/features/${featureName}/tasks.md ` +
          `using the pipeline: planner → researcher → executor → reviewer.`,
        { deliverAs: "steer" }
      );
    },
  });

  pi.registerCommand("bsd-continue", {
    description: "Resume interrupted BSD execution",
    handler: async (_args, ctx) => {
      if (!ctx?.cwd) {
        pi.logger?.error("bsd-continue: context or cwd is undefined");
        return;
      }
      const history = readLastHistoryEntry(ctx.cwd);
      if (!history) {
        if (ctx.hasUI) {
          ctx.ui.notify("No execution history found.", "warning");
        }
        return;
      }

      // Reconstruct STATE.md from history before continuing
      const state = reconstructStateFromHistory(ctx.cwd);
      updateSTATE(ctx.cwd, "BSD Execution State", state);

      // Checkout the correct task branch
      checkoutTaskBranch(ctx.cwd, history.feature, history.task);

      activateOrchestratorMode(pi, ctx);

      pi.sendUserMessage(
        `Resume BSD execution. Reconstructed state from history:\n${state}\n\n` +
          `Checked out branch: bsd/${history.feature}/${history.task}\n\n` +
          `Continue from where you left off.`,
        { deliverAs: "steer" }
      );
    },
  });

  pi.registerCommand("bsd-status", {
    description: "Show BSD execution status",
    handler: async (_args, ctx) => {
      if (!ctx?.cwd) {
        pi.logger?.error("bsd-status: context or cwd is undefined");
        return;
      }
      // Diagnostic info
      const hasGitDir = fs.existsSync(path.join(ctx.cwd, ".git"));
      const hasSpecs = fs.existsSync(path.join(ctx.cwd, ".specs"));
      
      const status = readBSDStatus(ctx.cwd);
      
      let msg = `CWD: ${ctx.cwd}\n`;
      msg += `Git: ${hasGitDir ? "✅" : "❌"} | Specs: ${hasSpecs ? "✅" : "❌"}\n`;
      
      if (!status.current) {
        msg += "\nNo BSD execution in progress.";
        ctx.ui.notify(msg, "info");
        return;
      }

      msg += `\nFeature: ${status.current.feature}\n`;
      msg += `Task: ${status.current.task}\n`;
      msg += `Phase: ${status.current.phase}\n`;
      msg += `Status: ${status.current.status}\n`;
      msg += `Attempt: ${status.current.attempt ?? 1}`;
      
      if (status.completedTasks.length > 0) {
        msg += `\nCompleted: ${status.completedTasks.join(", ")}`;
      }
      ctx.ui.notify(msg, "info");
    },
  });

  pi.registerCommand("bsd-on", {
    description: "Activate BSD orchestrator mode (restrict tools, enable pipeline)",
    handler: async (_args, ctx) => {
      try {
        if (!ctx?.cwd) {
          pi.logger?.error("bsd-on: context or cwd is undefined");
          return;
        }
        
        // Check if already active
        if (isBSDModeActive(ctx)) {
          if (ctx?.ui) {
            ctx.ui.notify("🔒 BSD mode already active.", "warning");
          }
          return;
        }
        
        activateOrchestratorMode(pi, ctx);
        
        if (ctx?.ui) {
          ctx.ui.notify("🔒 BSD mode ACTIVATED. Tools restricted to orchestrator mode.", "success");
        }
        
        pi.logger?.info("bsd-on: Mode activated successfully");
      } catch (err) {
        pi.logger?.error(`bsd-on error: ${err}`);
        if (ctx?.ui) {
          ctx.ui.notify(`Error: ${String(err)}`, "error");
        }
      }
    },
  });

  pi.registerCommand("bsd-off", {
    description: "Deactivate any active BSD mode (orchestrator or bugfix) and restore normal tools",
    handler: async (_args, ctx) => {
      try {
        // Check if any BSD mode is active
        if (!isBSDModeActive(ctx)) {
          if (ctx?.ui) {
            ctx.ui.notify("No active BSD mode to deactivate.", "info");
          }
          return;
        }
        
        // Use the shared deactivation function
        deactivateOrchestratorMode(pi, ctx);
        
        pi.logger?.info("bsd-off: Mode deactivated successfully");
      } catch (err) {
        pi.logger?.error(`bsd-off error: ${err}`);
        if (ctx?.ui) {
          ctx.ui.notify(`Error: ${String(err)}`, "error");
        }
      }
    },
  });

  pi.registerCommand("bsd-reset", {
    description: "Reset BSD execution state and deactivate mode",
    handler: async (_args, ctx) => {
      if (!ctx?.cwd) {
        pi.logger?.error("bsd-reset: context or cwd is undefined");
        return;
      }
      if (ctx.hasUI) {
        const ok = await ctx.ui.confirm("Reset BSD?", "Clear history, branches, and deactivate mode?");
        if (!ok) return;
      }

      resetBSD(ctx.cwd);
      deactivateOrchestratorMode(pi, ctx);
      ctx.ui.notify("BSD state reset and mode deactivated.", "info");
    },
  });

  pi.registerCommand("bsd-bug", {
    description: "Report a bug and start BugFix pipeline. Usage: /bsd-bug [<feature>: <description>]",
    handler: async (args, ctx) => {
      const argsStr = typeof args === "string" ? args : "";
      
      // ── WITHOUT ARGS: activate BSD BugFix mode (like /bsd-on) ──
      if (!argsStr.trim()) {
        // Check no conflicting mode active
        if (isBSDModeActive(ctx)) {
          ctx.ui.notify("Cannot start BugFix while Orchestrator mode is active. Use /bsd-off first.", "error");
          return;
        }

        // Activate BSD mode as bugfix (no specific feature yet)
        activateOrchestratorMode(pi, ctx, "bugfix");
        return;
      }
      
      // ── WITH ARGS: Parse "<feature>: <description>" ──
      const match = argsStr.match(/^(\S+?)\s*:\s*(.+)$/);
      if (!match) {
        if (ctx?.hasUI) {
          ctx.ui.notify("Usage: /bsd-bug <feature>: <bug description>\nExample: /bsd-bug comment-system: comment not showing after submit", "warning");
        }
        return;
      }

      const [, feature, description] = match;
      const trimmedFeature = feature.trim();
      const trimmedDescription = description.trim();

      // Check for git repository
      const hasGit = fs.existsSync(path.join(ctx.cwd, ".git")) || 
                     (() => {
                       try {
                         execSync("git rev-parse --git-dir", { cwd: ctx.cwd, stdio: "ignore" });
                         return true;
                       } catch {
                         return false;
                       }
                     })();
      
      if (!hasGit) {
        ctx.ui.notify(`Git repository required.\nCWD: ${ctx.cwd}\nRun 'git init' in project directory.`, "error");
        return;
      }
      
      // Check git has commits
      try {
        execSync("git rev-parse HEAD", { cwd: ctx.cwd, stdio: "ignore" });
      } catch {
        ctx.ui.notify("Git repository has no commits. Run 'git add . && git commit -m \"Initial\"' first.", "error");
        return;
      }
      
      // Check .specs exists
      const specsPath = path.join(ctx.cwd, ".specs");
      if (!fs.existsSync(specsPath)) {
        ctx.ui.notify("No .specs/ directory found. Run spec-driven first.", "error");
        return;
      }

      // Check feature exists
      const featurePath = path.join(specsPath, "features", trimmedFeature);
      if (!fs.existsSync(featurePath)) {
        ctx.ui.notify(`Feature "${trimmedFeature}" not found in .specs/features/`, "error");
        return;
      }

      // Check no conflicting mode active
      if (isBSDModeActive(ctx)) {
        ctx.ui.notify("Cannot start BugFix while Orchestrator mode is active. Use /bsd-off first.", "error");
        return;
      }

      // Create bug report
      const { bugId, filePath } = createBugReport(ctx.cwd, trimmedFeature, trimmedDescription);
      
      // Activate BSD BugFix mode
      activateOrchestratorMode(pi, ctx, "bugfix", trimmedFeature, `${bugId}: ${trimmedDescription}`);
      
      // Auto-update ROADMAP
      try {
        updateRoadmapFeature(ctx.cwd, trimmedFeature, "in-progress");
      } catch (err) {
        pi.logger?.error(`Failed to update ROADMAP: ${err}`);
      }

      pi.sendUserMessage(
        `BugFix pipeline started for feature "${trimmedFeature}".\n\n` +
        `Bug: ${bugId} — ${trimmedDescription}\n` +
        `Bug report: ${filePath}\n\n` +
        `Follow the BugFix pipeline:\n` +
        `1. **INTAKE** — Understand the bug via natural conversation (no ask_user)\n` +
        `   Ask clarifying questions until you have enough context\n\n` +
        `2. **DIAGNOSE** — Spawn bsd-bug-inspector agent\n` +
        `   Returns: root_cause, files_affected, fix_direction\n\n` +
        `3. **FIX PLAN** — Present diagnosis to user, ask for approval\n\n` +
        `4. **FIX & TEST** — Spawn bsd-fix-executor agent\n` +
        `   Creates branch: bsd/${trimmedFeature}/${bugId}\n` +
        `   Atomic fix, tests, commit: "fix(${trimmedFeature}): resolve ${bugId}"\n\n` +
        `5. **VERIFY** — Ask user to test and confirm\n\n` +
        `6. **REVISION LOOP** — Max 3 attempts, escalate on failure`,
        { deliverAs: "steer" }
      );
    },
  });

  pi.registerCommand("bsd-bug-abort", {
    description: "Cancel active BugFix session",
    handler: async (_args, ctx) => {
      const state = getBSDState(ctx);
      if (!state?.active || state.mode !== "bugfix") {
        if (ctx?.hasUI) {
          ctx.ui.notify("No active BugFix session to abort.", "warning");
        }
        return;
      }

      if (ctx?.hasUI) {
        const ok = await ctx.ui.confirm("Abort BugFix?", "Cancel active BugFix pipeline and restore tools?");
        if (!ok) return;
      }

      const feature = state.featureName || "unknown";
      
      deactivateOrchestratorMode(pi, ctx);
      
      if (ctx?.hasUI) {
        ctx.ui.notify(`🔓 BugFix session aborted for "${feature}". All tools restored.`, "info");
      }
    },
  });

  pi.registerCommand("bsd-bug-status", {
    description: "Show BugFix session status",
    handler: async (_args, ctx) => {
      if (!ctx?.cwd) return;

      const state = getBSDState(ctx);
      if (!state?.active || state.mode !== "bugfix") {
        if (ctx?.hasUI) {
          ctx.ui.notify("No active BugFix session.", "info");
        }
        return;
      }

      let msg = `Feature: ${state.featureName || "unknown"}\n`;
      if (state.currentBugId) msg += `Current Bug: ${state.currentBugId}\n`;
      msg += `Attempts: ${state.attemptCount}/3\n\n`;

      // List bugs
      if (state.featureName) {
        const bugs = listBugs(ctx.cwd, state.featureName);
        if (bugs.length > 0) {
          msg += "Bugs:\n";
          for (const bug of bugs) {
            const statusIcon = bug.status === "closed" ? "✅" : bug.status === "open" ? "🆕" : "🔄";
            msg += `  ${statusIcon} ${bug.id} (${bug.severity}) — ${bug.status}\n`;
          }
        }
      }

      ctx.ui.notify(msg, "info");
    },
  });

  // ─── Hooks ───

  // Enforce orchestrator restrictions
  // Bloqueia ferramentas BSD fora do modo orchestrator
  pi.on("tool_call", async (event, ctx) => {
    // STRICT: Ferramentas BSD SÓ funcionam em modo BSD ativo (orchestrator ou bugfix)
    const isModeActive = isBSDModeActive(ctx);
    if (BSD_TOOL_NAMES.includes(event.toolName) && !isModeActive) {
      return {
        block: true,
        reason: `Ferramenta "${event.toolName}" está disponível apenas no modo BSD (orchestrator ou bugfix). Ative com /bsd-on, /bsd-execute, ou /bsd-bug.`,
      };
    }

    if (!isModeActive) return undefined;

    // STRICT: Block all implementation tools
    const BLOCKED_TOOLS = ["edit", "write", "mcp"];
    if (BLOCKED_TOOLS.includes(event.toolName)) {
      return {
        block: true,
        reason: `Tool "${event.toolName}" is blocked in BSD orchestrator mode. Use subagent instead.`,
      };
    }

    // STRICT: Restrict bash to read-only commands
    if (event.toolName === "bash") {
      const command = (event.input as { command?: string }).command ?? "";
      
      // Allow only safe read-only patterns
      const SAFE_PATTERNS = [
        /^\s*git\s+(status|log|diff|show|branch|rev-parse|ls-files)/i,
        /^\s*ls\b/i,
        /^\s*cat\b/i,
        /^\s*echo\b/i,
        /^\s*pwd\b/i,
        /^\s*find\b/i,
        /^\s*grep\b/i,
      ];
      
      const isSafe = SAFE_PATTERNS.some(p => p.test(command));
      
      // Block destructive patterns
      const DESTRUCTIVE = [
        /\brm\b/i, /\bmv\b/i, /\bcp\b/i, /\btouch\b/i,
        /\bmkdir\b/i, /\brmdir\b/i, />[>]/, /\|.*\brm\b/,
        /\bnpm\s+(install|i)\b/i, /\byarn\s+(add|install)\b/i,
        /\bgit\s+(add|commit|push|pull|merge|checkout\s+-b)/i,
      ];
      
      const isDestructive = DESTRUCTIVE.some(p => p.test(command));
      
      if (!isSafe || isDestructive) {
        return {
          block: true,
          reason: `Bash restricted in orchestrator mode. Use subagent for implementation.`,
        };
      }
    }

    return undefined;
  });

  // Inject correct prompt based on active BSD mode
  pi.on("before_agent_start", async (event, ctx) => {
    const state = getBSDState(ctx);
    if (!state?.active) return;
    
    if (state.mode === "bugfix") {
      return {
        systemPrompt: event.systemPrompt + "\n\n" + BUGFIX_ORCHESTRATOR_PROMPT,
      };
    }
    return {
      systemPrompt: event.systemPrompt + "\n\n" + ORCHESTRATOR_PROMPT,
    };
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async (_event, ctx) => {
    if (isBSDModeActive(ctx)) {
      deactivateOrchestratorMode(pi, ctx);
    }
  });

  // Restore state on session start
  pi.on("session_start", async (_event, ctx) => {
    if (!isBSDModeActive(ctx)) {
      // BSD mode OFF: garantir que BSD tools fiquem invisíveis
      const currentNames = pi.getActiveTools(); // string[] — NÃO .map()
      const cleanNames = filterBSDTools(currentNames);
      if (cleanNames.length !== currentNames.length) {
        pi.setActiveTools(cleanNames);
      }
      return;
    }
    
    // BSD mode ON: reaplicar tools do modo ativo
    const state = getBSDState(ctx);
    if (!state) return;
    
    // Reaplicar o conjunto de tools correto para este modo
    // Orquestrador: só read, subagent, bash + BSD tools
    // Bugfix: mesma coisa
    const modeTools = [
      "read",
      "subagent",
      "bash",
      ...BSD_TOOL_NAMES,
    ];
    
    // Fundir com tools que o usuário já tinha ativas (exceto as bloqueadas)
    const originalTools = state.originalTools || [];
    const mergedTools = Array.from(new Set([
      ...modeTools,
      ...originalTools.filter(t => !BSD_TOOL_NAMES.includes(t)),
    ]));
    pi.setActiveTools(mergedTools);
    
    if (state.mode === "bugfix") {
      // Restore BugFix mode state
      if (ctx.ui) {
        ctx.ui.setWidget("bsd-mode-card", [
          "🔍 BSD BUGFIX MODE",
          `Feature: ${state.featureName || "unknown"}`,
          state.currentBugId ? `Bug: ${state.currentBugId}` : "",
        ]);
        ctx.ui.setStatus("bsd", "🔍 bugfix");
      }
    } else {
      // Restore Orchestrator mode state
      const history = readLastHistoryEntry(ctx.cwd);
      if (history) {
        const status = readBSDStatus(ctx.cwd);
        if (status.current && status.current.status !== "approved") {
          ctx.ui.setStatus("bsd", `BSD: ${status.current.feature} — ${status.current.task} (${status.current.phase})`);
        }
      } else {
        deactivateOrchestratorMode(pi, ctx);
      }
    }
  });

  // Update status after each tool execution when BSD is active
  pi.on("tool_execution_end", async (event, ctx) => {
    const state = getBSDState(ctx);
    if (!state?.active) return;
    
    const mode = state.mode;
    
    // BugFix mode: update TUI status after bsd_history calls
    if (mode === "bugfix" && event.toolName === "bsd_history") {
      try {
        if (ctx.ui) {
          const bugs = state.featureName ? listBugs(ctx.cwd, state.featureName) : [];
          const openBugs = bugs.filter(b => b.status !== "closed").length;
          ctx.ui.setStatus("bsd", `🔍 bugfix: ${state.featureName || "unknown"} (${openBugs} open)`);
        }
      } catch (err) {
        pi.logger?.error(`BugFix status update failed: ${err}`);
      }
      return;
    }
    
    // Orchestrator mode: update TUI status, STATE.md, ROADMAP, auto-continue
    if (mode !== "orchestrator") return;
    
    // Update TUI status
    if (event.toolName === "bsd_history") {
      const status = readBSDStatus(ctx.cwd);
      if (status.current) {
        ctx.ui.setStatus("bsd", `BSD: ${status.current.feature} — ${status.current.task} (${status.current.phase})`);
        
        // AUTO-UPDATE STATE.md after every history entry
        try {
          const state = reconstructStateFromHistory(ctx.cwd);
          updateSTATE(ctx.cwd, "BSD Execution State", state);
        } catch (err) {
          pi.logger?.error(`Auto-update STATE.md failed: ${err}`);
        }
        
        // AUTO-UPDATE ROADMAP.md when reviewer approves last task
        if (status.current.phase === "reviewer" && status.current.status === "approved") {
          // Check if all tasks are complete by reading tasks.md
          try {
            const tasksPath = path.join(ctx.cwd, ".specs", "features", status.current.feature, "tasks.md");
            if (fs.existsSync(tasksPath)) {
              const tasksContent = fs.readFileSync(tasksPath, "utf-8");
              const allTasks = parseTasksWithDependencies(ctx.cwd, status.current.feature);
              const allTaskIds = allTasks.map(t => t.id);
              const allApproved = allTaskIds.every(id => status.completedTasks.includes(id));
              
              if (allApproved) {
                updateRoadmapFeature(ctx.cwd, status.current.feature, "done");
                ctx.ui.notify(`✅ Feature "${status.current.feature}" complete! ROADMAP updated.`, "success");
                
                // AUTO-CONTINUE: Find next pending feature and send steer message
                try {
                  const nextFeature = findNextPendingFeatureDir(ctx.cwd, status.current.feature);
                  if (nextFeature) {
                    ctx.ui.notify(`⏩ Auto-continuing to next feature: "${nextFeature}"`, "info");
                    pi.sendUserMessage(
                      `Feature "${status.current.feature}" is fully complete and marked done in ROADMAP. ` +
                      `The next pending feature is "${nextFeature}". ` +
                      `Read .specs/features/${nextFeature}/tasks.md, ` +
                      `check .specs/project/ROADMAP.md, and immediately start the pipeline ` +
                      `(planner → researcher → executor → reviewer) for this feature. ` +
                      `Do NOT wait for user confirmation — continue automatically.`,
                      { deliverAs: "steer" }
                    );
                    pi.logger?.info(`Auto-continue: next feature is "${nextFeature}"`);
                  } else {
                    ctx.ui.notify(`🎉 All features complete! BSD pipeline finished.`, "success");
                    pi.logger?.info("Auto-continue: no more features to process");
                  }
                } catch (err) {
                  pi.logger?.error(`Auto-continue failed: ${err}`);
                }
              }
            }
          } catch (err) {
            pi.logger?.error(`Auto-update ROADMAP.md failed: ${err}`);
          }
        }
      }
    }
    
    // Auto-save artifacts for BSD subagents
    if (event.toolName === "subagent") {
      const result = event.result;
      if (result && result.details && result.details.results) {
        const subagentResult = result.details.results[0];
        if (subagentResult && subagentResult.agent?.startsWith("bsd-")) {
          const agentName = subagentResult.agent; // bsd-planner, bsd-researcher, bsd-reviewer
          const phase = agentName.replace("bsd-", "") as "plan" | "research" | "review";
          
          // Get current status from history
          const status = readBSDStatus(ctx.cwd);
          if (status.current) {
            const output = getFinalOutput(subagentResult.messages);
            if (output) {
              try {
                saveArtifact(
                  ctx.cwd,
                  status.current.feature,
                  status.current.task,
                  phase,
                  output,
                  status.current.attempt
                );
              } catch (err) {
                console.error("Failed to auto-save artifact:", err);
              }
            }
          }
        }
      }
    }
  });
}

// Helper to extract final output from subagent messages
function getFinalOutput(messages: any[]): string {
  if (!messages || !Array.isArray(messages)) return "";
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && msg.content) {
      for (const part of msg.content) {
        if (part.type === "text" && part.text) {
          return part.text;
        }
      }
    }
  }
  return "";
}
