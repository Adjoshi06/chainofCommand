# Chain of Command

Local-first, cryptographically accountable traces for multi-agent workflows.

This repo records **signed protocol events** in an append-only ledger, stores **content-addressed artifacts**, and produces **verification reports** that detect tampering (chain breaks, invalid signatures, missing artifacts, role-policy violations, etc.).

For the full system design and v1 requirements, start with `docs/README.md`.

## Repo layout

- `apps/cli` — `coc` CLI (`protocol run`, `audit verify`)
- `apps/api` — Fastify API for listing traces, events, artifacts, and reports
- `apps/viewer` — React trace viewer (Vite)
- `packages/*` — shared contracts, crypto, protocol runner, store, verifier, reporting
- `docs` — architecture/spec package (source of truth)
- `tests` — Vitest suites (core primitives + verifier scenarios)

## Prerequisites

- Node.js `^18 || ^20 || >=22`
- pnpm (repo pinned via `packageManager` to `pnpm@10.2.0`)

## Install

```bash
pnpm install
```

## Quickstart: run + verify a trace

### 1) Use a shared data directory (`COC_HOME`)

By default, the runtime uses `./.coc` relative to the **current working directory**. When you run scripts via `pnpm --filter ...`, each app runs from its own package folder, so set `COC_HOME` to keep CLI + API pointed at the same data.

PowerShell:

```powershell
$env:COC_HOME = (Resolve-Path .\.coc).Path
```

### 2) Create a task file

Create `task.json`:

```json
{
  "task_id": "demo_task",
  "objective": "Generate accountable execution proof.",
  "input_artifacts": [],
  "constraints": ["local-only"],
  "policy_profile": "default",
  "requested_roles": ["planner", "executor", "critic", "auditor"]
}
```

### 3) Run the protocol (emits events + artifacts, then verifies)

```bash
pnpm protocol:run -- --task task.json
```

You’ll get a `trace_id` plus a verification verdict. Trace data is written under `COC_HOME`.

### 4) Re-verify (audit)

```bash
pnpm audit:verify -- --trace <trace_id>
```

You can also pass a trace path (directory) or an `events.jsonl` path to `--trace`.

## Where data is stored

Given `COC_HOME`, the default layout is:

- `keys/` — agent key registry + PEM keypairs
- `artifacts/sha256/` — sharded blobs + `.meta.json` sidecars
- `traces/<trace_id>/events.jsonl` — append-only event ledger (JSON Lines)
- `traces/<trace_id>/trace.meta.json` — trace/session metadata (head hash, counts, participants, policy)
- `traces/<trace_id>/reports/<report_id>.json|.txt` — verifier reports
- `traces/<trace_id>/verification.latest.json` — last verifier report (for UI/API convenience)

## API + Viewer

### Start the API

```bash
pnpm api:start
```

Defaults to `http://127.0.0.1:4310` (configure with `COC_API_HOST` / `COC_API_PORT`).

### Start the trace viewer

```bash
pnpm viewer:dev
```

The viewer calls the API base URL from `VITE_API_BASE` (defaults to `http://127.0.0.1:4310`).

## Useful scripts

- `pnpm test` — run Vitest once
- `pnpm test:watch` — watch mode
- `pnpm protocol:run -- --task <file> [--format json] [--output <path>] [--strict]`
- `pnpm audit:verify -- --trace <id-or-path> [--format json] [--output <path>] [--strict]`

## Documentation

The `docs/` directory is a decision-complete specification package. If you’re extending the protocol, verifier, API contracts, or UI requirements, start at `docs/README.md` and follow the reading order.

