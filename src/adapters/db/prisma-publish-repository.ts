import type { PrismaClient } from "@prisma/client";
import type {
  PublishPackageUpdate,
  PublishRepository
} from "../../application/ports/publish-repository.js";
import {
  publishPackageSchema,
  publishPreferenceSchema,
  publishReceiptSchema,
  type PublishPackage,
  type PublishPreference,
  type PublishProviderType,
  type PublishReceipt
} from "../../domain/publish.js";

type PreferenceRow = {
  projectId: string;
  providerType: string;
  updatedAt: Date;
};

type PackageRow = {
  id: string;
  projectId: string;
  finalAssemblyId: string;
  finalArtifactId: string;
  finalArtifactHash: string;
  providerType: string;
  titleDraft: string;
  descriptionDraft: string | null;
  coverArtifactId: string | null;
  expiresAt: Date;
  singleUseTokenHash: string;
  tokenConsumedAt: Date | null;
  sessionTokenHash: string | null;
  sessionExpiresAt: Date | null;
  mediaTokenHash: string | null;
  mediaExpiresAt: Date | null;
  status: string;
  handoffReference: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  handoffStartedAt: Date | null;
  completedAt: Date | null;
  publishedConfirmedAt: Date | null;
};

type ReceiptRow = {
  id: string;
  projectId: string;
  packageId: string;
  providerType: string;
  kind: string;
  trusted: boolean;
  externalReference: string | null;
  evidenceHash: string | null;
  note: string | null;
  createdAt: Date;
};

function preferenceToDomain(row: PreferenceRow): PublishPreference {
  return publishPreferenceSchema.parse({
    projectId: row.projectId,
    providerType: row.providerType,
    updatedAt: row.updatedAt.toISOString()
  });
}

function packageToDomain(row: PackageRow): PublishPackage {
  return publishPackageSchema.parse({
    id: row.id,
    projectId: row.projectId,
    finalAssemblyId: row.finalAssemblyId,
    finalArtifactId: row.finalArtifactId,
    finalArtifactHash: row.finalArtifactHash,
    providerType: row.providerType,
    titleDraft: row.titleDraft,
    ...(row.descriptionDraft ? { descriptionDraft: row.descriptionDraft } : {}),
    ...(row.coverArtifactId ? { coverArtifactId: row.coverArtifactId } : {}),
    expiresAt: row.expiresAt.toISOString(),
    singleUseTokenHash: row.singleUseTokenHash,
    ...(row.tokenConsumedAt
      ? { tokenConsumedAt: row.tokenConsumedAt.toISOString() }
      : {}),
    ...(row.sessionTokenHash
      ? { sessionTokenHash: row.sessionTokenHash }
      : {}),
    ...(row.sessionExpiresAt
      ? { sessionExpiresAt: row.sessionExpiresAt.toISOString() }
      : {}),
    ...(row.mediaTokenHash ? { mediaTokenHash: row.mediaTokenHash } : {}),
    ...(row.mediaExpiresAt
      ? { mediaExpiresAt: row.mediaExpiresAt.toISOString() }
      : {}),
    status: row.status,
    ...(row.handoffReference
      ? { handoffReference: row.handoffReference }
      : {}),
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.claimedAt ? { claimedAt: row.claimedAt.toISOString() } : {}),
    ...(row.handoffStartedAt
      ? { handoffStartedAt: row.handoffStartedAt.toISOString() }
      : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    ...(row.publishedConfirmedAt
      ? { publishedConfirmedAt: row.publishedConfirmedAt.toISOString() }
      : {})
  });
}

function receiptToDomain(row: ReceiptRow): PublishReceipt {
  return publishReceiptSchema.parse({
    id: row.id,
    projectId: row.projectId,
    packageId: row.packageId,
    providerType: row.providerType,
    kind: row.kind,
    trusted: row.trusted,
    ...(row.externalReference
      ? { externalReference: row.externalReference }
      : {}),
    ...(row.evidenceHash ? { evidenceHash: row.evidenceHash } : {}),
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.createdAt.toISOString()
  });
}

export class PrismaPublishRepository implements PublishRepository {
  constructor(private readonly db: PrismaClient) {}

  async getPreference(projectId: string): Promise<PublishPreference | null> {
    const row = await this.db.publishPreferenceRecord.findUnique({
      where: { projectId }
    });
    return row ? preferenceToDomain(row) : null;
  }

  async setPreference(
    projectId: string,
    providerType: PublishProviderType,
    updatedAt: string
  ): Promise<PublishPreference> {
    const row = await this.db.publishPreferenceRecord.upsert({
      where: { projectId },
      create: {
        projectId,
        providerType,
        updatedAt: new Date(updatedAt)
      },
      update: {
        providerType,
        updatedAt: new Date(updatedAt)
      }
    });
    return preferenceToDomain(row);
  }

  async createPackage(input: PublishPackage): Promise<PublishPackage> {
    const value = publishPackageSchema.parse(input);
    const row = await this.db.publishPackageRecord.create({
      data: {
        id: value.id,
        projectId: value.projectId,
        finalAssemblyId: value.finalAssemblyId,
        finalArtifactId: value.finalArtifactId,
        finalArtifactHash: value.finalArtifactHash,
        providerType: value.providerType,
        titleDraft: value.titleDraft,
        descriptionDraft: value.descriptionDraft,
        coverArtifactId: value.coverArtifactId,
        expiresAt: new Date(value.expiresAt),
        singleUseTokenHash: value.singleUseTokenHash,
        tokenConsumedAt: value.tokenConsumedAt
          ? new Date(value.tokenConsumedAt)
          : null,
        sessionTokenHash: value.sessionTokenHash,
        sessionExpiresAt: value.sessionExpiresAt
          ? new Date(value.sessionExpiresAt)
          : null,
        mediaTokenHash: value.mediaTokenHash,
        mediaExpiresAt: value.mediaExpiresAt
          ? new Date(value.mediaExpiresAt)
          : null,
        status: value.status,
        handoffReference: value.handoffReference,
        errorCode: value.errorCode,
        errorMessage: value.errorMessage,
        createdAt: new Date(value.createdAt),
        claimedAt: value.claimedAt ? new Date(value.claimedAt) : null,
        handoffStartedAt: value.handoffStartedAt
          ? new Date(value.handoffStartedAt)
          : null,
        completedAt: value.completedAt ? new Date(value.completedAt) : null,
        publishedConfirmedAt: value.publishedConfirmedAt
          ? new Date(value.publishedConfirmedAt)
          : null
      }
    });
    return packageToDomain(row);
  }

  async findPackageById(id: string): Promise<PublishPackage | null> {
    const row = await this.db.publishPackageRecord.findUnique({ where: { id } });
    return row ? packageToDomain(row) : null;
  }

  async latestPackage(projectId: string): Promise<PublishPackage | null> {
    const row = await this.db.publishPackageRecord.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" }
    });
    return row ? packageToDomain(row) : null;
  }

  async listPackages(projectId: string): Promise<PublishPackage[]> {
    const rows = await this.db.publishPackageRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(packageToDomain);
  }

  async updatePackage(
    id: string,
    update: PublishPackageUpdate
  ): Promise<PublishPackage> {
    const row = await this.db.publishPackageRecord.update({
      where: { id },
      data: {
        ...(update.status ? { status: update.status } : {}),
        ...(update.sessionTokenHash !== undefined
          ? { sessionTokenHash: update.sessionTokenHash }
          : {}),
        ...(update.sessionExpiresAt !== undefined
          ? {
              sessionExpiresAt: update.sessionExpiresAt
                ? new Date(update.sessionExpiresAt)
                : null
            }
          : {}),
        ...(update.mediaTokenHash !== undefined
          ? { mediaTokenHash: update.mediaTokenHash }
          : {}),
        ...(update.mediaExpiresAt !== undefined
          ? {
              mediaExpiresAt: update.mediaExpiresAt
                ? new Date(update.mediaExpiresAt)
                : null
            }
          : {}),
        ...(update.handoffReference !== undefined
          ? { handoffReference: update.handoffReference }
          : {}),
        ...(update.status &&
        update.status !== "FAILED" &&
        update.status !== "SUBMISSION_UNKNOWN"
          ? { errorCode: null, errorMessage: null }
          : {
              ...(update.errorCode !== undefined
                ? { errorCode: update.errorCode }
                : {}),
              ...(update.errorMessage !== undefined
                ? { errorMessage: update.errorMessage }
                : {})
            }),
        ...(update.claimedAt !== undefined
          ? { claimedAt: update.claimedAt ? new Date(update.claimedAt) : null }
          : {}),
        ...(update.tokenConsumedAt !== undefined
          ? {
              tokenConsumedAt: update.tokenConsumedAt
                ? new Date(update.tokenConsumedAt)
                : null
            }
          : {}),
        ...(update.handoffStartedAt !== undefined
          ? {
              handoffStartedAt: update.handoffStartedAt
                ? new Date(update.handoffStartedAt)
                : null
            }
          : {}),
        ...(update.completedAt !== undefined
          ? {
              completedAt: update.completedAt
                ? new Date(update.completedAt)
                : null
            }
          : {}),
        ...(update.publishedConfirmedAt !== undefined
          ? {
              publishedConfirmedAt: update.publishedConfirmedAt
                ? new Date(update.publishedConfirmedAt)
                : null
            }
          : {})
      }
    });
    return packageToDomain(row);
  }

  async claimPackage(input: {
    id: string;
    tokenHash: string;
    sessionTokenHash: string;
    sessionExpiresAt: string;
    now: string;
  }): Promise<PublishPackage | null> {
    return this.db.$transaction(async (tx) => {
      const now = new Date(input.now);
      const updated = await tx.publishPackageRecord.updateMany({
        where: {
          id: input.id,
          singleUseTokenHash: input.tokenHash,
          tokenConsumedAt: null,
          expiresAt: { gt: now },
          status: "PACKAGE_READY"
        },
        data: {
          tokenConsumedAt: now,
          claimedAt: now,
          sessionTokenHash: input.sessionTokenHash,
          sessionExpiresAt: new Date(input.sessionExpiresAt)
        }
      });
      if (updated.count !== 1) return null;
      const row = await tx.publishPackageRecord.findUnique({
        where: { id: input.id }
      });
      return row ? packageToDomain(row) : null;
    });
  }

  async authorizeSession(input: {
    id: string;
    sessionTokenHash: string;
    now: string;
  }): Promise<PublishPackage | null> {
    const row = await this.db.publishPackageRecord.findFirst({
      where: {
        id: input.id,
        sessionTokenHash: input.sessionTokenHash,
        sessionExpiresAt: { gt: new Date(input.now) },
        status: {
          in: [
            "PACKAGE_READY",
            "HANDOFF_STARTED",
            "AWAITING_USER_ACTION",
            "HANDOFF_COMPLETED",
            "PUBLISHED_CONFIRMED"
          ]
        }
      }
    });
    return row ? packageToDomain(row) : null;
  }

  async authorizeMedia(input: {
    id: string;
    mediaTokenHash: string;
    now: string;
  }): Promise<PublishPackage | null> {
    const row = await this.db.publishPackageRecord.findFirst({
      where: {
        id: input.id,
        mediaTokenHash: input.mediaTokenHash,
        mediaExpiresAt: { gt: new Date(input.now) },
        status: {
          in: [
            "HANDOFF_STARTED",
            "AWAITING_USER_ACTION",
            "HANDOFF_COMPLETED",
            "PUBLISHED_CONFIRMED"
          ]
        }
      }
    });
    return row ? packageToDomain(row) : null;
  }

  async expirePackages(now: string): Promise<number> {
    const result = await this.db.publishPackageRecord.updateMany({
      where: {
        expiresAt: { lte: new Date(now) },
        status: {
          in: ["PACKAGE_READY", "HANDOFF_STARTED", "AWAITING_USER_ACTION"]
        }
      },
      data: { status: "EXPIRED" }
    });
    return result.count;
  }

  async createReceipt(input: PublishReceipt): Promise<PublishReceipt> {
    const value = publishReceiptSchema.parse(input);
    const row = await this.db.publishReceiptRecord.create({
      data: {
        id: value.id,
        projectId: value.projectId,
        packageId: value.packageId,
        providerType: value.providerType,
        kind: value.kind,
        trusted: value.trusted,
        externalReference: value.externalReference,
        evidenceHash: value.evidenceHash,
        note: value.note,
        createdAt: new Date(value.createdAt)
      }
    });
    return receiptToDomain(row);
  }

  async listReceipts(projectId: string): Promise<PublishReceipt[]> {
    const rows = await this.db.publishReceiptRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(receiptToDomain);
  }

  async listReceiptsForPackage(packageId: string): Promise<PublishReceipt[]> {
    const rows = await this.db.publishReceiptRecord.findMany({
      where: { packageId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(receiptToDomain);
  }
}
