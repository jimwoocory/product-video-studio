import test from "node:test";
import assert from "node:assert/strict";
import { ApplicationSmartProduction } from "../src/application/services/smart-production-adapter.js";
import { SmartFlowPause } from "../src/application/ports/smart-production.js";
import type { SmartGenerationRun } from "../src/domain/smart-generation.js";
import { makeProductTruth, makeValidClip, H, ISO } from "./fixtures.js";

function harness(input: { enabled: boolean; eligible: boolean }) {
  const projectId = "project-smart-visual";
  const clip = { ...makeValidClip(), id: "clip-smart-visual" };
  const truth = { ...makeProductTruth(), projectId };
  const project = {
    id: projectId,
    name: "smart visual fixture",
    status: "GENERATION_REVIEW",
    targetPlatform: "douyin",
    targetDurationMs: 8000,
    aspectRatio: "9:16",
    createdAt: ISO,
    updatedAt: ISO
  };
  const plan = {
    id: "plan-smart-visual",
    projectId,
    version: 1,
    status: "CONFIRMED",
    productTruthRef: { entityType: "ProductTruth", entityId: truth.id, version: truth.version, hash: truth.contentHash },
    scriptRef: { entityType: "ScriptDraft", entityId: "script", version: 1, hash: H.a },
    selectedCreativeId: "creative",
    visualDirection: "fixture",
    soundDirection: "fixture",
    productShowcaseRules: [],
    continuityLock: { product: { forbiddenChanges: truth.forbiddenChanges }, characters: [], environments: [] },
    scenes: [{ id: "scene", order: 1, purpose: "fixture", location: "studio", visualState: "stable", stableElements: [], sourceBeatIds: [], requiredFactIds: [], clips: [clip] }],
    contentHash: H.b,
    confirmedAt: ISO
  };
  const workspace = { project, productTruth: truth, productionPlan: plan };
  const attempt = {
    id: "attempt-smart-visual",
    projectId,
    clipId: clip.id,
    attemptNumber: 1,
    status: "SUCCEEDED",
    outputArtifactId: "video-smart-visual"
  };
  const decisions: any[] = [];
  let visualCalls = 0;
  const service = new ApplicationSmartProduction({
    productFlow: {
      async getWorkspace() { return workspace; }
    },
    review: {
      async listDecisions() { return decisions; }
    },
    workflow: {
      async listGenerationAttempts() { return [attempt]; }
    },
    visualReview: {
      async assess() {
        visualCalls++;
        return {
          artifactId: "visual-artifact",
          artifactHash: H.c,
          selectedWindow: { index: 0, inMs: 0, outMs: clip.durationMs },
          assessment: {
            contentHash: H.d,
            evaluatorVersion: "p1f06-visual-edit-v1",
            autoAcceptEligible: input.eligible,
            status: input.eligible ? "PASS" : "UNCERTAIN",
            confidence: input.eligible ? "HIGH" : "MEDIUM",
            reasons: [input.eligible ? "all gates pass" : "identity uncertain"]
          }
        };
      }
    },
    reviewService: {
      async decide(value: any) {
        decisions.push({
          id: "review-ai",
          projectId,
          clipId: clip.id,
          clipHash: clip.contentHash,
          generationAttemptId: attempt.id,
          outputArtifactId: attempt.outputArtifactId,
          outputArtifactHash: H.e,
          decision: value.decision,
          source: value.source,
          visualAssessment: value.visualAssessment,
          decidedAt: ISO
        });
        project.status = "READY_TO_ASSEMBLE";
        return { decision: decisions.at(-1), projectStatus: project.status };
      }
    }
  } as any);
  const run = {
    id: "run-smart-visual",
    projectId,
    attemptIds: [attempt.id],
    options: {
      autoSelectLowRiskClips: input.enabled
    }
  } as unknown as SmartGenerationRun;
  return { service, run, decisions, getVisualCalls: () => visualCalls };
}

test("smart run only auto-accepts after explicit opt-in and a high-confidence visual gate", async () => {
  const h = harness({ enabled: true, eligible: true });
  await h.service.reviewClips(h.run);
  assert.equal(h.getVisualCalls(), 1);
  assert.equal(h.decisions.length, 1);
  assert.equal(h.decisions[0]!.source, "AI_VISUAL_GATE");
  assert.equal(h.decisions[0]!.decision, "ACCEPT");
  assert.equal(h.decisions[0]!.visualAssessment.evaluatorVersion, "p1f06-visual-edit-v1");
});

test("smart run falls back to human review when visual evidence is uncertain", async () => {
  const h = harness({ enabled: true, eligible: false });
  await assert.rejects(
    h.service.reviewClips(h.run),
    (error: unknown) =>
      error instanceof SmartFlowPause &&
      error.code === "VISUAL_REVIEW_REQUIRED" &&
      error.status === "WAITING_FOR_CLIP_REVIEW"
  );
  assert.equal(h.getVisualCalls(), 1);
  assert.equal(h.decisions.length, 0);
});

test("smart run never invokes visual auto-review unless the user explicitly enabled it", async () => {
  const h = harness({ enabled: false, eligible: true });
  await assert.rejects(
    h.service.reviewClips(h.run),
    (error: unknown) =>
      error instanceof SmartFlowPause &&
      error.code === "OUTPUT_REVIEW_REQUIRED"
  );
  assert.equal(h.getVisualCalls(), 0);
  assert.equal(h.decisions.length, 0);
});
