import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { ArtifactRepository } from "../ports/artifact-repository.js";
import type { FinalOutputRepository } from "../ports/final-output-repository.js";
import type { PublishRepository } from "../ports/publish-repository.js";
import type { ProductFlowService } from "./product-flow.js";
import { PublishProviderRegistry } from "./publish-provider-registry.js";
import type {
  PublishPackage,
  PublishProviderType,
  PublishReceipt
} from "../../domain/publish.js";
import {
  publishPackageSchema,
  publishProviderTypeSchema,
  publishReceiptSchema
} from "../../domain/publish.js";
import { sha256Bytes, sha256Text } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";
import { LocalArtifactStore } from "../../adapters/store/local-artifact-store.js";

const DEFAULT_PROVIDER: PublishProviderType = "DOUYIN_SDK_HANDOFF";
const PACKAGE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 20 * 60 * 1000;
const MEDIA_TTL_MS = 15 * 60 * 1000;

export type PublicPublishPackage = Omit<
  PublishPackage,
  "singleUseTokenHash" | "sessionTokenHash" | "mediaTokenHash"
>;

function publicPackage(input: PublishPackage): PublicPublishPackage {
  const {
    singleUseTokenHash: _singleUseTokenHash,
    sessionTokenHash: _sessionTokenHash,
    mediaTokenHash: _mediaTokenHash,
    ...safe
  } = input;
  return safe;
}

function absoluteBaseUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DomainValidationError("Public base URL must use http/https");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function expiryWithin(parentExpiry: string, maxMs: number, now: number): string {
  const parent = Date.parse(parentExpiry);
  return new Date(Math.min(parent, now + maxMs)).toISOString();
}

export class PublishBridgeService {
  constructor(
    private readonly productFlow: ProductFlowService,
    private readonly artifacts: ArtifactRepository,
    private readonly finalOutput: FinalOutputRepository,
    private readonly publishRepo: PublishRepository,
    private readonly providers: PublishProviderRegistry,
    private readonly projectsRoot: string
  ) {}

  async getPreference(projectId: string) {
    const stored = await this.publishRepo.getPreference(projectId);
    return (
      stored ?? {
        projectId,
        providerType: DEFAULT_PROVIDER,
        updatedAt: new Date(0).toISOString()
      }
    );
  }

  async setPreference(
    projectId: string,
    providerTypeInput: string
  ) {
    const providerType = publishProviderTypeSchema.parse(providerTypeInput);
    this.providers.get(providerType);
    const project = await this.productFlow.getProject(projectId);
    if (!project) throw new DomainValidationError("Project not found");
    return this.publishRepo.setPreference(
      projectId,
      providerType,
      new Date().toISOString()
    );
  }

  async providerStatus(projectId: string) {
    const [preference, probes] = await Promise.all([
      this.getPreference(projectId),
      this.providers.probes(projectId)
    ]);
    return { preference, probes };
  }

  private async acceptedFinal(projectId: string) {
    const assembly = await this.finalOutput.latestAssembly(projectId);
    if (!assembly || assembly.status !== "ACCEPTED") {
      throw new DomainValidationError(
        "An ACCEPTED final video is required before publishing"
      );
    }
    const artifact = await this.artifacts.findById(assembly.outputArtifactId);
    if (
      !artifact ||
      artifact.projectId !== projectId ||
      artifact.kind !== "FINAL_VIDEO" ||
      artifact.integrityStatus !== "READY" ||
      !artifact.sha256 ||
      artifact.sha256 !== assembly.outputArtifactHash
    ) {
      throw new DomainValidationError("最终成片尚不可用");
    }
    return { assembly, artifact };
  }

  async createPackage(input: {
    projectId: string;
    title: string;
    description?: string;
    coverArtifactId?: string;
    providerType?: PublishProviderType;
    publicBaseUrl: string;
    ttlMs?: number;
  }): Promise<{
    package: PublicPublishPackage;
    claimToken: string;
    claimUrl: string;
  }> {
    const title = input.title.trim();
    if (!title) throw new DomainValidationError("Publish title is required");
    const { assembly, artifact } = await this.acceptedFinal(input.projectId);
    const preference = await this.getPreference(input.projectId);
    const providerType = input.providerType ?? preference.providerType;
    const provider = this.providers.get(providerType);
    const probe = await provider.probe(input.projectId);
    if (probe.code !== "READY") {
      throw new DomainValidationError(
        provider.displayName +
          " is not ready: " +
          (probe.reason ?? probe.code)
      );
    }

    if (input.coverArtifactId) {
      const cover = await this.artifacts.findById(input.coverArtifactId);
      if (
        !cover ||
        cover.projectId !== input.projectId ||
        cover.integrityStatus !== "READY" ||
        !cover.mimeType?.startsWith("image/")
      ) {
        throw new DomainValidationError("封面图片尚不可用");
      }
    }

    const now = Date.now();
    const token = randomToken();
    const id = randomUUID();
    const value = publishPackageSchema.parse({
      id,
      projectId: input.projectId,
      finalAssemblyId: assembly.id,
      finalArtifactId: artifact.id,
      finalArtifactHash: artifact.sha256,
      providerType,
      titleDraft: title,
      ...(input.description?.trim()
        ? { descriptionDraft: input.description.trim() }
        : {}),
      ...(input.coverArtifactId
        ? { coverArtifactId: input.coverArtifactId }
        : {}),
      expiresAt: new Date(
        now + Math.max(60_000, input.ttlMs ?? PACKAGE_TTL_MS)
      ).toISOString(),
      singleUseTokenHash: sha256Text(token),
      status: "PACKAGE_READY",
      createdAt: new Date(now).toISOString()
    });
    const stored = await this.publishRepo.createPackage(value);
    const base = absoluteBaseUrl(input.publicBaseUrl);
    const claimUrl =
      base +
      "/publish/mobile/" +
      encodeURIComponent(stored.id) +
      "#token=" +
      encodeURIComponent(token);
    return {
      package: publicPackage(stored),
      claimToken: token,
      claimUrl
    };
  }

  async claimPackage(input: {
    packageId: string;
    token: string;
  }): Promise<{
    package: PublicPublishPackage;
    sessionToken: string;
  }> {
    if (!input.token.trim()) {
      throw new DomainValidationError("缺少发布包领取凭证");
    }
    const now = Date.now();
    const existing = await this.publishRepo.findPackageById(input.packageId);
    if (!existing) throw new DomainValidationError("找不到该发布包");
    const sessionToken = randomToken();
    const claimed = await this.publishRepo.claimPackage({
      id: input.packageId,
      tokenHash: sha256Text(input.token),
      sessionTokenHash: sha256Text(sessionToken),
      sessionExpiresAt: expiryWithin(
        existing.expiresAt,
        SESSION_TTL_MS,
        now
      ),
      now: new Date(now).toISOString()
    });
    if (!claimed) {
      await this.publishRepo.expirePackages(new Date(now).toISOString());
      throw new DomainValidationError(
        "Publish claim token is invalid, expired, or already used"
      );
    }
    await this.publishRepo.createReceipt(
      publishReceiptSchema.parse({
        id: randomUUID(),
        projectId: claimed.projectId,
        packageId: claimed.id,
        providerType: claimed.providerType,
        kind: "PACKAGE_CLAIMED",
        trusted: false,
        note: "一次性 PublishPackage token 已消费。",
        createdAt: new Date(now).toISOString()
      })
    );
    return {
      package: publicPackage(claimed),
      sessionToken
    };
  }

  private async requireSession(
    packageId: string,
    sessionToken: string
  ): Promise<PublishPackage> {
    const value = await this.publishRepo.authorizeSession({
      id: packageId,
      sessionTokenHash: sha256Text(sessionToken),
      now: new Date().toISOString()
    });
    if (!value) {
      throw new DomainValidationError(
        "Publish session is invalid or expired"
      );
    }
    return value;
  }

  private async verifyPackageArtifact(pkg: PublishPackage) {
    const artifact = await this.artifacts.findById(pkg.finalArtifactId);
    if (
      !artifact ||
      artifact.projectId !== pkg.projectId ||
      artifact.kind !== "FINAL_VIDEO" ||
      artifact.integrityStatus !== "READY" ||
      artifact.sha256 !== pkg.finalArtifactHash
    ) {
      throw new DomainValidationError(
        "PublishPackage FINAL_VIDEO is not READY"
      );
    }
    const store = new LocalArtifactStore(
      path.resolve(this.projectsRoot, pkg.projectId),
      this.artifacts
    );
    const absolutePath = store.resolveArtifactPath(artifact.relativePath);
    const bytes = await fs.readFile(absolutePath);
    if (sha256Bytes(bytes) !== pkg.finalArtifactHash) {
      throw new DomainValidationError(
        "PublishPackage FINAL_VIDEO bytes changed"
      );
    }
    return { artifact, absolutePath };
  }

  async startHandoff(input: {
    packageId: string;
    sessionToken: string;
    publicBaseUrl: string;
  }) {
    const pkg = await this.requireSession(
      input.packageId,
      input.sessionToken
    );
    const provider = this.providers.get(pkg.providerType);
    if (!provider.prepareHandoff || provider.mode === "DIRECT") {
      throw new DomainValidationError(
        "Selected provider does not support handoff"
      );
    }
    const probe = await provider.probe(pkg.projectId);
    if (probe.code !== "READY") {
      throw new DomainValidationError(
        provider.displayName +
          " is not ready: " +
          (probe.reason ?? probe.code)
      );
    }
    await this.verifyPackageArtifact(pkg);

    const now = Date.now();
    const mediaToken = randomToken();
    const mediaExpiresAt = expiryWithin(
      pkg.expiresAt,
      MEDIA_TTL_MS,
      now
    );
    await this.publishRepo.updatePackage(pkg.id, {
      mediaTokenHash: sha256Text(mediaToken),
      mediaExpiresAt
    });

    const base = absoluteBaseUrl(input.publicBaseUrl);
    const mediaUrl =
      base +
      "/api/publish/packages/" +
      encodeURIComponent(pkg.id) +
      "/media?media_token=" +
      encodeURIComponent(mediaToken);
    const bridgeUrl =
      base + "/publish/mobile/" + encodeURIComponent(pkg.id);

    const handoff = await provider.prepareHandoff({
      projectId: pkg.projectId,
      packageId: pkg.id,
      title: pkg.titleDraft,
      ...(pkg.descriptionDraft
        ? { description: pkg.descriptionDraft }
        : {}),
      bridgeUrl,
      videoUrl: mediaUrl
    });
    const updated = await this.publishRepo.updatePackage(pkg.id, {
      status: handoff.awaitingUserAction
        ? "AWAITING_USER_ACTION"
        : "HANDOFF_STARTED",
      handoffReference: handoff.handoffReference ?? pkg.id,
      handoffStartedAt: new Date(now).toISOString()
    });
    await this.publishRepo.createReceipt(
      publishReceiptSchema.parse({
        id: randomUUID(),
        projectId: pkg.projectId,
        packageId: pkg.id,
        providerType: pkg.providerType,
        kind: "HANDOFF_STARTED",
        trusted: false,
        ...(handoff.handoffReference
          ? { externalReference: handoff.handoffReference }
          : {}),
        createdAt: new Date(now).toISOString()
      })
    );
    if (pkg.providerType !== "MANUAL_EXPORT") {
      await this.productFlow.setProjectStatus(pkg.projectId, "PUBLISHING");
    }
    return {
      package: publicPackage(updated),
      handoff
    };
  }

  async completeHandoff(input: {
    packageId: string;
    sessionToken: string;
    note?: string;
  }) {
    const pkg = await this.requireSession(
      input.packageId,
      input.sessionToken
    );
    if (
      pkg.status !== "AWAITING_USER_ACTION" &&
      pkg.status !== "HANDOFF_STARTED"
    ) {
      throw new DomainValidationError(
        "PublishPackage is not awaiting handoff completion"
      );
    }
    const now = new Date().toISOString();
    const updated = await this.publishRepo.updatePackage(pkg.id, {
      status: "HANDOFF_COMPLETED",
      completedAt: now
    });
    await this.publishRepo.createReceipt(
      publishReceiptSchema.parse({
        id: randomUUID(),
        projectId: pkg.projectId,
        packageId: pkg.id,
        providerType: pkg.providerType,
        kind: "HANDOFF_COMPLETED",
        trusted: false,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        createdAt: now
      })
    );
    await this.productFlow.setProjectStatus(
      pkg.projectId,
      "READY_TO_PUBLISH"
    );
    return publicPackage(updated);
  }

  async directPublish(input: {
    projectId: string;
    packageId: string;
    confirmed: boolean;
  }) {
    if (input.confirmed !== true) {
      throw new DomainValidationError(
        "Direct publishing requires explicit user confirmation"
      );
    }
    const pkg = await this.publishRepo.findPackageById(input.packageId);
    if (!pkg || pkg.projectId !== input.projectId) {
      throw new DomainValidationError("当前项目中找不到该发布包");
    }
    const provider = this.providers.get(pkg.providerType);
    if (provider.mode !== "DIRECT" || !provider.directPublish) {
      throw new DomainValidationError(
        "Selected provider is not a direct-publish provider"
      );
    }
    const probe = await provider.probe(pkg.projectId);
    if (probe.code !== "READY") {
      throw new DomainValidationError(
        provider.displayName +
          " is not ready: " +
          (probe.reason ?? probe.code)
      );
    }
    const { absolutePath } = await this.verifyPackageArtifact(pkg);
    const startedAt = new Date().toISOString();
    await this.publishRepo.updatePackage(pkg.id, {
      status: "DIRECT_PUBLISHING",
      handoffStartedAt: startedAt
    });
    await this.productFlow.setProjectStatus(pkg.projectId, "PUBLISHING");

    try {
      const result = await provider.directPublish({
        projectId: pkg.projectId,
        packageId: pkg.id,
        videoPath: absolutePath,
        title: pkg.titleDraft,
        ...(pkg.descriptionDraft
          ? { description: pkg.descriptionDraft }
          : {})
      });
      const now = new Date().toISOString();
      const receipt = await this.publishRepo.createReceipt(
        publishReceiptSchema.parse({
          id: randomUUID(),
          projectId: pkg.projectId,
          packageId: pkg.id,
          providerType: pkg.providerType,
          kind: "PUBLISHED_CONFIRMED",
          trusted: true,
          externalReference: result.externalReference,
          evidenceHash: sha256Text(
            JSON.stringify({
              providerType: pkg.providerType,
              externalReference: result.externalReference,
              videoId: result.videoId,
              itemId: result.itemId
            })
          ),
          createdAt: now
        })
      );
      const updated = await this.applyTrustedPublishedReceipt(pkg, receipt);
      return { package: publicPackage(updated), receipt };
    } catch (error) {
      const now = new Date().toISOString();
      const updated = await this.publishRepo.updatePackage(pkg.id, {
        status: "FAILED",
        errorCode: "DIRECT_PUBLISH_FAILED",
        errorMessage:
          error instanceof Error ? error.message : String(error),
        completedAt: now
      });
      await this.publishRepo.createReceipt(
        publishReceiptSchema.parse({
          id: randomUUID(),
          projectId: pkg.projectId,
          packageId: pkg.id,
          providerType: pkg.providerType,
          kind: "FAILED",
          trusted: false,
          note:
            error instanceof Error ? error.message : String(error),
          createdAt: now
        })
      );
      await this.productFlow.setProjectStatus(
        pkg.projectId,
        "READY_TO_PUBLISH"
      );
      throw new DomainValidationError(
        updated.errorMessage ?? "Direct publish failed"
      );
    }
  }

  private async applyTrustedPublishedReceipt(
    pkg: PublishPackage,
    receipt: PublishReceipt
  ): Promise<PublishPackage> {
    if (
      receipt.kind !== "PUBLISHED_CONFIRMED" ||
      receipt.trusted !== true ||
      receipt.packageId !== pkg.id
    ) {
      throw new DomainValidationError(
        "Only a trusted PUBLISHED_CONFIRMED receipt can confirm publication"
      );
    }
    const now = receipt.createdAt;
    const updated = await this.publishRepo.updatePackage(pkg.id, {
      status: "PUBLISHED_CONFIRMED",
      completedAt: now,
      publishedConfirmedAt: now,
      handoffReference:
        receipt.externalReference ?? pkg.handoffReference ?? pkg.id
    });
    await this.productFlow.setProjectStatus(pkg.projectId, "PUBLISHED");
    return updated;
  }

  async mediaBySession(input: {
    packageId: string;
    sessionToken: string;
  }) {
    const pkg = await this.requireSession(
      input.packageId,
      input.sessionToken
    );
    return this.verifyPackageArtifact(pkg);
  }

  async mediaByToken(input: {
    packageId: string;
    mediaToken: string;
  }) {
    const pkg = await this.publishRepo.authorizeMedia({
      id: input.packageId,
      mediaTokenHash: sha256Text(input.mediaToken),
      now: new Date().toISOString()
    });
    if (!pkg) {
      throw new DomainValidationError(
        "Publish media token is invalid or expired"
      );
    }
    return this.verifyPackageArtifact(pkg);
  }

  async packageForSession(input: {
    packageId: string;
    sessionToken: string;
  }) {
    return publicPackage(
      await this.requireSession(input.packageId, input.sessionToken)
    );
  }

  async audit(projectId: string) {
    await this.publishRepo.expirePackages(new Date().toISOString());
    const [preference, packages, receipts] = await Promise.all([
      this.getPreference(projectId),
      this.publishRepo.listPackages(projectId),
      this.publishRepo.listReceipts(projectId)
    ]);
    return {
      preference,
      packages: packages.map(publicPackage),
      receipts
    };
  }
}
