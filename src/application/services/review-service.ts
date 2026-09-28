import { randomUUID } from "node:crypto";
import type { ArtifactRepository } from "../ports/artifact-repository.js";
import type { GenerationRepository } from "../ports/generation-repository.js";
import type { ReviewRepository } from "../ports/review-repository.js";
import type { WorkflowRepository } from "../ports/workflow-repository.js";
import {
  reviewDecisionSchema,
  type Clip,
  type ReviewDecision
} from "../../domain/schemas.js";
import { DomainValidationError } from "../../domain/validation.js";
import type { ProductFlowService } from "./product-flow.js";

export class ReviewService {
  constructor(
    private readonly productFlow: ProductFlowService,
    private readonly generation: GenerationRepository,
    private readonly workflow: WorkflowRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly review: ReviewRepository
  ) {}

  private latestSuccessfulAttemptForClip(
    attempts: Awaited<ReturnType<WorkflowRepository["listGenerationAttempts"]>>,
    projectId: string,
    clipId: string
  ) {
    return attempts
      .filter(
        (item) =>
          item.projectId === projectId &&
          item.clipId === clipId &&
          (item.status === "SUCCEEDED" ||
            item.status === "RECONCILED_SUCCEEDED")
      )
      .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  }

  private latestUsageDecisionForClip(
    decisions: ReviewDecision[],
    clip: Clip
  ): ReviewDecision | undefined {
    return decisions
      .filter(
        (item) =>
          item.clipId === clip.id &&
          item.clipHash === clip.contentHash &&
          (item.decision === "SKIP" || item.decision === "USE")
      )
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
  }

  private async evaluateCurrentPlan(
    projectId: string,
    clips: Clip[]
  ): Promise<{
    projectStatus: string;
    acceptedClipIds: string[];
    skippedClipIds: string[];
    pendingClipIds: string[];
  }> {
    const attempts = await this.workflow.listGenerationAttempts(projectId);
    const allDecisions = await this.review.listDecisions(projectId);
    const acceptedClipIds: string[] = [];
    const skippedClipIds: string[] = [];
    const pendingClipIds: string[] = [];

    for (const currentClip of clips) {
      const usage = this.latestUsageDecisionForClip(allDecisions, currentClip);
      if (usage?.decision === "SKIP") {
        skippedClipIds.push(currentClip.id);
        continue;
      }

      const currentAttempt = this.latestSuccessfulAttemptForClip(
        attempts,
        projectId,
        currentClip.id
      );
      if (!currentAttempt?.outputArtifactId) {
        pendingClipIds.push(currentClip.id);
        continue;
      }
      const currentArtifact = await this.artifacts.findById(
        currentAttempt.outputArtifactId
      );
      if (
        !currentArtifact ||
        currentArtifact.projectId !== projectId ||
        currentArtifact.kind !== "GENERATED_VIDEO" ||
        currentArtifact.integrityStatus !== "READY" ||
        !currentArtifact.sha256
      ) {
        pendingClipIds.push(currentClip.id);
        continue;
      }
      const matchingReview = allDecisions
        .filter(
          (item) =>
            item.clipId === currentClip.id &&
            item.clipHash === currentClip.contentHash &&
            item.generationAttemptId === currentAttempt.id &&
            item.outputArtifactId === currentArtifact.id &&
            item.outputArtifactHash === currentArtifact.sha256 &&
            (item.decision === "ACCEPT" || item.decision === "REDO")
        )
        .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
      if (matchingReview?.decision === "ACCEPT") {
        acceptedClipIds.push(currentClip.id);
      } else {
        pendingClipIds.push(currentClip.id);
      }
    }

    const openBlockers = await this.workflow.listOpenBlockers(projectId);
    const hasUnknownSubmission = attempts.some(
      (item) =>
        item.status === "SUBMISSION_OUTCOME_UNKNOWN" ||
        item.status === "RECONCILING"
    );
    const allResolved = pendingClipIds.length === 0;
    const canComplete =
      acceptedClipIds.length > 0 &&
      allResolved &&
      !openBlockers.length &&
      !hasUnknownSubmission;
    const project = await this.productFlow.setProjectStatus(
      projectId,
      canComplete ? "READY_TO_ASSEMBLE" : "GENERATION_REVIEW"
    );
    return {
      projectStatus: project.status,
      acceptedClipIds,
      skippedClipIds,
      pendingClipIds
    };
  }

  async decide(input: {
    projectId: string;
    clipId: string;
    generationAttemptId?: string;
    decision: "ACCEPT" | "REDO" | "SKIP" | "USE";
    note?: string;
    now?: Date;
  }): Promise<{
    decision: ReviewDecision;
    projectStatus: string;
    redoClipId?: string;
  }> {
    const now = input.now ?? new Date();
    const workspace = await this.productFlow.getWorkspace(input.projectId);
    if (!workspace?.productionPlan) {
      throw new DomainValidationError("Current ProductionPlan is required");
    }
    const clips = workspace.productionPlan.scenes.flatMap((scene) => scene.clips);
    const clip = clips.find((item) => item.id === input.clipId);
    if (!clip) {
      throw new DomainValidationError("Review clip is not in current ProductionPlan");
    }

    if (input.decision === "SKIP" || input.decision === "USE") {
      const decision = reviewDecisionSchema.parse({
        id: randomUUID(),
        projectId: input.projectId,
        clipId: clip.id,
        clipHash: clip.contentHash,
        decision: input.decision,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        decidedAt: now.toISOString()
      });
      await this.review.createDecision(decision);
      const state = await this.evaluateCurrentPlan(input.projectId, clips);
      return { decision, projectStatus: state.projectStatus };
    }

    if (!input.generationAttemptId) {
      throw new DomainValidationError(
        `${input.decision} requires generationAttemptId`
      );
    }

    const attempt = await this.workflow.getGenerationAttempt(
      input.generationAttemptId
    );
    if (!attempt || attempt.projectId !== input.projectId) {
      throw new DomainValidationError("GenerationAttempt not found in project");
    }
    if (attempt.clipId !== clip.id) {
      throw new DomainValidationError("GenerationAttempt clip mismatch");
    }
    if (
      attempt.status !== "SUCCEEDED" &&
      attempt.status !== "RECONCILED_SUCCEEDED"
    ) {
      throw new DomainValidationError(
        `Only successful attempt can be reviewed, got ${attempt.status}`
      );
    }
    if (!attempt.outputArtifactId) {
      throw new DomainValidationError("Successful attempt has no output Artifact");
    }
    const artifact = await this.artifacts.findById(attempt.outputArtifactId);
    if (
      !artifact ||
      artifact.projectId !== input.projectId ||
      artifact.kind !== "GENERATED_VIDEO" ||
      artifact.integrityStatus !== "READY" ||
      !artifact.sha256
    ) {
      throw new DomainValidationError("Output video Artifact is not READY");
    }

    const attempts = await this.workflow.listGenerationAttempts(input.projectId);
    const currentSuccessfulAttempt = this.latestSuccessfulAttemptForClip(
      attempts,
      input.projectId,
      clip.id
    );
    if (
      !currentSuccessfulAttempt ||
      currentSuccessfulAttempt.id !== attempt.id ||
      currentSuccessfulAttempt.outputArtifactId !== artifact.id
    ) {
      throw new DomainValidationError(
        "ReviewDecision must target the current latest successful output for this Clip"
      );
    }

    const decision = reviewDecisionSchema.parse({
      id: randomUUID(),
      projectId: input.projectId,
      clipId: clip.id,
      clipHash: clip.contentHash,
      generationAttemptId: attempt.id,
      outputArtifactId: artifact.id,
      outputArtifactHash: artifact.sha256,
      decision: input.decision,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      decidedAt: now.toISOString()
    });
    await this.review.createDecision(decision);

    if (input.decision === "REDO") {
      await this.generation.markSubmissionChainStale(
        input.projectId,
        now.toISOString()
      );
      const project = await this.productFlow.setProjectStatus(
        input.projectId,
        "GENERATION_REVIEW"
      );
      return {
        decision,
        projectStatus: project.status,
        redoClipId: clip.id
      };
    }
    const state = await this.evaluateCurrentPlan(input.projectId, clips);
    return { decision, projectStatus: state.projectStatus };
  }

  async finalizeUsingAcceptedClips(input: {
    projectId: string;
    now?: Date;
  }): Promise<{
    projectStatus: string;
    acceptedClipIds: string[];
    skippedClipIds: string[];
    pendingClipIds: string[];
  }> {
    const now = input.now ?? new Date();
    const workspace = await this.productFlow.getWorkspace(input.projectId);
    if (!workspace?.productionPlan) {
      throw new DomainValidationError("Current ProductionPlan is required");
    }
    const clips = workspace.productionPlan.scenes.flatMap((scene) => scene.clips);
    const before = await this.evaluateCurrentPlan(input.projectId, clips);
    if (!before.acceptedClipIds.length) {
      throw new DomainValidationError(
        "At least one accepted Clip is required before continuing with a partial selection"
      );
    }

    const decisions = await this.review.listDecisions(input.projectId);
    for (const clip of clips) {
      if (before.acceptedClipIds.includes(clip.id)) continue;
      const latestUsage = this.latestUsageDecisionForClip(decisions, clip);
      if (latestUsage?.decision === "SKIP") continue;
      await this.review.createDecision(
        reviewDecisionSchema.parse({
          id: randomUUID(),
          projectId: input.projectId,
          clipId: clip.id,
          clipHash: clip.contentHash,
          decision: "SKIP",
          note: "用户选择使用当前已接受片段进入下一步；此 Clip 不纳入当前成片。",
          decidedAt: now.toISOString()
        })
      );
    }

    return this.evaluateCurrentPlan(input.projectId, clips);
  }
}
