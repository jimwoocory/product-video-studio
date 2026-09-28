import { randomUUID } from "node:crypto";
import type { GenerationRepository } from "../ports/generation-repository.js";
import type { WorkflowRepository } from "../ports/workflow-repository.js";
import {
  generationAttemptSchema,
  userApprovalSchema,
  type GenerationAttempt,
  type UserApproval
} from "../../domain/schemas.js";
import { hashValue } from "../../domain/hashing.js";
import { computeApprovalHash } from "./hash-contracts.js";
import { DomainValidationError } from "../../domain/validation.js";

export type ApproveCurrentRequestsInput = {
  projectId: string;
  acceptedUnknownCostRisk: boolean;
  acceptedDuplicateSubmissionRisk: boolean;
  now?: Date;
};

export type ApprovalBatchResult = {
  approvals: UserApproval[];
  attempts: GenerationAttempt[];
};

export class ApprovalService {
  constructor(
    private readonly generationRepo: GenerationRepository,
    private readonly workflowRepo: WorkflowRepository
  ) {}

  async approveCurrentRequests(
    input: ApproveCurrentRequestsInput
  ): Promise<ApprovalBatchResult> {
    const now = input.now ?? new Date();
    const [
      requests,
      reports,
      existingApprovals,
      existingAttempts
    ] = await Promise.all([
      this.generationRepo.listCurrentGenerationRequests(input.projectId),
      this.generationRepo.listPreflightReports(input.projectId),
      this.generationRepo.listUserApprovals(input.projectId),
      this.workflowRepo.listGenerationAttempts(input.projectId)
    ]);

    if (!requests.length) {
      throw new DomainValidationError("No CURRENT GenerationRequest to approve");
    }

    const hasUnknownSubmission = existingAttempts.some(
      (item) =>
        item.status === "SUBMISSION_OUTCOME_UNKNOWN" ||
        item.status === "RECONCILING"
    );
    if (
      hasUnknownSubmission &&
      input.acceptedDuplicateSubmissionRisk !== true
    ) {
      throw new DomainValidationError(
        "Unresolved submission outcome requires explicit duplicate-submission cost-risk acceptance before approval"
      );
    }

    const currentReports = reports.filter((item) => item.status !== "STALE");
    const reportByRequest = new Map(
      currentReports.map((item) => [item.generationRequestId, item])
    );

    const activeRequestIds = new Set(
      existingApprovals
        .filter((item) => item.status === "ACTIVE")
        .map((item) => item.generationRequestId)
    );

    const approvals: UserApproval[] = [];
    const attempts: GenerationAttempt[] = [];

    for (const request of requests) {
      if (activeRequestIds.has(request.id)) {
        throw new DomainValidationError(
          `GenerationRequest already has ACTIVE UserApproval: ${request.id}`
        );
      }
      const report = reportByRequest.get(request.id);
      if (!report) {
        throw new DomainValidationError(
          `GenerationRequest has no current PreflightReport: ${request.id}`
        );
      }
      if (report.status !== "PASS") {
        throw new DomainValidationError(
          `Preflight must be PASS before approval: ${report.id}`
        );
      }
      if (
        report.costEstimate.status === "UNKNOWN" &&
        !input.acceptedUnknownCostRisk
      ) {
        throw new DomainValidationError(
          "Unknown cost requires explicit user acceptance"
        );
      }
      if (
        report.requestHash !== request.requestHash ||
        report.providerIdentityHash !== request.providerIdentityHash ||
        report.capabilityFingerprint !== request.capabilityFingerprint
      ) {
        throw new DomainValidationError(
          `Preflight binding mismatch for request: ${request.id}`
        );
      }

      const approvalWithoutHash = {
        id: randomUUID(),
        projectId: input.projectId,
        generationRequestId: request.id,
        requestHash: request.requestHash,
        preflightReportId: report.id,
        preflightHash: report.reportHash,
        providerIdentityHash: request.providerIdentityHash,
        capabilityFingerprint: request.capabilityFingerprint,
        costSnapshot: report.costEstimate,
        acceptedUnknownCostRisk: input.acceptedUnknownCostRisk,
        acceptedDuplicateSubmissionRisk:
          input.acceptedDuplicateSubmissionRisk,
        status: "ACTIVE" as const,
        approvedAt: now.toISOString()
      };
      const approval = userApprovalSchema.parse({
        ...approvalWithoutHash,
        approvalHash: computeApprovalHash(approvalWithoutHash)
      });
      await this.generationRepo.createUserApproval(approval);

      const attemptNumber = await this.workflowRepo.nextAttemptNumber(
        request.clipId
      );
      const attempt = generationAttemptSchema.parse({
        id: randomUUID(),
        projectId: input.projectId,
        clipId: request.clipId,
        attemptNumber,
        generationRequestId: request.id,
        requestHash: request.requestHash,
        preflightReportId: report.id,
        userApprovalId: approval.id,
        approvalHash: approval.approvalHash,
        submissionFingerprint: hashValue({
          projectId: input.projectId,
          clipId: request.clipId,
          attemptNumber,
          requestHash: request.requestHash,
          approvalHash: approval.approvalHash
        }),
        status: "CREATED",
        commandAttempts: [],
        createdAt: now.toISOString()
      });
      await this.workflowRepo.createGenerationAttempt(attempt);

      approvals.push(approval);
      attempts.push(attempt);
    }

    return { approvals, attempts };
  }
}
