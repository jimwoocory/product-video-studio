import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { StructuredAiRuntime } from "../ports/structured-ai-runtime.js";
import {
  creativeBatchSchema,
  productTruthSchema,
  scriptDraftSchema,
  type CreativeBatch,
  type ForbiddenChange,
  type ProductTruth,
  type ScriptDraft
} from "../../domain/schemas.js";
import { hashValue } from "../../domain/hashing.js";
import {
  assertFactReferences,
  DomainValidationError
} from "../../domain/validation.js";

const productTruthProposalSchema = z.object({
  standardColors: z.array(z.string().trim().min(1)).max(12),
  confirmedFeatures: z.array(
    z.object({
      statement: z.string().trim().min(1),
      evidenceRef: z.string().trim().min(1).optional()
    })
  ).max(30),
  sellingPoints: z.array(
    z.object({
      statement: z.string().trim().min(1),
      evidenceRef: z.string().trim().min(1).optional()
    })
  ).max(20),
  uncertainClaims: z.array(
    z.object({
      statement: z.string().trim().min(1),
      reason: z.string().trim().min(1)
    })
  ).max(30)
});

const creativeProposalSchema = z.object({
  concepts: z.array(
    z.object({
      title: z.string().trim().min(1),
      targetAudience: z.string().trim().min(1),
      painPoint: z.string().trim().min(1),
      hook: z.string().trim().min(1),
      coreSellingPoint: z.string().trim().min(1),
      narrativePattern: z.string().trim().min(1),
      expectedDurationMs: z.number().int().min(60000).max(120000),
      productShowcaseStrategy: z.string().trim().min(1),
      generationRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
      requiredFactIds: z.array(z.string().trim().min(1))
    })
  ).min(4).max(6)
});

const scriptProposalSchema = z.object({
  beats: z.array(
    z.object({
      purpose: z.enum([
        "HOOK",
        "PAIN",
        "PRODUCT",
        "FEATURE",
        "PROOF",
        "RESULT",
        "CTA",
        "OTHER"
      ]),
      text: z.string().trim().min(1),
      estimatedDurationMs: z.number().int().positive(),
      requiredFactIds: z.array(z.string().trim().min(1))
    })
  ).min(1)
});

export type ProductInputForAi = {
  projectId: string;
  productName: string;
  featureDescription: string;
  brand?: string;
  category?: string;
  referenceImageIds: string[];
  referenceImageArtifacts: Array<{
    id: string;
    relativePath: string;
    sha256: string;
    mimeType?: string;
  }>;
  logoAssetId?: string;
  forbiddenChanges: ForbiddenChange[];
};

function contentHash<T extends object>(value: T): string {
  const copy = { ...value } as Record<string, unknown>;
  delete copy.contentHash;
  delete copy.confirmedAt;
  return hashValue(copy);
}

export class AiGenerationService {
  constructor(private readonly runtime: StructuredAiRuntime) {}

  async generateProductTruthDraft(
    input: ProductInputForAi,
    version: number
  ): Promise<ProductTruth> {
    if (!input.referenceImageIds.length) {
      throw new DomainValidationError("Product Input requires at least one reference image");
    }
    if (!input.productName.trim() || !input.featureDescription.trim()) {
      throw new DomainValidationError("Product name and feature description are required");
    }

    const raw = await this.runtime.generateJson({
      task: "Generate a DRAFT Product Truth proposal for user review.",
      instructions: [
        "Only treat information explicitly stated in productName/featureDescription/brand/category as confirmed fact candidates.",
        "Images are identity references. If you cannot actually inspect an image, do not infer color, shape, logo, packaging or text from its filename/path.",
        "Any inferred benefit, performance claim, audience assumption, visual guess or unsupported marketing statement must go to uncertainClaims.",
        "Do not invent certifications, numbers, test results, materials, origins or comparative claims.",
        "confirmedFeatures and sellingPoints are proposals only; the user must confirm the Product Truth before downstream use."
      ].join(" "),
      input,
      outputContract: {
        standardColors: ["string"],
        confirmedFeatures: [{ statement: "string", evidenceRef: "optional string" }],
        sellingPoints: [{ statement: "string", evidenceRef: "optional string" }],
        uncertainClaims: [{ statement: "string", reason: "string" }]
      }
    });
    const proposal = productTruthProposalSchema.parse(raw);
    const now = new Date().toISOString();

    const draftWithoutHash = {
      id: randomUUID(),
      projectId: input.projectId,
      version,
      status: "DRAFT" as const,
      productName: input.productName.trim(),
      ...(input.brand?.trim() ? { brand: input.brand.trim() } : {}),
      ...(input.category?.trim() ? { category: input.category.trim() } : {}),
      referenceImageIds: [...input.referenceImageIds],
      canonicalImageId: input.referenceImageIds[0]!,
      ...(input.logoAssetId ? { logoAssetId: input.logoAssetId } : {}),
      standardColors: proposal.standardColors,
      confirmedFeatures: proposal.confirmedFeatures.map((item) => ({
        id: randomUUID(),
        statement: item.statement,
        sourceType: "user" as const,
        ...(item.evidenceRef ? { evidenceRef: item.evidenceRef } : {}),
        createdAt: now
      })),
      sellingPoints: proposal.sellingPoints.map((item) => ({
        id: randomUUID(),
        statement: item.statement,
        sourceType: "user" as const,
        ...(item.evidenceRef ? { evidenceRef: item.evidenceRef } : {}),
        createdAt: now
      })),
      forbiddenChanges: input.forbiddenChanges,
      uncertainClaims: proposal.uncertainClaims.map((item) => ({
        id: randomUUID(),
        statement: item.statement,
        reason: item.reason,
        status: "UNVERIFIED" as const,
        dispositionConfirmedByUser: false
      })),
      evidenceRefs: [
        ...input.referenceImageArtifacts.map(
          (artifact) => `artifact:${artifact.id}#${artifact.sha256}`
        )
      ],
      inputRefs: []
    };
    return productTruthSchema.parse({
      ...draftWithoutHash,
      contentHash: contentHash(draftWithoutHash)
    });
  }

  async generateCreativeBatch(
    truthInput: ProductTruth,
    version: number
  ): Promise<CreativeBatch> {
    const truth = productTruthSchema.parse(truthInput);
    if (truth.status !== "CONFIRMED") {
      throw new DomainValidationError("Creative generation requires CONFIRMED ProductTruth");
    }
    const allowedFacts = [...truth.confirmedFeatures, ...truth.sellingPoints].map(
      (fact) => ({ id: fact.id, statement: fact.statement })
    );
    const raw = await this.runtime.generateJson({
      task: "Generate 4-6 marketing creative concepts for a 60-120 second Douyin product video.",
      instructions: [
        "Use only fact IDs supplied in allowedFacts.",
        "Never use uncertainClaims as a product fact.",
        "Each concept must have a concrete first-3-second hook, audience, pain point, core selling point, narrative pattern and product showcase strategy.",
        "Do not rank or auto-select a winner.",
        "generationRisk reflects generation difficulty, not business quality."
      ].join(" "),
      input: {
        productName: truth.productName,
        brand: truth.brand,
        category: truth.category,
        allowedFacts,
        forbiddenChanges: truth.forbiddenChanges
      },
      outputContract: {
        concepts: [
          {
            title: "string",
            targetAudience: "string",
            painPoint: "string",
            hook: "string",
            coreSellingPoint: "string",
            narrativePattern: "string",
            expectedDurationMs: 60000,
            productShowcaseStrategy: "string",
            generationRisk: "LOW|MEDIUM|HIGH",
            requiredFactIds: ["fact-id"]
          }
        ]
      }
    });
    const proposal = creativeProposalSchema.parse(raw);
    for (const concept of proposal.concepts) {
      assertFactReferences(truth, concept.requiredFactIds);
    }
    const draft = {
      id: randomUUID(),
      projectId: truth.projectId,
      version,
      status: "ACTIVE" as const,
      productTruthRef: {
        entityType: "ProductTruth",
        entityId: truth.id,
        version: truth.version,
        hash: truth.contentHash
      },
      generatorVersion: `${this.runtime.id}@${this.runtime.version}`,
      concepts: proposal.concepts.map((concept) => ({
        id: randomUUID(),
        ...concept
      })),
      createdAt: new Date().toISOString()
    };
    return creativeBatchSchema.parse({
      ...draft,
      contentHash: contentHash(draft)
    });
  }

  async generateScriptDraft(input: {
    truth: ProductTruth;
    batch: CreativeBatch;
    selectedCreativeId: string;
    version: number;
    targetDurationMs: number;
  }): Promise<ScriptDraft> {
    const truth = productTruthSchema.parse(input.truth);
    const batch = creativeBatchSchema.parse(input.batch);
    if (truth.status !== "CONFIRMED") {
      throw new DomainValidationError("Script generation requires CONFIRMED ProductTruth");
    }
    if (batch.status !== "ACTIVE") {
      throw new DomainValidationError("Script generation requires ACTIVE CreativeBatch");
    }
    const selected = batch.concepts.find(
      (concept) => concept.id === input.selectedCreativeId
    );
    if (!selected) {
      throw new DomainValidationError("selectedCreativeId is not in current CreativeBatch");
    }

    const allowedFacts = [...truth.confirmedFeatures, ...truth.sellingPoints].map(
      (fact) => ({ id: fact.id, statement: fact.statement })
    );
    const raw = await this.runtime.generateJson({
      task: "Generate a structured 60-120 second product marketing script draft.",
      instructions: [
        "Return ScriptBeat data only.",
        "The first beat must establish a strong hook appropriate for the selected creative.",
        "Include pain/need, product appearance, features/selling points, result and CTA when appropriate.",
        "Every factual product statement must cite only IDs from allowedFacts.",
        "Do not cite or restate uncertainClaims as fact.",
        "Sum estimatedDurationMs close to targetDurationMs."
      ].join(" "),
      input: {
        targetDurationMs: input.targetDurationMs,
        selectedCreative: selected,
        allowedFacts,
        forbiddenChanges: truth.forbiddenChanges
      },
      outputContract: {
        beats: [
          {
            purpose: "HOOK|PAIN|PRODUCT|FEATURE|PROOF|RESULT|CTA|OTHER",
            text: "string",
            estimatedDurationMs: 5000,
            requiredFactIds: ["fact-id"]
          }
        ]
      }
    });
    const proposal = scriptProposalSchema.parse(raw);
    const total = proposal.beats.reduce(
      (sum, beat) => sum + beat.estimatedDurationMs,
      0
    );
    const tolerance = Math.max(5000, Math.round(input.targetDurationMs * 0.1));
    if (Math.abs(total - input.targetDurationMs) > tolerance) {
      throw new DomainValidationError(
        `Generated script duration ${total}ms is outside target tolerance`
      );
    }
    proposal.beats.forEach((beat) =>
      assertFactReferences(truth, beat.requiredFactIds)
    );

    const draft = {
      id: randomUUID(),
      projectId: truth.projectId,
      version: input.version,
      status: "DRAFT" as const,
      productTruthRef: {
        entityType: "ProductTruth",
        entityId: truth.id,
        version: truth.version,
        hash: truth.contentHash
      },
      creativeBatchRef: {
        entityType: "CreativeBatch",
        entityId: batch.id,
        version: batch.version,
        hash: batch.contentHash
      },
      selectedCreativeId: input.selectedCreativeId,
      targetDurationMs: input.targetDurationMs,
      beats: proposal.beats.map((beat, index) => ({
        id: randomUUID(),
        order: index + 1,
        ...beat
      }))
    };
    return scriptDraftSchema.parse({
      ...draft,
      contentHash: contentHash(draft)
    });
  }
}
