import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanonicalProductArtifactReady,
  reviseProductionPlanDraft,
  reviseScriptDraft
} from "../src/application/services/review-actions.js";
import { renderProjectPage } from "../src/web/workbench-ui.js";
import type {
  ArtifactRecord,
  AssetRef,
  ProductionPlan,
  Project,
  ReviewDecision,
  ScriptDraft
} from "../src/domain/schemas.js";
import { DomainValidationError } from "../src/domain/validation.js";
import { H, ISO, makeProductTruth, makeValidClip } from "./fixtures.js";

function makeAsset(): AssetRef {
  return {
    id: "asset-1",
    artifactId: "artifact-canonical",
    type: "image",
    source: "user_upload",
    originalFilename: "product.png",
    sha256: H.a,
    mimeType: "image/png",
    sizeBytes: 12,
    provenance: "Product Input",
    createdAt: ISO
  };
}

function makeArtifact(
  integrityStatus: ArtifactRecord["integrityStatus"] = "READY",
  sha256 = H.a
): ArtifactRecord {
  return {
    id: "artifact-canonical",
    projectId: "project-1",
    kind: "USER_INPUT",
    relativePath: "input/product.png",
    sha256,
    sizeBytes: 12,
    mimeType: "image/png",
    integrityStatus,
    immutable: true,
    createdAt: ISO
  };
}

function makeScript(): ScriptDraft {
  return {
    id: "script-review",
    projectId: "project-1",
    version: 2,
    status: "CONFIRMED",
    productTruthRef: {
      entityType: "ProductTruth",
      entityId: "truth-1",
      version: 1,
      hash: H.a
    },
    creativeBatchRef: {
      entityType: "CreativeBatch",
      entityId: "batch-1",
      version: 1,
      hash: H.b
    },
    selectedCreativeId: "creative-1",
    targetDurationMs: 60000,
    beats: [
      {
        id: "beat-1",
        order: 1,
        purpose: "FEATURE",
        text: "Feature one",
        estimatedDurationMs: 60000,
        requiredFactIds: ["fact-1"]
      }
    ],
    contentHash: H.c,
    confirmedAt: ISO
  };
}

function makePlan(): ProductionPlan {
  const clip = makeValidClip();
  return {
    id: "plan-review",
    projectId: "project-1",
    version: 3,
    status: "CONFIRMED",
    productTruthRef: {
      entityType: "ProductTruth",
      entityId: "truth-1",
      version: 1,
      hash: H.a
    },
    scriptRef: {
      entityType: "ScriptDraft",
      entityId: "script-review",
      version: 2,
      hash: H.c
    },
    selectedCreativeId: "creative-1",
    visualDirection: "clean",
    soundDirection: "clear",
    productShowcaseRules: ["show product"],
    continuityLock: {
      product: {
        stableAttributes: ["logo"],
        forbiddenChanges: []
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

test("canonical Product Truth confirmation requires READY artifact with matching hash", () => {
  const truth = makeProductTruth();
  const asset = makeAsset();
  assert.doesNotThrow(() =>
    assertCanonicalProductArtifactReady(truth, [asset], [makeArtifact()])
  );

  assert.throws(
    () =>
      assertCanonicalProductArtifactReady(
        truth,
        [asset],
        [makeArtifact("MISSING")]
      ),
    (error: unknown) =>
      error instanceof DomainValidationError &&
      /must be READY/.test(error.message)
  );

  assert.throws(
    () =>
      assertCanonicalProductArtifactReady(
        truth,
        [asset],
        [makeArtifact("READY", H.b)]
      ),
    (error: unknown) =>
      error instanceof DomainValidationError &&
      /matching hash/.test(error.message)
  );
});

test("Script structured revision creates a new DRAFT version and validates beats", () => {
  const current = makeScript();
  const revised = reviseScriptDraft(current, [
    {
      id: "beat-1",
      purpose: "HOOK",
      text: "New hook",
      estimatedDurationMs: 60000,
      requiredFactIds: ["fact-1"]
    }
  ]);
  assert.equal(revised.status, "DRAFT");
  assert.equal(revised.version, current.version + 1);
  assert.notEqual(revised.id, current.id);
  assert.notEqual(revised.contentHash, current.contentHash);
  assert.equal(revised.beats[0]?.purpose, "HOOK");
  assert.equal(revised.confirmedAt, undefined);

  assert.throws(() =>
    reviseScriptDraft(current, [
      {
        purpose: "HOOK",
        text: "",
        estimatedDurationMs: 60000,
        requiredFactIds: []
      }
    ])
  );
});

test("ProductionPlan structured revision creates a new validated version and rejects invalid timeline", () => {
  const current = makePlan();
  const segment = current.scenes[0]!.clips[0]!.segments[0]!;
  const revised = reviseProductionPlanDraft(current, {
    visualDirection: "new visual direction",
    soundDirection: "new sound direction",
    productShowcaseRules: ["hero first"],
    segments: [
      {
        id: segment.id,
        cameraMovement: "slow orbit",
        subjectAction: "rotate product"
      }
    ]
  });

  assert.equal(revised.status, "DRAFT");
  assert.equal(revised.version, current.version + 1);
  assert.notEqual(revised.id, current.id);
  assert.notEqual(revised.contentHash, current.contentHash);
  assert.equal(
    revised.scenes[0]!.clips[0]!.segments[0]!.cameraMovement,
    "slow orbit"
  );
  assert.equal(revised.confirmedAt, undefined);

  assert.throws(() =>
    reviseProductionPlanDraft(current, {
      segments: [{ id: segment.id, endMs: 3000 }]
    })
  );
});

test("old REDO decision does not hide review controls for a new Attempt/output", () => {
  const plan = makePlan();
  const clip = plan.scenes[0]!.clips[0]!;
  const project: Project = {
    id: "project-1",
    name: "UI Review",
    status: "GENERATION_REVIEW",
    targetPlatform: "douyin",
    targetDurationMs: 60000,
    aspectRatio: "9:16",
    currentProductionPlanRef: {
      entityType: "ProductionPlan",
      entityId: plan.id,
      version: plan.version,
      hash: plan.contentHash
    },
    createdAt: ISO,
    updatedAt: ISO
  };

  const artifacts: ArtifactRecord[] = [
    {
      id: "video-old",
      projectId: project.id,
      kind: "GENERATED_VIDEO",
      relativePath: "outputs/old.mp4",
      sha256: H.one,
      sizeBytes: 10,
      mimeType: "video/mp4",
      integrityStatus: "READY",
      immutable: true,
      createdAt: ISO
    },
    {
      id: "video-new",
      projectId: project.id,
      kind: "GENERATED_VIDEO",
      relativePath: "outputs/new.mp4",
      sha256: H.two,
      sizeBytes: 11,
      mimeType: "video/mp4",
      integrityStatus: "READY",
      immutable: true,
      createdAt: ISO
    }
  ];
  const attempts = [
    {
      id: "attempt-old",
      projectId: project.id,
      clipId: clip.id,
      attemptNumber: 1,
      generationRequestId: "request-old",
      requestHash: H.a,
      preflightReportId: "preflight-old",
      userApprovalId: "approval-old",
      approvalHash: H.b,
      submissionFingerprint: H.c,
      status: "SUCCEEDED" as const,
      providerHandle: { externalTaskId: "task-old" },
      commandAttempts: [],
      outputArtifactId: "video-old",
      createdAt: ISO,
      completedAt: ISO
    },
    {
      id: "attempt-new",
      projectId: project.id,
      clipId: clip.id,
      attemptNumber: 2,
      generationRequestId: "request-new",
      requestHash: H.d,
      preflightReportId: "preflight-new",
      userApprovalId: "approval-new",
      approvalHash: H.e,
      submissionFingerprint: H.f,
      status: "SUCCEEDED" as const,
      providerHandle: { externalTaskId: "task-new" },
      commandAttempts: [],
      outputArtifactId: "video-new",
      createdAt: ISO,
      completedAt: ISO
    }
  ];

  const oldRedo: ReviewDecision = {
    id: "review-old",
    projectId: project.id,
    clipId: clip.id,
    clipHash: clip.contentHash,
    generationAttemptId: "attempt-old",
    outputArtifactId: "video-old",
    outputArtifactHash: H.one,
    decision: "REDO",
    decidedAt: ISO
  };

  const html = renderProjectPage({
    kind: "generate",
    workspace: { project, productionPlan: plan },
    blockers: [],
    attempts,
    generationRequests: [],
    preflights: [],
    approvals: [],
    compiledPrompts: [],
    artifacts,
    reviewDecisions: [oldRedo],
    commandAttempts: [],
    probe: {
      code: "DREAMINA_NOT_FOUND",
      cliFound: false,
      providerIdentityHash: H.a,
      capabilityFingerprint: H.b,
      rawStdout: "",
      rawStderr: "missing"
    }
  });

  assert.match(
    html,
    /data-attempt="attempt-new" data-clip="clip-1" data-decision="ACCEPT"/
  );
  assert.match(html, /为此 Clip 运行新 Preflight/);
});

test("GenerationAttempt cards follow current ProductionPlan clip order and isolate historical attempts", () => {
  const plan = makePlan();
  const first = plan.scenes[0]!.clips[0]!;
  const second = structuredClone(first);
  second.id = "clip-2";
  second.contentHash = H.two;
  plan.scenes[0]!.clips = [first, second];

  const project: Project = {
    id: "project-1",
    name: "UI Attempt Order",
    status: "GENERATION_REVIEW",
    targetPlatform: "douyin",
    targetDurationMs: 60000,
    aspectRatio: "9:16",
    currentProductionPlanRef: {
      entityType: "ProductionPlan",
      entityId: plan.id,
      version: plan.version,
      hash: plan.contentHash
    },
    createdAt: ISO,
    updatedAt: ISO
  };

  const baseAttempt = {
    projectId: project.id,
    attemptNumber: 1,
    generationRequestId: "request",
    requestHash: H.a,
    preflightReportId: "preflight",
    userApprovalId: "approval",
    approvalHash: H.b,
    submissionFingerprint: H.c,
    status: "CREATED" as const,
    commandAttempts: [],
    createdAt: ISO
  };
  const attempts = [
    {
      ...baseAttempt,
      id: "attempt-clip-2",
      clipId: second.id
    },
    {
      ...baseAttempt,
      id: "attempt-history",
      clipId: "clip-old"
    },
    {
      ...baseAttempt,
      id: "attempt-clip-1",
      clipId: first.id
    }
  ];

  const html = renderProjectPage({
    kind: "generate",
    workspace: { project, productionPlan: plan },
    blockers: [],
    attempts,
    generationRequests: [],
    preflights: [],
    approvals: [],
    compiledPrompts: [],
    artifacts: [],
    reviewDecisions: [],
    commandAttempts: [],
    probe: {
      code: "DREAMINA_NOT_FOUND",
      cliFound: false,
      providerIdentityHash: H.a,
      capabilityFingerprint: H.b,
      rawStdout: "",
      rawStderr: "missing"
    }
  });

  const clip1Index = html.indexOf("Clip 1 · Attempt #1 · CREATED");
  const clip2Index = html.indexOf("Clip 2 · Attempt #1 · CREATED");
  const historyIndex = html.indexOf("历史/旧计划 Attempt（1）");
  assert.ok(clip1Index >= 0);
  assert.ok(clip2Index > clip1Index);
  assert.ok(historyIndex > clip2Index);
  assert.match(html, /旧计划 · #1 · CREATED/);
  assert.match(html, /此记录不属于当前 ProductionPlan，仅保留为历史审计/);
});
