import { randomUUID } from "node:crypto";
import type { DouyinOpsRepository } from "../ports/douyin-ops-repository.js";
import {
  douyinCreativeFeedbackSchema,
  type DouyinCreativeFeedback
} from "../../domain/douyin-ops.js";
import { sha256Text } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";

export type DouyinCreativeFeedbackContextItem = {
  feedbackId: string;
  insightId: string;
  text: string;
  evidenceRefs: string[];
};

export class DouyinCreativeFeedbackService {
  constructor(
    private readonly repo: DouyinOpsRepository
  ) {}

  async promote(input: {
    projectId: string;
    insightId: string;
    actionIndex: number;
    confirmed: boolean;
    confirmedAt?: string;
  }): Promise<DouyinCreativeFeedback> {
    if (input.confirmed !== true) {
      throw new DomainValidationError(
        "需要明确确认后才能把复盘建议加入下一轮创意"
      );
    }
    if (
      !Number.isInteger(input.actionIndex) ||
      input.actionIndex < 0
    ) {
      throw new DomainValidationError(
        "复盘建议序号无效"
      );
    }

    const insight =
      await this.repo.findInsightById(
        input.insightId
      );
    if (
      !insight ||
      insight.projectId !== input.projectId
    ) {
      throw new DomainValidationError(
        "复盘记录不存在或不属于当前项目"
      );
    }

    const action =
      insight.nextCreativeActions[
        input.actionIndex
      ];
    if (!action) {
      throw new DomainValidationError(
        "所选复盘建议不存在"
      );
    }
    if (!action.evidenceRefs.length) {
      throw new DomainValidationError(
        "没有证据引用的复盘建议不能进入下一轮创意"
      );
    }

    const now =
      input.confirmedAt ?? new Date().toISOString();
    const actionHash = sha256Text(
      JSON.stringify({
        text: action.text,
        evidenceRefs: action.evidenceRefs
      })
    );

    return this.repo.upsertCreativeFeedback(
      douyinCreativeFeedbackSchema.parse({
        id: randomUUID(),
        projectId: input.projectId,
        insightId: insight.id,
        actionIndex: input.actionIndex,
        actionHash,
        actionText: action.text,
        evidenceRefs: action.evidenceRefs,
        active: true,
        confirmedAt: now,
        createdAt: now,
        updatedAt: now
      })
    );
  }

  async deactivate(input: {
    projectId: string;
    feedbackId: string;
    confirmed: boolean;
    deactivatedAt?: string;
  }): Promise<DouyinCreativeFeedback> {
    if (input.confirmed !== true) {
      throw new DomainValidationError(
        "需要明确确认后才能停用创意反馈"
      );
    }
    const existing =
      await this.repo.findCreativeFeedbackById(
        input.feedbackId
      );
    if (
      !existing ||
      existing.projectId !== input.projectId
    ) {
      throw new DomainValidationError(
        "创意反馈不存在或不属于当前项目"
      );
    }
    if (!existing.active) {
      return existing;
    }

    const updated =
      await this.repo.deactivateCreativeFeedback({
        feedbackId: existing.id,
        projectId: input.projectId,
        deactivatedAt:
          input.deactivatedAt ??
          new Date().toISOString()
      });
    if (!updated) {
      throw new DomainValidationError(
        "创意反馈状态已变化，请刷新后重试"
      );
    }
    return updated;
  }

  active(
    projectId: string
  ): Promise<DouyinCreativeFeedback[]> {
    return this.repo.listCreativeFeedback({
      projectId,
      active: true
    });
  }

  async context(
    projectId: string
  ): Promise<DouyinCreativeFeedbackContextItem[]> {
    const active = await this.active(projectId);
    return active.slice(-20).map((item) => ({
      feedbackId: item.id,
      insightId: item.insightId,
      text: item.actionText,
      evidenceRefs: item.evidenceRefs
    }));
  }
}
