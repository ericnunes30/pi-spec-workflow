# BSD Pipeline Templates

## Planner Output Template

```json
{
  "needsResearch": true,
  "plan": "Brief explanation of what needs research and why"
}
```

## Researcher Output Template

Return structured text:

```markdown
## Context for [task name]

### Relevant Files
- `path/to/file.ts` — purpose and relation to task

### Code Patterns
- Pattern description with example

### API Documentation
- Relevant API details

### Integration Points
- Where this task connects to existing code

### Potential Pitfalls
- Edge cases or gotchas
```

## Executor Output Template

```json
{
  "implemented": true,
  "files": ["file1.ts", "file2.ts"],
  "notes": "Any observations or deviations from spec"
}
```

## Reviewer Output Template

```json
{
  "approved": true,
  "feedback": "Detailed feedback",
  "findings": [
    {"severity": "BLOCKER|WARNING", "description": "...", "file": "...", "line": "..."}
  ]
}
```

If ANY BLOCKER exists → approved must be false.
