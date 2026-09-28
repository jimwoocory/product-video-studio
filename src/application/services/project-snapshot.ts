import fs from "node:fs/promises";
import path from "node:path";
import type { ArtifactRepository } from "../ports/artifact-repository.js";
import type { GenerationRepository } from "../ports/generation-repository.js";
import type { ProductInputStore } from "../ports/product-input-store.js";
import type { ProviderAuditRepository } from "../ports/provider-audit-repository.js";
import type { ReviewRepository } from "../ports/review-repository.js";
import type { WorkflowRepository } from "../ports/workflow-repository.js";
import type { ProductFlowService } from "./product-flow.js";

export class ProjectSnapshotService {
  constructor(
    private readonly projectsRoot: string,
    private readonly productFlow: ProductFlowService,
    private readonly productInput: ProductInputStore,
    private readonly artifacts: ArtifactRepository,
    private readonly generation: GenerationRepository,
    private readonly workflow: WorkflowRepository,
    private readonly review: ReviewRepository,
    private readonly providerAudit: ProviderAuditRepository
  ) {}

  async refresh(projectId: string): Promise<string> {
    const workspace = await this.productFlow.getWorkspace(projectId);
    if (!workspace) throw new Error(`Project not found: ${projectId}`);

    const [
      input,
      artifacts,
      requests,
      preflights,
      approvals,
      attempts,
      blockers,
      decisions,
      commandAttempts
    ] = await Promise.all([
      this.productInput.latest(projectId),
      this.artifacts.listByProject(projectId),
      this.generation.listGenerationRequests(projectId),
      this.generation.listPreflightReports(projectId),
      this.generation.listUserApprovals(projectId),
      this.workflow.listGenerationAttempts(projectId),
      this.workflow.listOpenBlockers(projectId),
      this.review.listDecisions(projectId),
      this.providerAudit.listCommandAttempts(projectId)
    ]);

    const snapshot = {
      schemaVersion: "p0-v0.2",
      derived: true,
      generatedAt: new Date().toISOString(),
      project: workspace.project,
      current: {
        productInput: input,
        productTruth: workspace.productTruth,
        creativeBatch: workspace.creativeBatch,
        script: workspace.script,
        productionPlan: workspace.productionPlan
      },
      workflow: {
        blockers,
        requests,
        preflights,
        approvals,
        attempts,
        reviewDecisions: decisions
      },
      audit: {
        commandAttempts,
        artifacts
      }
    };

    const exportsDir = path.join(this.projectsRoot, projectId, "exports");
    const target = path.join(exportsDir, "project.json");
    await fs.mkdir(exportsDir, { recursive: true });
    const temp = target + "." + process.pid + ".tmp";
    const handle = await fs.open(temp, "w");
    try {
      await handle.writeFile(JSON.stringify(snapshot, null, 2) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(temp, target);
    } catch {
      await fs.rm(target, { force: true });
      await fs.rename(temp, target);
    }
    return target;
  }
}
