---
name: local-dev
description: How to bring chainofCommand up locally — install, run protocol/audit CLI, API, and viewer (verified during onboarding, 2026-09-24)
---

# Local Dev — chainofCommand

Verified end-to-end on 2026-09-24 (Node v20.20.2, pnpm 10.2.0 via corepack).

## 1. Toolchain

- Node.js ^18 || ^20 || >=22; repo pins `pnpm@10.2.0` via `packageManager`.
- pnpm is not preinstalled on PATH — activate through corepack:
  `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && corepack pnpm --version`
- If `node_modules` exists but is root-owned/read-only (bun install from image build), clear it:
  `sudo rm -rf node_modules apps/*/node_modules packages/*/node_modules` plus any stray `bun.lock`.
  Mixing bun and pnpm layouts breaks the workspace.
- Install: `corepack pnpm install --frozen-lockfile` (164 packages, ~2s warm).

## 2. Root tests need workspace deps at root

`tests/` (vitest, root package) imports `@coc/*` workspace packages. pnpm's isolated layout only
links workspace packages that are declared, so root `package.json` must declare them:

```bash
corepack pnpm add -Dw "@coc/contracts@workspace:*" "@coc/crypto@workspace:*" \
  "@coc/protocol@workspace:*" "@coc/reporting@workspace:*" "@coc/store@workspace:*" \
  "@coc/verifier@workspace:*"
```

(Applied in the onboarding PR — package.json + pnpm-lock.yaml changed.) Bun hoists everything, so
this only bit under the pinned pnpm.

## 3. Primary user flow (protocol run → audit verify)

```bash
# task.json — docs/README.md quickstart demo
cat > /tmp/task.json <<'JSON'
{"task_id":"demo_task","objective":"Generate accountable execution proof.",
 "input_artifacts":[],"constraints":["local-only"],"policy_profile":"default",
 "requested_roles":["planner","executor","critic","auditor"]}
JSON

export COC_HOME=/abs/path/to/repo/.coc     # ABSOLUTE — see gotcha below
cd apps/cli
corepack pnpm exec tsx src/index.ts protocol run --task /tmp/task.json
# → trace_id, verification_status: pass, events_emitted: 12
corepack pnpm exec tsx src/index.ts audit verify --trace <trace_id>
# → verification_status: pass, 0 failures
```

Data lands under `$COC_HOME`: `keys/`, `artifacts/sha256/`, `traces/<id>/events.jsonl` + reports.

## 4. API + viewer

```bash
COC_HOME=/abs/path/.coc corepack pnpm --filter @coc/api run start   # port in log (default 4310)
corepack pnpm --filter @coc/viewer run dev                          # :5173
```

Endpoints exercised on onboarding: `GET /api/traces`, `GET /api/traces/:id`,
`GET /api/traces/:id/events?limit=N` (base64url cursor), `POST /api/traces/:id/verify`,
`GET /api/traces/:id/reports/latest` (200; 404 for unknown trace). Health check:
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4310/api/traces`.

Background servers: redirect stdin and all output or the exec stream hangs
(`nohup ... > /tmp/api.log 2>&1 < /dev/null &`); the process survives disconnects — check
`pgrep -af 'tsx src/index.ts'` and the log before starting twice.

## 5. Gotchas learned the hard way

- **`pnpm protocol:run -- --task x` fails under pnpm 10.** The literal `--` is forwarded through
  the two script layers; commander treats post-`--` tokens as positional and never sees `--task`.
  Use the direct `tsx` invocation in step 3 (same for `audit verify`).
- **COC_HOME must be absolute** when CLI and API share state — `pnpm --filter` runs each app from
  its own package dir, so the cwd-relative default `./.coc` fragments data.
- **Port comes from the API log** ("trace api ready" with host/port), not an assumed default.
- **Pre-existing issues on master (not environment problems):**
  - vitest 13/14: `detects signature invalid after payload mutation` expects `SIG_INVALID` but the
    hash-integrity check reports `HASH_MISMATCH` first.
  - `tsc --noEmit`: only `@coc/contracts` is clean; crypto/store/protocol/verifier/reporting have
    strict-mode errors (nothing runs tsc — runtime is tsx, viewer builds via esbuild).
  - Root `tsconfig.json` lacks a `jsx` flag, so it cannot typecheck `apps/viewer`.

## 6. Evidence from the onboarding run

- protocol run → trace `01M3AE18J227F7SY3DFKPNJ60V`, `pass`, 12 events; audit verify `pass`.
- API: all above endpoints returned expected codes; POST verify returned `pass` report JSON.
- Viewer: dev server HTTP 200; `vite build` OK (148.49 kB JS).
- Tests: 13/14 pass (one pre-existing failure, above).
- Sandbox snapshot: `wiet7ld8mgoynogidfz2:default` (2026-09-24T19:30:45.500Z).
