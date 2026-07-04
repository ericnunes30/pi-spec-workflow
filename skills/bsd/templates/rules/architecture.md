# Architecture

## Principles (in order of priority)
1. **Correctness over cleverness** — explicit > implicit
2. **Boring technology** — choose proven, well-known solutions
3. **Reversible decisions** — favor patterns that are easy to change
4. **Local reasoning** — a module should be understandable without loading the whole codebase
5. **Optimize for deletion** — code that's easy to delete is easy to evolve

## Layers
```
┌────────────────────────────┐
│  HTTP / RPC / UI           │  ← entrypoints
├────────────────────────────┤
│  Application services      │  ← use cases, orchestration
├────────────────────────────┤
│  Domain logic (pure)       │  ← business rules
├────────────────────────────┤
│  Infrastructure            │  ← DB, queue, cache, 3rd-party APIs
└────────────────────────────┘
```

- Dependencies point **inward** (Infrastructure → Application → Domain)
- Domain layer has zero I/O and zero external dependencies
- UI never talks directly to Infrastructure — always through Application services

## Data flow
- Commands (writes) go through Application services
- Queries (reads) can bypass Application for read models (CQRS-lite)
- Use transactions for any write that touches >1 aggregate

## State management
- Source of truth: DB
- Cache: read-through with explicit invalidation
- Avoid client-side state mirroring server state — fetch directly

## API design
- REST for CRUD, RPC for actions, GraphQL only when shapes vary widely
- Version from day 1 (`/v1/`)
- Idempotency keys for non-GET endpoints
- Pagination: cursor-based for lists > 100 items

## Observability (mandatory)
- Structured logs (JSON) with `trace_id`, `user_id`, `request_id`
- Metrics: request rate, error rate, p50/p95/p99 latency
- Tracing: OpenTelemetry across all boundaries
- Health endpoint: `/healthz` (liveness), `/readyz` (readiness)

## Security
- Input validation at the boundary (zod / valibot schemas)
- Output encoding (never trust user input in HTML/SQL/Shell)
- Secrets in env vars or secret manager, never in code
- Principle of least privilege for DB roles and API tokens
