# Product Video Studio — P0 Acceptance Record

Template version: P0 V0.2  
Acceptance date: 2026-09-27  
Current overall result: **IMPLEMENTATION_PASS + EXTERNAL_BLOCKED**  
E2E status: **NOT_ESTABLISHED**

This record contains only observed implementation/test/runtime evidence. No CLI version, ProviderIdentity, external task ID, polling result, downloaded Seedance video or E2E success is fabricated.

## 1. Acceptance classification

- [x] IMPLEMENTATION_PASS
- [x] EXTERNAL_BLOCKED
- [ ] E2E_PASS

Rule: final P0 PASS only equals E2E_PASS.  
Therefore **Final P0 PASS = NO** at this stage.

Independent read-only implementation review result:

```text
IMPLEMENTATION_PASS_READY=YES
BLOCKERS=NONE
FINAL_CLASSIFICATION:
IMPLEMENTATION_PASS=YES
EXTERNAL_BLOCKED=YES
E2E_PASS=NO / NOT ESTABLISHED
```

## 2. Current external environment

Checked date: 2026-09-27  
Observed provider result: `DREAMINA_NOT_FOUND`

Observed probe:

```text
code: DREAMINA_NOT_FOUND
cliFound: false
rawStderr: dreamina executable was not found
```

Observed implications:
- domestic official `dreamina` executable is not currently available on the development machine.
- no real official CLI version/help/login/credit/task evidence exists yet.
- no ProviderIdentity is claimed for the real development machine.
- generation is correctly fail-closed.
- no UserApproval or GenerationAttempt is created from the blocked real smoke run.

Current unresolved WorkflowBlocker:

```text
reasonCode: DREAMINA_NOT_FOUND
scope: PROVIDER
requiredUserAction: Install and verify the domestic official dreamina CLI, then rerun ProviderIdentity/capability probe.
resumeCheckpoint: Provider identity and capability probe
resolvedAt: not resolved
```

## 3. Specification Gate

- [x] docs/P0-PRD.md is V0.2
- [x] docs/ARCHITECTURE.md is V0.2
- [x] docs/SCHEMAS.md is V0.2
- [x] docs/UX-FLOW.md is V0.2
- [x] docs/THIRD-PARTY-POLICY.md is V0.2
- [x] docs/CODEX-GOAL.md is V0.2
- [x] Cross-document specification freeze passed

Evidence:
- V0.2 independent freeze review: `FREEZE_PASS`
- Freeze gates: G01–G20 all PASS
- Author-side cross-document checks: 37 checks, 0 failures
- Functional coding started only after specification freeze

## 4. License Gate

- [x] package.json ↔ package-lock.json ↔ dependency-allowlist.json are checked for consistency
- [x] direct dependencies reviewed
- [x] transitive dependencies reviewed
- [x] exact pinned versions enforced
- [x] license files/canonical license copies present
- [x] THIRD_PARTY_NOTICES anchors/inventory checked
- [x] GPL/AGPL/SSPL/UNKNOWN/no-LICENSE are default-denied
- [x] unregistered vendor/binary files are blocked
- [x] external runtimes are default-deny and require service-terms status
- [x] third-party Jimeng/Dreamina wrappers are blocked both as npm dependencies and external runtimes
- [x] official dreamina is registered only as a non-bundled external runtime
- [x] Hermes Agent is registered as a non-bundled MIT external runtime

Observed commands/results:

```text
node scripts/archive-licenses.mjs
LICENSE_ARCHIVE_PASS archived=14 skipped_optional=19

node scripts/license-gate.mjs
LICENSE_GATE_PASS packages=33 external_runtimes=2
```

Automated License Gate test evidence includes:
- complete governed fixture PASS
- unregistered lock dependency rejected
- transitive GPL rejected
- NO-LICENSE rejected
- missing license copy rejected
- missing NOTICE anchor rejected
- third-party Jimeng MIT wrapper runtime rejected
- unregistered vendor/binary rejected
- package.json/lock mismatch rejected
- allowlisted npm Jimeng wrapper rejected
- UNKNOWN external-runtime license rejected
- missing external-runtime serviceTermsStatus rejected
- missing external-runtime NOTICE anchor rejected

## 5. Implementation tests

Observed command:

```text
npm run typecheck
npm test
```

Observed result:

```text
TypeScript typecheck: PASS
tests: 77
pass: 77
fail: 0
cancelled: 0
skipped: 0
todo: 0
```

### 5.1 Domain validators

- [x] Clip duration 4000–15000ms
- [x] Clip >15000ms rejected
- [x] at least one Segment required
- [x] integer-millisecond timing required
- [x] first Segment starts at 0
- [x] last Segment ends at Clip duration
- [x] zero-length/reversed Segment rejected
- [x] no gap/overlap
- [x] opening/closing/adjacent continuity enforced
- [x] explicit NONE audio structures enforced
- [x] null/empty-string audio representations rejected
- [x] speech duration executable
- [x] ProductFact/UncertainClaim isolation enforced
- [x] structured ForbiddenChange enforced
- [x] string[] ForbiddenChange degradation rejected
- [x] fact/beat/scene/clip/segment traceability enforced

### 5.2 Product review/edit gates

- [x] canonical Product Truth image must resolve through AssetRef
- [x] canonical Artifact must be READY
- [x] canonical Asset/Artifact SHA-256 must match
- [x] Script structured edit creates a new DRAFT version
- [x] ProductionPlan structured edit creates a new DRAFT version
- [x] structural edits re-run schema/validator
- [x] downstream stale propagation is preserved
- [x] CompiledPrompt is not directly free-editable
- [x] Prompt Inspector is read-only
- [x] old REDO decision does not hide review controls for a new Attempt/output

### 5.3 Workflow / approval / retry semantics

- [x] upstream invalidation matrix
- [x] PASS/BLOCKED/STALE gates
- [x] Request/Preflight/Approval hashes bound
- [x] unknown cost requires explicit acceptance
- [x] active approval cannot be silently reused
- [x] resubmit/retry creates a new Approval + Attempt chain
- [x] submit automatic retry = 0
- [x] Attempt enters SUBMITTING before provider submit
- [x] SUBMISSION_OUTCOME_UNKNOWN is durable
- [x] unknown submit creates reconciliation blocker
- [x] reconcile FOUND_ACTIVE covered
- [x] reconcile FOUND_SUCCEEDED covered
- [x] reconcile FOUND_FAILED covered
- [x] reconcile NOT_FOUND covered
- [x] reconcile INCONCLUSIVE covered
- [x] poll failure retains durable handle and does not create a new Attempt
- [x] download failure can retry the same Attempt without creating a new Attempt
- [x] REDO does not automatically submit
- [x] REDO stales the old Request/Preflight/Approval chain

### 5.4 Artifact / restart recovery

- [x] immutable target cannot be overwritten
- [x] path traversal rejected
- [x] READY Artifact stores SHA-256 and size
- [x] PENDING missing file recovery
- [x] injected crash after temp-file write
- [x] injected crash after target publication but before DB READY
- [x] injected crash immediately after DB READY
- [x] orphan file detection
- [x] interrupted temp-file cleanup
- [x] SUBMITTING on restart becomes SUBMISSION_OUTCOME_UNKNOWN
- [x] reconciliation blocker restored after restart
- [x] restart with a new PrismaClient preserves Attempt/Blocker state
- [x] derived `exports/project.json` rebuilt from authoritative state

## 6. Domestic dreamina Provider implementation evidence

Implementation contract present:
- [x] probe
- [x] accountStatus
- [x] estimate
- [x] submit
- [x] status
- [x] download
- [x] reconcileSubmission
- [x] no automatic submit retry
- [x] discovered but unverified executable is hashed but not executed
- [x] verified runtime configuration path exists
- [x] verified runtime requires reviewed absolute executable path
- [x] verified runtime requires executable SHA-256
- [x] reviewed CLI version/help contract is checked
- [x] command templates reject credential/token/cookie/password material
- [x] version/help/account/estimate command evidence is persisted
- [x] provider command argv/stdout/stderr are redacted before persistence
- [x] stdout/stderr command evidence is persisted as immutable ArtifactRecords
- [x] verified ProviderIdentity can be persisted
- [x] ProviderCapability can bind to ProviderIdentity
- [x] hash mismatch fails closed without executing the binary

Verified-runtime implementation test:
- simulated reviewed/verified executable → provider READY
- authenticated account → true
- estimated credits → KNOWN
- Preflight → PASS
- separate version/help/account/estimate CommandAttempt evidence persisted
- version/help stdout/stderr ArtifactRecords READY
- ProviderIdentity persistence verified

This test validates the implementation path only. It does **not** claim that a real official dreamina CLI is installed on the current development machine.

## 7. Review / playback implementation evidence

- [x] generated video Artifact endpoint exists
- [x] Generate UI uses HTML video playback controls for READY GENERATED_VIDEO Artifact
- [x] ReviewDecision persists ACCEPT/REDO
- [x] ReviewDecision binds current clipHash
- [x] ReviewDecision binds generationAttemptId
- [x] ReviewDecision binds outputArtifactId/outputArtifactHash
- [x] old REDO does not suppress review UI for a new output
- [x] all-current-clips ACCEPT can move project to COMPLETED
- [x] REDO leaves project in generation review and requires a new Preflight path

## 8. SQLite / file authority / recovery

Observed migration status:

```text
3 migrations found
Database schema is up to date
```

Authority model:
- SQLite is authoritative for structured workflow state.
- immutable files are authoritative for Artifact bytes.
- `exports/project.json` is a derived/rebuildable snapshot, not a fact source.

Current smoke-project recovery:
- recovery missing: 0
- recovery corrupt: 0
- recovery orphanPaths: 0
- recovery tempRemoved: 0
- unknownAttempts introduced by recovery: 0
- derived project snapshot generated successfully

Snapshot path:

```text
projects/182956df-0e00-4a1e-9d34-a9d03178602e/exports/project.json
```

## 9. Real implementation smoke evidence

Project ID:

```text
182956df-0e00-4a1e-9d34-a9d03178602e
```

Observed implemented flow before the external provider blocker:
- real project created
- product input persisted
- Hermes Product Truth DRAFT generated
- Product Truth confirmed
- 5 CreativeConcepts generated
- Creative selected
- Script DRAFT generated and confirmed
- Product Director generated 6 Scenes / 6 Clips / 12 Segments
- total Clip duration = 60,000ms
- ProductionPlan v2 confirmed
- deterministic CompiledPrompt generated per Clip
- GenerationRequest created per Clip
- Preflight executed against actual local provider environment

Current database evidence:
- project status: `READY_TO_GENERATE`
- current ProductionPlan version: 2
- CompiledPrompt count: 6
- CURRENT GenerationRequest count: 6
- BLOCKED Preflight count: 6
- ACTIVE UserApproval count: 0
- GenerationAttempt count: 0
- open blocker count: 1
- open blocker: `DREAMINA_NOT_FOUND`
- real ProviderIdentity count: 0
- real ProviderCapability identity evidence: not established because CLI is missing
- no real external task ID exists
- no fake Seedance success data exists

Derived snapshot evidence:
- `derived: true`
- blocker contains `DREAMINA_NOT_FOUND`
- six Preflight entries are BLOCKED

## 10. ProviderIdentity evidence for the real development machine

Current status: **NOT_AVAILABLE — DREAMINA_NOT_FOUND**

Complete only after the domestic official executable exists and has been independently verified:
- Official source URL:
- Publisher/package:
- Executable path:
- Executable SHA-256/signature:
- CLI version:
- Raw version ArtifactRecord:
- Raw help ArtifactRecord:
- Official login origins:
- Capability fingerprint:
- Verification decision:
- Reviewer/date:

No value is filled here from the simulated verified-runtime implementation test.

## 11. Real Seedance E2E evidence

Current status: **NOT_EXECUTED — DREAMINA_NOT_FOUND**

The following fields must remain empty until a real official run exists:
- Real Product/Clip chosen for E2E:
- CompiledPrompt ID/hash used for paid run:
- GenerationRequest/requestHash:
- PASS PreflightReport/reportHash:
- UserApproval/approvalHash:
- GenerationAttempt/attemptNumber:
- real external task ID:
- submit command evidence:
- polling evidence:
- downloaded video ArtifactRecord:
- restart recovery evidence for that task:
- playback evidence:
- ACCEPT ReviewDecision:

No field in this section may be populated from a fake provider, unit/integration fixture or simulated verified runtime.

## 12. Current blocker

- reasonCode: `DREAMINA_NOT_FOUND`
- affected classification: `E2E_PASS`
- implementation impact: none; implementation is accepted
- requiredUserAction: install the domestic official dreamina CLI from a verifiable official source, then verify identity/capability and complete login through the official flow
- resumeCheckpoint: Provider identity and capability probe
- owner: external environment / operator action

## 13. Final decision

**IMPLEMENTATION_PASS: YES**  
**EXTERNAL_BLOCKED: YES**  
**E2E_PASS: NO / NOT ESTABLISHED**  
**Final P0 PASS: NO**

Decision evidence:
- final independent implementation review: `IMPLEMENTATION_PASS_READY=YES`
- independent review blockers: `NONE`
- Provider drift submission gate verified: re-probe before submit, stale old chain, submitCalls=0 on drift
- duplicate-cost gate verified: unresolved unknown/reconciling attempts require explicit duplicate-submission risk acceptance for new Preflight/Approval chains
- current-output review binding verified: COMPLETED requires current clipHash + latest successful Attempt + READY outputArtifactId/outputArtifactHash ACCEPT
- orphan recovery verified: deterministic quarantine to `.recovery/orphans/`, audit Artifact/blocker, second-restart idempotency
- TypeScript typecheck: PASS
- automated tests: 77/77 PASS
- Prisma migration status: schema up to date, 3 migrations present
- enhanced License Gate: PASS
- real smoke project: six requests/six BLOCKED preflights/zero approval/zero attempt
- unresolved real environment blocker: `DREAMINA_NOT_FOUND`

Reviewer attribution:
- implementation evidence: automated tests + SQLite/artifact/runtime observations
- implementation review: independent read-only Hermes audit
- E2E human approval: **not performed**

## 14. 2026-09-28 Runtime update

本节是对 2026-09-27 历史验收记录的增量更新，不删除旧证据：

- 国内官方 dreamina CLI 已在真实环境恢复并完成 OAuth。
- Seedance 2.0 Mini 已取得真实 task id、成功轮询、下载和播放。
- 当前真实项目已有 2 个生成结果通过用户 ACCEPT，另外 6 个 Clip 被用户明确 SKIP。
- 选片完成状态已从旧 COMPLETED 语义修订为 READY_TO_ASSEMBLE。
- 新增 FINAL_VIDEO 成片链与抖音官方 OAuth/video.create 发布链实现。
- 抖音真实发布仍要求用户自己的开放平台应用配置、video.create 权限、OAuth 授权和每次发布的显式确认；未满足前不得宣称真实 Douyin publish E2E。
