import { z } from "zod";
import { creativeReferenceSetSchema } from "./creative-reference.js";
import { postProductionSettingsSchema } from "./auto-edit.js";
import {
  creativeBatchSchema, scriptDraftSchema, productionPlanSchema, referenceVideoProfileSchema,
  entityIdSchema, sha256Schema, isoDateTimeSchema, versionRefSchema, directorGenerationTargetSchema
} from "./schemas.js";
const directorGenerationSettingsSchema = directorGenerationTargetSchema.pick({
  requestedModelVersion: true, aspectRatio: true, videoResolution: true, nativeAudioOutputRequested: true
}).strict();

export const smartRunStatusSchema = z.enum([
  "PLANNING", "WAITING_FOR_TRUTH_REVIEW", "WAITING_FOR_REFERENCE_REVIEW",
  "WAITING_FOR_CREATIVE_REVIEW", "WAITING_FOR_SCRIPT_REVIEW", "WAITING_FOR_PLAN_REVIEW",
  "READY_FOR_PAID_CONFIRM", "APPROVING", "GENERATING", "WAITING_FOR_CLIP_REVIEW",
  "AUTO_EDITING", "WAITING_FOR_AUDIO", "RENDERING", "REVIEW_READY", "COMPLETED", "BLOCKED", "FAILED", "CANCELLED"
]);
export const smartStageSchema = z.enum(["SOURCES", "CREATIVE", "SCRIPT", "DIRECTOR", "PREFLIGHT", "APPROVAL", "GENERATION", "CLIP_REVIEW", "AUTO_EDIT", "RENDER", "FINAL_REVIEW"]);
export const smartRunOptionsSchema = z.object({
  requestText: z.string().trim().min(1).max(6000),
  generationSettings: directorGenerationSettingsSchema,
  reviewMode: z.enum(["MANUAL", "AUTO"]).default("MANUAL"),
  autoSelectLowRiskClips: z.boolean().default(false),
  useExistingResearch: z.boolean().default(false),
  useResearchReferences: z.boolean().default(false),
  bgmArtifactId: entityIdSchema.optional(),
  allowSilentOutput: z.boolean().default(false),
  postProduction: postProductionSettingsSchema.optional()
}).strict();

export const workspaceBindingSchema = z.object({
  productTruthRef: versionRefSchema.optional(),
  creativeBatchRef: versionRefSchema.optional(),
  selectedCreativeId: entityIdSchema.optional(),
  scriptRef: versionRefSchema.optional(),
  productionPlanRef: versionRefSchema.optional()
});
export const creativeProductionContextSchema = z.object({
  requestText: z.string().trim().min(1).max(6000),
  references: creativeReferenceSetSchema.optional(),
  research: z.object({
    briefId: entityIdSchema, contentHash: sha256Schema,
    contentOpportunities: z.array(z.string()), uncertainties: z.array(z.string()),
    rule: z.literal("STRUCTURE_ONLY_NOT_PRODUCT_FACTS")
  }).optional()
});
export const paidScopeSchema = z.object({
  hash: sha256Schema,
  planRef: versionRefSchema,
  requests: z.array(z.object({
    requestId: entityIdSchema, requestHash: sha256Schema,
    preflightId: entityIdSchema, preflightHash: sha256Schema,
    costStatus: z.enum(["KNOWN", "UNKNOWN"]),
    estimatedCredits: z.number().nonnegative().optional(), costText: z.string().optional()
  })).min(1),
  preparedAt: isoDateTimeSchema
});
export const smartRunSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  requestKey: z.string().min(1).max(120),
  inputHash: sha256Schema,
  revision: z.number().int().positive(),
  status: smartRunStatusSchema,
  stage: smartStageSchema,
  targetDurationMs: z.number().int().min(10000).max(120000),
  options: smartRunOptionsSchema,
  postProduction: postProductionSettingsSchema.optional(),
  expectedWorkspace: workspaceBindingSchema,
  truthRef: versionRefSchema.optional(),
  assetsHash: sha256Schema.optional(),
  referenceVideoProfile: referenceVideoProfileSchema.optional(),
  creativeContext: creativeProductionContextSchema.optional(),
  creativeBatch: creativeBatchSchema.optional(),
  selectedCreativeId: entityIdSchema.optional(),
  script: scriptDraftSchema.optional(),
  productionPlan: productionPlanSchema.optional(),
  pendingInstall: z.enum(["CREATIVE", "SELECT_CREATIVE", "SCRIPT", "CONFIRM_SCRIPT", "DIRECTOR", "CONFIRM_PLAN"]).optional(),
  paidScope: paidScopeSchema.optional(),
  consent: z.object({
    scopeHash: sha256Schema, approvedAt: isoDateTimeSchema,
    acceptedUnknownCostRisk: z.boolean(),
    source: z.literal("EXPLICIT_SMART_RUN_PAID_CONFIRMATION")
  }).optional(),
  attemptIds: z.array(entityIdSchema).default([]),
  timelineRef: z.object({ id: entityIdSchema, hash: sha256Schema }).optional(),
  autoEditArtifactId: entityIdSchema.optional(),
  finalOutput: z.object({ artifactId: entityIdSchema, sha256: sha256Schema, renderJobId: entityIdSchema }).optional(),
  blocker: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
  notes: z.array(z.object({ at: isoDateTimeSchema, stage: smartStageSchema, message: z.string() })).max(200),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
}).superRefine((run, ctx) => {
  if (["APPROVING", "GENERATING"].includes(run.status) && (!run.paidScope || !run.consent || run.consent.scopeHash !== run.paidScope.hash)) {
    ctx.addIssue({ code: "custom", path: ["consent"], message: "Paid execution requires an explicit confirmation bound to this exact request set" });
  }
  if (["REVIEW_READY", "COMPLETED"].includes(run.status) && !run.finalOutput) {
    ctx.addIssue({ code: "custom", path: ["finalOutput"], message: "A ready final preview requires a real audited output Artifact" });
  }
});
export type SmartGenerationRun = z.infer<typeof smartRunSchema>;
export type SmartRunOptions = z.infer<typeof smartRunOptionsSchema>;
export type SmartRunStatus = z.infer<typeof smartRunStatusSchema>;
export type SmartStage = z.infer<typeof smartStageSchema>;
export type WorkspaceBinding = z.infer<typeof workspaceBindingSchema>;
export type CreativeProductionContext = z.infer<typeof creativeProductionContextSchema>;
export const runnableSmartStatuses: SmartRunStatus[] = ["PLANNING", "APPROVING", "GENERATING", "AUTO_EDITING", "RENDERING"];
export const closedSmartStatuses: SmartRunStatus[] = ["COMPLETED", "CANCELLED"];
