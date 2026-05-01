# BSD Research Strategy

## When to Research

Research is needed when:
- Task references external libraries (need API docs)
- Task depends on existing code patterns (need to find them)
- Task involves integration points (need to understand interfaces)
- Task has complex acceptance criteria (need to verify approach)

Research is NOT needed when:
- Task is straightforward CRUD
- Task only uses patterns already documented in design.md
- Task is isolated (no dependencies on existing code)

## Research Commands

```bash
# Find files by pattern
find . -name "*.ts" -not -path "*/node_modules/*"

# Search for code patterns
grep -r "pattern" --include="*.ts" .

# Search in specific directories
grep -r "class Auth" src/

# List project structure
ls -la src/
```

## Research Output

Consolidate findings into:
1. Relevant files and purposes
2. Code patterns to follow
3. API docs if applicable
4. Integration points
5. Potential pitfalls

Keep it concise — the executor needs actionable context, not essays.
