import type { PrismaClient } from "@prisma/client";
import type { DouyinOpsRepository } from "../../application/ports/douyin-ops-repository.js";
import {
  douyinCommentSchema,
  douyinMetricSnapshotSchema,
  douyinWorkBindingSchema,
  type DouyinComment,
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

type CommentRow = {
  id: string;
  projectId: string;
  bindingId: string;
  awemeId: string;
  cid: string;
  uid: string | null;
  secUid: string | null;
  nickname: string;
  text: string;
  diggCount: number;
  replyCount: number;
  platformCreatedAt: Date | null;
  parentCid: string | null;
  avatarUrl: string | null;
  sentiment: string | null;
  priority: string | null;
  syncedAt: Date;
  rawJson: string;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
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

function commentToDomain(
  row: CommentRow
): DouyinComment {
  return douyinCommentSchema.parse({
    id: row.id,
    projectId: row.projectId,
    bindingId: row.bindingId,
    awemeId: row.awemeId,
    cid: row.cid,
    ...(row.uid ? { uid: row.uid } : {}),
    ...(row.secUid ? { secUid: row.secUid } : {}),
    nickname: row.nickname,
    text: row.text,
    diggCount: row.diggCount,
    replyCount: row.replyCount,
    ...(row.platformCreatedAt
      ? { platformCreatedAt: row.platformCreatedAt.toISOString() }
      : {}),
    ...(row.parentCid ? { parentCid: row.parentCid } : {}),
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    ...(row.sentiment ? { sentiment: row.sentiment } : {}),
    ...(row.priority ? { priority: row.priority } : {}),
    syncedAt: row.syncedAt.toISOString(),
    rawJson: row.rawJson,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
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

  async upsertComments(
    input: DouyinComment[]
  ): Promise<DouyinComment[]> {
    const values = input.map((item) =>
      douyinCommentSchema.parse(item)
    );
    const output: DouyinComment[] = [];
    for (const value of values) {
      const row = await this.db.douyinCommentRecord.upsert({
        where: {
          awemeId_cid: {
            awemeId: value.awemeId,
            cid: value.cid
          }
        },
        create: {
          id: value.id,
          projectId: value.projectId,
          bindingId: value.bindingId,
          awemeId: value.awemeId,
          cid: value.cid,
          uid: value.uid ?? null,
          secUid: value.secUid ?? null,
          nickname: value.nickname,
          text: value.text,
          diggCount: value.diggCount,
          replyCount: value.replyCount,
          platformCreatedAt: value.platformCreatedAt
            ? new Date(value.platformCreatedAt)
            : null,
          parentCid: value.parentCid ?? null,
          avatarUrl: value.avatarUrl ?? null,
          sentiment: value.sentiment ?? null,
          priority: value.priority ?? null,
          syncedAt: new Date(value.syncedAt),
          rawJson: value.rawJson,
          contentHash: value.contentHash,
          createdAt: new Date(value.createdAt),
          updatedAt: new Date(value.updatedAt)
        },
        update: {
          projectId: value.projectId,
          bindingId: value.bindingId,
          uid: value.uid ?? null,
          secUid: value.secUid ?? null,
          nickname: value.nickname,
          text: value.text,
          diggCount: value.diggCount,
          replyCount: value.replyCount,
          platformCreatedAt: value.platformCreatedAt
            ? new Date(value.platformCreatedAt)
            : null,
          parentCid: value.parentCid ?? null,
          avatarUrl: value.avatarUrl ?? null,
          syncedAt: new Date(value.syncedAt),
          rawJson: value.rawJson,
          contentHash: value.contentHash,
          updatedAt: new Date(value.updatedAt)
        }
      });
      output.push(commentToDomain(row));
    }
    return output;
  }

  async listComments(input: {
    projectId: string;
    awemeId?: string;
    parentCid?: string | null;
    limit?: number;
  }): Promise<DouyinComment[]> {
    const limit =
      input.limit === undefined
        ? undefined
        : Math.max(1, Math.min(1000, Math.trunc(input.limit)));
    const rows = await this.db.douyinCommentRecord.findMany({
      where: {
        projectId: input.projectId,
        ...(input.awemeId ? { awemeId: input.awemeId } : {}),
        ...(input.parentCid === null
          ? { parentCid: null }
          : input.parentCid
            ? { parentCid: input.parentCid }
            : {})
      },
      orderBy: [
        { platformCreatedAt: "asc" },
        { createdAt: "asc" }
      ],
      ...(limit ? { take: limit } : {})
    });
    return rows.map(commentToDomain);
  }

  async findComment(input: {
    awemeId: string;
    cid: string;
  }): Promise<DouyinComment | null> {
    const row = await this.db.douyinCommentRecord.findUnique({
      where: {
        awemeId_cid: {
          awemeId: input.awemeId,
          cid: input.cid
        }
      }
    });
    return row ? commentToDomain(row) : null;
  }
}
