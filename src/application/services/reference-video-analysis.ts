import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ArtifactRepository } from "../ports/artifact-repository.js";
import type { ReferenceVideoRepository } from "../ports/reference-video-repository.js";
import type { StructuredAiRuntime } from "../ports/structured-ai-runtime.js";
import { generateStructuredJson } from "../ports/structured-ai-runtime.js";
import {
  referenceVideoProfileSchema,
  type ReferenceVideoProfile
} from "../../domain/schemas.js";
import { hashValue } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";
import { LocalArtifactStore } from "../../adapters/store/local-artifact-store.js";
import {
  probeReferenceVideo,
  sampleReferenceFrames
} from "../../adapters/media/reference-video-media.js";

const proposalSchema = z.object({
  analysisConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  hook: z.object({
    firstThreeSecondsPattern: z.string().trim().min(1),
    structuralPurpose: z.string().trim().min(1)
  }),
  pacing: z.object({
    overall: z.string().trim().min(1),
    estimatedShotCount: z.number().int().positive(),
    averageShotDurationMs: z.number().int().positive()
  }),
  shotLanguage: z.object({
    shotSizes: z.array(z.string().trim().min(1)).max(20),
    cameraPositions: z.array(z.string().trim().min(1)).max(20),
    cameraMovements: z.array(z.string().trim().min(1)).max(20),
    compositionPatterns: z.array(z.string().trim().min(1)).max(20)
  }),
  productAppearance: z.object({
    firstAppearanceMs: z.number().int().nonnegative().nullable(),
    visibilityPattern: z.string().trim().min(1),
    showcasePattern: z.string().trim().min(1)
  }),
  sellingPointPattern: z.array(z.string().trim().min(1)).max(20),
  dialogueNarrationStructure: z.string().trim().min(1),
  audioBgMusicStructure: z.string().trim().min(1),
  ctaPattern: z.string().trim().min(1),
  reusableStylePrinciples: z.array(z.string().trim().min(1)).min(1).max(20)
});

function profileContentHash(
  profile: Omit<ReferenceVideoProfile, "contentHash">
): string {
  return hashValue(profile);
}

export class ReferenceVideoAnalysisService {
  constructor(
    private readonly repo: ReferenceVideoRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly runtime: StructuredAiRuntime,
    private readonly projectsRoot: string
  ) {}

  async latest(projectId: string): Promise<ReferenceVideoProfile | null> {
    return this.repo.latestActive(projectId);
  }

  async list(projectId: string): Promise<ReferenceVideoProfile[]> {
    return this.repo.listProfiles(projectId);
  }

  async deactivate(projectId: string): Promise<void> {
    await this.repo.markActiveProfilesStale(projectId);
  }

  async analyzeUpload(input: {
    projectId: string;
    artifactId: string;
    originalFilename?: string;
  }): Promise<ReferenceVideoProfile> {
    const artifact = await this.artifacts.findById(input.artifactId);
    if (
      !artifact ||
      artifact.projectId !== input.projectId ||
      artifact.integrityStatus !== "READY" ||
      !artifact.sha256
    ) {
      throw new DomainValidationError("参考视频文件不可用");
    }
    if (
      artifact.mimeType !== "video/mp4" &&
      artifact.mimeType !== "video/quicktime"
    ) {
      throw new DomainValidationError("参考视频当前只支持 MP4 / MOV");
    }

    const projectRoot = path.resolve(this.projectsRoot, input.projectId);
    const store = new LocalArtifactStore(projectRoot, this.artifacts);
    const videoPath = store.resolveArtifactPath(artifact.relativePath);
    const mediaInfo = await probeReferenceVideo(videoPath);
    const tempDir = path.join(
      projectRoot,
      ".tmp",
      "reference-video-analysis",
      randomUUID()
    );

    try {
      const sampledFrames = await sampleReferenceFrames({
        filePath: videoPath,
        outputDir: tempDir,
        durationMs: mediaInfo.durationMs,
        maxFrames: 10
      });
      const media = [];
      for (const frame of sampledFrames) {
        const bytes = await fs.readFile(frame.path);
        media.push({
          type: "image" as const,
          mimeType: frame.mimeType,
          dataBase64: bytes.toString("base64"),
          label: "sample@" + frame.timestampMs + "ms"
        });
      }

      const generation = await generateStructuredJson(this.runtime, {
        task:
          "Analyze a reference marketing video into a reusable ReferenceVideoProfile for a new, original product video.",
        instructions: [
          "Analyze structure and production method only.",
          "Do not reproduce or quote source dialogue, captions, slogans, shot descriptions, character identity, brand-specific expression, or copyrighted creative wording.",
          "Describe the first-three-second hook by function and pattern, not by copying its content.",
          "Use sampled frames and local media metadata as evidence. If audio semantics cannot be reliably observed, say so instead of inventing dialogue or lyrics.",
          "estimatedShotCount may use local scene-cut timestamps as a lower-bound clue, but sampled frames are not every source frame.",
          "Product facts from the reference video are not Product Truth and must not be inferred into factual claims.",
          "Return concise reusable principles that Creative, Script and Director can adapt to a different product."
        ].join(" "),
        input: {
          sourceVideo: {
            artifactId: artifact.id,
            sha256: artifact.sha256,
            originalFilename: input.originalFilename,
            relativePath: artifact.relativePath,
            durationMs: mediaInfo.durationMs,
            width: mediaInfo.width,
            height: mediaInfo.height,
            frameRate: mediaInfo.frameRate,
            hasAudio: mediaInfo.hasAudio,
            sceneCutTimestampsMs: mediaInfo.sceneCutTimestampsMs
          },
          sampledFrames: sampledFrames.map((frame) => ({
            path: frame.path,
            timestampMs: frame.timestampMs
          })),
          copyPolicy: "STRUCTURE_AND_METHOD_ONLY"
        },
        media,
        outputContract: {
          analysisConfidence: "LOW|MEDIUM|HIGH",
          hook: {
            firstThreeSecondsPattern: "string",
            structuralPurpose: "string"
          },
          pacing: {
            overall: "string",
            estimatedShotCount: 8,
            averageShotDurationMs: 1200
          },
          shotLanguage: {
            shotSizes: ["string"],
            cameraPositions: ["string"],
            cameraMovements: ["string"],
            compositionPatterns: ["string"]
          },
          productAppearance: {
            firstAppearanceMs: 1000,
            visibilityPattern: "string",
            showcasePattern: "string"
          },
          sellingPointPattern: ["string"],
          dialogueNarrationStructure: "string",
          audioBgMusicStructure: "string",
          ctaPattern: "string",
          reusableStylePrinciples: ["string"]
        },
        context: {
          projectId: input.projectId,
          step: "REFERENCE_VIDEO_ANALYSIS"
        }
      });
      const proposal = proposalSchema.parse(generation.data);
      const localShotCount =
        mediaInfo.sceneCutTimestampsMs.length > 0
          ? mediaInfo.sceneCutTimestampsMs.length + 1
          : undefined;
      const estimatedShotCount = Math.max(
        1,
        localShotCount ?? proposal.pacing.estimatedShotCount
      );
      const averageShotDurationMs = Math.max(
        1,
        Math.round(mediaInfo.durationMs / estimatedShotCount)
      );
      const version = await this.repo.nextVersion(input.projectId);
      const createdAt = new Date().toISOString();
      const profileWithoutHash: Omit<
        ReferenceVideoProfile,
        "contentHash"
      > = {
        id: randomUUID(),
        projectId: input.projectId,
        version,
        status: "ACTIVE",
        sourceType: "UPLOAD",
        videoArtifactId: artifact.id,
        videoArtifactHash: artifact.sha256,
        ...(input.originalFilename
          ? { originalFilename: input.originalFilename }
          : {}),
        media: {
          durationMs: mediaInfo.durationMs,
          ...(mediaInfo.width ? { width: mediaInfo.width } : {}),
          ...(mediaInfo.height ? { height: mediaInfo.height } : {}),
          ...(mediaInfo.frameRate ? { frameRate: mediaInfo.frameRate } : {}),
          hasAudio: mediaInfo.hasAudio,
          sampledFrameCount: sampledFrames.length,
          sceneCutTimestampsMs: mediaInfo.sceneCutTimestampsMs
        },
        analysisConfidence: proposal.analysisConfidence,
        hook: proposal.hook,
        pacing: {
          overall: proposal.pacing.overall,
          estimatedShotCount,
          averageShotDurationMs
        },
        shotLanguage: proposal.shotLanguage,
        productAppearance: proposal.productAppearance,
        sellingPointPattern: proposal.sellingPointPattern,
        dialogueNarrationStructure: mediaInfo.hasAudio
          ? proposal.dialogueNarrationStructure
          : "源视频无音轨；没有旁白/对话结构可分析。",
        audioBgMusicStructure: mediaInfo.hasAudio
          ? proposal.audioBgMusicStructure
          : "源视频无音轨；没有 BGM/环境声结构可分析。",
        ctaPattern: proposal.ctaPattern,
        reusableStylePrinciples: proposal.reusableStylePrinciples,
        copyGuard: "STRUCTURE_AND_METHOD_ONLY",
        ...(generation.metadata
          ? { aiExecution: generation.metadata }
          : {}),
        createdAt
      };
      const profile = referenceVideoProfileSchema.parse({
        ...profileWithoutHash,
        contentHash: profileContentHash(profileWithoutHash)
      });
      return this.repo.saveProfile(profile);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(
        () => undefined
      );
    }
  }
}

export function referenceVideoProfileForPrompt(
  profile?: ReferenceVideoProfile | null
): unknown | undefined {
  if (!profile || profile.status !== "ACTIVE") return undefined;
  return {
    profileRef: {
      entityType: "ReferenceVideoProfile",
      entityId: profile.id,
      version: profile.version,
      hash: profile.contentHash
    },
    policy: profile.copyGuard,
    hook: profile.hook,
    pacing: profile.pacing,
    shotLanguage: profile.shotLanguage,
    productAppearance: profile.productAppearance,
    sellingPointPattern: profile.sellingPointPattern,
    dialogueNarrationStructure: profile.dialogueNarrationStructure,
    audioBgMusicStructure: profile.audioBgMusicStructure,
    ctaPattern: profile.ctaPattern,
    reusableStylePrinciples: profile.reusableStylePrinciples
  };
}
