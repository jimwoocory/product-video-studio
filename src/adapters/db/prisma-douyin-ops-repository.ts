import type { PrismaClient } from "@prisma/client";
import type { DouyinOpsRepository } from "../../application/ports/douyin-ops-repository.js";
import {
  douyinMetricSnapshotSchema,
  douyinWorkBindingSchema,
  type DouyinMetricSnapshot,
  type DouyinWorkBinding
} from "../../domain/douyin-ops.js";

type BindingRow = {
  id: string;
  projectId: string;
  packageId: string;
  publishReceiptId: string | null;
  awemeId: string | null;
  source: string | null;
  confidence: string;
  status: string;
  publishedAt: Date | null;
  boundAt: Date | null;
  externalUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SnapshotRow = {
  id: string;
  projectId: string;
  bindingId: string;
  awemeId: string;
  captureKey: string;
  capturedAt: Date;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  collects: number | null;
  durationMs: number | null;
  rawJson: string;
  contentHash: string;
  createdAt: Date;
};

function bindingToDomain(
  row: BindingRow
): DouyinWorkBinding {
  return douyinWorkBindingSchema.parse({
    id: row.id,
    projectId: row.projectId,
    packageId: row.packageId,
    ...(row.publishReceiptId
      ? { publishReceiptId: row.publishReceiptId }
      : {}),
    ...(row.awemeId ? { awemeId: row.awemeId } : {}),
    ...(row.source ? { source: row.source } : {}),
    confidence: row.confidence,
    status: row.status,
    ...(row.publishedAt
      ? { publishedAt: row.publishedAt.toISOString() }
      : {}),
    ...(row.boundAt
      ? { boundAt: row.boundAt.toISOString() }
      : {}),
    ...(row.externalUrl
      ? { externalUrl: row.externalUrl }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function snapshotToDomain(
  row: SnapshotRow
): DouyinMetricSnapshot {
  return douyinMetricSnapshotSchema.parse({
    id: row.id,
    projectId: row.projectId,
    bindingId: row.bindingId,
    awemeId: row.awemeId,
    captureKey: row.captureKey,
    capturedAt: row.capturedAt.toISOString(),
    plays: row.plays,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    ...(row.collects !== null
      ? { collects: row.collects }
      : {}),
    ...(row.durationMs !== null
      ? { durationMs: row.durationMs }
      : {}),
    rawJson: row.rawJson,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString()
  });
}

export class PrismaDouyinOpsRepository
  implements DouyinOpsRepository
{
  constructor(private readonly db: PrismaClient) {}

  async upsertWorkBinding(
    input: DouyinWorkBinding
  ): Promise<DouyinWorkBinding> {
    const value = douyinWorkBindingSchema.parse(input);
    const row = await this.db.douyinWorkBindingRecord.upsert({
      where: { packageId: value.packageId },
      create: {
        id: value.id,
        projectId: value.projectId,
        packageId: value.packageId,
        publishReceiptId: value.publishReceiptId ?? null,
        awemeId: value.awemeId ?? null,
        source: value.source ?? null,
        confidence: value.confidence,
        status: value.status,
        publishedAt: value.publishedAt
          ? new Date(value.publishedAt)
          : null,
        boundAt: value.boundAt
          ? new Date(value.boundAt)
          : null,
        externalUrl: value.externalUrl ?? null,
        createdAt: new Date(value.createdAt),
        updatedAt: new Date(value.updatedAt)
      },
      update: {
        projectId: value.projectId,
        publishReceiptId: value.publishReceiptId ?? null,
        awemeId: value.awemeId ?? null,
        source: value.source ?? null,
        confidence: value.confidence,
        status: value.status,
        publishedAt: value.publishedAt
          ? new Date(value.publishedAt)
          : null,
        boundAt: value.boundAt
          ? new Date(value.boundAt)
          : null,
        externalUrl: value.externalUrl ?? null,
        updatedAt: new Date(value.updatedAt)
      }
    });
    return bindingToDomain(row);
  }

  async findWorkBindingById(
    id: string
  ): Promise<DouyinWorkBinding | null> {
    const row =
      await this.db.douyinWorkBindingRecord.findUnique({
        where: { id }
      });
    return row ? bindingToDomain(row) : null;
  }

  async findWorkBindingByPackage(
    packageId: string
  ): Promise<DouyinWorkBinding | null> {
    const row =
      await this.db.douyinWorkBindingRecord.findUnique({
        where: { packageId }
      });
    return row ? bindingToDomain(row) : null;
  }

  async latestWorkBinding(
    projectId: string
  ): Promise<DouyinWorkBinding | null> {
    const row =
      await this.db.douyinWorkBindingRecord.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" }
      });
    return row ? bindingToDomain(row) : null;
  }

  async createMetricSnapshot(
    input: DouyinMetricSnapshot
  ): Promise<DouyinMetricSnapshot> {
    const value = douyinMetricSnapshotSchema.parse(input);
    const row = await this.db.douyinMetricSnapshotRecord.upsert({
      where: {
        projectId_captureKey: {
          projectId: value.projectId,
          captureKey: value.captureKey
        }
      },
      create: {
        id: value.id,
        projectId: value.projectId,
        bindingId: value.bindingId,
        awemeId: value.awemeId,
        captureKey: value.captureKey,
        capturedAt: new Date(value.capturedAt),
        plays: value.plays,
        likes: value.likes,
        comments: value.comments,
        shares: value.shares,
        collects: value.collects ?? null,
        durationMs: value.durationMs ?? null,
        rawJson: value.rawJson,
        contentHash: value.contentHash,
        createdAt: new Date(value.createdAt)
      },
      update: {}
    });

    if (row.contentHash !== value.contentHash) {
      throw new Error(
        "Douyin metric captureKey was reused with different content"
      );
    }
    return snapshotToDomain(row);
  }

  async findMetricSnapshotByCaptureKey(
    projectId: string,
    captureKey: string
  ): Promise<DouyinMetricSnapshot | null> {
    const row =
      await this.db.douyinMetricSnapshotRecord.findUnique({
        where: {
          projectId_captureKey: {
            projectId,
            captureKey
          }
        }
      });
    return row ? snapshotToDomain(row) : null;
  }

  async listMetricSnapshots(input: {
    projectId: string;
    awemeId?: string;
    limit?: number;
  }): Promise<DouyinMetricSnapshot[]> {
    const limit =
      input.limit === undefined
        ? undefined
        : Math.max(1, Math.min(500, Math.trunc(input.limit)));
    const rows =
      await this.db.douyinMetricSnapshotRecord.findMany({
        where: {
          projectId: input.projectId,
          ...(input.awemeId
            ? { awemeId: input.awemeId }
            : {})
        },
        orderBy: { capturedAt: limit ? "desc" : "asc" },
        ...(limit ? { take: limit } : {})
      });
    const domain = rows.map(snapshotToDomain);
    return limit ? domain.reverse() : domain;
  }
}
