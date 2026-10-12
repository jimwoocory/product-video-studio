import type { SmartGenerationRun, SmartRunStatus, WorkspaceBinding } from "../../domain/smart-generation.js";
import type {
  ArtifactRecord,
  CreativeBatch,
  ScriptDraft,
  ProductionPlan
} from "../../domain/schemas.js";
import type {
  AssetPaidScope,
  ProductionAssetSet,
  ProductionStrategy
} from "../../domain/production-strategy.js";
import type {
  DirectorV3Plan,
  ScriptFeasibilityReport,
  SeedancePromptV3Draft
} from "../../domain/director-v3.js";
import type { V8DirectorRecord, V8PromptRecord } from "../../domain/v8-production.js";
import type { V8DetailedProposal } from "../../domain/v8-screenplay.js";

export type DirectorV3ShadowPreview = {
  sourceRunId: string;
  sourceWorkflowVersion?: 1 | 2;
  createdAt: string;
  baseline: {
    clipCount: number;
    requests: Array<{
      clipId: string;
      durationMs: number;
      generateAudio: boolean;
      audioPolicy?: "V2_STRICT" | "V3_NATIVE_NO_BGM";
      promptText: string;
      outputArtifactId?: string;
    }>;
  };
  scriptBefore: ScriptFeasibilityReport;
  repairedScript: ScriptDraft;
  scriptAfter: ScriptFeasibilityReport;
  directorV3Plan: DirectorV3Plan;
  productionPlan: ProductionPlan;
  prompts: SeedancePromptV3Draft[];
  noPaidVideoGeneration: true;
  artifact?: ArtifactRecord;
};

export class SmartFlowPause extends Error {
  constructor(readonly status: SmartRunStatus, readonly code: string, message: string, readonly retryable = true) {
    super(message); this.name = "SmartFlowPause";
  }
}

/** All external effects remain in the existing, audited application services. */
export interface SmartProduction {
  initial(projectId: string): Promise<{ targetDurationMs: number; binding: WorkspaceBinding }>;
  sources(run: SmartGenerationRun): Promise<Pick<SmartGenerationRun, "truthRef" | "assetsHash" | "referenceVideoProfile" | "creativeContext" | "expectedWorkspace">>;
  assertCurrent(run: SmartGenerationRun): Promise<void>;
  creative(run: SmartGenerationRun): Promise<CreativeBatch>;
  planProduction?(run: SmartGenerationRun): Promise<ProductionStrategy>;
  prepareProductionAssets?(run: SmartGenerationRun): Promise<{
    set: ProductionAssetSet;
    paidScope?: AssetPaidScope;
  }>;
  validateAssetPaidScope?(run: SmartGenerationRun): Promise<void>;
  advanceProductionAssets?(run: SmartGenerationRun): Promise<ProductionAssetSet>;
  acceptProductionAsset?(run: SmartGenerationRun, key: string): Promise<ProductionAssetSet>;
  reconcileProductionAssetReview?(run: SmartGenerationRun): Promise<ProductionAssetSet>;
  recoverProductionAssetResults?(run: SmartGenerationRun): Promise<ProductionAssetSet>;
  updateProductionAssetPrompt?(run: SmartGenerationRun, key: string, prompt: string): Promise<{
    set: ProductionAssetSet;
    paidScope: AssetPaidScope;
  }>;
  regenerateProductionAsset?(run: SmartGenerationRun, key: string, prompt?: string): Promise<{
    set: ProductionAssetSet;
    paidScope: AssetPaidScope;
  }>;
  retryProductionAsset?(run: SmartGenerationRun, key: string, prompt?: string): Promise<{
    set: ProductionAssetSet;
    paidScope: AssetPaidScope;
  }>;
  script(run: SmartGenerationRun): Promise<ScriptDraft>;
  scriptV8?(run: SmartGenerationRun): Promise<{ script: ScriptDraft; screenplay: V8DetailedProposal }>;
  reviseV8Screenplay?(run: SmartGenerationRun, screenplay: unknown): Promise<ScriptDraft>;
  scriptV3?(run: SmartGenerationRun): Promise<{
    script: ScriptDraft;
    feasibility: ScriptFeasibilityReport;
  }>;
  /** Explicit AI script pacing repair, only for a single unspent V3 run. */
  repairNarrativeScriptV3?(run: SmartGenerationRun): Promise<{
    script: ScriptDraft;
    feasibility: ScriptFeasibilityReport;
  }>;
  reviseScriptV3?(
    run: SmartGenerationRun,
    beats: ScriptDraft["beats"]
  ): Promise<{
    script: ScriptDraft;
    feasibility: ScriptFeasibilityReport;
  }>;
  buildDirectorV8?(run: SmartGenerationRun): Promise<V8DirectorRecord>;
  directorV8?(run: SmartGenerationRun): Promise<ProductionPlan>;
  compilePromptsV8?(run: SmartGenerationRun, voiceBindings: V8PromptRecord["voiceBindings"]): Promise<V8PromptRecord>;
  validatePromptsV8?(run: SmartGenerationRun): Promise<void>;
  director(run: SmartGenerationRun): Promise<ProductionPlan>;
  directorV3?(run: SmartGenerationRun): Promise<{
    productionPlan: ProductionPlan;
    directorV3Plan: DirectorV3Plan;
    seedancePromptDrafts: SeedancePromptV3Draft[];
  }>;
  previewV3?(
    run: SmartGenerationRun
  ): Promise<DirectorV3ShadowPreview>;
  confirmScript(run: SmartGenerationRun): Promise<ScriptDraft>;
  confirmPlan(run: SmartGenerationRun): Promise<ProductionPlan>;
  install(run: SmartGenerationRun): Promise<WorkspaceBinding>;
  preparePaidScope(run: SmartGenerationRun): Promise<NonNullable<SmartGenerationRun["paidScope"]>>;
  validatePaidScope(run: SmartGenerationRun): Promise<void>;
  approve(run: SmartGenerationRun): Promise<string[]>;
  generate(run: SmartGenerationRun): Promise<{ done: boolean }>;
  reviewClips(run: SmartGenerationRun): Promise<void>;
  autoEdit(run: SmartGenerationRun): Promise<Pick<SmartGenerationRun, "timelineRef" | "autoEditArtifactId">>;
  render(run: SmartGenerationRun): Promise<NonNullable<SmartGenerationRun["finalOutput"]>>;
  cancel(run: SmartGenerationRun): Promise<void>;
  finalConfirmed(run: SmartGenerationRun): Promise<boolean>;
  adoptTimeline?(run: SmartGenerationRun, input: { id: string; hash: string }): Promise<void>;
}
