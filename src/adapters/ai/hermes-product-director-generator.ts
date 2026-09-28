import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  ProductDirectorGenerator,
  ProductDirectorInput
} from "../../application/ports/product-director-generator.js";
import type { StructuredAiRuntime } from "../../application/ports/structured-ai-runtime.js";
import {
  productionPlanSchema,
  type ProductionPlan
} from "../../domain/schemas.js";
import { hashValue } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";

const stateProposalSchema = z.object({
  description: z.string().trim().min(1),
  productState: z.string().trim().min(1),
  environmentState: z.string().trim().min(1)
});

const dialogueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("NONE") }),
  z.object({
    kind: z.enum(["DIALOGUE", "NARRATION"]),
    text: z.string().trim().min(1),
    estimatedDurationMs: z.number().int().positive(),
    estimatorVersion: z.string().trim().min(1)
  })
]);

const ambientSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("NONE") }),
  z.object({
    kind: z.literal("AMBIENT"),
    description: z.string().trim().min(1)
  })
]);

const segmentProposalSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  shotSize: z.string().trim().min(1),
  cameraPosition: z.string().trim().min(1),
  cameraAngle: z.string().trim().min(1),
  cameraMovement: z.string().trim().min(1),
  composition: z.string().trim().min(1),
  subjectAction: z.string().trim().min(1),
  productState: z.string().trim().min(1),
  dialogueOrNarration: dialogueSchema,
  ambientSound: ambientSchema,
  lighting: z.string().trim().min(1),
  continuityIn: stateProposalSchema,
  continuityOut: stateProposalSchema,
  sourceBeatIds: z.array(z.string().trim().min(1)).min(1),
  requiredFactIds: z.array(z.string().trim().min(1))
});

const clipProposalSchema = z.object({
  durationMs: z.number().int().min(4000).max(15000),
  purpose: z.string().trim().min(1),
  openingState: stateProposalSchema,
  closingState: stateProposalSchema,
  referenceAssets: z.array(
    z.object({
      assetId: z.string().trim().min(1),
      role: z.enum([
        "PRIMARY_PRODUCT",
        "LOGO",
        "STYLE",
        "ENVIRONMENT",
        "CHARACTER",
        "OTHER"
      ]),
      priority: z.number().int().nonnegative(),
      required: z.boolean()
    })
  ),
  productVisibility: z.enum(["NONE", "PARTIAL", "CLEAR", "HERO"]),
  strictProductIdentity: z.boolean(),
  strictProductIdentityScope: z.array(z.string().trim().min(1)),
  riskAssessment: z.object({
    level: z.enum(["LOW", "MEDIUM", "HIGH"]),
    reasonCodes: z.array(z.string().trim().min(1)),
    mitigations: z.array(z.string().trim().min(1)),
    source: z.literal("PRODUCT_DIRECTOR")
  }),
  sourceBeatIds: z.array(z.string().trim().min(1)).min(1),
  requiredFactIds: z.array(z.string().trim().min(1)),
  segments: z.array(segmentProposalSchema).min(1)
});

const directorProposalSchema = z.object({
  visualDirection: z.string().trim().min(1),
  soundDirection: z.string().trim().min(1),
  productShowcaseRules: z.array(z.string().trim().min(1)),
  characters: z.array(
    z.object({
      name: z.string().trim().min(1),
      stableAppearance: z.string().trim().min(1),
      wardrobe: z.string().trim().min(1)
    })
  ),
  scenes: z.array(
    z.object({
      purpose: z.string().trim().min(1),
      location: z.string().trim().min(1),
      timeOfDay: z.string().trim().min(1).optional(),
      visualState: z.string().trim().min(1),
      stableElements: z.array(z.string().trim().min(1)),
      sourceBeatIds: z.array(z.string().trim().min(1)).min(1),
      requiredFactIds: z.array(z.string().trim().min(1)),
      clips: z.array(clipProposalSchema).min(1)
    })
  ).min(1)
});

type StateProposal = z.infer<typeof stateProposalSchema>;

function stateEqual(a: StateProposal, b: StateProposal): boolean {
  return (
    a.description === b.description &&
    a.productState === b.productState &&
    a.environmentState === b.environmentState
  );
}

function withStateHash(state: StateProposal) {
  return {
    ...state,
    stateHash: hashValue(state)
  };
}

function hashContent(value: object): string {
  return hashValue(value);
}

export class HermesProductDirectorGenerator implements ProductDirectorGenerator {
  readonly id = "hermes-product-director";
  readonly version = "p0-v1";

  constructor(private readonly runtime: StructuredAiRuntime) {}

  async generate(input: ProductDirectorInput): Promise<ProductionPlan> {
    const facts = [
      ...input.productTruth.confirmedFeatures,
      ...input.productTruth.sellingPoints
    ].map((fact) => ({ id: fact.id, statement: fact.statement }));

    const raw = await this.runtime.generateJson({
      task:
        "Generate a Product Director ProductionPlan draft with Scene -> Clip -> Segment structure.",
      instructions: [
        "The total Clip duration must be close to projectTargetDurationMs.",
        "Each Clip must be 4000-15000 integer milliseconds and contain at least one Segment.",
        "Within each Clip, Segments must start at 0, end at durationMs, be contiguous, ordered, and have no gap or overlap.",
        "Adjacent Segment continuityOut and continuityIn objects must be exactly identical.",
        "The first Segment continuityIn must equal Clip openingState; the last continuityOut must equal Clip closingState.",
        "Use only sourceBeatIds from the supplied script and only requiredFactIds from allowedFacts.",
        "Do not introduce new product claims.",
        "Product Truth HARD forbidden changes are immutable and will be injected by code; do not attempt to rewrite them.",
        "Audio fields are mandatory and must explicitly use NONE when absent.",
        "Reference asset IDs may only come from referenceAssets.",
        "Do not return system IDs, hashes, versions or upstream refs."
      ].join(" "),
      input: {
        projectTargetDurationMs: input.projectTargetDurationMs,
        selectedCreativeId: input.selectedCreativeId,
        selectedCreative: input.creativeBatch.concepts.find(
          (item) => item.id === input.selectedCreativeId
        ),
        scriptBeats: input.script.beats.map((beat) => ({
          id: beat.id,
          purpose: beat.purpose,
          text: beat.text,
          estimatedDurationMs: beat.estimatedDurationMs,
          requiredFactIds: beat.requiredFactIds
        })),
        allowedFacts: facts,
        referenceAssets: input.productTruth.referenceImageIds.map((assetId) => ({
          assetId,
          suggestedRole: "PRIMARY_PRODUCT"
        })),
        logoAssetId: input.productTruth.logoAssetId,
        forbiddenChanges: input.productTruth.forbiddenChanges
      },
      outputContract: {
        visualDirection: "string",
        soundDirection: "string",
        productShowcaseRules: ["string"],
        characters: [
          {
            name: "string",
            stableAppearance: "string",
            wardrobe: "string"
          }
        ],
        scenes: [
          {
            purpose: "string",
            location: "string",
            timeOfDay: "optional string",
            visualState: "string",
            stableElements: ["string"],
            sourceBeatIds: ["beat-id"],
            requiredFactIds: ["fact-id"],
            clips: [
              {
                durationMs: 12000,
                purpose: "string",
                openingState: {
                  description: "string",
                  productState: "string",
                  environmentState: "string"
                },
                closingState: {
                  description: "string",
                  productState: "string",
                  environmentState: "string"
                },
                referenceAssets: [
                  {
                    assetId: "asset-id",
                    role:
                      "PRIMARY_PRODUCT|LOGO|STYLE|ENVIRONMENT|CHARACTER|OTHER",
                    priority: 0,
                    required: true
                  }
                ],
                productVisibility: "NONE|PARTIAL|CLEAR|HERO",
                strictProductIdentity: true,
                strictProductIdentityScope: ["logo"],
                riskAssessment: {
                  level: "LOW|MEDIUM|HIGH",
                  reasonCodes: ["string"],
                  mitigations: ["string"],
                  source: "PRODUCT_DIRECTOR"
                },
                sourceBeatIds: ["beat-id"],
                requiredFactIds: ["fact-id"],
                segments: [
                  {
                    startMs: 0,
                    endMs: 4000,
                    shotSize: "string",
                    cameraPosition: "string",
                    cameraAngle: "string",
                    cameraMovement: "string",
                    composition: "string",
                    subjectAction: "string",
                    productState: "string",
                    dialogueOrNarration: { kind: "NONE" },
                    ambientSound: { kind: "NONE" },
                    lighting: "string",
                    continuityIn: {
                      description: "string",
                      productState: "string",
                      environmentState: "string"
                    },
                    continuityOut: {
                      description: "string",
                      productState: "string",
                      environmentState: "string"
                    },
                    sourceBeatIds: ["beat-id"],
                    requiredFactIds: ["fact-id"]
                  }
                ]
              }
            ]
          }
        ]
      }
    });

    const proposal = directorProposalSchema.parse(raw);
    const allowedBeatIds = new Set(input.script.beats.map((beat) => beat.id));
    const allowedFactIds = new Set(facts.map((fact) => fact.id));
    const allowedAssetIds = new Set([
      ...input.productTruth.referenceImageIds,
      ...(input.productTruth.logoAssetId ? [input.productTruth.logoAssetId] : [])
    ]);

    const scenes = proposal.scenes.map((scene, sceneIndex) => {
      for (const beatId of scene.sourceBeatIds) {
        if (!allowedBeatIds.has(beatId)) {
          throw new DomainValidationError(
            `Director used unknown ScriptBeat: ${beatId}`
          );
        }
      }
      for (const factId of scene.requiredFactIds) {
        if (!allowedFactIds.has(factId)) {
          throw new DomainValidationError(
            `Director used unknown ProductFact: ${factId}`
          );
        }
      }

      const sceneId = randomUUID();
      const clips = scene.clips.map((clip, clipIndex) => {
        for (const usage of clip.referenceAssets) {
          if (!allowedAssetIds.has(usage.assetId)) {
            throw new DomainValidationError(
              `Director used unknown reference asset: ${usage.assetId}`
            );
          }
        }
        for (const beatId of clip.sourceBeatIds) {
          if (!allowedBeatIds.has(beatId)) {
            throw new DomainValidationError(
              `Director used unknown ScriptBeat: ${beatId}`
            );
          }
        }
        for (const factId of clip.requiredFactIds) {
          if (!allowedFactIds.has(factId)) {
            throw new DomainValidationError(
              `Director used unknown ProductFact: ${factId}`
            );
          }
        }

        const segments = clip.segments.map((segment, segmentIndex) => {
          if (segmentIndex === 0 && !stateEqual(segment.continuityIn, clip.openingState)) {
            throw new DomainValidationError(
              "Director first Segment continuityIn must equal Clip openingState"
            );
          }
          if (
            segmentIndex === clip.segments.length - 1 &&
            !stateEqual(segment.continuityOut, clip.closingState)
          ) {
            throw new DomainValidationError(
              "Director last Segment continuityOut must equal Clip closingState"
            );
          }
          if (
            segmentIndex > 0 &&
            !stateEqual(
              clip.segments[segmentIndex - 1]!.continuityOut,
              segment.continuityIn
            )
          ) {
            throw new DomainValidationError(
              "Director adjacent Segment continuity states do not match"
            );
          }
          for (const beatId of segment.sourceBeatIds) {
            if (!allowedBeatIds.has(beatId)) {
              throw new DomainValidationError(
                `Director Segment used unknown ScriptBeat: ${beatId}`
              );
            }
          }
          for (const factId of segment.requiredFactIds) {
            if (!allowedFactIds.has(factId)) {
              throw new DomainValidationError(
                `Director Segment used unknown ProductFact: ${factId}`
              );
            }
          }

          return {
            id: randomUUID(),
            order: segmentIndex + 1,
            ...segment,
            continuityIn: withStateHash(segment.continuityIn),
            continuityOut: withStateHash(segment.continuityOut)
          };
        });

        const clipWithoutHash = {
          id: randomUUID(),
          sceneId,
          order: clipIndex + 1,
          durationMs: clip.durationMs,
          purpose: clip.purpose,
          openingState: withStateHash(clip.openingState),
          closingState: withStateHash(clip.closingState),
          referenceAssets: clip.referenceAssets,
          productVisibility: clip.productVisibility,
          strictProductIdentity: clip.strictProductIdentity,
          strictProductIdentityScope: clip.strictProductIdentityScope,
          riskAssessment: clip.riskAssessment,
          sourceBeatIds: clip.sourceBeatIds,
          requiredFactIds: clip.requiredFactIds,
          segments,
          aggregateStatus: "PLANNED" as const
        };
        return {
          ...clipWithoutHash,
          contentHash: hashContent(clipWithoutHash)
        };
      });

      return {
        id: sceneId,
        order: sceneIndex + 1,
        purpose: scene.purpose,
        location: scene.location,
        ...(scene.timeOfDay ? { timeOfDay: scene.timeOfDay } : {}),
        visualState: scene.visualState,
        sourceBeatIds: scene.sourceBeatIds,
        requiredFactIds: scene.requiredFactIds,
        clips
      };
    });

    const draftWithoutHash = {
      id: randomUUID(),
      projectId: input.productTruth.projectId,
      version: input.productionPlanVersion ?? 1,
      status: "DRAFT" as const,
      productTruthRef: {
        entityType: "ProductTruth",
        entityId: input.productTruth.id,
        version: input.productTruth.version,
        hash: input.productTruth.contentHash
      },
      scriptRef: {
        entityType: "ScriptDraft",
        entityId: input.script.id,
        version: input.script.version,
        hash: input.script.contentHash
      },
      selectedCreativeId: input.selectedCreativeId,
      visualDirection: proposal.visualDirection,
      soundDirection: proposal.soundDirection,
      productShowcaseRules: proposal.productShowcaseRules,
      continuityLock: {
        product: {
          stableAttributes: [
            `productName:${input.productTruth.productName}`,
            ...input.productTruth.standardColors.map((item) => `color:${item}`)
          ],
          forbiddenChanges: structuredClone(input.productTruth.forbiddenChanges)
        },
        characters: proposal.characters,
        environments: proposal.scenes.map((scene, index) => ({
          sceneId: scenes[index]!.id,
          stableElements: scene.stableElements
        }))
      },
      scenes
    };

    return productionPlanSchema.parse({
      ...draftWithoutHash,
      contentHash: hashContent(draftWithoutHash)
    });
  }
}
