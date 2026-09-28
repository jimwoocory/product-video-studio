import {
  creativeBatchSchema,
  productTruthSchema,
  productionPlanSchema,
  scriptDraftSchema,
  type ProductionPlan
} from "../../domain/schemas.js";
import {
  assertPlanTraceability,
  DomainValidationError
} from "../../domain/validation.js";
import type {
  ProductDirectorGenerator,
  ProductDirectorInput
} from "../ports/product-director-generator.js";

function assertSameRef(
  actual: { entityType: string; entityId: string; version: number; hash: string },
  expected: { entityType: string; entityId: string; version: number; hash: string },
  label: string
): void {
  if (
    actual.entityType !== expected.entityType ||
    actual.entityId !== expected.entityId ||
    actual.version !== expected.version ||
    actual.hash !== expected.hash
  ) {
    throw new DomainValidationError(`${label} version ref mismatch`);
  }
}

function assertHardForbiddenChangesPreserved(
  truth: ProductDirectorInput["productTruth"],
  plan: ProductionPlan
): void {
  const planById = new Map(
    plan.continuityLock.product.forbiddenChanges.map((item) => [item.id, item])
  );
  for (const required of truth.forbiddenChanges.filter((item) => item.severity === "HARD")) {
    const actual = planById.get(required.id);
    if (
      !actual ||
      actual.severity !== "HARD" ||
      actual.field !== required.field ||
      actual.description !== required.description
    ) {
      throw new DomainValidationError(
        `Product Director failed HARD ForbiddenChange: ${required.id}`
      );
    }
  }
}

export class ProductDirectorService {
  constructor(private readonly generator: ProductDirectorGenerator) {}

  async generate(inputRaw: ProductDirectorInput): Promise<ProductionPlan> {
    const productTruth = productTruthSchema.parse(inputRaw.productTruth);
    const creativeBatch = creativeBatchSchema.parse(inputRaw.creativeBatch);
    const script = scriptDraftSchema.parse(inputRaw.script);

    if (productTruth.status !== "CONFIRMED") {
      throw new DomainValidationError("Product Director requires CONFIRMED ProductTruth");
    }
    if (creativeBatch.status !== "ACTIVE") {
      throw new DomainValidationError("Product Director requires ACTIVE CreativeBatch");
    }
    if (script.status !== "CONFIRMED") {
      throw new DomainValidationError("Product Director requires CONFIRMED ScriptDraft");
    }
    if (!creativeBatch.concepts.some((item) => item.id === inputRaw.selectedCreativeId)) {
      throw new DomainValidationError("selectedCreativeId is not in CreativeBatch");
    }
    if (script.selectedCreativeId !== inputRaw.selectedCreativeId) {
      throw new DomainValidationError("Script selectedCreativeId mismatch");
    }
    assertSameRef(creativeBatch.productTruthRef, script.productTruthRef, "ProductTruth");
    assertSameRef(
      script.creativeBatchRef,
      {
        entityType: "CreativeBatch",
        entityId: creativeBatch.id,
        version: creativeBatch.version,
        hash: creativeBatch.contentHash
      },
      "CreativeBatch"
    );

    const generated = productionPlanSchema.parse(
      await this.generator.generate({
        ...inputRaw,
        productTruth,
        creativeBatch,
        script
      })
    );

    if (generated.projectId !== productTruth.projectId) {
      throw new DomainValidationError("Generated ProductionPlan projectId mismatch");
    }
    assertSameRef(generated.productTruthRef, script.productTruthRef, "ProductionPlan ProductTruth");
    assertSameRef(
      generated.scriptRef,
      {
        entityType: "ScriptDraft",
        entityId: script.id,
        version: script.version,
        hash: script.contentHash
      },
      "ProductionPlan Script"
    );
    if (generated.selectedCreativeId !== inputRaw.selectedCreativeId) {
      throw new DomainValidationError("Generated ProductionPlan selectedCreativeId mismatch");
    }

    assertPlanTraceability(productTruth, script, generated);
    assertHardForbiddenChangesPreserved(productTruth, generated);

    const totalClipMs = generated.scenes
      .flatMap((scene) => scene.clips)
      .reduce((sum, clip) => sum + clip.durationMs, 0);
    const toleranceMs = Math.max(5000, Math.round(inputRaw.projectTargetDurationMs * 0.1));
    if (Math.abs(totalClipMs - inputRaw.projectTargetDurationMs) > toleranceMs) {
      throw new DomainValidationError(
        `ProductionPlan clip duration ${totalClipMs}ms is outside target tolerance`
      );
    }

    return generated;
  }
}
