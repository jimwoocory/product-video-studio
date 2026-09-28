import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "expected sha256 hex");
export const entityIdSchema = z.string().trim().min(1);
export const nonEmptyStringSchema = z.string().trim().min(1);
export const versionStatusSchema = z.enum(["DRAFT", "CONFIRMED", "STALE"]);
export const gateStatusSchema = z.enum(["PASS", "BLOCKED", "STALE"]);
export const riskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const versionRefSchema = z.object({
  entityType: nonEmptyStringSchema,
  entityId: entityIdSchema,
  version: z.number().int().positive(),
  hash: sha256Schema
});

export const projectStatusSchema = z.enum([
  "DRAFT",
  "PRODUCT_TRUTH_REVIEW",
  "CREATIVE_REVIEW",
  "SCRIPT_REVIEW",
  "DIRECTOR_REVIEW",
  "READY_TO_GENERATE",
  "GENERATING",
  "GENERATION_REVIEW",
  "READY_TO_ASSEMBLE",
  "FINAL_REVIEW",
  "READY_TO_PUBLISH",
  "PUBLISHING",
  "PUBLISHED",
  "COMPLETED",
  "FAILED"
]);

export const projectSchema = z.object({
  id: entityIdSchema,
  name: nonEmptyStringSchema,
  status: projectStatusSchema,
  targetPlatform: z.literal("douyin"),
  targetDurationMs: z.number().int().min(60000).max(120000),
  aspectRatio: z.literal("9:16"),
  currentProductTruthRef: versionRefSchema.optional(),
  currentCreativeBatchRef: versionRefSchema.optional(),
  selectedCreativeId: entityIdSchema.optional(),
  currentScriptRef: versionRefSchema.optional(),
  currentProductionPlanRef: versionRefSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const artifactIntegrityStatusSchema = z.enum(["PENDING", "READY", "MISSING", "CORRUPT"]);
export const artifactKindSchema = z.enum([
  "USER_INPUT",
  "STRUCTURED_SNAPSHOT",
  "PROMPT",
  "REQUEST",
  "PROVIDER_PROBE",
  "STDOUT",
  "STDERR",
  "PROVIDER_RESULT",
  "GENERATED_VIDEO",
  "FINAL_VIDEO",
  "OTHER"
]);

export const artifactRecordSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  kind: artifactKindSchema,
  relativePath: nonEmptyStringSchema,
  sha256: sha256Schema.optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  mimeType: nonEmptyStringSchema.optional(),
  integrityStatus: artifactIntegrityStatusSchema,
  immutable: z.literal(true),
  createdAt: isoDateTimeSchema
}).superRefine((artifact, ctx) => {
  if (artifact.integrityStatus === "READY") {
    if (!artifact.sha256) ctx.addIssue({ code: "custom", path: ["sha256"], message: "READY artifact requires sha256" });
    if (artifact.sizeBytes === undefined) ctx.addIssue({ code: "custom", path: ["sizeBytes"], message: "READY artifact requires sizeBytes" });
  }
});

export const assetRefSchema = z.object({
  id: entityIdSchema,
  artifactId: entityIdSchema,
  type: z.enum(["image", "video", "audio", "logo", "document"]),
  source: z.enum(["user_upload", "generated", "external"]),
  originalFilename: nonEmptyStringSchema.optional(),
  sha256: sha256Schema,
  mimeType: nonEmptyStringSchema,
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  provenance: nonEmptyStringSchema.optional(),
  createdAt: isoDateTimeSchema
});

export const productFactSchema = z.object({
  id: entityIdSchema,
  statement: nonEmptyStringSchema,
  sourceType: z.enum(["user", "official", "external"]),
  evidenceRef: nonEmptyStringSchema.optional(),
  createdAt: isoDateTimeSchema
});

export const forbiddenChangeSchema = z.object({
  id: entityIdSchema,
  field: z.enum(["logo", "color", "shape", "packaging", "text", "model", "proportion", "other"]),
  description: nonEmptyStringSchema,
  severity: z.enum(["HARD", "SOFT"])
});

export const uncertainClaimSchema = z.object({
  id: entityIdSchema,
  statement: nonEmptyStringSchema,
  reason: nonEmptyStringSchema,
  status: z.enum(["UNVERIFIED", "REJECTED", "PROMOTED"]),
  dispositionConfirmedByUser: z.boolean(),
  promotedFactId: entityIdSchema.optional()
}).superRefine((claim, ctx) => {
  if (claim.status === "PROMOTED" && !claim.promotedFactId) {
    ctx.addIssue({ code: "custom", path: ["promotedFactId"], message: "PROMOTED claim requires promotedFactId" });
  }
  if (claim.status !== "PROMOTED" && claim.promotedFactId) {
    ctx.addIssue({ code: "custom", path: ["promotedFactId"], message: "Only PROMOTED claim may have promotedFactId" });
  }
});

export const productTruthSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  version: z.number().int().positive(),
  status: versionStatusSchema,
  productName: nonEmptyStringSchema,
  brand: nonEmptyStringSchema.optional(),
  category: nonEmptyStringSchema.optional(),
  referenceImageIds: z.array(entityIdSchema).min(1),
  canonicalImageId: entityIdSchema,
  logoAssetId: entityIdSchema.optional(),
  standardColors: z.array(nonEmptyStringSchema),
  confirmedFeatures: z.array(productFactSchema),
  sellingPoints: z.array(productFactSchema),
  forbiddenChanges: z.array(forbiddenChangeSchema),
  uncertainClaims: z.array(uncertainClaimSchema),
  evidenceRefs: z.array(nonEmptyStringSchema),
  inputRefs: z.array(versionRefSchema),
  contentHash: sha256Schema,
  confirmedAt: isoDateTimeSchema.optional()
}).superRefine((truth, ctx) => {
  const factIds = new Set([...truth.confirmedFeatures, ...truth.sellingPoints].map((f) => f.id));
  const claimIds = new Set(truth.uncertainClaims.map((c) => c.id));
  for (const id of claimIds) {
    if (factIds.has(id)) ctx.addIssue({ code: "custom", path: ["uncertainClaims"], message: `Claim id ${id} collides with ProductFact id` });
  }
  if (truth.status === "CONFIRMED" && !truth.confirmedAt) {
    ctx.addIssue({ code: "custom", path: ["confirmedAt"], message: "CONFIRMED ProductTruth requires confirmedAt" });
  }
  if (truth.status === "CONFIRMED") {
    truth.uncertainClaims.forEach((claim, index) => {
      if (!claim.dispositionConfirmedByUser) {
        ctx.addIssue({ code: "custom", path: ["uncertainClaims", index, "dispositionConfirmedByUser"], message: "Confirmed ProductTruth requires user-confirmed claim disposition" });
      }
    });
  }
});

export const creativeConceptSchema = z.object({
  id: entityIdSchema,
  title: nonEmptyStringSchema,
  targetAudience: nonEmptyStringSchema,
  painPoint: nonEmptyStringSchema,
  hook: nonEmptyStringSchema,
  coreSellingPoint: nonEmptyStringSchema,
  narrativePattern: nonEmptyStringSchema,
  expectedDurationMs: z.number().int().min(60000).max(120000),
  productShowcaseStrategy: nonEmptyStringSchema,
  generationRisk: riskLevelSchema,
  requiredFactIds: z.array(entityIdSchema)
});

export const creativeBatchSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  version: z.number().int().positive(),
  status: z.enum(["ACTIVE", "STALE"]),
  productTruthRef: versionRefSchema,
  generatorVersion: nonEmptyStringSchema,
  concepts: z.array(creativeConceptSchema).min(4).max(6),
  selectedCreativeId: entityIdSchema.optional(),
  contentHash: sha256Schema,
  createdAt: isoDateTimeSchema
}).superRefine((batch, ctx) => {
  const ids = batch.concepts.map((c) => c.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["concepts"], message: "CreativeConcept ids must be unique within batch" });
  if (batch.selectedCreativeId && !ids.includes(batch.selectedCreativeId)) {
    ctx.addIssue({ code: "custom", path: ["selectedCreativeId"], message: "selectedCreativeId must belong to batch" });
  }
});

export const scriptBeatSchema = z.object({
  id: entityIdSchema,
  order: z.number().int().nonnegative(),
  purpose: z.enum(["HOOK", "PAIN", "PRODUCT", "FEATURE", "PROOF", "RESULT", "CTA", "OTHER"]),
  text: nonEmptyStringSchema,
  estimatedDurationMs: z.number().int().positive(),
  requiredFactIds: z.array(entityIdSchema)
});

export const scriptDraftSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  version: z.number().int().positive(),
  status: versionStatusSchema,
  productTruthRef: versionRefSchema,
  creativeBatchRef: versionRefSchema,
  selectedCreativeId: entityIdSchema,
  targetDurationMs: z.number().int().min(60000).max(120000),
  beats: z.array(scriptBeatSchema).min(1),
  contentHash: sha256Schema,
  confirmedAt: isoDateTimeSchema.optional()
}).superRefine((script, ctx) => {
  if (script.status === "CONFIRMED" && !script.confirmedAt) {
    ctx.addIssue({ code: "custom", path: ["confirmedAt"], message: "CONFIRMED ScriptDraft requires confirmedAt" });
  }
});

export const continuityStateSchema = z.object({
  description: nonEmptyStringSchema,
  productState: nonEmptyStringSchema,
  characterState: nonEmptyStringSchema.optional(),
  environmentState: nonEmptyStringSchema,
  stateHash: sha256Schema
});

export const dialogueOrNarrationSchema = z.union([
  z.object({ kind: z.literal("NONE") }).strict(),
  z.object({
    kind: z.literal("DIALOGUE"),
    text: nonEmptyStringSchema,
    estimatedDurationMs: z.number().int().positive(),
    estimatorVersion: nonEmptyStringSchema
  }).strict(),
  z.object({
    kind: z.literal("NARRATION"),
    text: nonEmptyStringSchema,
    estimatedDurationMs: z.number().int().positive(),
    estimatorVersion: nonEmptyStringSchema
  }).strict()
]);

export const ambientSoundSchema = z.union([
  z.object({ kind: z.literal("NONE") }).strict(),
  z.object({ kind: z.literal("AMBIENT"), description: nonEmptyStringSchema }).strict()
]);

export const referenceAssetUseSchema = z.object({
  assetId: entityIdSchema,
  role: z.enum(["PRIMARY_PRODUCT", "LOGO", "STYLE", "ENVIRONMENT", "CHARACTER", "OTHER"]),
  priority: z.number().int().nonnegative(),
  required: z.boolean()
});

export const clipRiskAssessmentSchema = z.object({
  level: riskLevelSchema,
  reasonCodes: z.array(nonEmptyStringSchema),
  mitigations: z.array(nonEmptyStringSchema),
  source: z.enum(["PRODUCT_DIRECTOR", "USER_OVERRIDE"])
});

export const segmentSchema = z.object({
  id: entityIdSchema,
  order: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  shotSize: nonEmptyStringSchema,
  cameraPosition: nonEmptyStringSchema,
  cameraAngle: nonEmptyStringSchema,
  cameraMovement: nonEmptyStringSchema,
  composition: nonEmptyStringSchema,
  subjectAction: nonEmptyStringSchema,
  productState: nonEmptyStringSchema,
  dialogueOrNarration: dialogueOrNarrationSchema,
  ambientSound: ambientSoundSchema,
  lighting: nonEmptyStringSchema,
  continuityIn: continuityStateSchema,
  continuityOut: continuityStateSchema,
  sourceBeatIds: z.array(entityIdSchema),
  requiredFactIds: z.array(entityIdSchema)
});

export const clipAggregateStatusSchema = z.enum(["PLANNED", "READY", "GENERATING", "NEEDS_REVIEW", "ACTION_REQUIRED", "ACCEPTED", "STALE"]);

export const clipSchema = z.object({
  id: entityIdSchema,
  sceneId: entityIdSchema,
  order: z.number().int().nonnegative(),
  durationMs: z.number().int().min(4000).max(15000),
  purpose: nonEmptyStringSchema,
  openingState: continuityStateSchema,
  closingState: continuityStateSchema,
  referenceAssets: z.array(referenceAssetUseSchema),
  productVisibility: z.enum(["NONE", "PARTIAL", "CLEAR", "HERO"]),
  strictProductIdentity: z.boolean(),
  strictProductIdentityScope: z.array(nonEmptyStringSchema),
  riskAssessment: clipRiskAssessmentSchema,
  sourceBeatIds: z.array(entityIdSchema),
  requiredFactIds: z.array(entityIdSchema),
  segments: z.array(segmentSchema).min(1),
  aggregateStatus: clipAggregateStatusSchema,
  contentHash: sha256Schema
}).superRefine((clip, ctx) => {
  const segments = clip.segments;
  if (segments[0]?.startMs !== 0) {
    ctx.addIssue({ code: "custom", path: ["segments", 0, "startMs"], message: "First segment must start at 0" });
  }
  if (segments.at(-1)?.endMs !== clip.durationMs) {
    ctx.addIssue({ code: "custom", path: ["segments", segments.length - 1, "endMs"], message: "Last segment must end at clip.durationMs" });
  }
  if (segments[0] && segments[0].continuityIn.stateHash !== clip.openingState.stateHash) {
    ctx.addIssue({ code: "custom", path: ["segments", 0, "continuityIn", "stateHash"], message: "First segment continuityIn must match clip openingState" });
  }
  if (segments.at(-1) && segments.at(-1)!.continuityOut.stateHash !== clip.closingState.stateHash) {
    ctx.addIssue({ code: "custom", path: ["segments", segments.length - 1, "continuityOut", "stateHash"], message: "Last segment continuityOut must match clip closingState" });
  }
  const orders = new Set<number>();
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments[i]!;
    if (current.endMs <= current.startMs) ctx.addIssue({ code: "custom", path: ["segments", i], message: "Segment endMs must be greater than startMs" });
    if (orders.has(current.order)) ctx.addIssue({ code: "custom", path: ["segments", i, "order"], message: "Segment order must be unique" });
    orders.add(current.order);
    if (current.dialogueOrNarration.kind !== "NONE" && current.dialogueOrNarration.estimatedDurationMs > current.endMs - current.startMs) {
      ctx.addIssue({ code: "custom", path: ["segments", i, "dialogueOrNarration", "estimatedDurationMs"], message: "Speech duration exceeds segment duration" });
    }
    if (i > 0) {
      const previous = segments[i - 1]!;
      if (previous.endMs !== current.startMs) {
        ctx.addIssue({ code: "custom", path: ["segments", i, "startMs"], message: "Segments must have no gap or overlap" });
      }
      if (previous.continuityOut.stateHash !== current.continuityIn.stateHash) {
        ctx.addIssue({ code: "custom", path: ["segments", i, "continuityIn", "stateHash"], message: "Adjacent segment continuity hashes must match" });
      }
      if (previous.order >= current.order) {
        ctx.addIssue({ code: "custom", path: ["segments", i, "order"], message: "Segment order must increase with time" });
      }
    }
  }
});

export const sceneSchema = z.object({
  id: entityIdSchema,
  order: z.number().int().nonnegative(),
  purpose: nonEmptyStringSchema,
  location: nonEmptyStringSchema,
  timeOfDay: nonEmptyStringSchema.optional(),
  visualState: nonEmptyStringSchema,
  sourceBeatIds: z.array(entityIdSchema),
  requiredFactIds: z.array(entityIdSchema),
  clips: z.array(clipSchema).min(1)
});

export const continuityLockSchema = z.object({
  product: z.object({
    stableAttributes: z.array(nonEmptyStringSchema),
    forbiddenChanges: z.array(forbiddenChangeSchema)
  }),
  characters: z.array(z.object({
    name: nonEmptyStringSchema,
    stableAppearance: nonEmptyStringSchema,
    wardrobe: nonEmptyStringSchema
  })),
  environments: z.array(z.object({
    sceneId: entityIdSchema,
    stableElements: z.array(nonEmptyStringSchema)
  }))
});

export const productionPlanSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  version: z.number().int().positive(),
  status: versionStatusSchema,
  productTruthRef: versionRefSchema,
  scriptRef: versionRefSchema,
  selectedCreativeId: entityIdSchema,
  visualDirection: nonEmptyStringSchema,
  soundDirection: nonEmptyStringSchema,
  productShowcaseRules: z.array(nonEmptyStringSchema),
  continuityLock: continuityLockSchema,
  scenes: z.array(sceneSchema).min(1),
  contentHash: sha256Schema,
  confirmedAt: isoDateTimeSchema.optional()
}).superRefine((plan, ctx) => {
  if (plan.status === "CONFIRMED" && !plan.confirmedAt) {
    ctx.addIssue({ code: "custom", path: ["confirmedAt"], message: "CONFIRMED ProductionPlan requires confirmedAt" });
  }
});

export const promptFactMappingSchema = z.object({
  factId: entityIdSchema,
  sourceBeatIds: z.array(entityIdSchema),
  sceneIds: z.array(entityIdSchema),
  clipId: entityIdSchema,
  segmentIds: z.array(entityIdSchema),
  promptSection: nonEmptyStringSchema
});

export const inputAssetManifestEntrySchema = z.object({
  assetId: entityIdSchema,
  artifactHash: sha256Schema,
  role: referenceAssetUseSchema.shape.role,
  priority: z.number().int().nonnegative(),
  required: z.boolean()
});

export const videoModelSchema = z.enum([
  "seedance-2.0",
  "seedance-2.0-mini"
]);

export const compiledPromptSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  clipId: entityIdSchema,
  version: z.number().int().positive(),
  status: z.enum(["CURRENT", "STALE"]),
  provider: z.literal("domestic-jimeng-cli"),
  model: videoModelSchema,
  productTruthRef: versionRefSchema,
  creativeBatchRef: versionRefSchema,
  selectedCreativeId: entityIdSchema,
  scriptRef: versionRefSchema,
  productionPlanRef: versionRefSchema,
  clipHash: sha256Schema,
  segmentHashes: z.record(z.string(), sha256Schema),
  compilerTemplateVersion: nonEmptyStringSchema,
  promptText: nonEmptyStringSchema,
  inputAssetManifest: z.array(inputAssetManifestEntrySchema),
  factMapping: z.array(promptFactMappingSchema),
  segmentMapping: z.array(z.object({ segmentId: entityIdSchema, promptSection: nonEmptyStringSchema })),
  constraintMapping: z.array(z.object({ forbiddenChangeId: entityIdSchema, promptSection: nonEmptyStringSchema })),
  generationParams: z.object({
    durationMs: z.number().int().min(4000).max(15000),
    aspectRatio: z.literal("9:16"),
    generateAudio: z.boolean()
  }),
  compiledPromptHash: sha256Schema,
  createdAt: isoDateTimeSchema
});

export const providerIdentityStatusSchema = z.enum(["VERIFIED", "UNVERIFIED", "REJECTED"]);
export const providerIdentitySchema = z.object({
  id: entityIdSchema,
  provider: z.literal("domestic-jimeng-cli"),
  officialSourceUrl: z.string().url().optional(),
  publisher: nonEmptyStringSchema.optional(),
  packageName: nonEmptyStringSchema.optional(),
  executablePath: nonEmptyStringSchema,
  executableSha256: sha256Schema,
  signatureInfo: nonEmptyStringSchema.optional(),
  cliVersion: nonEmptyStringSchema,
  rawVersionArtifactId: entityIdSchema,
  rawHelpArtifactId: entityIdSchema,
  officialLoginOrigins: z.array(z.string().url()),
  capabilityFingerprint: sha256Schema,
  verificationStatus: providerIdentityStatusSchema,
  verifiedAt: isoDateTimeSchema.optional()
}).superRefine((identity, ctx) => {
  if (identity.verificationStatus === "VERIFIED") {
    if (!identity.officialSourceUrl) ctx.addIssue({ code: "custom", path: ["officialSourceUrl"], message: "VERIFIED identity requires officialSourceUrl" });
    if (!identity.publisher && !identity.packageName) ctx.addIssue({ code: "custom", path: ["publisher"], message: "VERIFIED identity requires publisher or packageName" });
    if (!identity.verifiedAt) ctx.addIssue({ code: "custom", path: ["verifiedAt"], message: "VERIFIED identity requires verifiedAt" });
  }
});

export const providerCapabilitySchema = z.object({
  provider: z.literal("domestic-jimeng-cli"),
  providerIdentityId: entityIdSchema.optional(),
  cliFound: z.boolean(),
  authenticated: z.union([z.boolean(), z.literal("UNKNOWN")]),
  supportedOperations: z.array(nonEmptyStringSchema),
  supportedModels: z.array(nonEmptyStringSchema),
  supportedDurationsMs: z.array(z.number().int().positive()).optional(),
  rawProbeArtifactId: entityIdSchema,
  capabilityFingerprint: sha256Schema,
  probedAt: isoDateTimeSchema
});

export const generationRequestSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  clipId: entityIdSchema,
  compiledPromptId: entityIdSchema,
  compiledPromptHash: sha256Schema,
  provider: z.literal("domestic-jimeng-cli"),
  providerIdentityHash: sha256Schema,
  capabilityFingerprint: sha256Schema,
  model: videoModelSchema,
  promptText: nonEmptyStringSchema,
  assetManifest: z.array(inputAssetManifestEntrySchema),
  durationMs: z.number().int().min(4000).max(15000),
  aspectRatio: z.literal("9:16"),
  generateAudio: z.boolean(),
  inputVersionRefs: z.array(versionRefSchema),
  createdAt: isoDateTimeSchema,
  requestHash: sha256Schema
});

export const costEstimateSchema = z.object({
  status: z.enum(["KNOWN", "UNKNOWN"]),
  estimatedCredits: z.number().nonnegative().optional(),
  estimatedCostText: nonEmptyStringSchema.optional(),
  observedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.optional()
});

export const preflightReportSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  generationRequestId: entityIdSchema,
  requestHash: sha256Schema,
  status: gateStatusSchema,
  providerIdentityHash: sha256Schema,
  capabilityFingerprint: sha256Schema,
  clipCount: z.number().int().positive(),
  totalGeneratedMs: z.number().int().positive(),
  highRiskClipIds: z.array(entityIdSchema),
  costEstimate: costEstimateSchema,
  blockers: z.array(nonEmptyStringSchema),
  warnings: z.array(nonEmptyStringSchema),
  reportHash: sha256Schema,
  createdAt: isoDateTimeSchema,
  staleAt: isoDateTimeSchema.optional()
}).superRefine((report, ctx) => {
  if (report.status === "PASS" && report.blockers.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["blockers"],
      message: "PASS preflight cannot contain blockers"
    });
  }
  if (report.status === "BLOCKED" && report.blockers.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["blockers"],
      message: "BLOCKED preflight requires at least one blocker"
    });
  }
  if (report.status === "STALE" && !report.staleAt) {
    ctx.addIssue({
      code: "custom",
      path: ["staleAt"],
      message: "STALE preflight requires staleAt"
    });
  }
});

export const userApprovalSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  generationRequestId: entityIdSchema,
  requestHash: sha256Schema,
  preflightReportId: entityIdSchema,
  preflightHash: sha256Schema,
  providerIdentityHash: sha256Schema,
  capabilityFingerprint: sha256Schema,
  costSnapshot: costEstimateSchema,
  acceptedUnknownCostRisk: z.boolean(),
  acceptedDuplicateSubmissionRisk: z.boolean(),
  status: z.enum(["ACTIVE", "STALE", "REVOKED"]),
  approvedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.optional(),
  approvalHash: sha256Schema
});

export const providerHandleSchema = z.object({
  externalTaskId: nonEmptyStringSchema.optional(),
  submitId: nonEmptyStringSchema.optional(),
  opaqueHandle: nonEmptyStringSchema.optional()
});

export const commandAttemptRecordSchema = z.object({
  id: entityIdSchema,
  operation: z.enum(["PROBE", "ACCOUNT", "ESTIMATE", "SUBMIT", "STATUS", "DOWNLOAD", "RECONCILE"]),
  attemptNumber: z.number().int().positive(),
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.optional(),
  exitCode: z.number().int().optional(),
  signal: nonEmptyStringSchema.optional(),
  timedOut: z.boolean(),
  stdoutArtifactId: entityIdSchema.optional(),
  stderrArtifactId: entityIdSchema.optional(),
  redactionRulesVersion: nonEmptyStringSchema,
  parserVersion: nonEmptyStringSchema,
  errorCode: nonEmptyStringSchema.optional()
});

export const generationAttemptStatusSchema = z.enum([
  "CREATED",
  "SUBMITTING",
  "SUBMITTED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "SUBMISSION_OUTCOME_UNKNOWN",
  "RECONCILING",
  "RECONCILED_SUCCEEDED",
  "RECONCILED_FAILED"
]);

export const generationAttemptSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  clipId: entityIdSchema,
  attemptNumber: z.number().int().positive(),
  generationRequestId: entityIdSchema,
  requestHash: sha256Schema,
  preflightReportId: entityIdSchema,
  userApprovalId: entityIdSchema,
  approvalHash: sha256Schema,
  submissionFingerprint: sha256Schema,
  status: generationAttemptStatusSchema,
  providerHandle: providerHandleSchema.optional(),
  commandAttempts: z.array(commandAttemptRecordSchema),
  outputArtifactId: entityIdSchema.optional(),
  createdAt: isoDateTimeSchema,
  submittedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  errorCode: nonEmptyStringSchema.optional(),
  errorMessage: nonEmptyStringSchema.optional()
});

export const workflowBlockerScopeSchema = z.enum(["PROJECT", "PREFLIGHT", "GENERATION_ATTEMPT", "PROVIDER"]);
export const workflowBlockerReasonSchema = z.enum([
  "DREAMINA_NOT_FOUND",
  "PROVIDER_IDENTITY_UNVERIFIED",
  "AUTHENTICATION_REQUIRED",
  "INTERACTIVE_LOGIN_REQUIRED",
  "ENTITLEMENT_INSUFFICIENT",
  "CAPABILITY_UNSUPPORTED",
  "COST_CONFIRMATION_REQUIRED",
  "SUBMISSION_RECONCILIATION_REQUIRED",
  "PROVIDER_CHANGED",
  "ARTIFACT_INTEGRITY_FAILURE",
  "ORPHAN_ARTIFACT_QUARANTINED",
  "OTHER"
]);

export const workflowBlockerSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  scope: workflowBlockerScopeSchema,
  relatedEntityId: entityIdSchema.optional(),
  reasonCode: workflowBlockerReasonSchema,
  message: nonEmptyStringSchema,
  requiredUserAction: nonEmptyStringSchema,
  resumeCheckpoint: nonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.optional()
});

export const reviewDecisionSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  clipId: entityIdSchema,
  clipHash: sha256Schema,
  generationAttemptId: entityIdSchema.optional(),
  outputArtifactId: entityIdSchema.optional(),
  outputArtifactHash: sha256Schema.optional(),
  decision: z.enum(["ACCEPT", "REDO", "SKIP", "USE"]),
  note: nonEmptyStringSchema.optional(),
  decidedAt: isoDateTimeSchema
}).superRefine((value, ctx) => {
  const outputBound = value.decision === "ACCEPT" || value.decision === "REDO";
  if (
    outputBound &&
    (!value.generationAttemptId || !value.outputArtifactId || !value.outputArtifactHash)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${value.decision} ReviewDecision requires generationAttemptId, outputArtifactId and outputArtifactHash`
    });
  }
});

export type Project = z.infer<typeof projectSchema>;
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type ProductFact = z.infer<typeof productFactSchema>;
export type ForbiddenChange = z.infer<typeof forbiddenChangeSchema>;
export type ProductTruth = z.infer<typeof productTruthSchema>;
export type CreativeBatch = z.infer<typeof creativeBatchSchema>;
export type ScriptDraft = z.infer<typeof scriptDraftSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export type VideoModel = z.infer<typeof videoModelSchema>;
export type CompiledPrompt = z.infer<typeof compiledPromptSchema>;
export type ProviderIdentity = z.infer<typeof providerIdentitySchema>;
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type PreflightReport = z.infer<typeof preflightReportSchema>;
export type UserApproval = z.infer<typeof userApprovalSchema>;
export type CommandAttemptRecord = z.infer<typeof commandAttemptRecordSchema>;
export type GenerationAttempt = z.infer<typeof generationAttemptSchema>;
export type WorkflowBlocker = z.infer<typeof workflowBlockerSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
