# Conventions

## Code style
- 2-space indent, no tabs
- Max line length: 100 chars
- Trailing commas: always (multi-line)
- Semicolons: never (TS) / required (Go, Rust)
- Quote style: double quotes (JS/TS)

## Type safety
- TypeScript: `strict: true`, `noUncheckedIndexedAccess: true`
- No `any` — use `unknown` + narrowing, or define a proper type
- Prefer `type` over `interface` for object shapes (except for extensibility)
- Use `Result<T, E>` for fallible operations; reserve throw for truly exceptional cases

## Functions
- Pure functions preferred; isolate side effects at the edges
- Max ~50 lines per function; extract helpers otherwise
- Max 3 parameters — use an options object for more

## Errors
- Never swallow errors silently
- Always log with structured context (request id, user id, etc.)
- Custom error classes for domain errors (`class UserNotFoundError extends Error`)

## Comments
- JSDoc on every exported function
- Inline comments only for non-obvious "why", never "what"
- Keep comments in sync with code — stale comments are worse than none

## Commits
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`)
- Body explains motivation, not implementation
- Footer: `Refs: <spec-id>` for any change tied to a .specs/ feature
