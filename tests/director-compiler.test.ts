import test from "node:test";
import assert from "node:assert/strict";
import type {
  CreativeBatch,
  ProductionPlan,
  ScriptDraft
} from "../src/domain/schemas.js";
import { ProductDirectorService } from "../src/application/services/product-director.js";
import type {
  ProductDirectorGenerator,
  ProductDirectorInput
} from "../src/application/ports/product-director-generator.js";
import { compileSeedancePrompt } from "../src/application/services/prompt-compiler.js";
import { DomainValidationError } from "../src/domain/validation.js";
import { hashValue } from "../src/domain/hashing.js";
import { H, ISO, makeProductTruth, makeValidClip } from "./fixtures.js";

const truth = makeProductTruth();

function makeBatch(): CreativeBatch {
  return {
    id: "batch-director",
    projectId: truth.projectId,
    version: 1,
    status: "ACTIVE",
    productTruthRef: {
      entityType: "ProductTruth",
      entityId: truth.id,
      version: truth.version,
      hash: truth.contentHash
    },
    generatorVersion: "test-v1",
    concepts: Array.from({ length: 4 }, (_, index) => ({
      id: `creative-${index + 1}`,
      title: `Concept ${index + 1}`,
      targetAudience: "buyers",
      painPoint: "need",
      hook: "hook",
      coreSellingPoint: "Feature one",
      narrativePattern: "problem-solution",
      expectedDurationMs: 60000,
      productShowcaseStrategy: "hero",
      generationRisk: "LOW" as const,
      requiredFactIds: ["fact-1"]
    })),
    selectedCreativeId: "creative-1",
    contentHash: H.b,
    createdAt: ISO
  };
}

function makeScript(batch: CreativeBatch): ScriptDraft {
  return {
    id: "script-director",
    projectId: truth.projectId,
    version: 1,
    status: "CONFIRMED",
    productTruthRef: batch.productTruthRef,
    creativeBatchRef: {
      entityType: "CreativeBatch",
      entityId: batch.id,
      version: batch.version,
      hash: batch.contentHash
    },
    selectedCreativeId: "creative-1",
    targetDurationMs: 60000,
    beats: [
      {
        id: "beat-1",
        order: 1,
        purpose: "PRODUCT",
        text: "Feature one",
        estimatedDurationMs: 60000,
        requiredFactIds: ["fact-1"]
      }
    ],
    contentHash: H.c,
    confirmedAt: ISO
  };
}

function makeLongClip(index: number) {
  const clip = makeValidClip();
  clip.id = `clip-${index}`;
  clip.order = index;
  clip.durationMs = 15000;
  clip.contentHash = hashValue({ id: clip.id, durationMs: clip.durationMs });
  clip.requiredFactIds = ["fact-1"];
  clip.sourceBeatIds = ["beat-1"];
  clip.segments[0]!.id = `clip-${index}-seg-1`;
  clip.segments[0]!.endMs = 4000;
  clip.segments[0]!.requiredFactIds = ["fact-1"];
  clip.segments[0]!.sourceBeatIds = ["beat-1"];
  clip.segments[1]!.id = `clip-${index}-seg-2`;
  clip.segments[1]!.startMs = 4000;
  clip.segments[1]!.endMs = 15000;
  clip.segments[1]!.requiredFactIds = ["fact-1"];
  clip.segments[1]!.sourceBeatIds = ["beat-1"];
  return clip;
}

function makePlan(script: ScriptDraft): ProductionPlan {
  return {
    id: "plan-director",
    projectId: truth.projectId,
    version: 1,
    status: "CONFIRMED",
    productTruthRef: script.productTruthRef,
    scriptRef: {
      entityType: "ScriptDraft",
      entityId: script.id,
      version: script.version,
      hash: script.contentHash
    },
    selectedCreativeId: script.selectedCreativeId,
    visualDirection: "clean studio",
    soundDirection: "clear narration",
    productShowcaseRules: ["show real product"],
    continuityLock: {
      product: {
        stableAttributes: ["logo"],
        forbiddenChanges: structuredClone(truth.forbiddenChanges)
      },
      characters: [],
      environments: [{ sceneId: "scene-director", stableElements: ["studio"] }]
    },
    scenes: [
      {
        id: "scene-director",
        order: 1,
        purpose: "product reveal",
        location: "studio",
        visualState: "clean",
        sourceBeatIds: ["beat-1"],
        requiredFactIds: ["fact-1"],
        clips: [1, 2, 3, 4].map(makeLongClip)
      }
    ],
    contentHash: H.e,
    confirmedAt: ISO
  };
}

class FakeDirector implements ProductDirectorGenerator {
  id = "fake";
  version = "1";
  constructor(private readonly output: ProductionPlan) {}
  async generate(_input: ProductDirectorInput): Promise<ProductionPlan> {
    return structuredClone(this.output);
  }
}

test("Product Director validates generated plan before accepting it", async () => {
  const batch = makeBatch();
  const script = makeScript(batch);
  const plan = makePlan(script);
  const service = new ProductDirectorService(new FakeDirector(plan));
  const result = await service.generate({
    productTruth: truth,
    creativeBatch: batch,
    selectedCreativeId: "creative-1",
    script,
    projectTargetDurationMs: 60000
  });
  assert.equal(result.scenes[0]?.clips.length, 4);
});

test("Product Director rejects output that drops HARD product constraint", async () => {
  const batch = makeBatch();
  const script = makeScript(batch);
  const plan = makePlan(script);
  plan.continuityLock.product.forbiddenChanges = [];
  const service = new ProductDirectorService(new FakeDirector(plan));

  await assert.rejects(
    service.generate({
      productTruth: truth,
      creativeBatch: batch,
      selectedCreativeId: "creative-1",
      script,
      projectTargetDurationMs: 60000
    }),
    (error: unknown) =>
      error instanceof DomainValidationError &&
      /HARD ForbiddenChange/.test(error.message)
  );
});

test("Prompt Compiler is deterministic and excludes UNVERIFIED claims", () => {
  const batch = makeBatch();
  const script = makeScript(batch);
  const plan = makePlan(script);

  const first = compileSeedancePrompt({
    id: "prompt-1",
    version: 1,
    createdAt: ISO,
    productTruth: truth,
    creativeBatch: batch,
    script,
    productionPlan: plan,
    clipId: "clip-1",
    assets: []
  });

  const second = compileSeedancePrompt({
    id: "prompt-2",
    version: 2,
    createdAt: "2026-09-27T06:00:00.000Z",
    productTruth: structuredClone(truth),
    creativeBatch: structuredClone(batch),
    script: structuredClone(script),
    productionPlan: structuredClone(plan),
    clipId: "clip-1",
    assets: []
  });

  assert.equal(first.promptText, second.promptText);
  assert.equal(first.compiledPromptHash, second.compiledPromptHash);
  assert.match(first.promptText, /forbid-1 \[HARD\] \[logo\]: Do not change logo/);
  assert.match(first.promptText, /fact-1: Feature one/);
  assert.doesNotMatch(first.promptText, /Unverified claim/);
  assert.equal(first.factMapping[0]?.factId, "fact-1");
  assert.equal(first.constraintMapping[0]?.forbiddenChangeId, "forbid-1");
});

test("Prompt Compiler fails closed when required reference asset is missing", () => {
  const batch = makeBatch();
  const script = makeScript(batch);
  const plan = makePlan(script);
  plan.scenes[0]!.clips[0]!.referenceAssets = [
    {
      assetId: "asset-required",
      role: "PRIMARY_PRODUCT",
      priority: 0,
      required: true
    }
  ];

  assert.throws(
    () =>
      compileSeedancePrompt({
        id: "prompt-required",
        version: 1,
        createdAt: ISO,
        productTruth: truth,
        creativeBatch: batch,
        script,
        productionPlan: plan,
        clipId: "clip-1",
        assets: []
      }),
    (error: unknown) =>
      error instanceof DomainValidationError &&
      /Required reference asset missing/.test(error.message)
  );
});
