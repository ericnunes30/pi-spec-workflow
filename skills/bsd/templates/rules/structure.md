# Project Structure

## Top-level layout
```
/
├── .bsd/                    # BSD pipeline state (rules, history, STATE.md, ROADMAP)
├── .specs/                  # Feature specs and snapshots
│   ├── features/<NN-name>/  # Per-feature directory
│   │   ├── history/         # Snapshot history (NN-name.md)
│   │   ├── tasks.md         # Current task list
│   │   └── artifacts/       # Plan, research, review outputs
│   └── project/             # Project-level artifacts (ROADMAP, etc.)
├── src/                     # Application source
├── tests/                   # Test files
├── public/                  # Static assets
└── <config files>
```

## Module boundaries
- `src/<domain>/` — one directory per bounded context (e.g. `auth/`, `billing/`)
- `src/lib/` — pure utilities, no I/O
- `src/server/` — server-only code (no client imports allowed)
- `src/client/` — client-only code (no Node imports)

## Naming conventions
- Files: `kebab-case.ts` (e.g. `user-service.ts`)
- Classes/types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- DB tables: `snake_case` (plural)
- API routes: `kebab-case`

## Import rules
- Always use the package alias, never relative imports above `./`:
  - ❌ `import { foo } from "../../../lib/foo"`
  - ✅ `import { foo } from "@/lib/foo"`
- Group imports: external → internal (`@/`) → relative (`./`)
