import { randomUUID } from "node:crypto";
import type { DouyinOpsRepository } from "../ports/douyin-ops-repository.js";
import type { DouyinOpsRuntime } from "../ports/douyin-ops-runtime.js";
import {
  douyinMetricSnapshotSchema,
  douyinWorkBindingSchema,
  type DouyinMetricSnapshot,
  type DouyinWorkBinding
} from "../../domain/douyin-ops.js";
import { sha256Text } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";
import type {
  DouyinWorkBindingDecision
} from "./douyin-work-binding-service.js";

export class DouyinMetricService {
  constructor(
    private readonly repo: DouyinOpsRepository,
    private readonly runtime: DouyinOpsRuntime
  ) {}

  async persistBinding(input: {
    projectId: string;
    decision: DouyinWorkBindingDecision;
    publishedAt?: string;
    now?: string;
  }): Promise<DouyinWorkBinding> {
    const now = input.now ?? new Date().toISOString();
    const previous = await this.repo.findWorkBindingByPackage(
      input.decision.packageId
    );

    const value = douyinWorkBindingSchema.parse({
      id: previous?.id ?? randomUUID(),
      projectId: input.projectId,
      packageId: input.decision.packageId,
      ...(input.decision.receiptId
        ? { publishReceiptId: input.decision.receiptId }
        : {}),
      ...(input.decision.awemeId
        ? { awemeId: input.decision.awemeId }
        : {}),
      ...(input.decision.source
        ? { source: input.decision.source }
        : {}),
      confidence: input.decision.confidence,
      status: input.decision.status,
      ...(input.publishedAt
        ? { publishedAt: input.publishedAt }
        : previous?.publishedAt
          ? { publishedAt: previous.publishedAt }
          : {}),
      ...(input.decision.status === "BOUND"
        ? { boundAt: previous?.boundAt ?? now }
        : {}),
      ...(input.decision.externalUrl
        ? { externalUrl: input.decision.externalUrl }
        : {}),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    });

    return this.repo.upsertWorkBinding(value);
  }

  async refresh(input: {
    projectId: string;
    packageId?: string;
    captureKey?: string;
    capturedAt?: string;
  }): Promise<DouyinMetricSnapshot> {
    const binding = input.packageId
      ? await this.repo.findWorkBindingByPackage(input.packageId)
      : await this.repo.latestWorkBinding(input.projectId);

    if (!binding || binding.projectId !== input.projectId) {
      throw new DomainValidationError(
        "当前项目尚未建立抖音作品绑定"
      );
    }
    if (binding.status !== "BOUND" || !binding.awemeId) {
      throw new DomainValidationError(
        "抖音作品绑定尚未确认，不能刷新作品指标"
      );
    }

    const work = await this.runtime.getWork(binding.awemeId);
    if (work.awemeId !== binding.awemeId) {
      throw new DomainValidationError(
        "抖音运行时返回的作品 ID 与 PVS 绑定不一致"
      );
    }

    const capturedAt =
      input.capturedAt ?? new Date().toISOString();
    const captureKey =
      input.captureKey?.trim() ||
      "manual:" + randomUUID();

    const normalized = {
      awemeId: work.awemeId,
      description: work.description,
      publishedAt: work.publishedAt,
      metrics: work.metrics,
      durationMs: work.durationMs,
      externalUrl: work.externalUrl
    };
    const rawJson = JSON.stringify(normalized);
    const now = new Date().toISOString();

    const snapshot = douyinMetricSnapshotSchema.parse({
      id: randomUUID(),
      projectId: input.projectId,
      bindingId: binding.id,
      awemeId: binding.awemeId,
      captureKey,
      capturedAt,
      plays: work.metrics.plays,
      likes: work.metrics.likes,
      comments: work.metrics.comments,
      shares: work.metrics.shares,
      ...(work.metrics.collects !== undefined
        ? { collects: work.metrics.collects }
        : {}),
      ...(work.durationMs !== undefined
        ? { durationMs: work.durationMs }
        : {}),
      rawJson,
      contentHash: sha256Text(rawJson),
      createdAt: now
    });

    return this.repo.createMetricSnapshot(snapshot);
  }

  async history(input: {
    projectId: string;
    awemeId?: string;
    limit?: number;
  }): Promise<DouyinMetricSnapshot[]> {
    return this.repo.listMetricSnapshots(input);
  }
}
