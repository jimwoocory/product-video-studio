import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { DomesticJimengCliProvider } from "../adapters/video/domestic-jimeng-cli-provider.js";
import { createConfiguredDomesticJimengProvider } from "../adapters/video/verified-dreamina-runtime-loader.js";
import { blockerFromProviderProbe } from "../application/services/provider-blocker.js";
import { PrismaProductFlowRepository } from "../adapters/db/prisma-product-flow-repository.js";
import { PrismaWorkflowRepository } from "../adapters/db/prisma-workflow-repository.js";
import { PrismaArtifactRepository } from "../adapters/db/prisma-artifact-repository.js";
import { PrismaGenerationRepository } from "../adapters/db/prisma-generation-repository.js";
import { PrismaReviewRepository } from "../adapters/db/prisma-review-repository.js";
import { PrismaProviderAuditRepository } from "../adapters/db/prisma-provider-audit-repository.js";
import { PrismaFinalOutputRepository } from "../adapters/db/prisma-final-output-repository.js";
import { prisma } from "../adapters/db/prisma-client.js";
import { LocalArtifactStore } from "../adapters/store/local-artifact-store.js";
import { LocalProductInputStore } from "../adapters/store/local-product-input-store.js";
import { HermesStructuredAiRuntime } from "../adapters/ai/hermes-structured-ai-runtime.js";
import { validateReferenceImagesForPreflight } from "../adapters/media/reference-image-validator.js";
import { HermesProductDirectorGenerator } from "../adapters/ai/hermes-product-director-generator.js";
import { OfficialDouyinOpenApiProvider } from "../adapters/publish/official-douyin-openapi-provider.js";
import { ProductFlowService } from "../application/services/product-flow.js";
import { loadGenerationConfig } from "../application/config/generation-config.js";
import { AiGenerationService } from "../application/services/ai-generation.js";
import { ProductDirectorService } from "../application/services/product-director.js";
import { GenerationPreflightService } from "../application/services/generation-preflight.js";
import { ApprovalService } from "../application/services/approval-service.js";
import { GenerationExecutionService } from "../application/services/generation-execution.js";
import { ReviewService } from "../application/services/review-service.js";
import { ProjectSnapshotService } from "../application/services/project-snapshot.js";
import { RecoveryService } from "../application/services/recovery-service.js";
import { FinalAssemblyService } from "../application/services/final-assembly-service.js";
import { DouyinPublishService } from "../application/services/douyin-publish-service.js";
import {
  assertCanonicalProductArtifactReady,
  confirmProductTruthDraft,
  confirmProductionPlanDraft,
  confirmScriptDraft,
  reviseProductionPlanDraft,
  reviseScriptDraft,
  type ClaimDisposition,
  type ProductionPlanSegmentRevision,
  type ScriptBeatRevision
} from "../application/services/review-actions.js";
import type { WorkflowRepository } from "../application/ports/workflow-repository.js";
import type { ArtifactRepository } from "../application/ports/artifact-repository.js";
import type { GenerationRepository } from "../application/ports/generation-repository.js";
import type { ProductInputStore } from "../application/ports/product-input-store.js";
import type { ReviewRepository } from "../application/ports/review-repository.js";
import type { ProviderAuditRepository } from "../application/ports/provider-audit-repository.js";
import type { FinalOutputRepository } from "../application/ports/final-output-repository.js";
import type { ProviderCommandEvidence } from "../application/ports/video-provider.js";
import { DomainValidationError } from "../domain/validation.js";
import {
  commandAttemptRecordSchema,
  providerIdentitySchema
} from "../domain/schemas.js";
import { sha256Bytes } from "../domain/hashing.js";
import { renderProjectPage, renderProjectsPage } from "./workbench-ui.js";
import type {
  AssetRef,
  CreativeBatch,
  ForbiddenChange,
  ProductTruth,
  ProductionPlan,
  Project,
  ScriptDraft
} from "../domain/schemas.js";

export type WebDependencies = {
  productFlow: ProductFlowService;
  workflow: WorkflowRepository;
  artifacts: ArtifactRepository;
  generation: GenerationRepository;
  review: ReviewRepository;
  providerAudit: ProviderAuditRepository;
  finalOutput: FinalOutputRepository;
  productInput: ProductInputStore;
  aiGeneration: AiGenerationService;
  productDirector: ProductDirectorService;
  preflight: GenerationPreflightService;
  approval: ApprovalService;
  execution: GenerationExecutionService;
  reviewService: ReviewService;
  finalAssembly: FinalAssemblyService;
  douyinPublish: DouyinPublishService;
  snapshots: ProjectSnapshotService;
  recovery: RecoveryService;
  projectsRoot: string;
  provider: DomesticJimengCliProvider;
};

export function createDefaultDependencies(): WebDependencies {
  const artifacts = new PrismaArtifactRepository(prisma);
  const generation = new PrismaGenerationRepository(prisma);
  const workflow = new PrismaWorkflowRepository(prisma);
  const review = new PrismaReviewRepository(prisma);
  const providerAudit = new PrismaProviderAuditRepository(prisma);
  const finalOutput = new PrismaFinalOutputRepository(prisma);
  const productFlow = new ProductFlowService(
    new PrismaProductFlowRepository(prisma)
  );
  const projectsRoot = path.resolve(process.env.PROJECTS_ROOT ?? "projects");
  const productInput = new LocalProductInputStore(projectsRoot, artifacts);
  const provider = createConfiguredDomesticJimengProvider({
    resolveGenerationAssets: async (request) => {
      const snapshot = await productInput.latest(request.projectId);
      if (!snapshot) {
        throw new DomainValidationError(
          "Saved Product Input is required to resolve dreamina reference assets"
        );
      }
      const projectRoot = path.resolve(projectsRoot, request.projectId);
      const resolved = [];
      for (const manifest of [...request.assetManifest].sort(
        (a, b) =>
          a.priority - b.priority ||
          a.assetId.localeCompare(b.assetId)
      )) {
        const asset = snapshot.assets.find(
          (item) => item.id === manifest.assetId
        );
        if (!asset) {
          if (manifest.required) {
            throw new DomainValidationError(
              `Required Product Input asset is missing: ${manifest.assetId}`
            );
          }
          continue;
        }
        const artifact = await artifacts.findById(asset.artifactId);
        if (
          !artifact ||
          artifact.projectId !== request.projectId ||
          artifact.integrityStatus !== "READY" ||
          !artifact.sha256 ||
          artifact.sha256 !== asset.sha256 ||
          artifact.sha256 !== manifest.artifactHash
        ) {
          throw new DomainValidationError(
            `dreamina asset integrity mismatch: ${manifest.assetId}`
          );
        }
        const absolutePath = path.resolve(
          projectRoot,
          artifact.relativePath
        );
        const prefix = projectRoot.endsWith(path.sep)
          ? projectRoot
          : projectRoot + path.sep;
        if (
          absolutePath !== projectRoot &&
          !absolutePath.startsWith(prefix)
        ) {
          throw new DomainValidationError(
            `dreamina asset path escapes project root: ${manifest.assetId}`
          );
        }
        const bytes = await fs.readFile(absolutePath);
        if (sha256Bytes(bytes) !== manifest.artifactHash) {
          throw new DomainValidationError(
            `dreamina asset bytes changed after approval: ${manifest.assetId}`
          );
        }
        resolved.push({
          assetId: manifest.assetId,
          absolutePath,
          artifactHash: manifest.artifactHash,
          role: manifest.role,
          priority: manifest.priority,
          required: manifest.required
        });
      }
      return resolved;
    }
  });
  const aiRuntime = new HermesStructuredAiRuntime(process.cwd());
  const generationConfig = loadGenerationConfig();
  const preflight = new GenerationPreflightService(
    generation,
    workflow,
    provider,
    (projectId, entityKey) =>
      productFlow.nextVersion(projectId, "CompiledPrompt", entityKey),
    generationConfig.model
  );
  const approval = new ApprovalService(generation, workflow);
  const execution = new GenerationExecutionService(
    generation,
    workflow,
    artifacts,
    providerAudit,
    provider,
    projectsRoot
  );
  const reviewService = new ReviewService(
    productFlow,
    generation,
    workflow,
    artifacts,
    review
  );
  const finalAssembly = new FinalAssemblyService(
    productFlow,
    workflow,
    artifacts,
    review,
    finalOutput,
    projectsRoot
  );
  const douyinProvider = new OfficialDouyinOpenApiProvider();
  const douyinPublish = new DouyinPublishService(
    productFlow,
    workflow,
    artifacts,
    finalOutput,
    douyinProvider,
    projectsRoot
  );
  const snapshots = new ProjectSnapshotService(
    projectsRoot,
    productFlow,
    productInput,
    artifacts,
    generation,
    workflow,
    review,
    providerAudit
  );
  const recovery = new RecoveryService(
    projectsRoot,
    productFlow,
    artifacts,
    workflow,
    snapshots
  );
  return {
    productFlow,
    workflow,
    artifacts,
    generation,
    review,
    providerAudit,
    finalOutput,
    productInput,
    aiGeneration: new AiGenerationService(aiRuntime),
    productDirector: new ProductDirectorService(
      new HermesProductDirectorGenerator(aiRuntime)
    ),
    preflight,
    approval,
    execution,
    reviewService,
    finalAssembly,
    douyinPublish,
    snapshots,
    recovery,
    projectsRoot,
    provider
  };
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function html(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

async function readJson(req: http.IncomingMessage, maxBytes = 2_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new DomainValidationError("Request body too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainValidationError("Invalid JSON body");
  }
}

function assertProjectBody(projectId: string, body: unknown): void {
  if (!body || typeof body !== "object" || (body as { projectId?: unknown }).projectId !== projectId) {
    throw new DomainValidationError("Body projectId must match URL project id");
  }
}

function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base || "upload.bin";
}

function decodeBase64(value: string): Buffer {
  const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length) throw new DomainValidationError("Uploaded file is empty");
  if (bytes.byteLength > 10 * 1024 * 1024) {
    throw new DomainValidationError("Each uploaded file must be <= 10MB");
  }
  return bytes;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DomainValidationError(`${label} is required`);
  }
  return value.trim();
}

async function refreshProjectSnapshot(
  deps: WebDependencies,
  projectId: string
): Promise<void> {
  await deps.snapshots.refresh(projectId);
}

function sameArgs(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export async function persistPreflightProviderAudit(
  deps: WebDependencies,
  projectId: string,
  probe: Awaited<ReturnType<DomesticJimengCliProvider["probe"]>>
): Promise<{ providerIdentityId?: string; commandAttemptIds: string[] }> {
  const evidence = deps.provider.drainCommandEvidence();
  if (!evidence.length) return { commandAttemptIds: [] };

  const existing = await deps.providerAudit.listCommandAttempts(projectId);
  const counts = new Map<string, number>();
  for (const item of existing) {
    counts.set(item.operation, Math.max(counts.get(item.operation) ?? 0, item.attemptNumber));
  }

  const store = new LocalArtifactStore(
    path.join(deps.projectsRoot, projectId),
    deps.artifacts
  );
  const persisted: Array<{
    evidence: ProviderCommandEvidence;
    commandAttemptId: string;
    stdoutArtifactId: string;
    stderrArtifactId: string;
  }> = [];

  for (const item of evidence) {
    const commandAttemptId = randomUUID();
    const operation = item.operation;
    const attemptNumber = (counts.get(operation) ?? 0) + 1;
    counts.set(operation, attemptNumber);
    const base =
      "provider/commands/" +
      commandAttemptId +
      "-" +
      operation.toLowerCase();

    const [stdoutArtifact, stderrArtifact] = await Promise.all([
      store.writeImmutable({
        id: randomUUID(),
        projectId,
        kind: "STDOUT",
        relativePath: base + "-stdout.txt",
        immutable: true,
        bytes: Buffer.from(item.stdoutRedacted, "utf8"),
        mimeType: "text/plain"
      }),
      store.writeImmutable({
        id: randomUUID(),
        projectId,
        kind: "STDERR",
        relativePath: base + "-stderr.txt",
        immutable: true,
        bytes: Buffer.from(item.stderrRedacted, "utf8"),
        mimeType: "text/plain"
      })
    ]);

    const record = commandAttemptRecordSchema.parse({
      id: commandAttemptId,
      operation,
      attemptNumber,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      exitCode: item.exitCode,
      timedOut: item.timedOut,
      stdoutArtifactId: stdoutArtifact.id,
      stderrArtifactId: stderrArtifact.id,
      redactionRulesVersion: "p0-redact-v1",
      parserVersion: "p0-provider-v1",
      ...(item.exitCode !== 0
        ? { errorCode: operation + "_FAILED" }
        : {})
    });
    await deps.providerAudit.createCommandAttempt({
      ...record,
      projectId,
      argvRedacted: item.argvRedacted
    });
    persisted.push({
      evidence: item,
      commandAttemptId,
      stdoutArtifactId: stdoutArtifact.id,
      stderrArtifactId: stderrArtifact.id
    });
  }

  if (probe.code !== "READY") {
    return {
      commandAttemptIds: persisted.map((item) => item.commandAttemptId)
    };
  }

  const identityContract = deps.provider.getVerifiedIdentityContract();
  const probeArgs = deps.provider.getVerifiedProbeArgs();
  if (!identityContract || !probeArgs) {
    throw new DomainValidationError(
      "READY provider must expose verified identity and probe contract"
    );
  }
  const executableName =
    probe.executablePath.split(/[\\/]/).filter(Boolean).at(-1) ?? "dreamina";
  const findProbeEvidence = (args: string[]) =>
    persisted.find(
      (item) =>
        item.evidence.operation === "PROBE" &&
        sameArgs(item.evidence.argvRedacted, [executableName, ...args])
    );
  const versionEvidence = findProbeEvidence(probeArgs.versionArgs);
  const helpEvidence = findProbeEvidence(probeArgs.helpArgs);
  if (!versionEvidence || !helpEvidence) {
    throw new DomainValidationError(
      "READY provider is missing separately auditable version/help command evidence"
    );
  }

  const rawVersionArtifactId = versionEvidence.evidence.stdoutRedacted.trim()
    ? versionEvidence.stdoutArtifactId
    : versionEvidence.stderrArtifactId;
  const rawHelpArtifactId = helpEvidence.evidence.stdoutRedacted.trim()
    ? helpEvidence.stdoutArtifactId
    : helpEvidence.stderrArtifactId;

  const identity = providerIdentitySchema.parse({
    ...identityContract,
    executablePath: probe.executablePath,
    executableSha256: probe.executableSha256,
    cliVersion: probe.cliVersion,
    rawVersionArtifactId,
    rawHelpArtifactId,
    capabilityFingerprint: probe.capabilityFingerprint,
    verificationStatus: "VERIFIED"
  });
  await deps.providerAudit.saveIdentity(projectId, identity);

  return {
    providerIdentityId: identity.id,
    commandAttemptIds: persisted.map((item) => item.commandAttemptId)
  };
}

export function createAppServer(
  deps: WebDependencies = createDefaultDependencies()
): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, {
          status: "ok",
          service: "product-video-studio",
          specVersion: "P0-V0.2"
        });
      }

      if (req.method === "GET" && url.pathname === "/api/provider/probe") {
        const probe = await deps.provider.probe();
        const blocker = blockerFromProviderProbe(
          url.searchParams.get("projectId") ?? "local-probe",
          probe
        );
        return json(res, 200, { probe, blocker, waitingForUser: Boolean(blocker) });
      }

      if (req.method === "GET" && url.pathname === "/api/projects") {
        return json(res, 200, { projects: await deps.productFlow.listProjects() });
      }

      if (req.method === "POST" && url.pathname === "/api/projects") {
        const body = (await readJson(req)) as {
          name?: unknown;
          targetDurationMs?: unknown;
        };
        if (typeof body.name !== "string" || !body.name.trim()) {
          throw new DomainValidationError("Project name is required");
        }
        const targetDurationMs =
          typeof body.targetDurationMs === "number" ? body.targetDurationMs : 60000;
        const now = new Date().toISOString();
        const project: Project = {
          id: randomUUID(),
          name: body.name.trim(),
          status: "DRAFT",
          targetPlatform: "douyin",
          targetDurationMs,
          aspectRatio: "9:16",
          createdAt: now,
          updatedAt: now
        };
        return json(res, 201, { project: await deps.productFlow.createProject(project) });
      }

      const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (req.method === "GET" && projectMatch) {
        const project = await deps.productFlow.getProject(projectMatch[1]!);
        return project
          ? json(res, 200, { project })
          : json(res, 404, { error: "PROJECT_NOT_FOUND" });
      }

      const productInputMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/product-input\/generate-truth$/
      );
      if (req.method === "POST" && productInputMatch) {
        const projectId = productInputMatch[1]!;
        const project = await deps.productFlow.getProject(projectId);
        if (!project) return json(res, 404, { error: "PROJECT_NOT_FOUND" });

        const body = (await readJson(req, 30_000_000)) as {
          productName?: unknown;
          featureDescription?: unknown;
          brand?: unknown;
          category?: unknown;
          images?: unknown;
          logo?: unknown;
          forbiddenChanges?: unknown;
        };
        const productName = requireString(body.productName, "productName");
        const featureDescription = requireString(
          body.featureDescription,
          "featureDescription"
        );
        const uploads = Array.isArray(body.images) ? body.images : [];
        if (!uploads.length) {
          throw new DomainValidationError("At least one product image is required");
        }

        const artifactStore = new LocalArtifactStore(
          path.join(deps.projectsRoot, projectId),
          deps.artifacts
        );
        const now = new Date().toISOString();
        const storedDetails: Array<{
          asset: AssetRef;
          artifactId: string;
          relativePath: string;
          sha256: string;
          mimeType?: string;
        }> = [];

        const storeUpload = async (
          raw: unknown,
          type: "image" | "logo"
        ): Promise<AssetRef> => {
          if (!raw || typeof raw !== "object") {
            throw new DomainValidationError("Invalid upload payload");
          }
          const upload = raw as {
            name?: unknown;
            mimeType?: unknown;
            base64?: unknown;
          };
          const name = requireString(upload.name, "upload.name");
          const mimeType = requireString(upload.mimeType, "upload.mimeType");
          if (!mimeType.startsWith("image/")) {
            throw new DomainValidationError("Only image uploads are allowed in P0");
          }
          const base64 = requireString(upload.base64, "upload.base64");
          const bytes = decodeBase64(base64);
          const relativePath =
            "input/assets/" + randomUUID() + "-" + safeFileName(name);
          const artifact = await artifactStore.writeImmutable({
            id: randomUUID(),
            projectId,
            kind: "USER_INPUT",
            relativePath,
            immutable: true,
            bytes,
            mimeType
          });
          if (!artifact.sha256 || artifact.sizeBytes === undefined) {
            throw new DomainValidationError("Uploaded artifact did not become READY");
          }
          const asset: AssetRef = {
            id: randomUUID(),
            artifactId: artifact.id,
            type,
            source: "user_upload",
            originalFilename: name,
            sha256: artifact.sha256,
            mimeType,
            sizeBytes: artifact.sizeBytes,
            provenance: "Product Input",
            createdAt: now
          };
          storedDetails.push({
            asset,
            artifactId: artifact.id,
            relativePath: artifact.relativePath,
            sha256: artifact.sha256,
            mimeType: artifact.mimeType
          });
          return asset;
        };

        const imageAssets: AssetRef[] = [];
        for (const upload of uploads) {
          imageAssets.push(await storeUpload(upload, "image"));
        }
        const logoAsset =
          body.logo && typeof body.logo === "object"
            ? await storeUpload(body.logo, "logo")
            : undefined;

        const allowedFields = new Set([
          "logo",
          "color",
          "shape",
          "packaging",
          "text",
          "model",
          "proportion",
          "other"
        ]);
        const forbiddenChanges: ForbiddenChange[] = [];
        if (Array.isArray(body.forbiddenChanges)) {
          for (const raw of body.forbiddenChanges) {
            if (!raw || typeof raw !== "object") continue;
            const item = raw as {
              field?: unknown;
              description?: unknown;
              severity?: unknown;
            };
            const field = requireString(item.field, "forbiddenChange.field");
            const description = requireString(
              item.description,
              "forbiddenChange.description"
            );
            const severity = requireString(
              item.severity,
              "forbiddenChange.severity"
            );
            if (!allowedFields.has(field)) {
              throw new DomainValidationError("Invalid ForbiddenChange field");
            }
            if (severity !== "HARD" && severity !== "SOFT") {
              throw new DomainValidationError("Invalid ForbiddenChange severity");
            }
            forbiddenChanges.push({
              id: randomUUID(),
              field: field as ForbiddenChange["field"],
              description,
              severity
            });
          }
        }

        const snapshot = await deps.productInput.save({
          projectId,
          productName,
          featureDescription,
          ...(typeof body.brand === "string" && body.brand.trim()
            ? { brand: body.brand.trim() }
            : {}),
          ...(typeof body.category === "string" && body.category.trim()
            ? { category: body.category.trim() }
            : {}),
          assets: [...imageAssets, ...(logoAsset ? [logoAsset] : [])],
          forbiddenChanges
        });

        const truthVersion = await deps.productFlow.nextVersion(
          projectId,
          "ProductTruth",
          "product-truth"
        );
        const truth = await deps.aiGeneration.generateProductTruthDraft(
          {
            projectId,
            productName: snapshot.productName,
            featureDescription: snapshot.featureDescription,
            ...(snapshot.brand ? { brand: snapshot.brand } : {}),
            ...(snapshot.category ? { category: snapshot.category } : {}),
            referenceImageIds: imageAssets.map((asset) => asset.id),
            referenceImageArtifacts: storedDetails
              .filter((item) => item.asset.type === "image")
              .map((item) => ({
                id: item.artifactId,
                relativePath: item.relativePath,
                sha256: item.sha256,
                ...(item.mimeType ? { mimeType: item.mimeType } : {})
              })),
            ...(logoAsset ? { logoAssetId: logoAsset.id } : {}),
            forbiddenChanges
          },
          truthVersion
        );
        const updatedProject = await deps.productFlow.saveProductTruthDraft(truth);
        return json(res, 201, {
          project: updatedProject,
          productInput: snapshot,
          productTruth: truth
        });
      }

      const truthMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/truth\/confirm$/);
      if (req.method === "POST" && truthMatch) {
        const projectId = truthMatch[1]!;
        const body = (await readJson(req)) as {
          projectId?: unknown;
          dispositions?: unknown;
        };
        assertProjectBody(truthMatch[1]!, body);
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (!workspace?.productTruth) {
          throw new DomainValidationError("No current ProductTruth to confirm");
        }
        if (workspace.productTruth.status === "DRAFT") {
          if (!body.dispositions || typeof body.dispositions !== "object") {
            throw new DomainValidationError("UncertainClaim dispositions are required");
          }
          const [productInput, projectArtifacts] = await Promise.all([
            deps.productInput.latest(projectId),
            deps.artifacts.listByProject(projectId)
          ]);
          if (!productInput) {
            throw new DomainValidationError(
              "Saved Product Input is required before Product Truth confirmation"
            );
          }
          assertCanonicalProductArtifactReady(
            workspace.productTruth,
            productInput.assets,
            projectArtifacts
          );
          const confirmed = confirmProductTruthDraft(
            workspace.productTruth,
            body.dispositions as Record<string, ClaimDisposition>
          );
          let project = await deps.productFlow.confirmProductTruth(confirmed);
          const creativeVersion = await deps.productFlow.nextVersion(
            projectId,
            "CreativeBatch",
            "creative-batch"
          );
          const batch = await deps.aiGeneration.generateCreativeBatch(
            confirmed,
            creativeVersion
          );
          project = await deps.productFlow.activateCreativeBatch(batch);
          return json(res, 200, { project, productTruth: confirmed, creativeBatch: batch });
        }
        return json(res, 200, {
          project: await deps.productFlow.confirmProductTruth(body as ProductTruth)
        });
      }

      const truthGenerateMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/truth\/generate-from-input$/
      );
      if (req.method === "POST" && truthGenerateMatch) {
        const projectId = truthGenerateMatch[1]!;
        const snapshot = await deps.productInput.latest(projectId);
        if (!snapshot) {
          throw new DomainValidationError("No saved Product Input to retry");
        }
        const imageAssets = snapshot.assets.filter((asset) => asset.type === "image");
        const logoAsset = snapshot.assets.find((asset) => asset.type === "logo");
        const artifactDetails = [];
        for (const asset of imageAssets) {
          const artifact = await deps.artifacts.findById(asset.artifactId);
          if (!artifact || artifact.integrityStatus !== "READY" || !artifact.sha256) {
            throw new DomainValidationError(
              `Input artifact is not READY: ${asset.artifactId}`
            );
          }
          artifactDetails.push({
            id: artifact.id,
            relativePath: artifact.relativePath,
            sha256: artifact.sha256,
            ...(artifact.mimeType ? { mimeType: artifact.mimeType } : {})
          });
        }
        const version = await deps.productFlow.nextVersion(
          projectId,
          "ProductTruth",
          "product-truth"
        );
        const truth = await deps.aiGeneration.generateProductTruthDraft(
          {
            projectId,
            productName: snapshot.productName,
            featureDescription: snapshot.featureDescription,
            ...(snapshot.brand ? { brand: snapshot.brand } : {}),
            ...(snapshot.category ? { category: snapshot.category } : {}),
            referenceImageIds: imageAssets.map((asset) => asset.id),
            referenceImageArtifacts: artifactDetails,
            ...(logoAsset ? { logoAssetId: logoAsset.id } : {}),
            forbiddenChanges: snapshot.forbiddenChanges
          },
          version
        );
        const project = await deps.productFlow.saveProductTruthDraft(truth);
        return json(res, 201, { project, productTruth: truth });
      }

      const creativeGenerateMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/creative\/generate$/
      );
      if (req.method === "POST" && creativeGenerateMatch) {
        const projectId = creativeGenerateMatch[1]!;
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (!workspace?.productTruth || workspace.productTruth.status !== "CONFIRMED") {
          throw new DomainValidationError("Confirmed ProductTruth is required");
        }
        const version = await deps.productFlow.nextVersion(
          projectId,
          "CreativeBatch",
          "creative-batch"
        );
        const batch = await deps.aiGeneration.generateCreativeBatch(
          workspace.productTruth,
          version
        );
        const project = await deps.productFlow.activateCreativeBatch(batch);
        return json(res, 201, { project, creativeBatch: batch });
      }

      const creativeBatchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/creative-batches$/);
      if (req.method === "POST" && creativeBatchMatch) {
        const body = await readJson(req);
        assertProjectBody(creativeBatchMatch[1]!, body);
        return json(res, 200, {
          project: await deps.productFlow.activateCreativeBatch(body as CreativeBatch)
        });
      }

      const creativeSelectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/creative\/select$/);
      if (req.method === "POST" && creativeSelectMatch) {
        const projectId = creativeSelectMatch[1]!;
        const body = (await readJson(req)) as { creativeId?: unknown };
        if (typeof body.creativeId !== "string" || !body.creativeId.trim()) {
          throw new DomainValidationError("creativeId is required");
        }
        let project = await deps.productFlow.selectCreative(projectId, body.creativeId);
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (!workspace?.productTruth || !workspace.creativeBatch) {
          throw new DomainValidationError("Current ProductTruth and CreativeBatch are required");
        }
        const version = await deps.productFlow.nextVersion(
          projectId,
          "ScriptDraft",
          "script"
        );
        const script = await deps.aiGeneration.generateScriptDraft({
          truth: workspace.productTruth,
          batch: workspace.creativeBatch,
          selectedCreativeId: body.creativeId,
          version,
          targetDurationMs: workspace.project.targetDurationMs
        });
        project = await deps.productFlow.saveScriptDraft(script);
        return json(res, 200, { project, script });
      }

      const scriptMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/script\/confirm$/);
      if (req.method === "POST" && scriptMatch) {
        const projectId = scriptMatch[1]!;
        const body = (await readJson(req)) as {
          projectId?: unknown;
          confirmCurrent?: unknown;
        };
        assertProjectBody(projectId, body);
        if (body.confirmCurrent === true) {
          const workspace = await deps.productFlow.getWorkspace(projectId);
          if (
            !workspace?.productTruth ||
            !workspace.creativeBatch ||
            !workspace.script
          ) {
            throw new DomainValidationError("Current ProductTruth, CreativeBatch and Script are required");
          }
          const confirmedScript = confirmScriptDraft(workspace.script);
          let project = await deps.productFlow.confirmScript(confirmedScript);
          const planVersion = await deps.productFlow.nextVersion(
            projectId,
            "ProductionPlan",
            "production-plan"
          );
          const plan = await deps.productDirector.generate({
            productTruth: workspace.productTruth,
            creativeBatch: workspace.creativeBatch,
            selectedCreativeId: confirmedScript.selectedCreativeId,
            script: confirmedScript,
            projectTargetDurationMs: workspace.project.targetDurationMs,
            productionPlanVersion: planVersion
          });
          project = await deps.productFlow.saveProductionPlanDraft(plan);
          return json(res, 200, { project, script: confirmedScript, productionPlan: plan });
        }
        return json(res, 200, {
          project: await deps.productFlow.confirmScript(body as ScriptDraft)
        });
      }

      const scriptGenerateMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/script\/generate$/
      );
      if (req.method === "POST" && scriptGenerateMatch) {
        const projectId = scriptGenerateMatch[1]!;
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (
          !workspace?.productTruth ||
          !workspace.creativeBatch ||
          !workspace.project.selectedCreativeId
        ) {
          throw new DomainValidationError(
            "Current ProductTruth, CreativeBatch and selected creative are required"
          );
        }
        const version = await deps.productFlow.nextVersion(
          projectId,
          "ScriptDraft",
          "script"
        );
        const script = await deps.aiGeneration.generateScriptDraft({
          truth: workspace.productTruth,
          batch: workspace.creativeBatch,
          selectedCreativeId: workspace.project.selectedCreativeId,
          version,
          targetDurationMs: workspace.project.targetDurationMs
        });
        const project = await deps.productFlow.saveScriptDraft(script);
        return json(res, 201, { project, script });
      }

      const scriptReviseMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/script\/revise$/
      );
      if (req.method === "POST" && scriptReviseMatch) {
        const projectId = scriptReviseMatch[1]!;
        const body = (await readJson(req)) as { beats?: unknown };
        if (!Array.isArray(body.beats) || !body.beats.length) {
          throw new DomainValidationError("Script revision requires beats");
        }
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (!workspace?.script) {
          throw new DomainValidationError("No current ScriptDraft to revise");
        }
        const beats = body.beats.map((raw, index) => {
          if (!raw || typeof raw !== "object") {
            throw new DomainValidationError(`Invalid ScriptBeat at index ${index}`);
          }
          const item = raw as Record<string, unknown>;
          const purpose = requireString(item.purpose, "beat.purpose");
          const text = requireString(item.text, "beat.text");
          if (
            typeof item.estimatedDurationMs !== "number" ||
            !Number.isInteger(item.estimatedDurationMs)
          ) {
            throw new DomainValidationError(
              "beat.estimatedDurationMs must be an integer"
            );
          }
          if (!Array.isArray(item.requiredFactIds)) {
            throw new DomainValidationError("beat.requiredFactIds must be an array");
          }
          return {
            ...(typeof item.id === "string" && item.id.trim()
              ? { id: item.id.trim() }
              : {}),
            purpose,
            text,
            estimatedDurationMs: item.estimatedDurationMs,
            requiredFactIds: item.requiredFactIds.map((factId) =>
              requireString(factId, "beat.requiredFactId")
            )
          } as ScriptBeatRevision;
        });
        const revised = reviseScriptDraft(workspace.script, beats);
        const project = await deps.productFlow.saveScriptDraft(revised);
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 201, { project, script: revised });
      }

      const planGenerateMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/production-plan\/generate$/
      );
      if (req.method === "POST" && planGenerateMatch) {
        const projectId = planGenerateMatch[1]!;
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (
          !workspace?.productTruth ||
          !workspace.creativeBatch ||
          !workspace.script ||
          workspace.script.status !== "CONFIRMED" ||
          !workspace.project.selectedCreativeId
        ) {
          throw new DomainValidationError(
            "Confirmed ProductTruth/Script and current CreativeBatch selection are required"
          );
        }
        const planVersion = await deps.productFlow.nextVersion(
          projectId,
          "ProductionPlan",
          "production-plan"
        );
        const plan = await deps.productDirector.generate({
          productTruth: workspace.productTruth,
          creativeBatch: workspace.creativeBatch,
          selectedCreativeId: workspace.project.selectedCreativeId,
          script: workspace.script,
          projectTargetDurationMs: workspace.project.targetDurationMs,
          productionPlanVersion: planVersion
        });
        const project = await deps.productFlow.saveProductionPlanDraft(plan);
        return json(res, 201, { project, productionPlan: plan });
      }

      const planReviseMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/production-plan\/revise$/
      );
      if (req.method === "POST" && planReviseMatch) {
        const projectId = planReviseMatch[1]!;
        const body = (await readJson(req)) as {
          visualDirection?: unknown;
          soundDirection?: unknown;
          productShowcaseRules?: unknown;
          segments?: unknown;
        };
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (!workspace?.productionPlan) {
          throw new DomainValidationError(
            "No current ProductionPlan to revise"
          );
        }
        if (!Array.isArray(body.segments)) {
          throw new DomainValidationError(
            "ProductionPlan revision requires segments array"
          );
        }
        const segmentPatches = body.segments.map((raw, index) => {
          if (!raw || typeof raw !== "object") {
            throw new DomainValidationError(
              `Invalid Segment revision at index ${index}`
            );
          }
          const item = raw as Record<string, unknown>;
          return {
            ...item,
            id: requireString(item.id, "segment.id")
          } as ProductionPlanSegmentRevision;
        });
        const revised = reviseProductionPlanDraft(workspace.productionPlan, {
          ...(typeof body.visualDirection === "string"
            ? { visualDirection: body.visualDirection }
            : {}),
          ...(typeof body.soundDirection === "string"
            ? { soundDirection: body.soundDirection }
            : {}),
          ...(Array.isArray(body.productShowcaseRules)
            ? {
                productShowcaseRules: body.productShowcaseRules.map((item) =>
                  requireString(item, "productShowcaseRule")
                )
              }
            : {}),
          segments: segmentPatches
        });
        const project = await deps.productFlow.saveProductionPlanDraft(revised);
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 201, { project, productionPlan: revised });
      }

      const planMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/production-plan\/confirm$/);
      if (req.method === "POST" && planMatch) {
        const projectId = planMatch[1]!;
        const body = (await readJson(req)) as {
          projectId?: unknown;
          confirmCurrent?: unknown;
        };
        assertProjectBody(projectId, body);
        if (body.confirmCurrent === true) {
          const workspace = await deps.productFlow.getWorkspace(projectId);
          if (!workspace?.productionPlan) {
            throw new DomainValidationError("No current ProductionPlan to confirm");
          }
          const confirmedPlan = confirmProductionPlanDraft(workspace.productionPlan);
          const project = await deps.productFlow.confirmProductionPlan(confirmedPlan);
          return json(res, 200, { project, productionPlan: confirmedPlan });
        }
        return json(res, 200, {
          project: await deps.productFlow.confirmProductionPlan(body as ProductionPlan)
        });
      }

      const preflightRunMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/preflight\/run$/
      );
      if (req.method === "POST" && preflightRunMatch) {
        const projectId = preflightRunMatch[1]!;
        const body = (await readJson(req)) as {
          clipIds?: unknown;
          acceptedDuplicateSubmissionRisk?: unknown;
        };
        const clipIds = Array.isArray(body.clipIds)
          ? body.clipIds.map((item) => requireString(item, "clipId"))
          : undefined;
        const [workspace, productInput] = await Promise.all([
          deps.productFlow.getWorkspace(projectId),
          deps.productInput.latest(projectId)
        ]);
        if (
          !workspace?.productTruth ||
          !workspace.creativeBatch ||
          !workspace.script ||
          !workspace.productionPlan
        ) {
          throw new DomainValidationError(
            "Current ProductTruth, CreativeBatch, Script and ProductionPlan are required"
          );
        }
        if (
          workspace.productTruth.status !== "CONFIRMED" ||
          workspace.script.status !== "CONFIRMED" ||
          workspace.productionPlan.status !== "CONFIRMED"
        ) {
          throw new DomainValidationError(
            "ProductTruth, Script and ProductionPlan must be CONFIRMED"
          );
        }
        if (!productInput) {
          throw new DomainValidationError("Saved Product Input is required");
        }

        const selectedClips = workspace.productionPlan.scenes
          .flatMap((scene) => scene.clips)
          .filter((clip) => !clipIds?.length || clipIds.includes(clip.id));
        const requiredReferenceAssetIds = selectedClips
          .flatMap((clip) => clip.referenceAssets)
          .filter(
            (usage) =>
              usage.required ||
              productInput.assets.some((asset) => asset.id === usage.assetId)
          )
          .map((usage) => usage.assetId);
        const referenceImageValidation =
          await validateReferenceImagesForPreflight({
            projectsRoot: deps.projectsRoot,
            projectId,
            snapshot: productInput,
            artifacts: deps.artifacts,
            requiredAssetIds: requiredReferenceAssetIds
          });

        // Page rendering may probe the provider for display. Preflight evidence
        // must contain only commands executed by this explicit run.
        deps.provider.drainCommandEvidence();
        const result = await deps.preflight.run({
          projectId,
          productTruth: workspace.productTruth,
          creativeBatch: workspace.creativeBatch,
          script: workspace.script,
          productionPlan: workspace.productionPlan,
          assets: productInput.assets,
          ...(clipIds?.length ? { clipIds } : {}),
          inputBlockers: referenceImageValidation.blockers,
          acceptedDuplicateSubmissionRisk:
            body.acceptedDuplicateSubmissionRisk === true
        });

        const providerAudit = await persistPreflightProviderAudit(
          deps,
          projectId,
          result.probe
        );

        const probeBytes = Buffer.from(
          JSON.stringify(
            {
              projectId,
              probedAt: new Date().toISOString(),
              probe: result.probe
            },
            null,
            2
          ) + "\n",
          "utf8"
        );
        const probeArtifact = await new LocalArtifactStore(
          path.join(deps.projectsRoot, projectId),
          deps.artifacts
        ).writeImmutable({
          id: randomUUID(),
          projectId,
          kind: "PROVIDER_PROBE",
          relativePath:
            "provider/probe-" +
            Date.now() +
            "-" +
            result.probe.capabilityFingerprint.slice(0, 12) +
            ".json",
          immutable: true,
          bytes: probeBytes,
          mimeType: "application/json"
        });

        await deps.providerAudit.saveCapability(projectId, {
          provider: "domestic-jimeng-cli",
          ...(providerAudit.providerIdentityId
            ? { providerIdentityId: providerAudit.providerIdentityId }
            : {}),
          cliFound: result.probe.cliFound,
          authenticated: result.authenticated,
          supportedOperations:
            result.probe.code === "READY"
              ? result.probe.supportedOperations
              : [],
          supportedModels:
            result.probe.code === "READY"
              ? result.probe.supportedModels
              : [],
          ...(result.probe.code === "READY" &&
          result.probe.supportedDurationsMs
            ? { supportedDurationsMs: result.probe.supportedDurationsMs }
            : {}),
          rawProbeArtifactId: probeArtifact.id,
          capabilityFingerprint: result.probe.capabilityFingerprint,
          probedAt: new Date().toISOString()
        });
        await refreshProjectSnapshot(deps, projectId);

        return json(res, 200, {
          overallStatus: result.overallStatus,
          requestCount: result.requests.length,
          preflightCount: result.reports.length,
          probe: result.probe,
          blocker: result.blocker,
          reports: result.reports,
          referenceImageValidation,
          probeArtifact,
          providerAudit
        });
      }

      const approvalMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/approval$/
      );
      if (req.method === "POST" && approvalMatch) {
        const projectId = approvalMatch[1]!;
        const body = (await readJson(req)) as {
          acceptedUnknownCostRisk?: unknown;
          acceptedDuplicateSubmissionRisk?: unknown;
        };
        const result = await deps.approval.approveCurrentRequests({
          projectId,
          acceptedUnknownCostRisk: body.acceptedUnknownCostRisk === true,
          acceptedDuplicateSubmissionRisk:
            body.acceptedDuplicateSubmissionRisk === true
        });
        await deps.productFlow.setProjectStatus(projectId, "GENERATING");
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 201, result);
      }

      const attemptActionMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/attempts\/([^/]+)\/(submit|poll|download|reconcile)$/
      );
      if (req.method === "POST" && attemptActionMatch) {
        const projectId = attemptActionMatch[1]!;
        const attemptId = attemptActionMatch[2]!;
        const action = attemptActionMatch[3]!;
        const attempt = await deps.workflow.getGenerationAttempt(attemptId);
        if (!attempt || attempt.projectId !== projectId) {
          return json(res, 404, { error: "ATTEMPT_NOT_FOUND" });
        }
        const updated =
          action === "submit"
            ? await deps.execution.submitAttempt(attemptId)
            : action === "poll"
              ? await deps.execution.pollAttempt(attemptId)
              : action === "download"
                ? await deps.execution.downloadAttempt(attemptId)
                : await deps.execution.reconcileAttempt(attemptId);
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 200, { attempt: updated });
      }

      const reviewMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/clips\/([^/]+)\/review$/
      );
      if (req.method === "POST" && reviewMatch) {
        const projectId = reviewMatch[1]!;
        const clipId = reviewMatch[2]!;
        const body = (await readJson(req)) as {
          generationAttemptId?: unknown;
          decision?: unknown;
          note?: unknown;
        };
        const decision = requireString(body.decision, "decision");
        if (
          decision !== "ACCEPT" &&
          decision !== "REDO" &&
          decision !== "SKIP" &&
          decision !== "USE"
        ) {
          throw new DomainValidationError(
            "decision must be ACCEPT, REDO, SKIP or USE"
          );
        }
        const generationAttemptId =
          decision === "ACCEPT" || decision === "REDO"
            ? requireString(body.generationAttemptId, "generationAttemptId")
            : undefined;
        const result = await deps.reviewService.decide({
          projectId,
          clipId,
          ...(generationAttemptId ? { generationAttemptId } : {}),
          decision,
          ...(typeof body.note === "string" && body.note.trim()
            ? { note: body.note.trim() }
            : {})
        });
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 201, result);
      }

      const finalizeSelectionMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/review\/finalize-selection$/
      );
      if (req.method === "POST" && finalizeSelectionMatch) {
        const projectId = finalizeSelectionMatch[1]!;
        const result = await deps.reviewService.finalizeUsingAcceptedClips({
          projectId
        });
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 201, result);
      }

      const finalRenderMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/final\/render$/
      );
      if (req.method === "POST" && finalRenderMatch) {
        const projectId = finalRenderMatch[1]!;
        const assembly = await deps.finalAssembly.render(projectId);
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 201, { assembly });
      }

      const finalAcceptMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/final\/accept$/
      );
      if (req.method === "POST" && finalAcceptMatch) {
        const projectId = finalAcceptMatch[1]!;
        const assembly = await deps.finalAssembly.accept(projectId);
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 200, { assembly });
      }

      const douyinOAuthStartMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/publish\/douyin\/oauth\/start$/
      );
      if (req.method === "GET" && douyinOAuthStartMatch) {
        const projectId = douyinOAuthStartMatch[1]!;
        const { authorizationUrl } = await deps.douyinPublish.beginOAuth(
          projectId
        );
        res.writeHead(302, { location: authorizationUrl });
        return res.end();
      }

      if (
        req.method === "GET" &&
        url.pathname === "/api/douyin/oauth/callback"
      ) {
        const code = url.searchParams.get("code")?.trim();
        const state = url.searchParams.get("state")?.trim();
        if (!code || !state) {
          throw new DomainValidationError(
            "Douyin OAuth callback requires code and state"
          );
        }
        const result = await deps.douyinPublish.completeOAuth({ code, state });
        await refreshProjectSnapshot(deps, result.projectId);
        res.writeHead(302, {
          location: `/projects/${encodeURIComponent(result.projectId)}/final`
        });
        return res.end();
      }

      const douyinPublishMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/publish\/douyin$/
      );
      if (req.method === "POST" && douyinPublishMatch) {
        const projectId = douyinPublishMatch[1]!;
        const body = (await readJson(req)) as {
          title?: unknown;
          description?: unknown;
          confirmed?: unknown;
        };
        const title = requireString(body.title, "title");
        const result = await deps.douyinPublish.publish({
          projectId,
          title,
          ...(typeof body.description === "string" && body.description.trim()
            ? { description: body.description.trim() }
            : {}),
          confirmed: body.confirmed === true
        });
        await refreshProjectSnapshot(deps, projectId);
        return json(res, 201, { publishAttempt: result });
      }

      const artifactContentMatch = url.pathname.match(
        /^\/api\/artifacts\/([^/]+)\/content$/
      );
      if (req.method === "GET" && artifactContentMatch) {
        const artifact = await deps.artifacts.findById(
          artifactContentMatch[1]!
        );
        if (
          !artifact ||
          artifact.integrityStatus !== "READY" ||
          (artifact.kind !== "GENERATED_VIDEO" &&
            artifact.kind !== "FINAL_VIDEO")
        ) {
          return json(res, 404, { error: "VIDEO_ARTIFACT_NOT_FOUND" });
        }
        const store = new LocalArtifactStore(
          path.join(deps.projectsRoot, artifact.projectId),
          deps.artifacts
        );
        const absolute = store.resolveArtifactPath(artifact.relativePath);
        const fs = await import("node:fs");
        res.writeHead(200, {
          "content-type": artifact.mimeType ?? "video/mp4",
          ...(artifact.sizeBytes !== undefined
            ? { "content-length": String(artifact.sizeBytes) }
            : {}),
          "cache-control": "no-store"
        });
        return fs.createReadStream(absolute).pipe(res);
      }

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(302, { location: "/projects" });
        return res.end();
      }

      if (req.method === "GET" && url.pathname === "/projects") {
        const projects = await deps.productFlow.listProjects();
        const blockerLists = await Promise.all(
          projects.map((project) => deps.workflow.listOpenBlockers(project.id))
        );
        const blockerCounts = new Map(
          projects.map((project, index) => [
            project.id,
            blockerLists[index]?.length ?? 0
          ])
        );
        return html(res, 200, renderProjectsPage(projects, blockerCounts));
      }

      const pageMatch = url.pathname.match(
        /^\/projects\/([^/]+)\/(product|truth|creative|script|director|generate|final)$/
      );
      if (req.method === "GET" && pageMatch) {
        const projectId = pageMatch[1]!;
        const kind = pageMatch[2] as
          | "product"
          | "truth"
          | "creative"
          | "script"
          | "director"
          | "generate"
          | "final";
        const workspace = await deps.productFlow.getWorkspace(projectId);
        if (!workspace) {
          return json(res, 404, { error: "PROJECT_NOT_FOUND" });
        }

        const [
          persistedBlockers,
          attempts,
          productInput,
          generationRequests,
          preflights,
          approvals,
          compiledPrompts,
          artifacts,
          reviewDecisions,
          commandAttempts
        ] = await Promise.all([
          deps.workflow.listOpenBlockers(projectId),
          deps.workflow.listGenerationAttempts(projectId),
          deps.productInput.latest(projectId),
          deps.generation.listGenerationRequests(projectId),
          deps.generation.listPreflightReports(projectId),
          deps.generation.listUserApprovals(projectId),
          deps.generation.listCompiledPrompts(projectId),
          deps.artifacts.listByProject(projectId),
          deps.review.listDecisions(projectId),
          deps.providerAudit.listCommandAttempts(projectId)
        ]);
        let blockers = persistedBlockers;
        let probe;
        let finalAssembly;
        let publishAttempts;
        let publishProbe;
        if (kind === "generate") {
          probe = await deps.provider.probe();
          const providerBlocker = blockerFromProviderProbe(projectId, probe);
          if (
            providerBlocker &&
            !blockers.some(
              (item) =>
                item.scope === "PROVIDER" &&
                item.reasonCode === providerBlocker.reasonCode
            )
          ) {
            blockers = [...blockers, providerBlocker];
          }
        }
        if (kind === "final") {
          finalAssembly =
            (await deps.finalOutput.latestAssembly(projectId)) ?? undefined;
          publishAttempts = await deps.finalOutput.listPublishAttempts(projectId);
          if (finalAssembly?.status === "ACCEPTED") {
            publishProbe = await deps.douyinPublish.probe(projectId);
            blockers = await deps.workflow.listOpenBlockers(projectId);
          }
        }

        return html(
          res,
          200,
          renderProjectPage({
            kind,
            workspace,
            ...(productInput ? { productInput } : {}),
            blockers,
            attempts,
            generationRequests,
            preflights,
            approvals,
            compiledPrompts,
            artifacts,
            reviewDecisions,
            commandAttempts,
            ...(probe ? { probe } : {}),
            ...(finalAssembly ? { finalAssembly } : {}),
            ...(publishAttempts ? { publishAttempts } : {}),
            ...(publishProbe ? { publishProbe } : {})
          })
        );
      }

      return json(res, 404, { error: "NOT_FOUND" });
    } catch (error) {
      if (error instanceof DomainValidationError || error instanceof ZodError) {
        return json(res, 400, {
          error: "VALIDATION_ERROR",
          message: error.message
        });
      }
      return json(res, 500, {
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3090);
  const deps = createDefaultDependencies();
  void (async () => {
    try {
      const recovered = await deps.recovery.recoverAll();
      console.log(
        "Product Video Studio recovery complete: " +
          recovered.length +
          " project(s)"
      );
    } catch (error) {
      console.error(
        "Product Video Studio recovery failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
    createAppServer(deps).listen(port, "127.0.0.1", () => {
      console.log(
        "Product Video Studio P0 listening on http://127.0.0.1:" + port
      );
    });
  })();
}
