import {
  compiledPromptSchema,
  creativeBatchSchema,
  productTruthSchema,
  productionPlanSchema,
  scriptDraftSchema,
  type AssetRef,
  type CompiledPrompt,
  type ProductFact,
  type VideoModel
} from "../../domain/schemas.js";
import {
  assertFactReferences,
  assertPlanTraceability,
  DomainValidationError
} from "../../domain/validation.js";
import { hashValue } from "../../domain/hashing.js";

export const PROMPT_COMPILER_TEMPLATE_VERSION = "p0-seedance-v1";

export type PromptCompilerInput = {
  id: string;
  version: number;
  createdAt: string;
  productTruth: Parameters<typeof productTruthSchema.parse>[0];
  creativeBatch: Parameters<typeof creativeBatchSchema.parse>[0];
  script: Parameters<typeof scriptDraftSchema.parse>[0];
  productionPlan: Parameters<typeof productionPlanSchema.parse>[0];
  clipId: string;
  model?: VideoModel;
  assets: AssetRef[];
};

function ref(
  entityType: string,
  entityId: string,
  version: number,
  hash: string
) {
  return { entityType, entityId, version, hash };
}

function audioText(
  value:
    | { kind: "NONE" }
    | { kind: "DIALOGUE" | "NARRATION"; text: string; estimatedDurationMs: number; estimatorVersion: string }
): string {
  if (value.kind === "NONE") return "NONE";
  return `${value.kind}: ${value.text} [estimated=${value.estimatedDurationMs}ms; estimator=${value.estimatorVersion}]`;
}

function ambientText(value: { kind: "NONE" } | { kind: "AMBIENT"; description: string }): string {
  return value.kind === "NONE" ? "NONE" : `AMBIENT: ${value.description}`;
}

function factMap(facts: ProductFact[]): Map<string, ProductFact> {
  return new Map(facts.map((item) => [item.id, item]));
}

export function compileSeedancePrompt(input: PromptCompilerInput): CompiledPrompt {
  const model = input.model ?? "seedance-2.0";
  const truth = productTruthSchema.parse(input.productTruth);
  const batch = creativeBatchSchema.parse(input.creativeBatch);
  const script = scriptDraftSchema.parse(input.script);
  const plan = productionPlanSchema.parse(input.productionPlan);

  if (truth.status !== "CONFIRMED") {
    throw new DomainValidationError("Prompt Compiler requires CONFIRMED ProductTruth");
  }
  if (script.status !== "CONFIRMED" || plan.status !== "CONFIRMED") {
    throw new DomainValidationError("Prompt Compiler requires confirmed Script and ProductionPlan");
  }
  if (
    batch.productTruthRef.entityId !== truth.id ||
    batch.productTruthRef.version !== truth.version ||
    batch.productTruthRef.hash !== truth.contentHash
  ) {
    throw new DomainValidationError("CreativeBatch ProductTruth ref mismatch");
  }
  if (
    script.productTruthRef.entityId !== truth.id ||
    script.productTruthRef.version !== truth.version ||
    script.productTruthRef.hash !== truth.contentHash ||
    script.creativeBatchRef.entityId !== batch.id ||
    script.creativeBatchRef.version !== batch.version ||
    script.creativeBatchRef.hash !== batch.contentHash
  ) {
    throw new DomainValidationError("Script upstream version ref mismatch");
  }
  if (
    plan.productTruthRef.entityId !== truth.id ||
    plan.productTruthRef.version !== truth.version ||
    plan.productTruthRef.hash !== truth.contentHash ||
    plan.scriptRef.entityId !== script.id ||
    plan.scriptRef.version !== script.version ||
    plan.scriptRef.hash !== script.contentHash
  ) {
    throw new DomainValidationError("ProductionPlan upstream version ref mismatch");
  }
  if (
    batch.selectedCreativeId &&
    batch.selectedCreativeId !== script.selectedCreativeId
  ) {
    throw new DomainValidationError("Creative selection mismatch");
  }
  if (script.selectedCreativeId !== plan.selectedCreativeId) {
    throw new DomainValidationError("ProductionPlan selectedCreativeId mismatch");
  }

  assertPlanTraceability(truth, script, plan);

  const containingScenes = plan.scenes.filter((scene) =>
    scene.clips.some((clip) => clip.id === input.clipId)
  );
  if (containingScenes.length !== 1) {
    throw new DomainValidationError("clipId must belong to exactly one Scene");
  }
  const scene = containingScenes[0]!;
  const clip = scene.clips.find((item) => item.id === input.clipId)!;

  const hardTruth = truth.forbiddenChanges.filter((item) => item.severity === "HARD");
  const planConstraintById = new Map(
    plan.continuityLock.product.forbiddenChanges.map((item) => [item.id, item])
  );
  for (const item of hardTruth) {
    const planned = planConstraintById.get(item.id);
    if (
      !planned ||
      planned.severity !== "HARD" ||
      planned.field !== item.field ||
      planned.description !== item.description
    ) {
      throw new DomainValidationError(`HARD ForbiddenChange not preserved: ${item.id}`);
    }
  }

  const allFacts = [...truth.confirmedFeatures, ...truth.sellingPoints];
  const facts = factMap(allFacts);
  const factIds = [...new Set([
    ...clip.requiredFactIds,
    ...clip.segments.flatMap((segment) => segment.requiredFactIds)
  ])].sort();
  assertFactReferences(truth, factIds);

  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const assetManifest = [...clip.referenceAssets]
    .sort((a, b) => a.priority - b.priority || a.assetId.localeCompare(b.assetId))
    .map((usage) => {
      const asset = assetById.get(usage.assetId);
      if (!asset) {
        if (usage.required) {
          throw new DomainValidationError(`Required reference asset missing: ${usage.assetId}`);
        }
        return null;
      }
      return {
        assetId: asset.id,
        artifactHash: asset.sha256,
        role: usage.role,
        priority: usage.priority,
        required: usage.required
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const sortedSegments = [...clip.segments].sort(
    (a, b) => a.startMs - b.startMs || a.order - b.order || a.id.localeCompare(b.id)
  );
  const sortedConstraints = [...plan.continuityLock.product.forbiddenChanges].sort(
    (a, b) => a.id.localeCompare(b.id)
  );

  const lines: string[] = [
    "[P0_SEEDANCE_PROMPT]",
    `compiler_template=${PROMPT_COMPILER_TEMPLATE_VERSION}`,
    `provider=domestic-jimeng-cli`,
    `model=${model}`,
    `duration_ms=${clip.durationMs}`,
    "aspect_ratio=9:16",
    "",
    "[PRODUCT]",
    `name=${truth.productName}`,
    `brand=${truth.brand ?? "UNSPECIFIED"}`,
    `category=${truth.category ?? "UNSPECIFIED"}`,
    "",
    "[CONFIRMED_FACTS]"
  ];

  for (const factId of factIds) {
    const fact = facts.get(factId)!;
    lines.push(`${fact.id}: ${fact.statement}`);
  }
  if (!factIds.length) lines.push("NONE");

  lines.push("", "[FORBIDDEN_CHANGES]");
  for (const item of sortedConstraints) {
    lines.push(`${item.id} [${item.severity}] [${item.field}]: ${item.description}`);
  }
  if (!sortedConstraints.length) lines.push("NONE");

  lines.push(
    "",
    "[CLIP_STATE]",
    `opening=${clip.openingState.description}`,
    `opening_product=${clip.openingState.productState}`,
    `opening_environment=${clip.openingState.environmentState}`,
    `closing=${clip.closingState.description}`,
    `closing_product=${clip.closingState.productState}`,
    `closing_environment=${clip.closingState.environmentState}`,
    "",
    "[SEGMENTS]"
  );

  for (const segment of sortedSegments) {
    lines.push(
      `SEGMENT ${segment.id} ${segment.startMs}-${segment.endMs}ms`,
      `shot_size=${segment.shotSize}`,
      `camera_position=${segment.cameraPosition}`,
      `camera_angle=${segment.cameraAngle}`,
      `camera_movement=${segment.cameraMovement}`,
      `composition=${segment.composition}`,
      `subject_action=${segment.subjectAction}`,
      `product_state=${segment.productState}`,
      `dialogue_or_narration=${audioText(segment.dialogueOrNarration)}`,
      `ambient_sound=${ambientText(segment.ambientSound)}`,
      `lighting=${segment.lighting}`,
      `continuity_in=${segment.continuityIn.description}`,
      `continuity_out=${segment.continuityOut.description}`,
      `required_facts=${[...segment.requiredFactIds].sort().join(",") || "NONE"}`,
      ""
    );
  }

  lines.push("[REFERENCE_ASSETS]");
  for (const asset of assetManifest) {
    lines.push(
      `${asset.assetId} role=${asset.role} priority=${asset.priority} required=${asset.required} sha256=${asset.artifactHash}`
    );
  }
  if (!assetManifest.length) lines.push("NONE");

  const promptText = lines.join("\n").trimEnd();

  const factMapping = factIds.map((factId) => ({
    factId,
    sourceBeatIds: [...new Set([
      ...clip.sourceBeatIds,
      ...clip.segments
        .filter((segment) => segment.requiredFactIds.includes(factId))
        .flatMap((segment) => segment.sourceBeatIds)
    ])].sort(),
    sceneIds: [scene.id],
    clipId: clip.id,
    segmentIds: clip.segments
      .filter((segment) => segment.requiredFactIds.includes(factId))
      .map((segment) => segment.id)
      .sort(),
    promptSection: `CONFIRMED_FACTS/${factId}`
  }));

  const segmentMapping = sortedSegments.map((segment) => ({
    segmentId: segment.id,
    promptSection: `SEGMENTS/${segment.id}`
  }));

  const constraintMapping = sortedConstraints.map((item) => ({
    forbiddenChangeId: item.id,
    promptSection: `FORBIDDEN_CHANGES/${item.id}`
  }));

  const generateAudio = clip.segments.some(
    (segment) =>
      segment.dialogueOrNarration.kind !== "NONE" ||
      segment.ambientSound.kind !== "NONE"
  );

  const compiledPromptHash = hashValue({
    compilerTemplateVersion: PROMPT_COMPILER_TEMPLATE_VERSION,
    productTruthRef: ref("ProductTruth", truth.id, truth.version, truth.contentHash),
    creativeBatchRef: ref("CreativeBatch", batch.id, batch.version, batch.contentHash),
    scriptRef: ref("ScriptDraft", script.id, script.version, script.contentHash),
    productionPlanRef: ref("ProductionPlan", plan.id, plan.version, plan.contentHash),
    clipHash: clip.contentHash,
    model,
    promptText,
    assetManifest,
    factMapping,
    segmentMapping,
    constraintMapping,
    generateAudio
  });

  return compiledPromptSchema.parse({
    id: input.id,
    projectId: truth.projectId,
    clipId: clip.id,
    version: input.version,
    status: "CURRENT",
    provider: "domestic-jimeng-cli",
    model,
    productTruthRef: ref("ProductTruth", truth.id, truth.version, truth.contentHash),
    creativeBatchRef: ref("CreativeBatch", batch.id, batch.version, batch.contentHash),
    selectedCreativeId: script.selectedCreativeId,
    scriptRef: ref("ScriptDraft", script.id, script.version, script.contentHash),
    productionPlanRef: ref("ProductionPlan", plan.id, plan.version, plan.contentHash),
    clipHash: clip.contentHash,
    segmentHashes: Object.fromEntries(
      sortedSegments.map((segment) => [segment.id, hashValue(segment)])
    ),
    compilerTemplateVersion: PROMPT_COMPILER_TEMPLATE_VERSION,
    promptText,
    inputAssetManifest: assetManifest,
    factMapping,
    segmentMapping,
    constraintMapping,
    generationParams: {
      durationMs: clip.durationMs,
      aspectRatio: "9:16",
      generateAudio
    },
    compiledPromptHash,
    createdAt: input.createdAt
  });
}
