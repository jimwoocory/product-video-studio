# Product Video Studio P1 Final Release Baseline — 2026-10-04

## Baseline identity

- Branch: `baseline/p1-final-20261004`
- P1 Final code baseline commit: `034b2d3ecb9d50c416198ba5efc8b5abd3744a12`
- Intended release tag: `v0.3.0-p1-final`
- Remote: `https://github.com/jimwoocory/product-video-studio.git`
- Remote ancestry: `origin/main` / `origin/p0-v0.2` at P0 commit `e8531eb31546fe98a4ed2e81178c8b691a850c6b`

## P0 freeze integrity

P0 frozen release directory remains external and unchanged:

`C:\Users\Administrator\AgentDock\Product-Video-Studio-Releases\P0-V0.2-freeze-20260928-151435`

Verified SHA256:

- P0 source ZIP: `01F7B2678484D058A87F25D5964F011E7E1F5963E35617A6D71443AFA5775C3A`
- P0 runtime ZIP: `117282505061104070B2610868D7A5FC9994C590A185D6E2535DB77B8A128485`

Both match `P0-FREEZE-CHECKSUMS.txt`.

## Baseline verification

Executed from the P1 Final working tree before the baseline commit:

- `npm test`: **250/250 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
  - packages=35
  - external_runtimes=5
- `npx prisma validate`: **PASS**

## Secret/runtime exclusion check

The following remain ignored and were not included in the baseline commit:

- `.env`
- `.runtime-secrets/`
- `prisma/*.db`
- `projects/`
- `.pvs-server.*.log`
- `.tmp-*`

A pre-commit candidate scan found only test fixture / UI selector false positives; no production API key, access token or client secret was intentionally committed.

## Development rule after this baseline

All practical optimization work must branch from this baseline. Do not rewrite or force-push `main`.

Recommended branches:

- `feat/p1f-practical-a01-workflow-nav`
- `feat/p1f-practical-a02-blocked-pages`
- `feat/p1f-practical-a03-research-quality`
- `test/p1f-practical-a04-browser-e2e`
- `feat/p1f-practical-a06-task-center`

P0 freeze artifacts remain immutable.
