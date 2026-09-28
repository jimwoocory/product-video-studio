import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  StructuredAiRequest,
  StructuredAiRuntime
} from "../src/application/ports/structured-ai-runtime.js";
import { AiGenerationService } from "../src/application/services/ai-generation.js";
import {
  confirmProductTruthDraft,
  confirmScriptDraft
} from "../src/application/services/review-actions.js";
import { LocalProductInputStore } from "../src/adapters/store/local-product-input-store.js";
import type {
  ArtifactRepository,
  PendingArtifactInput
} from "../src/application/ports/artifact-repository.js";
import type {
  ArtifactRecord,
  AssetRef
} from "../src/domain/schemas.js";
import { makeProductTruth, ISO } from "./fixtures.js";

class QueueAiRuntime implements StructuredAiRuntime {
  readonly id = "fake-ai";
  readonly version = "1";
  readonly requests: StructuredAiRequest[] = [];
  constructor(private readonly outputs: unknown[]) {}
  async generateJson(request: StructuredAiRequest): Promise<unknown> {
    this.requests.push(request);
    if (!this.outputs.length) throw new Error("no queued AI output");
    return structuredClone(this.outputs.shift());
  }
}

class MemoryArtifactRepository implements ArtifactRepository {
  readonly data = new Map<string, ArtifactRecord>();

  async createPending(input: PendingArtifactInput): Promise<ArtifactRecord> {
    const record: ArtifactRecord = {
      id: input.id,
      projectId: input.projectId,
      kind: input.kind,
      relativePath: input.relativePath,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      integrityStatus: "PENDING",
      immutable: true,
      createdAt: ISO
    };
    this.data.set(record.id, record);
    return record;
  }

  async markReady(
    id: string,
    fields: { sha256: string; sizeBytes: number; mimeType?: string }
  ): Promise<ArtifactRecord> {
    const current = this.data.get(id);
    if (!current) throw new Error("missing");
    const next: ArtifactRecord = {
      ...current,
      sha256: fields.sha256,
      sizeBytes: fields.sizeBytes,
      ...(fields.mimeType ? { mimeType: fields.mimeType } : {}),
      integrityStatus: "READY"
    };
    this.data.set(id, next);
    return next;
  }

  async markMissing(id: string): Promise<ArtifactRecord> {
    const current = this.data.get(id);
    if (!current) throw new Error("missing");
    const next = { ...current, integrityStatus: "MISSING" as const };
    this.data.set(id, next);
    return next;
  }

  async markCorrupt(id: string): Promise<ArtifactRecord> {
    const current = this.data.get(id);
    if (!current) throw new Error("missing");
    const next = { ...current, integrityStatus: "CORRUPT" as const };
    this.data.set(id, next);
    return next;
  }

  async findById(id: string): Promise<ArtifactRecord | null> {
    return this.data.get(id) ?? null;
  }

  async listByProject(
    projectId: string,
    kind?: ArtifactRecord["kind"]
  ): Promise<ArtifactRecord[]> {
    return [...this.data.values()].filter(
      (item) => item.projectId === projectId && (!kind || item.kind === kind)
    );
  }

  async listPending(): Promise<ArtifactRecord[]> {
    return [...this.data.values()].filter(
      (item) => item.integrityStatus === "PENDING"
    );
  }
}

test("AI Product Truth stays DRAFT and unsupported claims stay uncertain", async () => {
  const runtime = new QueueAiRuntime([
    {
      standardColors: [],
      confirmedFeatures: [{ statement: "User stated feature" }],
      sellingPoints: [],
      uncertainClaims: [
        {
          statement: "Best in market",
          reason: "Not supported by user-provided facts"
        }
      ]
    }
  ]);
  const service = new AiGenerationService(runtime);
  const truth = await service.generateProductTruthDraft(
    {
      projectId: "p1",
      productName: "Widget",
      featureDescription: "User stated feature",
      referenceImageIds: ["asset-ref-1"],
      referenceImageArtifacts: [
        {
          id: "artifact-1",
          relativePath: "input/assets/one.png",
          sha256: "a".repeat(64),
          mimeType: "image/png"
        }
      ],
      forbiddenChanges: []
    },
    1
  );

  assert.equal(truth.status, "DRAFT");
  assert.equal(truth.confirmedFeatures[0]?.statement, "User stated feature");
  assert.equal(truth.uncertainClaims[0]?.status, "UNVERIFIED");
  assert.equal(
    truth.uncertainClaims[0]?.dispositionConfirmedByUser,
    false
  );
  assert.match(
    runtime.requests[0]!.instructions,
    /unsupported marketing statement must go to uncertainClaims/
  );
});

test("Product Truth confirmation creates a new version and preserves UNVERIFIED isolation", () => {
  const confirmedFixture = makeProductTruth();
  const draft = {
    ...confirmedFixture,
    id: "draft-truth",
    version: 5,
    status: "DRAFT" as const,
    confirmedAt: undefined,
    uncertainClaims: confirmedFixture.uncertainClaims.map((claim) => ({
      ...claim,
      status: "UNVERIFIED" as const,
      dispositionConfirmedByUser: false
    }))
  };
  const result = confirmProductTruthDraft(
    draft,
    { "claim-1": "KEEP_UNVERIFIED" },
    new Date(ISO)
  );

  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.version, 6);
  assert.notEqual(result.id, draft.id);
  assert.equal(result.uncertainClaims[0]?.status, "UNVERIFIED");
  assert.equal(result.uncertainClaims[0]?.dispositionConfirmedByUser, true);
  assert.equal(result.confirmedFeatures.some((fact) => fact.id === "claim-1"), false);
});

test("AI creative and script only use confirmed ProductFact ids", async () => {
  const truth = makeProductTruth();
  const runtime = new QueueAiRuntime([
    {
      concepts: Array.from({ length: 4 }, (_, index) => ({
        title: "Concept " + index,
        targetAudience: "buyers",
        painPoint: "need",
        hook: "hook",
        coreSellingPoint: "Feature one",
        narrativePattern: "problem-solution",
        expectedDurationMs: 60000,
        productShowcaseStrategy: "show product",
        generationRisk: "LOW",
        requiredFactIds: ["fact-1"]
      }))
    },
    {
      beats: [
        {
          purpose: "HOOK",
          text: "Hook",
          estimatedDurationMs: 5000,
          requiredFactIds: []
        },
        {
          purpose: "FEATURE",
          text: "Feature one",
          estimatedDurationMs: 45000,
          requiredFactIds: ["fact-1"]
        },
        {
          purpose: "CTA",
          text: "CTA",
          estimatedDurationMs: 10000,
          requiredFactIds: []
        }
      ]
    }
  ]);
  const service = new AiGenerationService(runtime);
  const batch = await service.generateCreativeBatch(truth, 1);
  const selected = batch.concepts[0]!.id;
  const script = await service.generateScriptDraft({
    truth,
    batch,
    selectedCreativeId: selected,
    version: 1,
    targetDurationMs: 60000
  });

  assert.equal(batch.concepts.length, 4);
  assert.equal(script.status, "DRAFT");
  assert.equal(script.beats[1]?.requiredFactIds[0], "fact-1");
  const confirmedScript = confirmScriptDraft(script, new Date(ISO));
  assert.equal(confirmedScript.status, "CONFIRMED");
  assert.equal(confirmedScript.version, 2);
});

test("Product Input snapshot persists immutable JSON and reloads after store recreation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pvs-product-input-"));
  const repo = new MemoryArtifactRepository();
  const asset: AssetRef = {
    id: "asset-ref-1",
    artifactId: "raw-artifact-1",
    type: "image",
    source: "user_upload",
    originalFilename: "product.png",
    sha256: "b".repeat(64),
    mimeType: "image/png",
    sizeBytes: 10,
    createdAt: ISO
  };
  try {
    const firstStore = new LocalProductInputStore(root, repo);
    const saved = await firstStore.save({
      projectId: "p-input",
      productName: "Widget",
      featureDescription: "Feature",
      assets: [asset],
      forbiddenChanges: []
    });
    assert.equal(saved.version, 1);

    const secondStore = new LocalProductInputStore(root, repo);
    const reloaded = await secondStore.latest("p-input");
    assert.equal(reloaded?.productName, "Widget");
    assert.equal(reloaded?.contentHash, saved.contentHash);
    assert.equal(reloaded?.assets[0]?.id, "asset-ref-1");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
