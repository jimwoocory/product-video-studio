import { hashValue } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";
import type { SmartGenerationRun, WorkspaceBinding } from "../../domain/smart-generation.js";
import { SmartFlowPause, type SmartProduction } from "../ports/smart-production.js";
import type { ProductInputStore } from "../ports/product-input-store.js";
import type { ArtifactRepository } from "../ports/artifact-repository.js";
import type { GenerationRepository } from "../ports/generation-repository.js";
import type { WorkflowRepository } from "../ports/workflow-repository.js";
import type { ReviewRepository } from "../ports/review-repository.js";
import type { FinalOutputRepository } from "../ports/final-output-repository.js";
import type { ProductFlowService, ProjectWorkspace } from "./product-flow.js";
import type { AiGenerationService } from "./ai-generation.js";
import type { ProductDirectorService } from "./product-director.js";
import type { ResearchService } from "./research-service.js";
import type { ReferenceVideoAnalysisService } from "./reference-video-analysis.js";
import type { GenerationPreflightService, RunPreflightResult } from "./generation-preflight.js";
import type { DreaminaAgentCapabilityService } from "./dreamina-agent-capability.js";
import type { ApprovalService } from "./approval-service.js";
import type { GenerationExecutionService } from "./generation-execution.js";
import type { BatchGenerationService } from "./batch-generation-service.js";
import type { RenderEngine } from "./render-engine.js";
import type { TimelineService } from "./timeline-service.js";
import { assertCanonicalProductArtifactReady, confirmProductionPlanDraft, confirmScriptDraft } from "./review-actions.js";
import { resolveDirectorGenerationTarget, assertDirectorSettingsMatch } from "./director-generation-target.js";
import { validateReferenceImagesForPreflight } from "../../adapters/media/reference-image-validator.js";
import { AutoEditBlocked } from "../../domain/auto-edit.js";
import {CreativeReferenceService} from "./creative-reference-service.js";
import {referenceSetRef} from "./creative-reference-binding.js";
import type { ReviewService } from "./review-service.js";
import type { VisualEditAssessmentService } from "./visual-edit-assessment.js";

type Ref = NonNullable<SmartGenerationRun["truthRef"]>;
function ref(entityType: string, value: { id: string; version: number; contentHash: string }): Ref {
  return { entityType, entityId: value.id, version: value.version, hash: value.contentHash };
}
export function workspaceBinding(workspace: ProjectWorkspace): WorkspaceBinding {
  const p = workspace.project;
  return { productTruthRef: p.currentProductTruthRef, creativeBatchRef: p.currentCreativeBatchRef,
    selectedCreativeId: p.selectedCreativeId, scriptRef: p.currentScriptRef, productionPlanRef: p.currentProductionPlanRef };
}
function equal(a: unknown, b: unknown) { return hashValue(a ?? null) === hashValue(b ?? null); }
function scopeHash(scope: NonNullable<SmartGenerationRun["paidScope"]>) { return hashValue({ planRef: scope.planRef, requests: scope.requests }); }

export type SmartProductionDependencies = {
  productFlow: ProductFlowService; productInput: ProductInputStore; artifacts: ArtifactRepository;
  aiGeneration: AiGenerationService; productDirector: ProductDirectorService;
  referenceVideo: ReferenceVideoAnalysisService; research: ResearchService;
  generation: GenerationRepository; workflow: WorkflowRepository; review: ReviewRepository;
  dreaminaCapability: DreaminaAgentCapabilityService; preflight: GenerationPreflightService;
  approval: ApprovalService; execution: GenerationExecutionService; batchGeneration: BatchGenerationService;
  finalOutput: FinalOutputRepository; renderEngine: RenderEngine; projectsRoot: string;
  timeline?: Pick<TimelineService, "latestTimeline">;
  creativeReferences?: CreativeReferenceService;
  reviewService?: Pick<ReviewService, "decide">;
  visualReview?: VisualEditAssessmentService;
  preflightAudit: (projectId: string, result: RunPreflightResult) => Promise<void>;
  autoEdit?: (run: SmartGenerationRun) => ReturnType<SmartProduction["autoEdit"]>;
};

/** Bridge to the established P1 services, not a second generation/approval implementation. */
export class ApplicationSmartProduction implements SmartProduction {
  constructor(private readonly d: SmartProductionDependencies) {}
  private async workspace(projectId: string) {
    const workspace = await this.d.productFlow.getWorkspace(projectId);
    if (!workspace) throw new DomainValidationError("项目不存在");
    return workspace;
  }
  async initial(projectId: string) {
    const w = await this.workspace(projectId);
    return { targetDurationMs: w.project.targetDurationMs, binding: workspaceBinding(w) };
  }
  async sources(run: SmartGenerationRun) {
    const w = await this.workspace(run.projectId);
    const truth = w.productTruth;
    if (!truth || truth.status !== "CONFIRMED") throw new SmartFlowPause("WAITING_FOR_TRUTH_REVIEW", "TRUTH_REVIEW_REQUIRED", "请先在产品事实页确认事实与使用规则，再恢复本任务");
    if ((truth.usageRules ?? []).some((r) => r.status === "UNVERIFIED" && !r.dispositionConfirmedByUser)) throw new SmartFlowPause("WAITING_FOR_TRUTH_REVIEW", "USAGE_REVIEW_REQUIRED", "存在尚未处理的使用规则，需要用户审核");
    const material = await this.d.productInput.latest(run.projectId);
    if (!material) throw new SmartFlowPause("BLOCKED", "PRODUCT_INPUT_MISSING", "请先保存产品资料和产品主图");
    assertCanonicalProductArtifactReady(truth, material.assets, await this.d.artifacts.listByProject(run.projectId));
    const references=await this.d.creativeReferences?.current(run.projectId);
    if (run.options.useResearchReferences&&!references) throw new SmartFlowPause("WAITING_FOR_REFERENCE_REVIEW", "CREATIVE_REFERENCE_SET_NOT_READY", "请先在创作参考素材池明确确认本轮参考；未审核图片不能进入生成");
    const profile = await this.d.referenceVideo.latest(run.projectId);
    const brief = run.options.useExistingResearch ? (await this.d.research.pageData(run.projectId)).brief : undefined;
    if (run.options.useExistingResearch && (!brief || brief.status !== "READY")) throw new SmartFlowPause("BLOCKED", "RESEARCH_NOT_READY", "已选择使用研究内容，但当前没有可用研究简报");
    if (brief) {
      const reviewedStatements = new Set([
        ...truth.confirmedFeatures.map((f) => f.statement), ...truth.sellingPoints.map((f) => f.statement),
        ...truth.uncertainClaims.filter((c) => c.dispositionConfirmedByUser).map((c) => c.statement),
        ...(truth.usageRules ?? []).filter((r) => r.dispositionConfirmedByUser || r.status === "CONFIRMED").map((r) => r.statement)
      ]);
      if ([...brief.candidateClaims, ...brief.usageRules].some((c) => c.status !== "REJECTED" && !reviewedStatements.has(c.statement))) {
        throw new SmartFlowPause("WAITING_FOR_TRUTH_REVIEW", "RESEARCH_CANDIDATES_UNREVIEWED", "研究含新事实或使用规则候选；请送入产品事实审核并明确处理后再恢复，不会静默提升为事实");
      }
    }
    return { truthRef: ref("ProductTruth", truth), assetsHash: material.contentHash,
      ...(profile?.status === "ACTIVE" ? { referenceVideoProfile: profile } : {}),
      creativeContext: { requestText: run.options.requestText, ...(references?{references}:{}), ...(brief ? { research: {
        briefId: brief.id, contentHash: brief.contentHash, contentOpportunities: brief.contentOpportunities,
        uncertainties: brief.uncertainties, rule: "STRUCTURE_ONLY_NOT_PRODUCT_FACTS" as const
      } } : {}) }, expectedWorkspace: workspaceBinding(w) };
  }
  private async assertSources(run: SmartGenerationRun, w: ProjectWorkspace) {
    await this.d.creativeReferences?.assertExpected(run.projectId,referenceSetRef(run.creativeContext?.references));
    if (!w.productTruth || w.productTruth.status !== "CONFIRMED" || !equal(run.truthRef, ref("ProductTruth", w.productTruth)) || w.project.targetDurationMs !== run.targetDurationMs) {
      throw new SmartFlowPause("BLOCKED", "SOURCE_CHANGED", "产品事实或目标时长已改变；请取消旧任务并重新规划，旧付费范围不扩展", false);
    }
    const input = await this.d.productInput.latest(run.projectId);
    if (input?.contentHash !== run.assetsHash) throw new SmartFlowPause("BLOCKED", "ASSETS_CHANGED", "产品素材已变化，旧任务不可继续使用旧审批", false);
    const profile = await this.d.referenceVideo.latest(run.projectId);
    if (!equal(run.referenceVideoProfile?.contentHash, profile?.status === "ACTIVE" ? profile.contentHash : undefined)) throw new SmartFlowPause("BLOCKED", "REFERENCE_CHANGED", "参考视频已变化，请重新规划", false);
    if (run.creativeContext?.research) {
      const brief = (await this.d.research.pageData(run.projectId)).brief;
      if (!brief || brief.status !== "READY" || brief.id !== run.creativeContext.research.briefId || brief.contentHash !== run.creativeContext.research.contentHash) throw new SmartFlowPause("BLOCKED", "RESEARCH_CHANGED", "研究来源已变化，需要重新审核与规划", false);
    }
  }
  async assertCurrent(run: SmartGenerationRun) {
    const w = await this.workspace(run.projectId);
    await this.assertSources(run, w);
    if (!equal(workspaceBinding(w), run.expectedWorkspace)) throw new SmartFlowPause("BLOCKED", "WORKSPACE_CHANGED", "标准流程已更新创意、脚本或分镜；本任务暂停，避免覆盖新版本", false);
  }
  async creative(run: SmartGenerationRun) {
    const w = await this.workspace(run.projectId);
    return this.d.aiGeneration.generateCreativeBatch(w.productTruth!, await this.d.productFlow.nextVersion(run.projectId, "CreativeBatch", "creative-batch"), run.targetDurationMs, run.referenceVideoProfile, run.creativeContext);
  }
  async script(run: SmartGenerationRun) {
    const w = await this.workspace(run.projectId);
    return this.d.aiGeneration.generateScriptDraft({ truth: w.productTruth!, batch: run.creativeBatch!,
      selectedCreativeId: run.selectedCreativeId!, version: await this.d.productFlow.nextVersion(run.projectId, "ScriptDraft", "script"),
      targetDurationMs: run.targetDurationMs, referenceVideoProfile: run.referenceVideoProfile, creativeContext: run.creativeContext });
  }
  async director(run: SmartGenerationRun) {
    const w = await this.workspace(run.projectId);
    const generationTarget = resolveDirectorGenerationTarget(await this.d.dreaminaCapability.registry(), run.options.generationSettings);
    return this.d.productDirector.generate({ productTruth: w.productTruth!, creativeBatch: run.creativeBatch!,
      selectedCreativeId: run.selectedCreativeId!, script: run.script!, generationTarget,
      projectTargetDurationMs: run.targetDurationMs, productionPlanVersion: await this.d.productFlow.nextVersion(run.projectId, "ProductionPlan", "production-plan"),
      referenceVideoProfile: run.referenceVideoProfile, creativeContext: run.creativeContext });
  }
  async confirmScript(run: SmartGenerationRun) {
    const w = await this.workspace(run.projectId);
    if (!run.script) throw new DomainValidationError("脚本尚未生成");
    await this.d.aiGeneration.assertScriptUsageCompliance(w.productTruth!, run.script);
    return confirmScriptDraft(run.script);
  }
  async confirmPlan(run: SmartGenerationRun) {
    const w = await this.workspace(run.projectId);
    if (!run.productionPlan?.generationTarget) throw new DomainValidationError("模型感知分镜尚未准备");
    await this.d.productDirector.assertPlanUsageCompliance(w.productTruth!, run.productionPlan);
    assertDirectorSettingsMatch(run.productionPlan.generationTarget, run.options.generationSettings);
    return confirmProductionPlanDraft(run.productionPlan);
  }
  async install(run: SmartGenerationRun): Promise<WorkspaceBinding> {
    const w = await this.workspace(run.projectId);
    await this.assertSources(run, w);
    const desired: WorkspaceBinding = { ...run.expectedWorkspace };
    switch (run.pendingInstall) {
      case "CREATIVE": desired.creativeBatchRef = ref("CreativeBatch", run.creativeBatch!); desired.selectedCreativeId = undefined; desired.scriptRef = undefined; desired.productionPlanRef = undefined; break;
      case "SELECT_CREATIVE": desired.selectedCreativeId = run.selectedCreativeId; desired.scriptRef = undefined; desired.productionPlanRef = undefined; break;
      case "SCRIPT": case "CONFIRM_SCRIPT": desired.scriptRef = ref("ScriptDraft", run.script!); desired.productionPlanRef = undefined; break;
      case "DIRECTOR": case "CONFIRM_PLAN": desired.productionPlanRef = ref("ProductionPlan", run.productionPlan!); break;
      default: throw new DomainValidationError("没有待接入的阶段结果");
    }
    const current = workspaceBinding(w);
    if (equal(current, desired)) return current; // Recover commit-before-checkpoint without duplicating versions.
    if (!equal(current, run.expectedWorkspace)) throw new SmartFlowPause("BLOCKED", "WORKSPACE_CHANGED", "版本链被其他操作更新，不会覆盖当前工作", false);
    switch (run.pendingInstall) {
      case "CREATIVE": await this.d.productFlow.activateCreativeBatch(run.creativeBatch!); break;
      case "SELECT_CREATIVE": await this.d.productFlow.selectCreative(run.projectId, run.selectedCreativeId!); break;
      case "SCRIPT": await this.d.productFlow.saveScriptDraft(run.script!); break;
      case "CONFIRM_SCRIPT": await this.d.productFlow.confirmScript(run.script!); break;
      case "DIRECTOR": await this.d.productFlow.saveProductionPlanDraft(run.productionPlan!); break;
      case "CONFIRM_PLAN": await this.d.productFlow.confirmProductionPlan(run.productionPlan!); break;
    }
    const installed = workspaceBinding(await this.workspace(run.projectId));
    if (!equal(installed, desired)) throw new SmartFlowPause("BLOCKED", "INSTALL_CONFLICT", "保存后的版本链不匹配，需要人工核查", false);
    return installed;
  }

  async preparePaidScope(run: SmartGenerationRun) {
    await this.assertCurrent(run);
    const w = await this.workspace(run.projectId), material = await this.d.productInput.latest(run.projectId);
    if (!w.productTruth || !w.creativeBatch || !w.script || !w.productionPlan || !material) throw new DomainValidationError("生产链不完整");
    const ids = w.productionPlan.scenes.flatMap((s) => s.clips.flatMap((c) => c.referenceAssets.map((a) => a.assetId)));
    const valid = await validateReferenceImagesForPreflight({ projectsRoot: this.d.projectsRoot, projectId: run.projectId,
      confirmedReferenceAssets: CreativeReferenceService.assets(await this.d.creativeReferences?.assertExpected(run.projectId,w.productionPlan.creativeReferenceSetRef)??null),
      snapshot: material, artifacts: this.d.artifacts, requiredAssetIds: ids });
    const result = await this.d.preflight.run({ projectId: run.projectId, productTruth: w.productTruth, creativeBatch: w.creativeBatch,
      script: w.script, productionPlan: w.productionPlan, assets: material.assets, generationSettings: run.options.generationSettings,
      inputBlockers: valid.blockers, acceptedDuplicateSubmissionRisk: false });
    await this.d.preflightAudit(run.projectId, result);
    if (result.reports.some((r) => r.status !== "PASS")) throw new SmartFlowPause("BLOCKED", "PREFLIGHT_BLOCKED", result.reports.flatMap((r) => r.blockers).join("；") || "生成前检查未通过");
    const requests = result.requests.map((r) => {
      const report = result.reports.find((p) => p.generationRequestId === r.id)!;
      return { requestId: r.id, requestHash: r.requestHash, preflightId: report.id, preflightHash: report.reportHash,
        costStatus: report.costEstimate.status, estimatedCredits: report.costEstimate.estimatedCredits, costText: report.costEstimate.estimatedCostText };
    }).sort((a, b) => a.requestId.localeCompare(b.requestId));
    const scope = { hash: "0".repeat(64), planRef: ref("ProductionPlan", w.productionPlan), requests, preparedAt: new Date().toISOString() };
    return { ...scope, hash: scopeHash(scope) };
  }
  async validatePaidScope(run: SmartGenerationRun) {
    await this.assertCurrent(run);
    const scope = run.paidScope;
    if (!scope || scopeHash(scope) !== scope.hash || !run.productionPlan || !equal(scope.planRef, ref("ProductionPlan", run.productionPlan))) throw new DomainValidationError("付费范围校验失败");
    const [requests, reports, registry] = await Promise.all([this.d.generation.listCurrentGenerationRequests(run.projectId), this.d.generation.listPreflightReports(run.projectId), this.d.dreaminaCapability.registry()]);
    if (registry.registryFingerprint !== run.productionPlan.generationTarget?.registryFingerprint) throw new SmartFlowPause("BLOCKED", "CAPABILITY_CHANGED", "即梦能力在确认前后发生变化，请重新规划，不复用旧授权", false);
    const planned = new Set(run.productionPlan.scenes.flatMap((s) => s.clips.map((c) => c.id)));
    const found = new Set<string>();
    for (const bound of scope.requests) {
      const request = requests.find((r) => r.id === bound.requestId), report = reports.find((r) => r.id === bound.preflightId);
      if (!request || !report || report.status !== "PASS" || request.requestHash !== bound.requestHash || report.reportHash !== bound.preflightHash || report.requestHash !== request.requestHash || report.generationRequestId !== request.id ||
          !request.inputVersionRefs.some((r) => equal(r, scope.planRef)) || !planned.has(request.clipId) || found.has(request.clipId) ||
          (report.costEstimate.expiresAt && Date.parse(report.costEstimate.expiresAt) <= Date.now())) throw new SmartFlowPause("BLOCKED", "PAID_SCOPE_STALE", "镜头、预检或成本范围已失效；不会使用旧确认执行新请求", false);
      found.add(request.clipId);
    }
    if (found.size !== planned.size) throw new DomainValidationError("付费范围没有精确覆盖当前导演镜头");
  }
  async approve(run: SmartGenerationRun) {
    if (!run.consent || run.consent.scopeHash !== run.paidScope?.hash) throw new DomainValidationError("缺少本次明确付费确认");
    const approved = await this.d.approval.approveCurrentRequests({ projectId: run.projectId,
      generationRequestIds: run.paidScope.requests.map((r) => r.requestId), acceptedUnknownCostRisk: run.consent.acceptedUnknownCostRisk,
      acceptedDuplicateSubmissionRisk: false, reuseMatchingApprovals: true });
    return approved.attempts.map((a) => a.id);
  }
  async generate(run: SmartGenerationRun) {
    if (!run.consent || run.consent.scopeHash !== run.paidScope?.hash || !run.attemptIds.length) throw new DomainValidationError("生成任务缺少独立授权与尝试记录");
    let attempts = await this.d.workflow.listGenerationAttempts(run.projectId);
    const scoped = attempts.filter((a) => run.attemptIds.includes(a.id));
    if (scoped.length !== run.attemptIds.length) throw new DomainValidationError("生成尝试记录不完整");
    const created = scoped.filter((a) => a.status === "CREATED");
    if (created.length) {
      await this.validatePaidScope(run);
      const preview = await this.d.batchGeneration.preview(run.projectId, created.map((a) => a.id));
      await this.d.batchGeneration.submit({ projectId: run.projectId, attemptIds: created.map((a) => a.id), scopeHash: preview.scopeHash });
    }
    for (const id of run.attemptIds) {
      let attempt = await this.d.workflow.getGenerationAttempt(id);
      if (!attempt) continue;
      if (["SUBMITTED", "PROCESSING"].includes(attempt.status)) attempt = await this.d.execution.pollAttempt(id);
      if (["SUCCEEDED", "RECONCILED_SUCCEEDED"].includes(attempt.status) && !attempt.outputArtifactId) await this.d.execution.downloadAttempt(id);
    }
    attempts = (await this.d.workflow.listGenerationAttempts(run.projectId)).filter((a) => run.attemptIds.includes(a.id));
    if (attempts.some((a) => ["SUBMITTED", "PROCESSING"].includes(a.status))) return { done: false };
    if (attempts.some((a) => ["SUBMITTING", "SUBMISSION_OUTCOME_UNKNOWN", "RECONCILING"].includes(a.status))) throw new SmartFlowPause("BLOCKED", "RECONCILE_REQUIRED", "有镜头提交结果未知，先在视频生成页调和；不会自动重提");
    if (attempts.some((a) => a.status === "CREATED")) throw new SmartFlowPause("BLOCKED", "SUBMISSION_BLOCKED", "部分镜头尚未提交，请查看视频生成页的审批或能力错误");
    if (attempts.some((a) => ["SUCCEEDED", "RECONCILED_SUCCEEDED"].includes(a.status) && !a.outputArtifactId)) throw new SmartFlowPause("BLOCKED", "DOWNLOAD_REQUIRED", "视频已生成但下载尚未成功，可恢复下载，不会重新付费生成");
    return { done: true };
  }
  async reviewClips(run: SmartGenerationRun) {
    let w = await this.workspace(run.projectId);
    let decisions = await this.d.review.listDecisions(run.projectId);
    const acceptedRunOutput = () =>
      decisions.some(
        r =>
          r.decision === "ACCEPT" &&
          r.generationAttemptId &&
          run.attemptIds.includes(r.generationAttemptId)
      );
    if (w.project.status === "READY_TO_ASSEMBLE") {
      if (!acceptedRunOutput()) {
        throw new SmartFlowPause(
          "WAITING_FOR_CLIP_REVIEW",
          "NO_ACCEPTED_RUN_OUTPUT",
          "本任务没有已采用的生成结果"
        );
      }
      return;
    }
    if (!run.options.autoSelectLowRiskClips) {
      throw new SmartFlowPause(
        "WAITING_FOR_CLIP_REVIEW",
        "OUTPUT_REVIEW_REQUIRED",
        "请在视频生成页采用或跳过镜头。只有你在创建任务时明确启用“高置信视觉自动采用”，系统才会尝试自动审片"
      );
    }
    if (!this.d.visualReview || !this.d.reviewService || !w.productTruth || !w.productionPlan) {
      throw new SmartFlowPause(
        "WAITING_FOR_CLIP_REVIEW",
        "VISUAL_REVIEW_NOT_READY",
        "视觉审片服务未准备好，请改为人工审片"
      );
    }

    const allAttempts = (await this.d.workflow.listGenerationAttempts(run.projectId))
      .filter(a => run.attemptIds.includes(a.id));
    const planClips = w.productionPlan.scenes
      .flatMap(scene => scene.clips)
      .sort((a, b) => a.order - b.order);
    const pending: Array<{
      clip: (typeof planClips)[number];
      attempt: (typeof allAttempts)[number];
      assessment: Awaited<ReturnType<VisualEditAssessmentService["assess"]>>;
    }> = [];

    for (const clip of planClips) {
      const usage = decisions
        .filter(
          d =>
            d.clipId === clip.id &&
            d.clipHash === clip.contentHash &&
            (d.decision === "SKIP" || d.decision === "USE")
        )
        .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
      if (usage?.decision === "SKIP") continue;

      const attempt = allAttempts
        .filter(
          a =>
            a.clipId === clip.id &&
            ["SUCCEEDED", "RECONCILED_SUCCEEDED"].includes(a.status) &&
            Boolean(a.outputArtifactId)
        )
        .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
      if (!attempt?.outputArtifactId) {
        throw new SmartFlowPause(
          "WAITING_FOR_CLIP_REVIEW",
          "OUTPUT_REVIEW_REQUIRED",
          "仍有镜头没有本轮可审的成功视频，请先处理生成结果"
        );
      }
      const existing = decisions
        .filter(
          d =>
            d.clipId === clip.id &&
            d.clipHash === clip.contentHash &&
            d.generationAttemptId === attempt.id &&
            d.outputArtifactId === attempt.outputArtifactId &&
            (d.decision === "ACCEPT" || d.decision === "REDO")
        )
        .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
      if (existing?.decision === "ACCEPT") continue;
      if (existing?.decision === "REDO") {
        throw new SmartFlowPause(
          "WAITING_FOR_CLIP_REVIEW",
          "REDO_ALREADY_REQUESTED",
          "已有镜头明确要求重做，视觉 AI 不会覆盖人工重做决定"
        );
      }

      let assessment;
      try {
        assessment = await this.d.visualReview.assess({
          projectId: run.projectId,
          truth: w.productTruth,
          clip,
          attemptId: attempt.id,
          outputArtifactId: attempt.outputArtifactId
        });
      } catch (error) {
        throw new SmartFlowPause(
          "WAITING_FOR_CLIP_REVIEW",
          "VISUAL_REVIEW_UNAVAILABLE",
          "视觉 AI 无法可靠完成审片：" +
            (error instanceof Error ? error.message : String(error)) +
            "；已转回人工审片"
        );
      }
      if (!assessment.assessment.autoAcceptEligible) {
        throw new SmartFlowPause(
          "WAITING_FOR_CLIP_REVIEW",
          "VISUAL_REVIEW_REQUIRED",
          "视觉 AI 未达到自动采用门槛（" +
            assessment.assessment.status +
            "/" +
            assessment.assessment.confidence +
            "）：" +
            assessment.assessment.reasons.join("；") +
            "。请人工播放完整视频决定采用或重做"
        );
      }
      pending.push({ clip, attempt, assessment });
    }

    // Assess the full outstanding set first. Only then persist AI ACCEPT decisions.
    for (const item of pending) {
      await this.d.reviewService.decide({
        projectId: run.projectId,
        clipId: item.clip.id,
        generationAttemptId: item.attempt.id,
        decision: "ACCEPT",
        source: "AI_VISUAL_GATE",
        visualAssessment: {
          artifactId: item.assessment.artifactId,
          artifactHash: item.assessment.artifactHash,
          assessmentContentHash: item.assessment.assessment.contentHash,
          evaluatorVersion: item.assessment.assessment.evaluatorVersion
        },
        note:
          "用户已在一键成片任务中明确启用高置信视觉自动采用；产品身份、稳定性、使用约束、画质和剪辑窗口均通过视觉门禁"
      });
    }

    w = await this.workspace(run.projectId);
    decisions = await this.d.review.listDecisions(run.projectId);
    if (w.project.status !== "READY_TO_ASSEMBLE" || !acceptedRunOutput()) {
      throw new SmartFlowPause(
        "WAITING_FOR_CLIP_REVIEW",
        "OUTPUT_REVIEW_REQUIRED",
        "视觉门禁完成后仍有镜头未形成当前有效采用/跳过决定，请人工复核"
      );
    }
  }
  async autoEdit(run: SmartGenerationRun) {
    if (!this.d.autoEdit) throw new SmartFlowPause("BLOCKED", "AUTO_EDIT_NOT_READY", "自动剪辑、字幕和音轨集成尚未完成；现有手动时间线可用");
    try { return await this.d.autoEdit(run); }
    catch (error) {
      if (error instanceof AutoEditBlocked) throw new SmartFlowPause(error.audioRequired ? "WAITING_FOR_AUDIO" : "BLOCKED", error.code, error.message);
      throw error;
    }
  }
  async adoptTimeline(run: SmartGenerationRun, input: { id: string; hash: string }) {
    const timeline = await this.d.timeline?.latestTimeline(run.projectId);
    if (!timeline || timeline.status !== "CONFIRMED" || timeline.id !== input.id || timeline.contentHash !== input.hash || timeline.productionPlanHash !== run.productionPlan?.contentHash) {
      throw new SmartFlowPause("BLOCKED", "TIMELINE_CHANGED", "请先确认本项目当前分镜对应的手工时间线，再明确采用此版本");
    }
    const outputs = new Set((await this.d.workflow.listGenerationAttempts(run.projectId)).filter(a => run.attemptIds.includes(a.id)).map(a => a.outputArtifactId));
    if (timeline.clips.some(c => !c.deleted && !outputs.has(c.sourceArtifactId))) throw new SmartFlowPause("BLOCKED", "TIMELINE_OTHER_OUTPUT", "手工时间线包含本任务以外的生成结果，请独立完成手工成片");
  }
  async render(run: SmartGenerationRun) {
    const current = await this.d.timeline?.latestTimeline(run.projectId);
    if (!current || current.status !== "CONFIRMED" || current.id !== run.timelineRef?.id || current.contentHash !== run.timelineRef?.hash) {
      throw new SmartFlowPause("BLOCKED", "TIMELINE_CHANGED", "当前时间线不是本任务确认的版本，已在渲染前阻断", false);
    }
    const result = await this.d.renderEngine.render(run.projectId);
    if (result.renderJob.status !== "SUCCEEDED" || result.assembly.timelineId !== run.timelineRef?.id || result.assembly.timelineHash !== run.timelineRef?.hash) throw new SmartFlowPause("BLOCKED", "RENDER_OUTPUT_MISMATCH", "渲染输出与本任务时间线不一致", false);
    return { artifactId: result.assembly.outputArtifactId, sha256: result.assembly.outputArtifactHash, renderJobId: result.renderJob.id };
  }
  async cancel(run: SmartGenerationRun) {
    for (const r of run.paidScope?.requests ?? []) await this.d.generation.markRequestChainStale(r.requestId, new Date().toISOString());
  }
  async finalConfirmed(run: SmartGenerationRun) {
    const a = await this.d.finalOutput.latestAssembly(run.projectId);
    return Boolean(a && a.status === "ACCEPTED" && a.outputArtifactId === run.finalOutput?.artifactId && a.outputArtifactHash === run.finalOutput?.sha256 && a.renderJobId === run.finalOutput?.renderJobId);
  }
}
