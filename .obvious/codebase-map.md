# Codebase Map — chainofCommand

pnpm workspace monorepo. Depth cap 2.

| Path | What it is | Key files / notes |
|---|---|---|
| `apps/api` | Fastify trace API (@coc/api) | `src/index.ts` — all routes; reads `COC_HOME`; logs host/port at startup (default 127.0.0.1:4310) |
| `apps/cli` | `coc` CLI (@coc/cli) | `src/index.ts` — `protocol run` (emit + verify) and `audit verify` (re-verify) subcommands |
| `apps/viewer` | React trace viewer (@coc/viewer) | `index.html`, `src/App.tsx` (fetches API), `vite.config.ts` |
| `packages/contracts` | Zod schemas + shared types (@coc/contracts) | `src/index.ts` — task/event/report schemas, `HEX_64_REGEX`, id helpers (ulid). Typechecks clean |
| `packages/crypto` | Crypto primitives (@coc/crypto) | `canonicalize.ts`, `hash.ts`, `keys.ts` (PEM key registry), `sign.ts` (Ed25519) |
| `packages/protocol` | Protocol runner (@coc/protocol) | `event-factory.ts` (buildSignedEvent), `orchestrator.ts` (runProtocolFlow) |
| `packages/reporting` | Report rendering (@coc/reporting) | `src/index.ts` |
| `packages/store` | Filesystem store (@coc/store) | `trace-store.ts`, `ledger.ts` (JSONL append-only), `artifact-store.ts` (sharded sha256), `layout.ts` |
| `packages/verifier` | Verifier (@coc/verifier) | `verifier.ts` — policy checks (hash integrity, chain continuity, signatures, artifacts, roles) |
| `tests` | Vitest suites | `core-primitives.test.ts`, `verifier-scenarios.test.ts` (root package; needs root `@coc/*` deps) |
| `docs` | Architecture/spec package (source of truth) | `README.md` (quickstart), `01`–`13` specs |
| root configs | Workspace + TS config | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `tsconfig.json` |

Runtime data lives under `COC_HOME` (default `./.coc`, gitignored): `keys/`, `artifacts/sha256/`,
`traces/<trace_id>/events.jsonl`, `trace.meta.json`, `reports/<report_id>.json|.txt`.
