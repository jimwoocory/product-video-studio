import test from "node:test";
import assert from "node:assert/strict";
import type {
  AccountStatus,
  CostEstimateResult,
  DownloadedAsset,
  GenerationHandle,
  GenerationStatusResult,
  ProviderProbeResult,
  ReconcileResult,
  SubmitResult,
  VideoProvider
} from "../src/application/ports/video-provider.js";
import type { GenerationRepository } from "../src/application/ports/generation-repository.js";
import type { WorkflowRepository } from "../src/application/ports/workflow-repository.js";
import { GenerationPreflightService } from "../src/application/services/generation-preflight.js";
import type {
  CompiledPrompt,
  CreativeBatch,
  GenerationAttempt,
  GenerationRequest,
  PreflightReport,
  ProductionPlan,
  ScriptDraft,
  UserApproval,
  WorkflowBlocker
} from "../src/domain/schemas.js";
import {
  H,
  ISO,
  makeAttempt,
  makeProductTruth,
  makeValidClip
} from "./fixtures.js";

class MemoryGenerationRepository implements GenerationRepository {
  compiled: CompiledPrompt[] = [];
  requests: GenerationRequest[] = [];
  reports: PreflightReport[] = [];
  approvals: UserApproval[] = [];
  staleCalls = 0;

  async markSubmissionChainStale(): Promise<void> {
    this.staleCalls += 1;
  }
  async saveCompiledPrompt(prompt: CompiledPrompt): Promise<CompiledPrompt> {
    this.compiled.push(prompt);
    return prompt;
  }
  async listCompiledPrompts(): Promise<CompiledPrompt[]> {
    return this.compiled;
  }
  async createGenerationRequest(request: GenerationRequest): Promise<GenerationRequest> {
    this.requests.push(request);
    return request;
  }
  async getGenerationRequest(id: string): Promise<GenerationRequest | null> {
    return this.requests.find((item) => item.id === id) ?? null;
  }
  async listGenerationRequests(): Promise<GenerationRequest[]> {
    return this.requests;
  }
  async listCurrentGenerationRequests(): Promise<GenerationRequest[]> {
    return this.requests;
  }
  async createPreflightReport(report: PreflightReport): Promise<PreflightReport> {
    this.reports.push(report);
    return report;
  }
  async getPreflightReport(id: string): Promise<PreflightReport | null> {
    return this.reports.find((item) => item.id === id) ?? null;
  }
  async listPreflightReports(): Promise<PreflightReport[]> {
    return this.reports;
  }
  async createUserApproval(approval: UserApproval): Promise<UserApproval> {
    this.approvals.push(approval);
    return approval;
  }
  async getUserApproval(id: string): Promise<UserApproval | null> {
    return this.approvals.find((item) => item.id === id) ?? null;
  }
  async listUserApprovals(): Promise<UserApproval[]> {
    return this.approvals;
  }
}

class MemoryWorkflowRepository implements WorkflowRepository {
  blockers: WorkflowBlocker[] = [];
  attempts: GenerationAttempt[] = [];

  async createBlocker(blocker: WorkflowBlocker): Promise<WorkflowBlocker> {
    this.blockers.push(blocker);
    return blocker;
  }
  async listOpenBlockers(projectId: string): Promise<WorkflowBlocker[]> {
    return this.blockers.filter(
      (item) => item.projectId === projectId && !item.resolvedAt
    );
  }
  async resolveBlocker(id: string, resolvedAt: string): Promise<WorkflowBlocker> {
    const blocker = this.blockers.find((item) => item.id === id);
    if (!blocker) throw new Error("blocker missing");
    blocker.resolvedAt = resolvedAt;
    return blocker;
  }
  async createGenerationAttempt(attempt: GenerationAttempt): Promise<GenerationAttempt> {
    this.attempts.push(attempt);
    return attempt;
  }
  async getGenerationAttempt(id: string): Promise<GenerationAttempt | null> {
    return this.attempts.find((item) => item.id === id) ?? null;
  }
  async nextAttemptNumber(clipId: string): Promise<number> {
    const numbers = this.attempts
      .filter((item) => item.clipId === clipId)
      .map((item) => item.attemptNumber);
    return (numbers.length ? Math.max(...numbers) : 0) + 1;
  }
  async listGenerationAttempts(projectId: string): Promise<GenerationAttempt[]> {
    return this.attempts.filter((item) => item.projectId === projectId);
  }
  async updateGenerationAttemptStatus(): Promise<GenerationAttempt> {
    throw new Error("not used");
  }
}

class MissingDreaminaProvider implements VideoProvider {
  readonly id = "domestic-jimeng-cli" as const;
  async probe(): Promise<ProviderProbeResult> {
    return {
      code: "DREAMINA_NOT_FOUND",
      cliFound: false,
      providerIdentityHash: H.b,
      capabilityFingerprint: H.c,
      rawStdout: "",
      rawStderr: "missing"
    };
  }
  async accountStatus(): Promise<AccountStatus> {
    throw new Error("must not be called when provider is missing");
  }
  async estimate(): Promise<CostEstimateResult> {
    throw new Error("must not be called when provider is missing");
  }
  async submit(): Promise<SubmitResult> {
    throw new Error("must not submit");
  }
  async status(): Promise<GenerationStatusResult> {
    throw new Error("must not poll");
  }
  async download(): Promise<DownloadedAsset> {
    throw new Error("must not download");
  }
  async reconcileSubmission(): Promise<ReconcileResult> {
    return { outcome: "INCONCLUSIVE", reason: "not used" };
  }
}

function makeBatch(): CreativeBatch {
  const truth = makeProductTruth();
  return {
    id: "batch-preflight",
    projectId: truth.projectId,
    version: 1,
    status: "ACTIVE",
    productTruthRef: {
      entityType: "ProductTruth",
      entityId: truth.id,
      version: truth.version,
      hash: truth.contentHash
    },
    generatorVersion: "test",
    concepts: Array.from({ length: 4 }, (_, i) => ({
      id: `creative-${i + 1}`,
      title: `Concept ${i + 1}`,
      targetAudience: "buyers",
      painPoint: "need",
      hook: "hook",
      coreSellingPoint: "Feature one",
      narrativePattern: "problem-solution",
      expectedDurationMs: 60000,
      productShowcaseStrategy: "hero",
      generationRisk: "LOW" as const,
      requiredFactIds: ["fact-1"]
    })),
    selectedCreativeId: "creative-1",
    contentHash: H.b,
    createdAt: ISO
  };
}

function makeScript(batch: CreativeBatch): ScriptDraft {
  return {
    id: "script-preflight",
    projectId: batch.projectId,
    version: 1,
    status: "CONFIRMED",
    productTruthRef: batch.productTruthRef,
    creativeBatchRef: {
      entityType: "CreativeBatch",
      entityId: batch.id,
      version: batch.version,
      hash: batch.contentHash
    },
    selectedCreativeId: "creative-1",
    targetDurationMs: 60000,
    beats: [
      {
        id: "beat-1",
        order: 1,
        purpose: "PRODUCT",
        text: "Feature one",
        estimatedDurationMs: 60000,
        requiredFactIds: ["fact-1"]
      }
    ],
    contentHash: H.c,
    confirmedAt: ISO
  };
}

function makePlan(script: ScriptDraft): ProductionPlan {
  const truth = makeProductTruth();
  const clip = makeValidClip();
  return {
    id: "plan-preflight",
    projectId: truth.projectId,
    version: 1,
    status: "CONFIRMED",
    productTruthRef: script.productTruthRef,
    scriptRef: {
      entityType: "ScriptDraft",
      entityId: script.id,
      version: script.version,
      hash: script.contentHash
    },
    selectedCreativeId: script.selectedCreativeId,
    visualDirection: "studio",
    soundDirection: "clear",
    productShowcaseRules: ["show product"],
    continuityLock: {
      product: {
        stableAttributes: ["logo"],
        forbiddenChanges: structuredClone(truth.forbiddenChanges)
      },
      characters: [],
      environments: [
        { sceneId: "scene-1", stableElements: ["studio"] }
      ]
    },
    scenes: [
      {
        id: "scene-1",
        order: 1,
        purpose: "product",
        location: "studio",
        visualState: "clean",
        sourceBeatIds: ["beat-1"],
        requiredFactIds: ["fact-1"],
        clips: [clip]
      }
    ],
    contentHash: H.e,
    confirmedAt: ISO
  };
}

test("DREAMINA_NOT_FOUND produces BLOCKED preflight and no approval/attempt", async () => {
  const generation = new MemoryGenerationRepository();
  const workflow = new MemoryWorkflowRepository();
  const provider = new MissingDreaminaProvider();
  let nextVersion = 0;
  const service = new GenerationPreflightService(
    generation,
    workflow,
    provider,
    async () => ++nextVersion
  );
  const truth = makeProductTruth();
  const batch = makeBatch();
  const script = makeScript(batch);
  const plan = makePlan(script);

  const result = await service.run({
    projectId: truth.projectId,
    productTruth: truth,
    creativeBatch: batch,
    script,
    productionPlan: plan,
    assets: []
  });

  assert.equal(result.overallStatus, "BLOCKED");
  assert.equal(result.requests.length, 1);
  assert.equal(result.reports.length, 1);
  assert.equal(result.reports[0]?.status, "BLOCKED");
  assert.deepEqual(result.reports[0]?.blockers, ["DREAMINA_NOT_FOUND"]);
  assert.equal(result.blocker?.reasonCode, "DREAMINA_NOT_FOUND");
  assert.equal(generation.compiled.length, 1);
  assert.equal(generation.approvals.length, 0);
  assert.equal(workflow.attempts.length, 0);
  assert.equal(generation.staleCalls, 1);
});

test("unresolved submission outcome blocks ordinary Preflight unless duplicate-cost risk is explicitly accepted", async () => {
  const generation = new MemoryGenerationRepository();
  const workflow = new MemoryWorkflowRepository();
  const provider = new MissingDreaminaProvider();
  const truth = makeProductTruth();
  const batch = makeBatch();
  const script = makeScript(batch);
  const plan = makePlan(script);
  workflow.attempts.push({
    ...makeAttempt(),
    projectId: truth.projectId,
    status: "SUBMISSION_OUTCOME_UNKNOWN"
  });
  let nextVersion = 0;
  const service = new GenerationPreflightService(
    generation,
    workflow,
    provider,
    async () => ++nextVersion
  );

  await assert.rejects(
    service.run({
      projectId: truth.projectId,
      productTruth: truth,
      creativeBatch: batch,
      script,
      productionPlan: plan,
      assets: []
    }),
    /explicit duplicate-submission cost-risk acceptance/
  );
  assert.equal(generation.staleCalls, 0);
  assert.equal(generation.requests.length, 0);
  assert.equal(generation.reports.length, 0);

  const accepted = await service.run({
    projectId: truth.projectId,
    productTruth: truth,
    creativeBatch: batch,
    script,
    productionPlan: plan,
    assets: [],
    acceptedDuplicateSubmissionRisk: true
  });
  assert.equal(generation.staleCalls, 1);
  assert.equal(accepted.requests.length, 1);
  assert.equal(accepted.reports.length, 1);
  assert.equal(accepted.reports[0]?.status, "BLOCKED");
  assert.deepEqual(
    accepted.reports[0]?.blockers,
    ["DREAMINA_NOT_FOUND"]
  );
});

test("RECONCILING also blocks ordinary Preflight and preserves old blocker when duplicate-cost risk is accepted", async () => {
  const generation = new MemoryGenerationRepository();
  const workflow = new MemoryWorkflowRepository();
  const provider = new MissingDreaminaProvider();
  const truth = makeProductTruth();
  const batch = makeBatch();
  const script = makeScript(batch);
  const plan = makePlan(script);
  const oldAttempt = {
    ...makeAttempt(),
    projectId: truth.projectId,
    status: "RECONCILING" as const
  };
  workflow.attempts.push(oldAttempt);
  const reconcileBlocker: WorkflowBlocker = {
    id: "reconcile-blocker",
    projectId: truth.projectId,
    scope: "GENERATION_ATTEMPT",
    relatedEntityId: oldAttempt.id,
    reasonCode: "SUBMISSION_RECONCILIATION_REQUIRED",
    message: "unknown submission",
    requiredUserAction: "reconcile first",
    resumeCheckpoint: "generation.reconcile",
    createdAt: ISO
  };
  workflow.blockers.push(reconcileBlocker);

  let nextVersion = 0;
  const service = new GenerationPreflightService(
    generation,
    workflow,
    provider,
    async () => ++nextVersion
  );

  await assert.rejects(
    service.run({
      projectId: truth.projectId,
      productTruth: truth,
      creativeBatch: batch,
      script,
      productionPlan: plan,
      assets: []
    }),
    /explicit duplicate-submission cost-risk acceptance/
  );
  assert.equal(generation.requests.length, 0);
  assert.equal(generation.reports.length, 0);
  assert.equal(
    (await workflow.listOpenBlockers(truth.projectId)).filter(
      (item) =>
        item.reasonCode === "SUBMISSION_RECONCILIATION_REQUIRED"
    ).length,
    1
  );

  const accepted = await service.run({
    projectId: truth.projectId,
    productTruth: truth,
    creativeBatch: batch,
    script,
    productionPlan: plan,
    assets: [],
    acceptedDuplicateSubmissionRisk: true
  });
  assert.equal(accepted.requests.length, 1);
  assert.equal(accepted.reports.length, 1);
  assert.equal(workflow.attempts.length, 1);
  assert.equal(workflow.attempts[0]?.status, "RECONCILING");
  assert.equal(
    (await workflow.listOpenBlockers(truth.projectId)).filter(
      (item) =>
        item.reasonCode === "SUBMISSION_RECONCILIATION_REQUIRED"
    ).length,
    1
  );
});
