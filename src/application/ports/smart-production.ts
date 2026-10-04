import type { SmartGenerationRun, SmartRunStatus, WorkspaceBinding } from "../../domain/smart-generation.js";
import type { CreativeBatch, ScriptDraft, ProductionPlan } from "../../domain/schemas.js";

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
  script(run: SmartGenerationRun): Promise<ScriptDraft>;
  director(run: SmartGenerationRun): Promise<ProductionPlan>;
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
