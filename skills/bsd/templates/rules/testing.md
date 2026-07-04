# Testing

## Philosophy
- Test behavior, not implementation
- Each test should fail for exactly one reason
- One assertion per test (loosely — multi-assert is fine if checking one behavior)

## Coverage targets
- Lines: 80% (gate: fail CI if below)
- Branches: 75%
- Critical paths (auth, billing, data integrity): 100%

## Test pyramid
- Unit tests: 70% — fast, isolated, no I/O
- Integration tests: 20% — DB, API contracts
- E2E tests: 10% — full user flows, slow

## Patterns
- Arrange → Act → Assert (with blank line between)
- Descriptive test names: `it("returns 404 when user is not found", ...)`
- No `it.only` or `describe.skip` in committed code
- Use factories/fixtures, never hardcoded data in tests

## Mocking
- Mock at the boundary (HTTP, DB, FS), not internal modules
- Prefer `nock`/`msw` over stubbing fetch directly
- Never mock what you own unless you must
- Real-clock tests use `vitest.useFakeTimers` with explicit time

## What to test (priority)
1. Domain logic (pricing, validation, state machines)
2. Authorization checks
3. External API contracts
4. Edge cases (empty, null, boundary values)
5. Error paths

## What NOT to test
- Trivial getters/setters
- Third-party library internals
- Generated code
- One-line wrappers around stdlib
