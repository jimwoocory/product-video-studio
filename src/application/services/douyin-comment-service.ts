import type {
  DouyinOpsRepository
} from "../ports/douyin-ops-repository.js";
import type {
  DouyinOpsComment,
  DouyinOpsRuntime
} from "../ports/douyin-ops-runtime.js";
import {
  douyinCommentSchema,
  type DouyinComment,
  type DouyinWorkBinding
} from "../../domain/douyin-ops.js";
import { sha256Text } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";

export type DouyinCommentSyncResult = {
  projectId: string;
  awemeId: string;
  pages: number;
  syncedCount: number;
  cursor: string;
  hasMore: boolean;
  truncated: boolean;
};

function boundedInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export class DouyinCommentService {
  constructor(
    private readonly repo: DouyinOpsRepository,
    private readonly runtime: DouyinOpsRuntime
  ) {}

  private async resolveBinding(input: {
    projectId: string;
    packageId?: string;
  }): Promise<DouyinWorkBinding> {
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
        "抖音作品绑定尚未确认，不能同步评论"
      );
    }
    return binding;
  }

  private toRecord(input: {
    binding: DouyinWorkBinding;
    comment: DouyinOpsComment;
    syncedAt: string;
    parentCid?: string;
  }): DouyinComment {
    const { binding, comment, syncedAt } = input;
    if (!binding.awemeId) {
      throw new DomainValidationError(
        "抖音作品绑定缺少 awemeId"
      );
    }
    if (
      comment.awemeId &&
      comment.awemeId !== binding.awemeId
    ) {
      throw new DomainValidationError(
        "评论所属作品与 PVS 绑定的抖音作品不一致"
      );
    }

    const parentCid =
      input.parentCid?.trim() ||
      comment.parentCid?.trim() ||
      undefined;
    const normalized = {
      cid: comment.cid,
      awemeId: binding.awemeId,
      uid: comment.uid,
      secUid: comment.secUid,
      nickname: comment.nickname,
      text: comment.text,
      diggCount: comment.diggCount,
      replyCount: comment.replyCount,
      createdAt: comment.createdAt,
      parentCid: parentCid ?? "",
      avatarUrl: comment.avatarUrl
    };
    const rawJson = JSON.stringify(normalized);

    return douyinCommentSchema.parse({
      id: "douyin-comment:" +
        binding.awemeId +
        ":" +
        comment.cid,
      projectId: binding.projectId,
      bindingId: binding.id,
      awemeId: binding.awemeId,
      cid: comment.cid,
      ...(comment.uid ? { uid: comment.uid } : {}),
      ...(comment.secUid
        ? { secUid: comment.secUid }
        : {}),
      nickname: comment.nickname,
      text: comment.text,
      diggCount: comment.diggCount,
      replyCount: comment.replyCount,
      ...(comment.createdAt
        ? { platformCreatedAt: comment.createdAt }
        : {}),
      ...(parentCid ? { parentCid } : {}),
      ...(comment.avatarUrl
        ? { avatarUrl: comment.avatarUrl }
        : {}),
      syncedAt,
      rawJson,
      contentHash: sha256Text(rawJson),
      createdAt: syncedAt,
      updatedAt: syncedAt
    });
  }

  private async syncPages(input: {
    binding: DouyinWorkBinding;
    maxPages: number;
    pageSize: number;
    syncedAt: string;
    parentCid?: string;
  }): Promise<DouyinCommentSyncResult> {
    if (!input.binding.awemeId) {
      throw new DomainValidationError(
        "抖音作品绑定缺少 awemeId"
      );
    }

    let cursor = "0";
    let pages = 0;
    let hasMore = true;
    const synced = new Set<string>();

    while (pages < input.maxPages && hasMore) {
      const previousCursor = cursor;
      const page = input.parentCid
        ? await this.runtime.getReplies({
            awemeId: input.binding.awemeId,
            cid: input.parentCid,
            cursor,
            count: input.pageSize
          })
        : await this.runtime.getComments({
            awemeId: input.binding.awemeId,
            cursor,
            count: input.pageSize
          });

      const records = page.comments.map((comment) =>
        this.toRecord({
          binding: input.binding,
          comment,
          syncedAt: input.syncedAt,
          ...(input.parentCid
            ? { parentCid: input.parentCid }
            : {})
        })
      );
      if (records.length) {
        await this.repo.upsertComments(records);
        for (const record of records) {
          synced.add(record.cid);
        }
      }

      pages += 1;
      cursor = page.cursor || previousCursor;
      hasMore = page.hasMore;

      if (hasMore && cursor === previousCursor) {
        throw new DomainValidationError(
          "抖音评论分页游标没有推进，已停止继续同步"
        );
      }
    }

    return {
      projectId: input.binding.projectId,
      awemeId: input.binding.awemeId,
      pages,
      syncedCount: synced.size,
      cursor,
      hasMore,
      truncated: hasMore && pages >= input.maxPages
    };
  }

  async syncComments(input: {
    projectId: string;
    packageId?: string;
    maxPages?: number;
    pageSize?: number;
    syncedAt?: string;
  }): Promise<DouyinCommentSyncResult> {
    const binding = await this.resolveBinding(input);
    return this.syncPages({
      binding,
      maxPages: boundedInt(input.maxPages, 5, 1, 20),
      pageSize: boundedInt(input.pageSize, 20, 1, 20),
      syncedAt: input.syncedAt ?? new Date().toISOString()
    });
  }

  async syncReplies(input: {
    projectId: string;
    cid: string;
    packageId?: string;
    maxPages?: number;
    pageSize?: number;
    syncedAt?: string;
  }): Promise<DouyinCommentSyncResult> {
    const binding = await this.resolveBinding(input);
    if (!binding.awemeId) {
      throw new DomainValidationError(
        "抖音作品绑定缺少 awemeId"
      );
    }
    const parent = await this.repo.findComment({
      awemeId: binding.awemeId,
      cid: input.cid
    });
    if (!parent) {
      throw new DomainValidationError(
        "请先同步并选择一条已存在的抖音评论"
      );
    }

    return this.syncPages({
      binding,
      parentCid: input.cid,
      maxPages: boundedInt(input.maxPages, 5, 1, 20),
      pageSize: boundedInt(input.pageSize, 20, 1, 20),
      syncedAt: input.syncedAt ?? new Date().toISOString()
    });
  }

  listComments(input: {
    projectId: string;
    awemeId?: string;
    parentCid?: string | null;
    limit?: number;
  }): Promise<DouyinComment[]> {
    return this.repo.listComments(input);
  }
}
