import type { PrismaClient } from "@prisma/client";
import type { DouyinOpsRepository } from "../../application/ports/douyin-ops-repository.js";
import {
  douyinCommentClassificationSchema,
  douyinCommentSchema,
  douyinCreativeFeedbackSchema,
  douyinInsightSchema,
  douyinMetricSnapshotSchema,
  douyinReplyDraftRevisionSchema,
  douyinReplyDraftSchema,
  douyinWorkBindingSchema,
  type DouyinComment,
  type DouyinCommentClassification,
  type DouyinCreativeFeedback,
  type DouyinInsight,
  type DouyinMetricSnapshot,
  type DouyinReplyDraft,
  type DouyinReplyDraftRevision,
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
  category: string | null;
  priority: string | null;
  syncedAt: Date;
  rawJson: string;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
};

type ClassificationRow = {
  id: string;
  projectId: string;
  commentId: string;
  awemeId: string;
  cid: string;
  sourceContentHash: string;
  sentiment: string;
  category: string;
  priority: string;
  rationale: string | null;
  runtimeId: string;
  runtimeVersion: string;
  providerId: string | null;
  modelId: string | null;
  executionId: string | null;
  configVersion: number | null;
  classifiedAt: Date;
  createdAt: Date;
};

type ReplyDraftRow = {
  id: string;
  projectId: string;
  commentId: string;
  awemeId: string;
  cid: string;
  sourceContentHash: string;
  classificationId: string | null;
  productTruthHash: string;
  usedFactIdsJson: string;
  generatedText: string;
  currentText: string;
  strategy: string;
  status: string;
  revision: number;
  runtimeId: string;
  runtimeVersion: string;
  providerId: string | null;
  modelId: string | null;
  executionId: string | null;
  configVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type ReplyDraftRevisionRow = {
  id: string;
  projectId: string;
  draftId: string;
  commentId: string;
  action: string;
  beforeText: string;
  afterText: string;
  beforeStatus: string;
  afterStatus: string;
  expectedRevision: number;
  resultingRevision: number;
  createdAt: Date;
};

type InsightRow = {
  id: string;
  projectId: string;
  bindingId: string;
  awemeId: string;
  productTruthHash: string;
  metricSnapshotIdsJson: string;
  commentIdsJson: string;
  evidenceHash: string;
  summary: string;
  strengthsJson: string;
  weaknessesJson: string;
  audienceQuestionsJson: string;
  nextCreativeActionsJson: string;
  runtimeId: string;
  runtimeVersion: string;
  providerId: string | null;
  modelId: string | null;
  executionId: string | null;
  configVersion: number | null;
  createdAt: Date;
};

type CreativeFeedbackRow = {
  id: string;
  projectId: string;
  insightId: string;
  actionIndex: number;
  actionHash: string;
  actionText: string;
  evidenceRefsJson: string;
  active: boolean;
  confirmedAt: Date;
  deactivatedAt: Date | null;
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
    ...(row.category ? { category: row.category } : {}),
    ...(row.priority ? { priority: row.priority } : {}),
    syncedAt: row.syncedAt.toISOString(),
    rawJson: row.rawJson,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function classificationToDomain(
  row: ClassificationRow
): DouyinCommentClassification {
  return douyinCommentClassificationSchema.parse({
    id: row.id,
    projectId: row.projectId,
    commentId: row.commentId,
    awemeId: row.awemeId,
    cid: row.cid,
    sourceContentHash: row.sourceContentHash,
    sentiment: row.sentiment,
    category: row.category,
    priority: row.priority,
    ...(row.rationale ? { rationale: row.rationale } : {}),
    runtimeId: row.runtimeId,
    runtimeVersion: row.runtimeVersion,
    ...(row.providerId ? { providerId: row.providerId } : {}),
    ...(row.modelId ? { modelId: row.modelId } : {}),
    ...(row.executionId ? { executionId: row.executionId } : {}),
    ...(row.configVersion !== null
      ? { configVersion: row.configVersion }
      : {}),
    classifiedAt: row.classifiedAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  });
}

function replyDraftToDomain(
  row: ReplyDraftRow
): DouyinReplyDraft {
  return douyinReplyDraftSchema.parse({
    id: row.id,
    projectId: row.projectId,
    commentId: row.commentId,
    awemeId: row.awemeId,
    cid: row.cid,
    sourceContentHash: row.sourceContentHash,
    ...(row.classificationId
      ? { classificationId: row.classificationId }
      : {}),
    productTruthHash: row.productTruthHash,
    usedFactIds: JSON.parse(row.usedFactIdsJson) as string[],
    generatedText: row.generatedText,
    currentText: row.currentText,
    strategy: row.strategy,
    status: row.status,
    revision: row.revision,
    runtimeId: row.runtimeId,
    runtimeVersion: row.runtimeVersion,
    ...(row.providerId ? { providerId: row.providerId } : {}),
    ...(row.modelId ? { modelId: row.modelId } : {}),
    ...(row.executionId ? { executionId: row.executionId } : {}),
    ...(row.configVersion !== null
      ? { configVersion: row.configVersion }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function replyDraftRevisionToDomain(
  row: ReplyDraftRevisionRow
): DouyinReplyDraftRevision {
  return douyinReplyDraftRevisionSchema.parse({
    id: row.id,
    projectId: row.projectId,
    draftId: row.draftId,
    commentId: row.commentId,
    action: row.action,
    beforeText: row.beforeText,
    afterText: row.afterText,
    beforeStatus: row.beforeStatus,
    afterStatus: row.afterStatus,
    expectedRevision: row.expectedRevision,
    resultingRevision: row.resultingRevision,
    createdAt: row.createdAt.toISOString()
  });
}

function insightToDomain(
  row: InsightRow
): DouyinInsight {
  return douyinInsightSchema.parse({
    id: row.id,
    projectId: row.projectId,
    bindingId: row.bindingId,
    awemeId: row.awemeId,
    productTruthHash: row.productTruthHash,
    metricSnapshotIds:
      JSON.parse(row.metricSnapshotIdsJson) as string[],
    commentIds:
      JSON.parse(row.commentIdsJson) as string[],
    evidenceHash: row.evidenceHash,
    summary: row.summary,
    strengths: JSON.parse(row.strengthsJson),
    weaknesses: JSON.parse(row.weaknessesJson),
    audienceQuestions:
      JSON.parse(row.audienceQuestionsJson),
    nextCreativeActions:
      JSON.parse(row.nextCreativeActionsJson),
    runtimeId: row.runtimeId,
    runtimeVersion: row.runtimeVersion,
    ...(row.providerId ? { providerId: row.providerId } : {}),
    ...(row.modelId ? { modelId: row.modelId } : {}),
    ...(row.executionId ? { executionId: row.executionId } : {}),
    ...(row.configVersion !== null
      ? { configVersion: row.configVersion }
      : {}),
    createdAt: row.createdAt.toISOString()
  });
}

function creativeFeedbackToDomain(
  row: CreativeFeedbackRow
): DouyinCreativeFeedback {
  return douyinCreativeFeedbackSchema.parse({
    id: row.id,
    projectId: row.projectId,
    insightId: row.insightId,
    actionIndex: row.actionIndex,
    actionHash: row.actionHash,
    actionText: row.actionText,
    evidenceRefs:
      JSON.parse(row.evidenceRefsJson) as string[],
    active: row.active,
    confirmedAt: row.confirmedAt.toISOString(),
    ...(row.deactivatedAt
      ? { deactivatedAt: row.deactivatedAt.toISOString() }
      : {}),
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
          category: value.category ?? null,
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

  async findCommentsByCids(
    projectId: string,
    cids: string[]
  ): Promise<DouyinComment[]> {
    if (!cids.length) return [];
    const rows = await this.db.douyinCommentRecord.findMany({
      where: {
        projectId,
        cid: { in: [...new Set(cids)] }
      }
    });
    return rows.map(commentToDomain);
  }

  async latestCommentClassification(
    commentId: string
  ): Promise<DouyinCommentClassification | null> {
    const row =
      await this.db.douyinCommentClassificationRecord.findFirst({
        where: { commentId },
        orderBy: [
          { classifiedAt: "desc" },
          { createdAt: "desc" }
        ]
      });
    return row ? classificationToDomain(row) : null;
  }

  async saveCommentClassifications(input: {
    updates: Array<{
      commentId: string;
      sentiment: DouyinCommentClassification["sentiment"];
      category: DouyinCommentClassification["category"];
      priority: DouyinCommentClassification["priority"];
    }>;
    records: DouyinCommentClassification[];
  }): Promise<DouyinComment[]> {
    const records = input.records.map((item) =>
      douyinCommentClassificationSchema.parse(item)
    );
    const updates = new Map(
      input.updates.map((item) => [item.commentId, item])
    );

    if (
      updates.size !== input.updates.length ||
      records.length !== input.updates.length
    ) {
      throw new Error(
        "Douyin comment classification batch is inconsistent"
      );
    }

    const rows = await this.db.$transaction(async (tx) => {
      const output: CommentRow[] = [];
      for (const record of records) {
        const update = updates.get(record.commentId);
        if (!update) {
          throw new Error(
            "Missing current-comment update for classification"
          );
        }
        const row = await tx.douyinCommentRecord.update({
          where: { id: record.commentId },
          data: {
            sentiment: update.sentiment,
            category: update.category,
            priority: update.priority
          }
        });
        await tx.douyinCommentClassificationRecord.create({
          data: {
            id: record.id,
            projectId: record.projectId,
            commentId: record.commentId,
            awemeId: record.awemeId,
            cid: record.cid,
            sourceContentHash: record.sourceContentHash,
            sentiment: record.sentiment,
            category: record.category,
            priority: record.priority,
            rationale: record.rationale ?? null,
            runtimeId: record.runtimeId,
            runtimeVersion: record.runtimeVersion,
            providerId: record.providerId ?? null,
            modelId: record.modelId ?? null,
            executionId: record.executionId ?? null,
            configVersion: record.configVersion ?? null,
            classifiedAt: new Date(record.classifiedAt),
            createdAt: new Date(record.createdAt)
          }
        });
        output.push(row);
      }
      return output;
    });

    return rows.map(commentToDomain);
  }

  async listCommentClassifications(
    commentId: string
  ): Promise<DouyinCommentClassification[]> {
    const rows =
      await this.db.douyinCommentClassificationRecord.findMany({
        where: { commentId },
        orderBy: [
          { classifiedAt: "asc" },
          { createdAt: "asc" }
        ]
      });
    return rows.map(classificationToDomain);
  }

  async createReplyDraft(
    input: DouyinReplyDraft
  ): Promise<DouyinReplyDraft> {
    const value = douyinReplyDraftSchema.parse(input);
    const row = await this.db.douyinReplyDraftRecord.create({
      data: {
        id: value.id,
        projectId: value.projectId,
        commentId: value.commentId,
        awemeId: value.awemeId,
        cid: value.cid,
        sourceContentHash: value.sourceContentHash,
        classificationId: value.classificationId ?? null,
        productTruthHash: value.productTruthHash,
        usedFactIdsJson: JSON.stringify(value.usedFactIds),
        generatedText: value.generatedText,
        currentText: value.currentText,
        strategy: value.strategy,
        status: value.status,
        revision: value.revision,
        runtimeId: value.runtimeId,
        runtimeVersion: value.runtimeVersion,
        providerId: value.providerId ?? null,
        modelId: value.modelId ?? null,
        executionId: value.executionId ?? null,
        configVersion: value.configVersion ?? null,
        createdAt: new Date(value.createdAt),
        updatedAt: new Date(value.updatedAt)
      }
    });
    return replyDraftToDomain(row);
  }

  async latestReplyDraft(
    commentId: string
  ): Promise<DouyinReplyDraft | null> {
    const row =
      await this.db.douyinReplyDraftRecord.findFirst({
        where: { commentId },
        orderBy: [
          { createdAt: "desc" },
          { updatedAt: "desc" }
        ]
      });
    return row ? replyDraftToDomain(row) : null;
  }

  async listLatestReplyDrafts(input: {
    projectId: string;
    awemeId?: string;
  }): Promise<DouyinReplyDraft[]> {
    const rows =
      await this.db.douyinReplyDraftRecord.findMany({
        where: {
          projectId: input.projectId,
          ...(input.awemeId
            ? { awemeId: input.awemeId }
            : {})
        },
        orderBy: [
          { createdAt: "asc" },
          { updatedAt: "asc" }
        ]
      });
    const latest = new Map<string, ReplyDraftRow>();
    for (const row of rows) {
      latest.set(row.commentId, row);
    }
    return [...latest.values()].map(replyDraftToDomain);
  }

  async listReplyDrafts(
    commentId: string
  ): Promise<DouyinReplyDraft[]> {
    const rows =
      await this.db.douyinReplyDraftRecord.findMany({
        where: { commentId },
        orderBy: [
          { createdAt: "asc" },
          { updatedAt: "asc" }
        ]
      });
    return rows.map(replyDraftToDomain);
  }

  async findReplyDraftById(
    draftId: string
  ): Promise<DouyinReplyDraft | null> {
    const row =
      await this.db.douyinReplyDraftRecord.findUnique({
        where: { id: draftId }
      });
    return row ? replyDraftToDomain(row) : null;
  }

  async mutateReplyDraft(input: {
    draftId: string;
    expectedRevision: number;
    currentText: string;
    status: "DRAFT" | "REJECTED";
    revisionRecord: DouyinReplyDraftRevision;
  }): Promise<DouyinReplyDraft | null> {
    const audit =
      douyinReplyDraftRevisionSchema.parse(
        input.revisionRecord
      );

    return this.db.$transaction(async (tx) => {
      const updated =
        await tx.douyinReplyDraftRecord.updateMany({
          where: {
            id: input.draftId,
            revision: input.expectedRevision
          },
          data: {
            currentText: input.currentText,
            status: input.status,
            revision: { increment: 1 },
            updatedAt: new Date(audit.createdAt)
          }
        });

      if (updated.count !== 1) {
        return null;
      }

      await tx.douyinReplyDraftRevisionRecord.create({
        data: {
          id: audit.id,
          projectId: audit.projectId,
          draftId: audit.draftId,
          commentId: audit.commentId,
          action: audit.action,
          beforeText: audit.beforeText,
          afterText: audit.afterText,
          beforeStatus: audit.beforeStatus,
          afterStatus: audit.afterStatus,
          expectedRevision: audit.expectedRevision,
          resultingRevision: audit.resultingRevision,
          createdAt: new Date(audit.createdAt)
        }
      });

      const row =
        await tx.douyinReplyDraftRecord.findUnique({
          where: { id: input.draftId }
        });
      if (!row) {
        throw new Error(
          "Reply draft disappeared during mutation"
        );
      }
      return replyDraftToDomain(row);
    });
  }

  async listReplyDraftRevisions(
    draftId: string
  ): Promise<DouyinReplyDraftRevision[]> {
    const rows =
      await this.db.douyinReplyDraftRevisionRecord.findMany({
        where: { draftId },
        orderBy: [
          { resultingRevision: "asc" },
          { createdAt: "asc" }
        ]
      });
    return rows.map(replyDraftRevisionToDomain);
  }

  async createInsight(
    input: DouyinInsight
  ): Promise<DouyinInsight> {
    const value = douyinInsightSchema.parse(input);
    const row = await this.db.douyinInsightRecord.create({
      data: {
        id: value.id,
        projectId: value.projectId,
        bindingId: value.bindingId,
        awemeId: value.awemeId,
        productTruthHash: value.productTruthHash,
        metricSnapshotIdsJson:
          JSON.stringify(value.metricSnapshotIds),
        commentIdsJson:
          JSON.stringify(value.commentIds),
        evidenceHash: value.evidenceHash,
        summary: value.summary,
        strengthsJson:
          JSON.stringify(value.strengths),
        weaknessesJson:
          JSON.stringify(value.weaknesses),
        audienceQuestionsJson:
          JSON.stringify(value.audienceQuestions),
        nextCreativeActionsJson:
          JSON.stringify(value.nextCreativeActions),
        runtimeId: value.runtimeId,
        runtimeVersion: value.runtimeVersion,
        providerId: value.providerId ?? null,
        modelId: value.modelId ?? null,
        executionId: value.executionId ?? null,
        configVersion: value.configVersion ?? null,
        createdAt: new Date(value.createdAt)
      }
    });
    return insightToDomain(row);
  }

  async latestInsight(
    projectId: string,
    awemeId?: string
  ): Promise<DouyinInsight | null> {
    const row =
      await this.db.douyinInsightRecord.findFirst({
        where: {
          projectId,
          ...(awemeId ? { awemeId } : {})
        },
        orderBy: { createdAt: "desc" }
      });
    return row ? insightToDomain(row) : null;
  }

  async listInsights(input: {
    projectId: string;
    awemeId?: string;
    limit?: number;
  }): Promise<DouyinInsight[]> {
    const limit =
      input.limit === undefined
        ? undefined
        : Math.max(1, Math.min(100, Math.trunc(input.limit)));
    const rows =
      await this.db.douyinInsightRecord.findMany({
        where: {
          projectId: input.projectId,
          ...(input.awemeId
            ? { awemeId: input.awemeId }
            : {})
        },
        orderBy: { createdAt: "asc" },
        ...(limit ? { take: limit } : {})
      });
    return rows.map(insightToDomain);
  }

  async findInsightById(
    insightId: string
  ): Promise<DouyinInsight | null> {
    const row =
      await this.db.douyinInsightRecord.findUnique({
        where: { id: insightId }
      });
    return row ? insightToDomain(row) : null;
  }

  async upsertCreativeFeedback(
    input: DouyinCreativeFeedback
  ): Promise<DouyinCreativeFeedback> {
    const value =
      douyinCreativeFeedbackSchema.parse(input);
    const row =
      await this.db.douyinCreativeFeedbackRecord.upsert({
        where: {
          insightId_actionHash: {
            insightId: value.insightId,
            actionHash: value.actionHash
          }
        },
        create: {
          id: value.id,
          projectId: value.projectId,
          insightId: value.insightId,
          actionIndex: value.actionIndex,
          actionHash: value.actionHash,
          actionText: value.actionText,
          evidenceRefsJson:
            JSON.stringify(value.evidenceRefs),
          active: value.active,
          confirmedAt: new Date(value.confirmedAt),
          deactivatedAt: value.deactivatedAt
            ? new Date(value.deactivatedAt)
            : null,
          createdAt: new Date(value.createdAt),
          updatedAt: new Date(value.updatedAt)
        },
        update: {
          actionIndex: value.actionIndex,
          actionText: value.actionText,
          evidenceRefsJson:
            JSON.stringify(value.evidenceRefs),
          active: value.active,
          confirmedAt: new Date(value.confirmedAt),
          deactivatedAt: value.deactivatedAt
            ? new Date(value.deactivatedAt)
            : null,
          updatedAt: new Date(value.updatedAt)
        }
      });
    return creativeFeedbackToDomain(row);
  }

  async findCreativeFeedbackById(
    feedbackId: string
  ): Promise<DouyinCreativeFeedback | null> {
    const row =
      await this.db.douyinCreativeFeedbackRecord.findUnique({
        where: { id: feedbackId }
      });
    return row ? creativeFeedbackToDomain(row) : null;
  }

  async listCreativeFeedback(input: {
    projectId: string;
    active?: boolean;
  }): Promise<DouyinCreativeFeedback[]> {
    const rows =
      await this.db.douyinCreativeFeedbackRecord.findMany({
        where: {
          projectId: input.projectId,
          ...(input.active !== undefined
            ? { active: input.active }
            : {})
        },
        orderBy: [
          { confirmedAt: "asc" },
          { createdAt: "asc" }
        ]
      });
    return rows.map(creativeFeedbackToDomain);
  }

  async deactivateCreativeFeedback(input: {
    feedbackId: string;
    projectId: string;
    deactivatedAt: string;
  }): Promise<DouyinCreativeFeedback | null> {
    const updated =
      await this.db.douyinCreativeFeedbackRecord.updateMany({
        where: {
          id: input.feedbackId,
          projectId: input.projectId,
          active: true
        },
        data: {
          active: false,
          deactivatedAt: new Date(input.deactivatedAt),
          updatedAt: new Date(input.deactivatedAt)
        }
      });
    if (updated.count !== 1) return null;
    const row =
      await this.db.douyinCreativeFeedbackRecord.findUnique({
        where: { id: input.feedbackId }
      });
    return row ? creativeFeedbackToDomain(row) : null;
  }
}
