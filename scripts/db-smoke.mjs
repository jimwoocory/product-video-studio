import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaArtifactRepository } from "../dist/src/adapters/db/prisma-artifact-repository.js";
import { PrismaVersionRepository } from "../dist/src/adapters/db/prisma-version-repository.js";
import { PrismaWorkflowRepository } from "../dist/src/adapters/db/prisma-workflow-repository.js";
import { LocalArtifactStore } from "../dist/src/adapters/store/local-artifact-store.js";
import { propagateStale } from "../dist/src/application/services/stale-propagation.js";

process.env.DATABASE_URL ??= "file:./dev.db";
const db = new PrismaClient();
const projectId = "smoke-project";
const artifactRoot = path.resolve("projects", projectId);
const now = "2026-09-27T05:00:00.000Z";
const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
  e: "e".repeat(64),
  f: "f".repeat(64)
};

try {
  await db.project.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      name: "Smoke Project",
      status: "DRAFT",
      targetPlatform: "douyin",
      targetDurationMs: 60000,
      aspectRatio: "9:16"
    }
  });

  await db.versionedEntity.createMany({
    data: [
      {
        id: "smoke-creative",
        projectId,
        entityType: "CreativeBatch",
        entityKey: "creative",
        version: 1,
        status: "ACTIVE",
        contentHash: H.a,
        dataJson: "{}"
      },
      {
        id: "smoke-script",
        projectId,
        entityType: "ScriptDraft",
        entityKey: "script",
        version: 1,
        status: "CONFIRMED",
        contentHash: H.b,
        dataJson: "{}"
      }
    ]
  });

  await db.project.update({
    where: { id: projectId },
    data: {
      currentCreativeBatchId: "smoke-creative",
      currentCreativeBatchVersion: 1,
      currentCreativeBatchHash: H.a,
      currentScriptId: "smoke-script",
      currentScriptVersion: 1,
      currentScriptHash: H.b
    }
  });
  const currentProject = await db.project.findUniqueOrThrow({
    where: { id: projectId }
  });
  if (
    currentProject.currentCreativeBatchId !== "smoke-creative" ||
    currentProject.currentScriptId !== "smoke-script"
  ) {
    throw new Error("Project current pointers were not persisted");
  }

  const staleCount = await propagateStale(
    new PrismaVersionRepository(db),
    projectId,
    "PRODUCT_TRUTH"
  );
  if (staleCount < 2) throw new Error("STALE propagation did not update expected records");

  const artifactRepo = new PrismaArtifactRepository(db);
  const store = new LocalArtifactStore(artifactRoot, artifactRepo);
  const artifact = await store.writeImmutable({
    id: "smoke-artifact",
    projectId,
    kind: "STRUCTURED_SNAPSHOT",
    relativePath: "snapshots/smoke.json",
    immutable: true,
    mimeType: "application/json",
    bytes: Buffer.from('{"smoke":true}', "utf8")
  });
  if (artifact.integrityStatus !== "READY") {
    throw new Error("Artifact did not become READY");
  }

  const fromDb = await db.artifactRecord.findUnique({ where: { id: artifact.id } });
  if (!fromDb?.sha256 || fromDb.integrityStatus !== "READY") {
    throw new Error("Artifact DB state invalid");
  }

  await db.generationRequestRecord.create({
    data: {
      id: "smoke-request",
      projectId,
      clipId: "clip-1",
      compiledPromptId: "prompt-1",
      requestHash: H.c,
      providerIdentityHash: H.d,
      capabilityFingerprint: H.e,
      status: "CURRENT",
      dataJson: "{}"
    }
  });

  await db.preflightReportRecord.create({
    data: {
      id: "smoke-preflight",
      projectId,
      generationRequestId: "smoke-request",
      requestHash: H.c,
      status: "PASS",
      providerIdentityHash: H.d,
      capabilityFingerprint: H.e,
      reportHash: H.f,
      dataJson: "{}"
    }
  });

  await db.userApprovalRecord.create({
    data: {
      id: "smoke-approval",
      projectId,
      generationRequestId: "smoke-request",
      preflightReportId: "smoke-preflight",
      requestHash: H.c,
      preflightHash: H.f,
      providerIdentityHash: H.d,
      capabilityFingerprint: H.e,
      status: "ACTIVE",
      approvalHash: H.a,
      approvedAt: new Date(now),
      dataJson: "{}"
    }
  });

  const workflow = new PrismaWorkflowRepository(db);
  await workflow.createBlocker({
    id: "smoke-blocker",
    projectId,
    scope: "PROVIDER",
    reasonCode: "DREAMINA_NOT_FOUND",
    message: "dreamina missing",
    requiredUserAction: "install official dreamina",
    resumeCheckpoint: "provider.probe",
    createdAt: now
  });
  const blockers = await workflow.listOpenBlockers(projectId);
  if (blockers.length !== 1 || blockers[0]?.reasonCode !== "DREAMINA_NOT_FOUND") {
    throw new Error("WorkflowBlocker persistence failed");
  }

  const attempt = await workflow.createGenerationAttempt({
    id: "smoke-attempt",
    projectId,
    clipId: "clip-1",
    attemptNumber: 1,
    generationRequestId: "smoke-request",
    requestHash: H.c,
    preflightReportId: "smoke-preflight",
    userApprovalId: "smoke-approval",
    approvalHash: H.a,
    submissionFingerprint: H.b,
    status: "CREATED",
    commandAttempts: [],
    createdAt: now
  });
  if (attempt.status !== "CREATED") {
    throw new Error("GenerationAttempt create failed");
  }
  const updatedAttempt = await workflow.updateGenerationAttemptStatus(
    attempt.id,
    {
      status: "SUBMISSION_OUTCOME_UNKNOWN",
      errorCode: "SUBMISSION_OUTCOME_UNKNOWN",
      errorMessage: "smoke unknown"
    }
  );
  if (updatedAttempt.status !== "SUBMISSION_OUTCOME_UNKNOWN") {
    throw new Error("GenerationAttempt status persistence failed");
  }

  console.log(JSON.stringify({
    db: "PASS",
    staleCount,
    artifactStatus: fromDb.integrityStatus,
    artifactPath: fromDb.relativePath,
    blockerCount: blockers.length,
    attemptStatus: updatedAttempt.status
  }));
} finally {
  await db.generationAttemptRecord.deleteMany({ where: { projectId } });
  await db.userApprovalRecord.deleteMany({ where: { projectId } });
  await db.preflightReportRecord.deleteMany({ where: { projectId } });
  await db.generationRequestRecord.deleteMany({ where: { projectId } });
  await db.workflowBlockerRecord.deleteMany({ where: { projectId } });
  await db.artifactRecord.deleteMany({ where: { projectId } });
  await db.versionedEntity.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { id: projectId } });
  await db.$disconnect();
  await fs.rm(artifactRoot, { recursive: true, force: true });
}
