import type { PrismaClient } from "@prisma/client";
import { DomainValidationError } from "../../domain/validation.js";
import type { TimelineRepository } from "../../application/ports/timeline-repository.js";
import {
  renderConfigSchema,
  renderJobSchema,
  timelineSchema,
  type RenderJob,
  type Timeline
} from "../../domain/schemas.js";

type TimelineRow = {
  id: string;
  projectId: string;
  version: number;
  status: string;
  productionPlanHash: string;
  contentHash: string;
  dataJson: string;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
};

type RenderJobRow = {
  id: string;
  projectId: string;
  timelineId: string;
  timelineHash: string;
  status: string;
  inputArtifactIdsJson: string;
  inputArtifactHashesJson: string;
  renderConfigJson: string;
  outputArtifactId: string | null;
  outputArtifactHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

function timelineToDomain(row: TimelineRow): Timeline {
  const parsed = timelineSchema.parse(JSON.parse(row.dataJson));
  return timelineSchema.parse({
    ...parsed,
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    status: row.status,
    productionPlanHash: row.productionPlanHash,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.confirmedAt
      ? { confirmedAt: row.confirmedAt.toISOString() }
      : { confirmedAt: undefined })
  });
}

function renderJobToDomain(row: RenderJobRow): RenderJob {
  return renderJobSchema.parse({
    id: row.id,
    projectId: row.projectId,
    timelineId: row.timelineId,
    timelineHash: row.timelineHash,
    status: row.status,
    inputArtifactIds: JSON.parse(row.inputArtifactIdsJson),
    inputArtifactHashes: JSON.parse(row.inputArtifactHashesJson),
    renderConfig: renderConfigSchema.parse(JSON.parse(row.renderConfigJson)),
    ...(row.outputArtifactId ? { outputArtifactId: row.outputArtifactId } : {}),
    ...(row.outputArtifactHash ? { outputArtifactHash: row.outputArtifactHash } : {}),
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {})
  });
}

export class PrismaTimelineRepository implements TimelineRepository {
  constructor(private readonly db: PrismaClient) {}

  async installAutoTimeline(input: Timeline, expected: { id: string; hash: string; status: string } | null): Promise<Timeline> {
    const valid = timelineSchema.parse(input);
    return this.db.$transaction(async tx => {
      const project = await tx.project.findUnique({ where: { id: valid.projectId } });
      if (project?.currentProductionPlanHash !== valid.productionPlanHash) {
        throw new DomainValidationError("导演方案已变化，自动剪辑不能覆盖当前时间线");
      }
      const current = await tx.timelineRecord.findFirst({ where: { projectId: valid.projectId }, orderBy: [{ version: "desc" }, { updatedAt: "desc" }] });
      if (current?.id === valid.id && current.contentHash === valid.contentHash && current.status !== "STALE") return timelineToDomain(current);
      if ((current?.id ?? null) !== (expected?.id ?? null) || (current && (current.contentHash !== expected?.hash || current.status !== expected?.status))) {
        throw new DomainValidationError("时间线已被其他操作修改，自动剪辑不会覆盖新编辑");
      }
      if (await tx.renderJobRecord.count({ where: { projectId: valid.projectId, status: "RENDERING" } })) {
        throw new DomainValidationError("本项目正在渲染，不能替换时间线");
      }
      const last = await tx.timelineRecord.findFirst({ where: { projectId: valid.projectId }, orderBy: { version: "desc" } });
      const installed = timelineSchema.parse({ ...valid, version: (last?.version ?? 0) + 1 });
      await tx.timelineRecord.updateMany({ where: { projectId: valid.projectId, status: { not: "STALE" } }, data: { status: "STALE" } });
      const row = await tx.timelineRecord.create({ data: {
        id: installed.id, projectId: installed.projectId, version: installed.version, status: installed.status,
        productionPlanHash: installed.productionPlanHash, contentHash: installed.contentHash, dataJson: JSON.stringify(installed),
        createdAt: new Date(installed.createdAt), updatedAt: new Date(installed.updatedAt), confirmedAt: null
      } });
      return timelineToDomain(row);
    });
  }

  async nextTimelineVersion(projectId: string): Promise<number> {
    const row = await this.db.timelineRecord.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    return (row?.version ?? 0) + 1;
  }

  async saveTimeline(timeline: Timeline): Promise<Timeline> {
    const valid = timelineSchema.parse(timeline);
    const row = await this.db.timelineRecord.upsert({
      where: { id: valid.id },
      create: {
        id: valid.id,
        projectId: valid.projectId,
        version: valid.version,
        status: valid.status,
        productionPlanHash: valid.productionPlanHash,
        contentHash: valid.contentHash,
        dataJson: JSON.stringify(valid),
        createdAt: new Date(valid.createdAt),
        updatedAt: new Date(valid.updatedAt),
        confirmedAt: valid.confirmedAt ? new Date(valid.confirmedAt) : null
      },
      update: {
        status: valid.status,
        productionPlanHash: valid.productionPlanHash,
        contentHash: valid.contentHash,
        dataJson: JSON.stringify(valid),
        updatedAt: new Date(valid.updatedAt),
        confirmedAt: valid.confirmedAt ? new Date(valid.confirmedAt) : null
      }
    });
    return timelineToDomain(row);
  }

  async findTimelineById(id: string): Promise<Timeline | null> {
    const row = await this.db.timelineRecord.findUnique({ where: { id } });
    return row ? timelineToDomain(row) : null;
  }

  async latestTimeline(projectId: string): Promise<Timeline | null> {
    const row = await this.db.timelineRecord.findFirst({
      where: { projectId },
      orderBy: [{ version: "desc" }, { updatedAt: "desc" }]
    });
    return row ? timelineToDomain(row) : null;
  }

  async markTimelinesStale(projectId: string, exceptId?: string): Promise<void> {
    await this.db.timelineRecord.updateMany({
      where: {
        projectId,
        status: { not: "STALE" },
        ...(exceptId ? { id: { not: exceptId } } : {})
      },
      data: { status: "STALE" }
    });
  }

  async createRenderJob(job: RenderJob): Promise<RenderJob> {
    const valid = renderJobSchema.parse(job);
    const row = await this.db.renderJobRecord.create({
      data: {
        id: valid.id,
        projectId: valid.projectId,
        timelineId: valid.timelineId,
        timelineHash: valid.timelineHash,
        status: valid.status,
        inputArtifactIdsJson: JSON.stringify(valid.inputArtifactIds),
        inputArtifactHashesJson: JSON.stringify(valid.inputArtifactHashes),
        renderConfigJson: JSON.stringify(valid.renderConfig),
        outputArtifactId: valid.outputArtifactId,
        outputArtifactHash: valid.outputArtifactHash,
        errorCode: valid.errorCode,
        errorMessage: valid.errorMessage,
        createdAt: new Date(valid.createdAt),
        startedAt: valid.startedAt ? new Date(valid.startedAt) : null,
        completedAt: valid.completedAt ? new Date(valid.completedAt) : null
      }
    });
    return renderJobToDomain(row);
  }

  async updateRenderJob(
    id: string,
    update: Partial<
      Pick<
        RenderJob,
        | "status"
        | "outputArtifactId"
        | "outputArtifactHash"
        | "errorCode"
        | "errorMessage"
        | "startedAt"
        | "completedAt"
      >
    >
  ): Promise<RenderJob> {
    const row = await this.db.renderJobRecord.update({
      where: { id },
      data: {
        ...(update.status ? { status: update.status } : {}),
        ...(update.outputArtifactId !== undefined
          ? { outputArtifactId: update.outputArtifactId }
          : {}),
        ...(update.outputArtifactHash !== undefined
          ? { outputArtifactHash: update.outputArtifactHash }
          : {}),
        ...(update.status === "RENDERING" || update.status === "SUCCEEDED"
          ? { errorCode: null, errorMessage: null }
          : {
              ...(update.errorCode !== undefined
                ? { errorCode: update.errorCode }
                : {}),
              ...(update.errorMessage !== undefined
                ? { errorMessage: update.errorMessage }
                : {})
            }),
        ...(update.startedAt !== undefined
          ? { startedAt: update.startedAt ? new Date(update.startedAt) : null }
          : {}),
        ...(update.completedAt !== undefined
          ? { completedAt: update.completedAt ? new Date(update.completedAt) : null }
          : {})
      }
    });
    return renderJobToDomain(row);
  }

  async latestRenderJob(projectId: string): Promise<RenderJob | null> {
    const row = await this.db.renderJobRecord.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" }
    });
    return row ? renderJobToDomain(row) : null;
  }

  async listRenderJobs(projectId: string): Promise<RenderJob[]> {
    const rows = await this.db.renderJobRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(renderJobToDomain);
  }
}
