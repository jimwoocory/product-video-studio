import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ArtifactRepository } from "../ports/artifact-repository.js";
import type { GenerationRepository } from "../ports/generation-repository.js";
import type { ProviderAuditRepository } from "../ports/provider-audit-repository.js";
import type {
  ProviderCommandEvidenceSource,
  ProviderCommandOperation,
  VideoProvider
} from "../ports/video-provider.js";
import { SubmissionOutcomeUnknownError } from "../ports/video-provider.js";
import type { WorkflowRepository } from "../ports/workflow-repository.js";
import {
  commandAttemptRecordSchema,
  type CommandAttemptRecord,
  type GenerationAttempt,
  type GenerationRequest,
  type WorkflowBlocker
} from "../../domain/schemas.js";
import { DomainValidationError } from "../../domain/validation.js";
import { LocalArtifactStore } from "../../adapters/store/local-artifact-store.js";

const REDACTION_RULES_VERSION = "p0-redact-v1";
const PARSER_VERSION = "p0-provider-v1";

export class GenerationExecutionService {
  constructor(
    private readonly generation: GenerationRepository,
    private readonly workflow: WorkflowRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly providerAudit: ProviderAuditRepository,
    private readonly provider: VideoProvider,
    private readonly projectsRoot: string
  ) {}

  private async requireAttempt(id: string): Promise<GenerationAttempt> {
    const attempt = await this.workflow.getGenerationAttempt(id);
    if (!attempt) throw new DomainValidationError(`Attempt not found: ${id}`);
    return attempt;
  }

  private async beginCommand(
    attempt: GenerationAttempt,
    operation: CommandAttemptRecord["operation"]
  ): Promise<CommandAttemptRecord> {
    const commandAttemptNumber =
      attempt.commandAttempts.filter((item) => item.operation === operation).length + 1;
    const record = commandAttemptRecordSchema.parse({
      id: randomUUID(),
      operation,
      attemptNumber: commandAttemptNumber,
      startedAt: new Date().toISOString(),
      timedOut: false,
      redactionRulesVersion: REDACTION_RULES_VERSION,
      parserVersion: PARSER_VERSION
    });
    await this.providerAudit.createCommandAttempt({
      ...record,
      projectId: attempt.projectId,
      generationAttemptId: attempt.id,
      argvRedacted: ["dreamina", `<verified-${operation.toLowerCase()}-command>`]
    });
    await this.workflow.updateGenerationAttemptStatus(attempt.id, {
      status: attempt.status,
      commandAttempts: [...attempt.commandAttempts, record]
    });
    return record;
  }

  private async collectProviderEvidence(
    attempt: GenerationAttempt,
    record: CommandAttemptRecord,
    operation: ProviderCommandOperation
  ): Promise<
    Partial<
      Pick<
        CommandAttemptRecord,
        "stdoutArtifactId" | "stderrArtifactId" | "exitCode" | "timedOut"
      >
    > & { argvRedacted?: string[] }
  > {
    const candidate = this.provider as VideoProvider &
      Partial<ProviderCommandEvidenceSource>;
    if (typeof candidate.drainCommandEvidence !== "function") return {};
    const evidence = candidate.drainCommandEvidence(operation);
    if (!evidence.length) return {};

    const projectRoot = path.join(this.projectsRoot, attempt.projectId);
    const store = new LocalArtifactStore(projectRoot, this.artifacts);
    const stdoutText = evidence
      .map((item) => item.stdoutRedacted)
      .join("\n--- provider command boundary ---\n");
    const stderrText = evidence
      .map((item) => item.stderrRedacted)
      .join("\n--- provider command boundary ---\n");
    const base = `logs/provider/${attempt.id}/${record.id}-${operation.toLowerCase()}`;
    const [stdoutArtifact, stderrArtifact] = await Promise.all([
      store.writeImmutable({
        id: randomUUID(),
        projectId: attempt.projectId,
        kind: "STDOUT",
        relativePath: base + "-stdout.txt",
        immutable: true,
        bytes: Buffer.from(stdoutText, "utf8"),
        mimeType: "text/plain"
      }),
      store.writeImmutable({
        id: randomUUID(),
        projectId: attempt.projectId,
        kind: "STDERR",
        relativePath: base + "-stderr.txt",
        immutable: true,
        bytes: Buffer.from(stderrText, "utf8"),
        mimeType: "text/plain"
      })
    ]);
    const last = evidence[evidence.length - 1]!;
    return {
      stdoutArtifactId: stdoutArtifact.id,
      stderrArtifactId: stderrArtifact.id,
      exitCode: last.exitCode,
      timedOut: evidence.some((item) => item.timedOut),
      argvRedacted: last.argvRedacted
    };
  }

  private async finishCommand(
    attemptId: string,
    record: CommandAttemptRecord,
    update: Partial<
      Pick<
        CommandAttemptRecord,
        | "completedAt"
        | "exitCode"
        | "signal"
        | "timedOut"
        | "stdoutArtifactId"
        | "stderrArtifactId"
        | "errorCode"
      >
    > & { argvRedacted?: string[] }
  ): Promise<void> {
    const { argvRedacted: _argvRedacted, ...recordUpdate } = update;
    const completed = commandAttemptRecordSchema.parse({
      ...record,
      ...recordUpdate
    });
    await this.providerAudit.updateCommandAttempt(record.id, update);
    const attempt = await this.requireAttempt(attemptId);
    const commandAttempts = attempt.commandAttempts.map((item) =>
      item.id === record.id ? completed : item
    );
    await this.workflow.updateGenerationAttemptStatus(attemptId, {
      status: attempt.status,
      commandAttempts
    });
  }

  private async ensureReconcileBlocker(
    attempt: GenerationAttempt
  ): Promise<WorkflowBlocker> {
    const open = await this.workflow.listOpenBlockers(attempt.projectId);
    const existing = open.find(
      (item) =>
        item.reasonCode === "SUBMISSION_RECONCILIATION_REQUIRED" &&
        item.relatedEntityId === attempt.id
    );
    if (existing) return existing;
    return this.workflow.createBlocker({
      id: randomUUID(),
      projectId: attempt.projectId,
      scope: "GENERATION_ATTEMPT",
      relatedEntityId: attempt.id,
      reasonCode: "SUBMISSION_RECONCILIATION_REQUIRED",
      message:
        "提交结果未知，可能已经产生生成任务或费用，禁止自动重提。",
      requiredUserAction:
        "先执行调和；若仍无结论，明确接受可能重复扣费后再发起新的重做流程。",
      resumeCheckpoint: "generation.reconcile",
      createdAt: new Date().toISOString()
    });
  }

  private async resolveReconcileBlocker(attempt: GenerationAttempt): Promise<void> {
    const open = await this.workflow.listOpenBlockers(attempt.projectId);
    for (const blocker of open) {
      if (
        blocker.reasonCode === "SUBMISSION_RECONCILIATION_REQUIRED" &&
        blocker.relatedEntityId === attempt.id
      ) {
        await this.workflow.resolveBlocker(
          blocker.id,
          new Date().toISOString()
        );
      }
    }
  }

  private async ensureProviderChangedBlocker(
    attempt: GenerationAttempt,
    message: string
  ): Promise<WorkflowBlocker> {
    const open = await this.workflow.listOpenBlockers(attempt.projectId);
    const existing = open.find(
      (item) =>
        item.reasonCode === "PROVIDER_CHANGED" &&
        item.scope === "PROVIDER" &&
        !item.resolvedAt
    );
    if (existing) return existing;
    return this.workflow.createBlocker({
      id: randomUUID(),
      projectId: attempt.projectId,
      scope: "PROVIDER",
      relatedEntityId: attempt.id,
      reasonCode: "PROVIDER_CHANGED",
      message,
      requiredUserAction:
        "重新运行 Provider probe 与 Preflight；必须基于当前 ProviderIdentity/Capability 创建新的 Request、Preflight、Approval 和 Attempt。",
      resumeCheckpoint: "preflight.provider-refresh",
      createdAt: new Date().toISOString()
    });
  }

  private async assertProviderStillMatchesApprovedRequest(
    attempt: GenerationAttempt,
    request: GenerationRequest
  ): Promise<void> {
    const command = await this.beginCommand(attempt, "PROBE");
    try {
      const probe = await this.provider.probe();
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "PROBE"
      );
      const changed =
        probe.code !== "READY" ||
        probe.providerIdentityHash !== request.providerIdentityHash ||
        probe.capabilityFingerprint !== request.capabilityFingerprint;

      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? (probe.code === "READY" ? 0 : 1),
        ...(changed ? { errorCode: "PROVIDER_CHANGED" } : {})
      });

      if (!changed) return;

      await this.generation.markSubmissionChainStale(
        attempt.projectId,
        new Date().toISOString()
      );
      await this.workflow.updateGenerationAttemptStatus(attempt.id, {
        status: attempt.status,
        errorCode: "PROVIDER_CHANGED_BEFORE_SUBMIT",
        errorMessage:
          probe.code === "READY"
            ? "Provider identity/capability changed after approval; external submit was blocked."
            : `Provider is no longer READY (${probe.code}); external submit was blocked.`
      });
      await this.ensureProviderChangedBlocker(
        attempt,
        probe.code === "READY"
          ? "ProviderIdentity 或 CapabilityFingerprint 在审批后发生变化，旧审批链已失效。"
          : `Provider 在审批后变为 ${probe.code}，旧审批链已失效。`
      );
      throw new DomainValidationError(
        "Provider changed after approval; submission chain was marked STALE and external submit was blocked"
      );
    } catch (error) {
      if (
        error instanceof DomainValidationError &&
        /Provider changed after approval/.test(error.message)
      ) {
        throw error;
      }
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "PROBE"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 1,
        errorCode: "PROVIDER_REPROBE_FAILED"
      });
      await this.generation.markSubmissionChainStale(
        attempt.projectId,
        new Date().toISOString()
      );
      await this.workflow.updateGenerationAttemptStatus(attempt.id, {
        status: attempt.status,
        errorCode: "PROVIDER_REPROBE_FAILED",
        errorMessage:
          error instanceof Error ? error.message : String(error)
      });
      await this.ensureProviderChangedBlocker(
        attempt,
        "提交前重新核验 Provider 失败，旧审批链已失效。"
      );
      throw new DomainValidationError(
        "Provider re-probe failed before submit; submission chain was marked STALE"
      );
    }
  }

  async submitAttempt(attemptId: string): Promise<GenerationAttempt> {
    let attempt = await this.requireAttempt(attemptId);
    if (attempt.status !== "CREATED") {
      throw new DomainValidationError(
        `Attempt must be CREATED before submit, got ${attempt.status}`
      );
    }

    const [request, preflight, approval] = await Promise.all([
      this.generation.getGenerationRequest(attempt.generationRequestId),
      this.generation.getPreflightReport(attempt.preflightReportId),
      this.generation.getUserApproval(attempt.userApprovalId)
    ]);
    if (!request || !preflight || !approval) {
      throw new DomainValidationError("Approval chain is incomplete");
    }

    const allArtifacts = await this.artifacts.listByProject(attempt.projectId);
    const gates = request.assetManifest.map((entry) => {
      const match = allArtifacts.find(
        (artifact) =>
          artifact.integrityStatus === "READY" &&
          artifact.sha256 === entry.artifactHash
      );
      return {
        artifactId: match?.id ?? entry.assetId,
        integrityStatus: match?.integrityStatus ?? ("MISSING" as const)
      };
    });

    const { assertSubmissionGate } = await import("../../domain/validation.js");
    assertSubmissionGate({
      request,
      preflight,
      approval,
      artifacts: gates
    });

    await this.assertProviderStillMatchesApprovedRequest(attempt, request);

    attempt = await this.workflow.updateGenerationAttemptStatus(attempt.id, {
      status: "SUBMITTING"
    });
    const command = await this.beginCommand(attempt, "SUBMIT");

    try {
      const handle = await this.provider.submit(request);
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "SUBMIT"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 0,
        timedOut: evidence.timedOut ?? false
      });
      return this.workflow.updateGenerationAttemptStatus(attempt.id, {
        status: "SUBMITTED",
        providerHandle: handle,
        submittedAt: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof SubmissionOutcomeUnknownError) {
        const evidence = await this.collectProviderEvidence(
          attempt,
          command,
          "SUBMIT"
        );
        await this.finishCommand(attempt.id, command, {
          ...evidence,
          completedAt: new Date().toISOString(),
          exitCode: evidence.exitCode ?? 1,
          errorCode: "SUBMISSION_OUTCOME_UNKNOWN"
        });
        const unknown = await this.workflow.updateGenerationAttemptStatus(
          attempt.id,
          {
            status: "SUBMISSION_OUTCOME_UNKNOWN",
            errorCode: "SUBMISSION_OUTCOME_UNKNOWN",
            errorMessage: error.message
          }
        );
        await this.ensureReconcileBlocker(unknown);
        return unknown;
      }

      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "SUBMIT"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 1,
        errorCode: "SUBMIT_FAILED"
      });
      return this.workflow.updateGenerationAttemptStatus(attempt.id, {
        status: "FAILED",
        errorCode: "SUBMIT_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async pollAttempt(attemptId: string): Promise<GenerationAttempt> {
    let attempt = await this.requireAttempt(attemptId);
    if (
      attempt.status !== "SUBMITTED" &&
      attempt.status !== "PROCESSING"
    ) {
      throw new DomainValidationError(
        `Attempt is not pollable: ${attempt.status}`
      );
    }
    if (!attempt.providerHandle) {
      throw new DomainValidationError("Attempt has no provider handle");
    }

    const command = await this.beginCommand(attempt, "STATUS");
    try {
      const status = await this.provider.status(attempt.providerHandle);
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "STATUS"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 0
      });
      const mapped =
        status.status === "PROCESSING"
          ? "PROCESSING"
          : status.status === "SUCCEEDED"
            ? "SUCCEEDED"
            : status.status === "FAILED"
              ? "FAILED"
              : attempt.status;
      return this.workflow.updateGenerationAttemptStatus(attempt.id, {
        status: mapped,
        ...(mapped === "SUCCEEDED" || mapped === "FAILED"
          ? { completedAt: new Date().toISOString() }
          : {})
      });
    } catch (error) {
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "STATUS"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 1,
        errorCode: "STATUS_FAILED"
      });
      // Technical status failure never creates a new generation task and never
      // discards the durable handle.
      return this.requireAttempt(attempt.id);
    }
  }

  async downloadAttempt(attemptId: string): Promise<GenerationAttempt> {
    let attempt = await this.requireAttempt(attemptId);
    if (
      attempt.status !== "SUCCEEDED" &&
      attempt.status !== "RECONCILED_SUCCEEDED"
    ) {
      throw new DomainValidationError(
        `Attempt is not downloadable: ${attempt.status}`
      );
    }
    if (!attempt.providerHandle) {
      throw new DomainValidationError("Attempt has no provider handle");
    }

    const command = await this.beginCommand(attempt, "DOWNLOAD");
    const projectRoot = path.join(this.projectsRoot, attempt.projectId);
    const tempDir = path.join(
      projectRoot,
      ".tmp",
      `download-${attempt.id}-${command.id}`
    );
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${attempt.id}.mp4`);

    try {
      const downloaded = await this.provider.download(attempt.providerHandle, tempPath);
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "DOWNLOAD"
      );
      const bytes = await fs.readFile(downloaded.path);
      const artifact = await new LocalArtifactStore(
        projectRoot,
        this.artifacts
      ).writeImmutable({
        id: randomUUID(),
        projectId: attempt.projectId,
        kind: "GENERATED_VIDEO",
        relativePath: `outputs/${attempt.clipId}/${attempt.id}.mp4`,
        immutable: true,
        bytes,
        mimeType: "video/mp4"
      });
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 0
      });
      return this.workflow.updateGenerationAttemptStatus(attempt.id, {
        status: attempt.status,
        outputArtifactId: artifact.id,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "DOWNLOAD"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 1,
        errorCode: "DOWNLOAD_FAILED"
      });
      return this.requireAttempt(attempt.id);
    } finally {
      // The verified CLI may create one or more provider-named files when
      // download operates on a directory. Keep every attempt isolated and
      // remove the entire transient directory on both success and failure so
      // Recovery never mistakes a provider-side download residue for a new
      // user Artifact.
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async reconcileAttempt(attemptId: string): Promise<GenerationAttempt> {
    let attempt = await this.requireAttempt(attemptId);
    if (
      attempt.status !== "SUBMISSION_OUTCOME_UNKNOWN" &&
      attempt.status !== "RECONCILING"
    ) {
      throw new DomainValidationError(
        `Attempt is not reconcilable: ${attempt.status}`
      );
    }

    attempt = await this.workflow.updateGenerationAttemptStatus(attempt.id, {
      status: "RECONCILING"
    });
    const command = await this.beginCommand(attempt, "RECONCILE");
    try {
      const result = await this.provider.reconcileSubmission({
        requestHash: attempt.requestHash,
        submissionFingerprint: attempt.submissionFingerprint,
        ...(attempt.providerHandle
          ? { knownHandle: attempt.providerHandle }
          : {})
      });
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "RECONCILE"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 0
      });

      if (result.outcome === "FOUND_ACTIVE") {
        await this.resolveReconcileBlocker(attempt);
        return this.workflow.updateGenerationAttemptStatus(attempt.id, {
          status: "PROCESSING",
          providerHandle: result.handle
        });
      }
      if (result.outcome === "FOUND_SUCCEEDED") {
        await this.resolveReconcileBlocker(attempt);
        return this.workflow.updateGenerationAttemptStatus(attempt.id, {
          status: "RECONCILED_SUCCEEDED",
          providerHandle: result.handle,
          completedAt: new Date().toISOString()
        });
      }
      if (result.outcome === "FOUND_FAILED") {
        await this.resolveReconcileBlocker(attempt);
        return this.workflow.updateGenerationAttemptStatus(attempt.id, {
          status: "RECONCILED_FAILED",
          ...(result.handle ? { providerHandle: result.handle } : {}),
          completedAt: new Date().toISOString(),
          errorCode: "RECONCILED_FAILED",
          errorMessage: result.reason
        });
      }
      if (result.outcome === "NOT_FOUND") {
        await this.resolveReconcileBlocker(attempt);
        return this.workflow.updateGenerationAttemptStatus(attempt.id, {
          status: "RECONCILED_FAILED",
          completedAt: new Date().toISOString(),
          errorCode: "RECONCILED_NOT_FOUND",
          errorMessage: "Provider confirmed no matching task exists"
        });
      }

      const unknown = await this.workflow.updateGenerationAttemptStatus(
        attempt.id,
        {
          status: "SUBMISSION_OUTCOME_UNKNOWN",
          errorCode: "RECONCILIATION_INCONCLUSIVE",
          errorMessage: result.reason
        }
      );
      await this.ensureReconcileBlocker(unknown);
      return unknown;
    } catch (error) {
      const evidence = await this.collectProviderEvidence(
        attempt,
        command,
        "RECONCILE"
      );
      await this.finishCommand(attempt.id, command, {
        ...evidence,
        completedAt: new Date().toISOString(),
        exitCode: evidence.exitCode ?? 1,
        errorCode: "RECONCILE_FAILED"
      });
      const unknown = await this.workflow.updateGenerationAttemptStatus(
        attempt.id,
        {
          status: "SUBMISSION_OUTCOME_UNKNOWN",
          errorCode: "RECONCILE_FAILED",
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      );
      await this.ensureReconcileBlocker(unknown);
      return unknown;
    }
  }
}
