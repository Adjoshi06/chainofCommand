# chainofCommand — Agent Guidance

Local-first, cryptographically accountable traces for multi-agent workflows. The system records
signed protocol events in an append-only ledger, stores content-addressed (sha256) artifacts, and
produces verification reports that detect tampering (chain breaks, invalid signatures, missing
artifacts, role-policy violations). Architecture specs live in `docs/` (source of truth).

## Stack

- Node.js `^18 || ^20 || >=22` (verified on v20.20.2)
- pnpm@10.2.0 — pinned via `packageManager`; run through corepack (`corepack pnpm ...`)
- TypeScript 5.7, strict mode; sources run via `tsx` — no build step needed for dev
- Fastify 5 (API) · Commander 12 + pino (CLI) · React 18 + Vite 6 (viewer) · Vitest 2 (tests)
- No external services. Storage is filesystem-based under `COC_HOME`
  (default `./.coc` relative to cwd; `.coc` is gitignored)

## Commands

```bash
corepack pnpm install --frozen-lockfile          # install
corepack pnpm test                               # vitest run (all suites)
corepack pnpm -r --filter './packages/*' run build   # per-package tsc typecheck/build

# CLI (from apps/cli — the wrapper scripts `pnpm protocol:run` are broken under pnpm 10, see Gotchas)
cd apps/cli && COC_HOME=/abs/path/.coc corepack pnpm exec tsx src/index.ts protocol run --task /abs/task.json
cd apps/cli && COC_HOME=/abs/path/.coc corepack pnpm exec tsx src/index.ts audit verify --trace <trace_id>

# API (list traces/events/artifacts/reports + POST verify) — port logged at startup
COC_HOME=/abs/path/.coc corepack pnpm --filter @coc/api run start

# Viewer (React trace viewer)
corepack pnpm --filter @coc/viewer run dev        # dev server
corepack pnpm --filter @coc/viewer run build      # production build
```

A demo task file matching the docs quickstart exists at `task.json` (untracked; recreate from
`docs/README.md` if missing).

## Environment variables

All optional with working defaults. No secrets are required for local dev.

| Variable | Default | Purpose |
|---|---|---|
| `COC_HOME` | `./.coc` (cwd-relative) | Data dir: keys/, artifacts/sha256/, traces/. Set an **absolute** path when CLI and API must share state (pnpm --filter runs each app in its own dir) |
| `COC_API_HOST` | `127.0.0.1` | API bind host |
| `COC_API_PORT` | `4310` | API port (parse the startup log, don't assume) |
| `COC_LOG_LEVEL` | `info` | CLI pino log level |
| `COC_POLICY_PROFILE` | `default` | Verifier policy profile (`default` \| `strict`) |

## Codebase map

See [codebase-map.md](./codebase-map.md). `docs/README.md` has the full quickstart and data layout.

## Local Verification Summary (onboarding run, 2026-09-24)

- `pnpm install --frozen-lockfile`: OK (164 packages)
- Primary flow: `protocol run` → trace `01M3AE18J227F7SY3DFKPNJ60V`, verification `pass`, 12 events;
  `audit verify` on that trace → `pass`, 0 failures, 0 warnings
- API on port 4310 (from its own log): GET traces/detail/events (cursor pagination) = 200;
  POST verify = 200 (`pass`); reports/latest = 200; unknown trace = 404
- Viewer: vite dev served HTTP 200 on 5173; `vite build` succeeded (148.49 kB JS)
- Tests: vitest 13/14 pass — 1 pre-existing failure (see Gotchas)
- Typecheck: `tsc --noEmit` clean only for `@coc/contracts`; other packages have pre-existing
  strict-mode errors (see Gotchas)
- Sandbox snapshot: `wiet7ld8mgoynogidfz2:default` at 2026-09-24T19:30:45.500Z

## Gotchas (verified during onboarding)

1. **`pnpm protocol:run -- --task x` is broken under pnpm 10.** The root script chains
   `pnpm --filter @coc/cli run start -- protocol run`; pnpm forwards the literal `--` and commander
   treats everything after it as positional → "required option '--task' not specified". Use the
   direct `tsx` invocation shown under Commands.
2. **Root tests need workspace deps declared at root.** `tests/` imports `@coc/*`, which only
   resolves under pnpm if the root package.json declares them. This was fixed in this onboarding PR
   (`pnpm add -Dw @coc/contracts@workspace:* ...`); keep them declared if you add root-level tests.
3. **Pre-existing test failure on master:** `verifier tamper scenarios > detects signature invalid
   after payload mutation` expects `SIG_INVALID`, but the hash-integrity check fires first
   (`HASH_MISMATCH`). Verifier/test expectation mismatch — not an environment issue.
4. **No typecheck gate.** Nothing runs `tsc` (runtime is `tsx`, viewer builds via esbuild), so
   strict-mode errors exist in packages/crypto (2), store (2), protocol (3), verifier (4),
   reporting (2). Root `tsconfig.json` also lacks the `jsx` flag, so it can't typecheck the viewer.
   `@coc/contracts` typechecks clean.
