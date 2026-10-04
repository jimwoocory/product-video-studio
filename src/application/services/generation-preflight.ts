import { randomUUID } from "node:crypto";
import type { GenerationRepository } from "../ports/generation-repository.js";
import type { WorkflowRepository } from "../ports/workflow-repository.js";
import type {
  ProviderProbeResult,
  VideoProvider
} from "../ports/video-provider.js";
import {
  generationRequestSchema,
  preflightReportSchema,
  type AssetRef,
  type CreativeBatch,
  type GenerationRequest,
  type PreflightReport,
  type ProductTruth,
  type ProductionPlan,
  type ScriptDraft,
  type VideoModel,
  type WorkflowBlocker
} from "../../domain/schemas.js";
import { hashValue } from "../../domain/hashing.js";
import { computeGenerationRequestHash } from "./hash-contracts.js";
import { compileSeedancePrompt } from "./prompt-compiler.js";
import { blockerFromProviderProbe } from "./provider-blocker.js";
import { DomainValidationError } from "../../domain/validation.js";
import type { StructuredAiRuntime } from "../ports/structured-ai-runtime.js";
import { UsageComplianceService } from "./usage-compliance.js";
import {assertReferenceBinding,type CreativeReferenceGuard} from "./creative-reference-binding.js";
import {CreativeReferenceService} from "./creative-reference-service.js";
import {
  assertDirectorPlanTarget,
  assertDirectorSettingsMatch,
  assertProfileMatchesDirectorTarget,
  standardClipOperation
} from "./director-generation-target.js";
import {
  resolveGenerationProfile,
  type DreaminaAgentCapabilityService
} from "./dreamina-agent-capability.js";

export type RunPreflightInput = {
  projectId: string;
  productTruth: ProductTruth;
  creativeBatch: CreativeBatch;
  script: ScriptDraft;
  productionPlan: ProductionPlan;
  assets: AssetRef[];
  clipIds?: string[];
  inputBlockers?: string[];
  acceptedDuplicateSubmissionRisk?: boolean;
  generationSettings?: {
    requestedModelVersion: string;
    aspectRatio: string;
    videoResolution: string;
    nativeAudioOutputRequested: boolean;
  };
};

export type RunPreflightResult = {
  probe: ProviderProbeResult;
  requests: GenerationRequest[];
  reports: PreflightReport[];
  blocker: WorkflowBlocker | null;
  authenticated: boolean | "UNKNOWN";
  costEstimate: PreflightReport["costEstimate"];
  overallStatus: "PASS" | "BLOCKED";
};

function reportHash(
  report: Omit<PreflightReport, "reportHash">
): string {
  return hashValue(report);
}

function providerBlockers(
  probe: ProviderProbeResult,
  model: VideoModel,
  durationMs: number,
  profileValidated = false
): string[] {
  if (probe.code === "DREAMINA_NOT_FOUND") {
    return ["DREAMINA_NOT_FOUND"];
  }
  if (probe.code === "PROVIDER_IDENTITY_UNVERIFIED") {
    return ["PROVIDER_IDENTITY_UNVERIFIED"];
  }

  const blockers: string[] = [];
  if (!probe.supportedOperations.includes("submit")) {
    blockers.push("CAPABILITY_UNSUPPORTED:submit");
  }
  if (!probe.supportedOperations.includes("status")) {
    blockers.push("CAPABILITY_UNSUPPORTED:status");
  }
  if (!probe.supportedOperations.includes("download")) {
    blockers.push("CAPABILITY_UNSUPPORTED:download");
  }
  if (!profileValidated) {
    if (!probe.supportedModels.includes(model)) {
      blockers.push(`CAPABILITY_UNSUPPORTED:${model}`);
    }
    if (!probe.supportedDurationsMs) {
      blockers.push("CAPABILITY_UNSUPPORTED:duration-unknown");
    } else if (!probe.supportedDurationsMs.includes(durationMs)) {
      blockers.push(`CAPABILITY_UNSUPPORTED:duration-${durationMs}`);
    }
  }
  return blockers;
}

function syntheticInputBlocker(
  projectId: string,
  blockerCode: string,
  now: Date
): WorkflowBlocker {
  return {
    id: randomUUID(),
    projectId,
    scope: "PREFLIGHT",
    reasonCode: "OTHER",
    message: `参考素材不满足生成前置条件：${blockerCode}`,
    requiredUserAction:
      "替换为正常尺寸、可解码且完整的真实产品参考图，然后重新运行 Preflight。",
    resumeCheckpoint: "preflight.reference-assets",
    createdAt: now.toISOString()
  };
}

function syntheticCapabilityBlocker(
  projectId: string,
  blockerCode: string,
  now: Date
): WorkflowBlocker {
  return {
    id: randomUUID(),
    projectId,
    scope: "PREFLIGHT",
    reasonCode: "CAPABILITY_UNSUPPORTED",
    message: `国内官方 dreamina CLI 当前能力不满足生成要求：${blockerCode}`,
    requiredUserAction:
      "核验官方 CLI help/capability，确认 Seedance 2.0、submit/status/download 和当前 Clip 时长均被支持。",
    resumeCheckpoint: "preflight.provider-capability",
    createdAt: now.toISOString()
  };
}

export class GenerationPreflightService {
  private readonly usageCompliance?: UsageComplianceService;

  constructor(
    private readonly generationRepo: GenerationRepository,
    private readonly workflowRepo: WorkflowRepository,
    private readonly provider: VideoProvider,
    private readonly nextCompiledPromptVersion: (
      projectId: string,
      entityKey: string
    ) => Promise<number>,
    private readonly targetModel: VideoModel = "seedance-2.0",
    usageComplianceRuntime?: StructuredAiRuntime,
    private readonly dreaminaCapability?: DreaminaAgentCapabilityService,
    private readonly references?: CreativeReferenceGuard
  ) {
    this.usageCompliance = usageComplianceRuntime
      ? new UsageComplianceService(usageComplianceRuntime)
      : undefined;
  }

  private async persistBlockerOnce(
    projectId: string,
    blocker: WorkflowBlocker | null
  ): Promise<WorkflowBlocker | null> {
    if (!blocker) return null;
    const open = await this.workflowRepo.listOpenBlockers(projectId);
    const existing = open.find(
      (item) =>
        item.scope === blocker.scope &&
        item.reasonCode === blocker.reasonCode &&
        item.resumeCheckpoint === blocker.resumeCheckpoint
    );
    if (existing) return existing;
    return this.workflowRepo.createBlocker(blocker);
  }

  private async reconcileReferenceAssetBlockers(
    projectId: string,
    activeBlockerCodes: readonly string[],
    resolvedAt: string
  ): Promise<void> {
    const activeReferenceBlockers = activeBlockerCodes.filter((code) =>
      code.startsWith("REFERENCE_")
    );
    const open = await this.workflowRepo.listOpenBlockers(projectId);

    for (const item of open) {
      if (
        item.scope !== "PREFLIGHT" ||
        item.resumeCheckpoint !== "preflight.reference-assets"
      ) {
        continue;
      }

      const stillActive = activeReferenceBlockers.some((code) =>
        item.message.includes(code)
      );
      if (!stillActive) {
        await this.workflowRepo.resolveBlocker(item.id, resolvedAt);
      }
    }
  }

  private async reconcileCapabilityBlockers(
    projectId: string,
    activeBlockerCodes: readonly string[],
    resolvedAt: string
  ): Promise<void> {
    const activeCapabilityBlockers = activeBlockerCodes.filter(
      code => !code.startsWith("REFERENCE_")
    );
    const open = await this.workflowRepo.listOpenBlockers(projectId);
    for (const item of open) {
      if (
        item.scope !== "PREFLIGHT" ||
        item.resumeCheckpoint !== "preflight.provider-capability"
      ) {
        continue;
      }
      const stillActive = activeCapabilityBlockers.some(code =>
        item.message.includes(code)
      );
      if (!stillActive) {
        await this.workflowRepo.resolveBlocker(item.id, resolvedAt);
      }
    }
  }

  async run(input: RunPreflightInput): Promise<RunPreflightResult> {
    const references=await this.references?.assertExpected(input.projectId,input.productionPlan.creativeReferenceSetRef);
    for(const artifact of [input.creativeBatch,input.script,input.productionPlan])assertReferenceBinding(artifact.creativeReferenceSetRef,references,input.productTruth);
    if(references)input={...input,assets:[...input.assets.filter(a=>!a.id.startsWith("research-ref-")),...CreativeReferenceService.assets(references)]};
    const now = new Date();
    const directorTarget = input.productionPlan.generationTarget;
    if (directorTarget) {
      assertDirectorPlanTarget(input.productionPlan);
      if (input.generationSettings) assertDirectorSettingsMatch(directorTarget, input.generationSettings);
      else input = { ...input, generationSettings: {
        requestedModelVersion: directorTarget.requestedModelVersion,
        aspectRatio: directorTarget.aspectRatio,
        videoResolution: directorTarget.videoResolution,
        nativeAudioOutputRequested: directorTarget.nativeAudioOutputRequested
      } };
    }
    const existingAttempts = await this.workflowRepo.listGenerationAttempts(
      input.projectId
    );
    const hasUnknownSubmission = existingAttempts.some(
      (item) =>
        item.status === "SUBMISSION_OUTCOME_UNKNOWN" ||
        item.status === "RECONCILING"
    );
    if (
      hasUnknownSubmission &&
      input.acceptedDuplicateSubmissionRisk !== true
    ) {
      throw new DomainValidationError(
        "Unresolved submission outcome requires explicit duplicate-submission cost-risk acceptance before creating a new Preflight chain"
      );
    }

    if (this.usageCompliance) {
      await this.usageCompliance.assertPlan(
        input.productTruth,
        input.productionPlan
      );
    }

    await this.generationRepo.markSubmissionChainStale(
      input.projectId,
      now.toISOString()
    );
    const probe = await this.provider.probe();

    if (probe.code === "READY") {
      const open = await this.workflowRepo.listOpenBlockers(input.projectId);
      for (const item of open) {
        if (
          item.scope === "PROVIDER" &&
          (item.reasonCode === "DREAMINA_NOT_FOUND" ||
            item.reasonCode === "PROVIDER_IDENTITY_UNVERIFIED" ||
            item.reasonCode === "PROVIDER_CHANGED")
        ) {
          await this.workflowRepo.resolveBlocker(item.id, now.toISOString());
        }
      }
    }

    await this.reconcileReferenceAssetBlockers(
      input.projectId,
      input.inputBlockers ?? [],
      now.toISOString()
    );

    const requests: GenerationRequest[] = [];
    const allClips = input.productionPlan.scenes.flatMap((scene) => scene.clips);
    const requestedClipIds = input.clipIds?.length
      ? new Set(input.clipIds)
      : null;
    const clips = requestedClipIds
      ? allClips.filter((clip) => requestedClipIds.has(clip.id))
      : allClips;
    if (!clips.length) {
      throw new Error("Preflight requires at least one current Clip");
    }
    if (requestedClipIds && clips.length !== requestedClipIds.size) {
      throw new Error("Preflight clipIds contain unknown or stale Clip ids");
    }
    let capabilityRegistry;
    if (input.generationSettings && probe.code === "READY") {
      if (!this.dreaminaCapability) {
        throw new DomainValidationError(
          "标准生成尚未接入 DreaminaCapabilityRegistry，不能验证用户选择的模型/画幅/分辨率"
        );
      }
      capabilityRegistry = await this.dreaminaCapability.registry();
      if (directorTarget && capabilityRegistry.registryFingerprint !== directorTarget.registryFingerprint) {
        throw new DomainValidationError("Dreamina 能力表已变化，旧生成请求和授权已失效；请返回导演分镜重新适配并审核");
      }
    }
    if (directorTarget && !capabilityRegistry) {
      throw new DomainValidationError("当前无法验证导演目标的实时模型能力，已阻止回退到旧生成参数；请恢复即梦连接后重试");
    }

    for (const clip of clips) {
      const dreaminaOperation = standardClipOperation(clip.referenceAssets.length);
      const referenceAudioInputCount = clip.referenceAssets.filter((usage) => {
        const asset = input.assets.find((item) => item.id === usage.assetId);
        return asset?.mimeType?.startsWith("audio/") === true;
      }).length;
      const generationProfile =
        input.generationSettings && capabilityRegistry
          ? resolveGenerationProfile(capabilityRegistry, {
              operation: dreaminaOperation,
              requestedModelVersion:
                input.generationSettings.requestedModelVersion,
              aspectRatio: input.generationSettings.aspectRatio,
              videoResolution: input.generationSettings.videoResolution,
              durationMs: clip.durationMs,
              referenceAudioInputCount,
              nativeAudioOutputRequested:
                input.generationSettings.nativeAudioOutputRequested
            })
          : undefined;
      if (directorTarget && generationProfile) assertProfileMatchesDirectorTarget(directorTarget, generationProfile);
      const requestModel =
        generationProfile?.modelVersion ??
        (input.generationSettings &&
        input.generationSettings.requestedModelVersion !== "AUTO" &&
        input.generationSettings.requestedModelVersion !== "FIXED"
          ? input.generationSettings.requestedModelVersion
          : this.targetModel);
      const requestAspectRatio =
        generationProfile?.aspectRatio ??
        input.generationSettings?.aspectRatio ??
        "9:16";
      const requestVideoResolution =
        generationProfile?.videoResolution ??
        input.generationSettings?.videoResolution;
      const requestGenerateAudio = generationProfile
        ? generationProfile.nativeAudioOutputRequested
        : undefined;
      const version = await this.nextCompiledPromptVersion(
        input.projectId,
        `compiled-prompt:${clip.id}`
      );
      const compiled = compileSeedancePrompt({
        creativeReferenceSet: references,
        id: randomUUID(),
        version,
        createdAt: now.toISOString(),
        productTruth: input.productTruth,
        creativeBatch: input.creativeBatch,
        script: input.script,
        productionPlan: input.productionPlan,
        clipId: clip.id,
        model: requestModel,
        ...(generationProfile ? { generationProfile } : {}),
        aspectRatio: requestAspectRatio,
        ...(requestVideoResolution
          ? { videoResolution: requestVideoResolution }
          : {}),
        ...(requestGenerateAudio !== undefined
          ? { generateAudio: requestGenerateAudio }
          : {}),
        assets: input.assets
      });
      await this.generationRepo.saveCompiledPrompt(compiled);

      const requestWithoutHash = {
        id: randomUUID(),
        projectId: input.projectId,
        clipId: clip.id,
        compiledPromptId: compiled.id,
        compiledPromptHash: compiled.compiledPromptHash,
        provider: "domestic-jimeng-cli" as const,
        providerIdentityHash: probe.providerIdentityHash,
        capabilityFingerprint: probe.capabilityFingerprint,
        model: requestModel,
        promptText: compiled.promptText,
        assetManifest: compiled.inputAssetManifest,
        dreaminaOperation,
        durationMs: compiled.generationParams.durationMs,
        aspectRatio: requestAspectRatio,
        ...(requestVideoResolution
          ? { videoResolution: requestVideoResolution }
          : {}),
        generateAudio: compiled.generationParams.generateAudio,
        ...(generationProfile ? { generationProfile } : {}),
        inputVersionRefs: [
          compiled.productTruthRef,
          compiled.creativeBatchRef,
          compiled.scriptRef,
          compiled.productionPlanRef,
          ...(compiled.creativeReferenceSetRef?[compiled.creativeReferenceSetRef]:[])
        ],
        createdAt: now.toISOString()
      };
      const request = generationRequestSchema.parse({
        ...requestWithoutHash,
        requestHash: computeGenerationRequestHash(requestWithoutHash)
      });
      requests.push(await this.generationRepo.createGenerationRequest(request));
    }

    let costEstimate: PreflightReport["costEstimate"] = {
      status: "UNKNOWN",
      observedAt: now.toISOString()
    };
    let authenticated: boolean | "UNKNOWN" = "UNKNOWN";
    if (probe.code === "READY") {
      const [account, estimate] = await Promise.all([
        this.provider.accountStatus(),
        this.provider.estimate(requests)
      ]);
      authenticated =
        account.status === "AUTHENTICATED"
          ? true
          : account.status === "NOT_AUTHENTICATED"
            ? false
            : "UNKNOWN";
      costEstimate = {
        status: estimate.status,
        ...(estimate.estimatedCredits !== undefined
          ? { estimatedCredits: estimate.estimatedCredits }
          : {}),
        ...(estimate.estimatedCostText
          ? { estimatedCostText: estimate.estimatedCostText }
          : {}),
        observedAt: now.toISOString()
      };
    }

    const reports: PreflightReport[] = [];
    let firstBlocker: WorkflowBlocker | null = blockerFromProviderProbe(
      input.projectId,
      probe,
      now
    );

    for (const request of requests) {
      const clip = clips.find((item) => item.id === request.clipId)!;
      const blockers = [
        ...(input.inputBlockers ?? []),
        ...providerBlockers(
          probe,
          request.model,
          request.durationMs,
          Boolean(request.generationProfile)
        )
      ];
      if (probe.code === "READY" && authenticated !== true) {
        blockers.push(
          authenticated === false
            ? "AUTHENTICATION_REQUIRED"
            : "AUTHENTICATION_REQUIRED:unknown"
        );
      }
      const status = blockers.length ? "BLOCKED" : "PASS";
      const warnings =
        costEstimate.status === "UNKNOWN" ? ["COST_ESTIMATE_UNKNOWN"] : [];
      const base = {
        id: randomUUID(),
        projectId: input.projectId,
        generationRequestId: request.id,
        requestHash: request.requestHash,
        status: status as "PASS" | "BLOCKED",
        providerIdentityHash: request.providerIdentityHash,
        capabilityFingerprint: request.capabilityFingerprint,
        clipCount: 1,
        totalGeneratedMs: request.durationMs,
        highRiskClipIds:
          clip.riskAssessment.level === "HIGH" ? [clip.id] : [],
        costEstimate,
        blockers,
        warnings,
        createdAt: now.toISOString()
      };
      const report = preflightReportSchema.parse({
        ...base,
        reportHash: reportHash(base)
      });
      reports.push(await this.generationRepo.createPreflightReport(report));

      if (!firstBlocker && blockers.length) {
        firstBlocker = blockers[0]!.startsWith("REFERENCE_")
          ? syntheticInputBlocker(
              input.projectId,
              blockers[0]!,
              now
            )
          : syntheticCapabilityBlocker(
              input.projectId,
              blockers[0]!,
              now
            );
      }
    }

    await this.reconcileCapabilityBlockers(
      input.projectId,
      reports.flatMap(item => item.blockers),
      now.toISOString()
    );

    const blocker = await this.persistBlockerOnce(
      input.projectId,
      firstBlocker
    );

    return {
      probe,
      requests,
      reports,
      blocker,
      authenticated,
      costEstimate,
      overallStatus: reports.every((item) => item.status === "PASS")
        ? "PASS"
        : "BLOCKED"
    };
  }
}
