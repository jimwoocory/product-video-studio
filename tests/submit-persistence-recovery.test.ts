import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaArtifactRepository } from "../src/adapters/db/prisma-artifact-repository.js";
import { PrismaGenerationRepository } from "../src/adapters/db/prisma-generation-repository.js";
import { PrismaProductFlowRepository } from "../src/adapters/db/prisma-product-flow-repository.js";
import { PrismaProviderAuditRepository } from "../src/adapters/db/prisma-provider-audit-repository.js";
import { PrismaWorkflowRepository } from "../src/adapters/db/prisma-workflow-repository.js";
import type { VideoProvider } from "../src/application/ports/video-provider.js";
import { ApprovalService } from "../src/application/services/approval-service.js";
import { GenerationExecutionService } from "../src/application/services/generation-execution.js";
import { GenerationPreflightService } from "../src/application/services/generation-preflight.js";
import { ProductFlowService } from "../src/application/services/product-flow.js";
import { RecoveryService } from "../src/application/services/recovery-service.js";
import type { ProjectSnapshotService } from "../src/application/services/project-snapshot.js";
import { H, makeApproval, makeAttempt, makePreflight, makeRequest } from "./fixtures.js";

process.env.DATABASE_URL ??= "file:./dev.db";

for (const fault of ["audit", "handle"] as const) {
  test(`submit preserves recovery safety when ${fault} persistence fails`, async () => {
    const db = new PrismaClient();
    const projectId = `submit-persistence-${randomUUID()}`;
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pvs-submit-persistence-"));
    const generation = new PrismaGenerationRepository(db);
    const workflow = new PrismaWorkflowRepository(db);
    const artifacts = new PrismaArtifactRepository(db);
    const audit = new PrismaProviderAuditRepository(db);
    const flow = new ProductFlowService(new PrismaProductFlowRepository(db));
    const operations = new Map<string, string>();
    let injected = false;
    let submitCalls = 0;
    const provider = {
      probe: async () => ({ code: "READY", providerIdentityHash: H.b, capabilityFingerprint: H.c }),
      submit: async () => { submitCalls++; return { externalTaskId: "simulated-task-123" }; },
      reconcileSubmission: async () => ({ outcome: "FOUND_ACTIVE", handle: { externalTaskId: "simulated-task-123" } })
    } as unknown as VideoProvider;
    const wrappedAudit = new Proxy(audit, {
      get(target, prop) {
        if (prop === "createCommandAttempt") return async (...args: Parameters<typeof audit.createCommandAttempt>) => {
          operations.set(args[0].id, args[0].operation);
          return target.createCommandAttempt(...args);
        };
        if (prop === "updateCommandAttempt") return async (...args: Parameters<typeof audit.updateCommandAttempt>) => {
          if (fault === "audit" && operations.get(args[0]) === "SUBMIT" && !injected) {
            injected = true;
            throw new Error("injected audit failure");
          }
          return target.updateCommandAttempt(...args);
        };
        return Reflect.get(target, prop, target);
      }
    });
    const wrappedWorkflow = new Proxy(workflow, {
      get(target, prop) {
        if (prop === "updateGenerationAttemptStatus") return async (...args: Parameters<typeof workflow.updateGenerationAttemptStatus>) => {
          if (fault === "handle" && args[1].status === "SUBMITTED" && !injected) {
            injected = true;
            throw new Error("injected handle persistence failure");
          }
          return target.updateGenerationAttemptStatus(...args);
        };
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    try {
      const now = new Date().toISOString();
      await flow.createProject({ id: projectId, name: "submit recovery", status: "GENERATING", targetPlatform: "douyin", targetDurationMs: 60000, aspectRatio: "9:16", createdAt: now, updatedAt: now });
      const request = { ...makeRequest(), id: `request-${randomUUID()}`, projectId, clipId: `clip-${randomUUID()}` };
      const preflight = { ...makePreflight(), id: `preflight-${randomUUID()}`, projectId, generationRequestId: request.id };
      const approval = { ...makeApproval(), id: `approval-${randomUUID()}`, projectId, generationRequestId: request.id, preflightReportId: preflight.id };
      const attempt = { ...makeAttempt(), id: `attempt-${randomUUID()}`, projectId, clipId: request.clipId, generationRequestId: request.id, preflightReportId: preflight.id, userApprovalId: approval.id };
      await generation.createGenerationRequest(request);
      await generation.createPreflightReport(preflight);
      await generation.createUserApproval(approval);
      await workflow.createGenerationAttempt(attempt);
      const execution = new GenerationExecutionService(generation, wrappedWorkflow, artifacts, wrappedAudit, provider, root);
      await assert.rejects(execution.submitAttempt(attempt.id), /injected/);
      assert.equal(submitCalls, 1);
      assert.equal(injected, true);
      const durable = await workflow.getGenerationAttempt(attempt.id);
      if (fault === "audit") {
        assert.equal(durable?.status, "SUBMITTED");
        assert.equal(durable?.providerHandle?.externalTaskId, "simulated-task-123");
        const restarted = new PrismaClient();
        try {
          const recovered = await new PrismaWorkflowRepository(restarted).getGenerationAttempt(attempt.id);
          assert.equal(recovered?.status, "SUBMITTED");
          assert.equal(recovered?.providerHandle?.externalTaskId, "simulated-task-123");
        } finally { await restarted.$disconnect(); }
      } else {
        assert.equal(durable?.status, "SUBMITTING");
        const approvals = new ApprovalService(generation, workflow);
        await assert.rejects(approvals.approveCurrentRequests({ projectId, acceptedUnknownCostRisk: true, acceptedDuplicateSubmissionRisk: false }), /explicit duplicate-submission cost-risk acceptance/);
        const preflightService = new GenerationPreflightService(generation, workflow, provider, async () => 1);
        const preflightInput = { projectId } as Parameters<GenerationPreflightService["run"]>[0];
        await assert.rejects(preflightService.run(preflightInput), /explicit duplicate-submission cost-risk acceptance/);
        const snapshots = { refresh: async () => "simulated-snapshot" } as unknown as ProjectSnapshotService;
        const recovery = new RecoveryService(root, flow, artifacts, workflow, snapshots);
        await recovery.recoverProject(projectId);
        const restarted = new PrismaClient();
        try {
          const restartedWorkflow = new PrismaWorkflowRepository(restarted);
          assert.equal((await restartedWorkflow.getGenerationAttempt(attempt.id))?.status, "SUBMISSION_OUTCOME_UNKNOWN");
          assert.ok((await restartedWorkflow.listOpenBlockers(projectId)).some((b) => b.relatedEntityId === attempt.id && b.reasonCode === "SUBMISSION_RECONCILIATION_REQUIRED"));
          await assert.rejects(new ApprovalService(new PrismaGenerationRepository(restarted), restartedWorkflow).approveCurrentRequests({ projectId, acceptedUnknownCostRisk: true, acceptedDuplicateSubmissionRisk: false }), /explicit duplicate-submission cost-risk acceptance/);
          const resumed = new GenerationExecutionService(new PrismaGenerationRepository(restarted), restartedWorkflow, new PrismaArtifactRepository(restarted), new PrismaProviderAuditRepository(restarted), provider, root);
          const reconciled = await resumed.reconcileAttempt(attempt.id);
          assert.equal(reconciled.status, "PROCESSING");
          assert.equal(reconciled.providerHandle?.externalTaskId, "simulated-task-123");
          assert.equal((await restartedWorkflow.listOpenBlockers(projectId)).length, 0);
          assert.equal(submitCalls, 1);
        } finally { await restarted.$disconnect(); }
      }
    } finally {
      await db.commandAttemptRecord.deleteMany({ where: { projectId } });
      await db.generationAttemptRecord.deleteMany({ where: { projectId } });
      await db.userApprovalRecord.deleteMany({ where: { projectId } });
      await db.preflightReportRecord.deleteMany({ where: { projectId } });
      await db.generationRequestRecord.deleteMany({ where: { projectId } });
      await db.workflowBlockerRecord.deleteMany({ where: { projectId } });
      await db.project.deleteMany({ where: { id: projectId } });
      await db.$disconnect();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
