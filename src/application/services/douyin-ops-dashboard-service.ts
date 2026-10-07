import type { ProductFlowService } from "./product-flow.js";
import type { PublishRepository } from "../ports/publish-repository.js";
import type {
  DouyinOpsRuntime,
  DouyinOpsWork
} from "../ports/douyin-ops-runtime.js";
import type {
  DouyinOpsLauncher,
  DouyinOpsLaunchResult
} from "../ports/douyin-ops-launcher.js";
import type { DouyinOpsRepository } from "../ports/douyin-ops-repository.js";
import type {
  DouyinCreativeFeedback,
  DouyinInsight,
  DouyinMetricSnapshot,
  DouyinReplyDraft,
  DouyinWorkBinding,
  DouyinComment
} from "../../domain/douyin-ops.js";
import type {
  PublishPackage,
  PublishReceipt
} from "../../domain/publish.js";
import {
  DouyinAccountBindingService,
  type DouyinAccountMatchResult
} from "./douyin-account-binding-service.js";
import {
  DouyinWorkBindingService
} from "./douyin-work-binding-service.js";
import { DouyinMetricService } from "./douyin-metric-service.js";
import { DouyinCommentService } from "./douyin-comment-service.js";
import { DouyinCommentClassificationService } from "./douyin-comment-classification-service.js";
import { DouyinReplyDraftService } from "./douyin-reply-draft-service.js";
import { DouyinRetrospectiveService } from "./douyin-retrospective-service.js";
import { DouyinCreativeFeedbackService } from "./douyin-creative-feedback-service.js";
import { DouyinOpsRuntimeError } from "../ports/douyin-ops-runtime.js";
import { DomainValidationError } from "../../domain/validation.js";

export type DouyinOpsGlobalView = {
  runtime: Awaited<ReturnType<DouyinOpsRuntime["probe"]>>;
  account: DouyinAccountMatchResult;
  works: DouyinOpsWork[];
  worksStatus: "READY" | "AUTH_REQUIRED" | "OFFLINE" | "FAILED";
  worksMessage?: string;
  linkedProjects: Array<{
    projectId: string;
    projectName: string;
    binding: DouyinWorkBinding;
  }>;
};

export type DouyinOpsProjectView = {
  project: {
    id: string;
    name: string;
  };
  runtime: Awaited<ReturnType<DouyinOpsRuntime["probe"]>>;
  account: DouyinAccountMatchResult;
  publishPackage: PublishPackage | null;
  publishReceipt: PublishReceipt | null;
  binding: DouyinWorkBinding | null;
  snapshots: DouyinMetricSnapshot[];
  comments: DouyinComment[];
  replyDrafts: DouyinReplyDraft[];
  latestInsight: DouyinInsight | null;
  creativeFeedback: DouyinCreativeFeedback[];
  candidates: DouyinOpsWork[];
  candidatesStatus: "READY" | "AUTH_REQUIRED" | "OFFLINE" | "FAILED";
  candidatesMessage?: string;
};

function latestTrustedReceipt(
  receipts: PublishReceipt[]
): PublishReceipt | null {
  for (let i = receipts.length - 1; i >= 0; i -= 1) {
    const receipt = receipts[i]!;
    if (
      receipt.kind === "PUBLISHED_CONFIRMED" &&
      receipt.trusted === true
    ) {
      return receipt;
    }
  }
  return null;
}

function candidateFailure(error: unknown): {
  status: DouyinOpsProjectView["candidatesStatus"];
  message: string;
} {
  if (
    error instanceof DouyinOpsRuntimeError &&
    error.code === "AUTH_REQUIRED"
  ) {
    return {
      status: "AUTH_REQUIRED",
      message: "抖音运营账号需要重新登录。"
    };
  }
  if (error instanceof DouyinOpsRuntimeError) {
    return {
      status: "OFFLINE",
      message: error.message
    };
  }
  return {
    status: "FAILED",
    message:
      error instanceof Error
        ? error.message
        : String(error)
  };
}

export class DouyinOpsDashboardService {
  constructor(
    private readonly productFlow: ProductFlowService,
    private readonly publishRepo: PublishRepository,
    private readonly opsRepo: DouyinOpsRepository,
    private readonly opsRuntime: DouyinOpsRuntime,
    private readonly accountBinding: DouyinAccountBindingService,
    private readonly workBinding: DouyinWorkBindingService,
    private readonly metrics: DouyinMetricService,
    private readonly comments: DouyinCommentService,
    private readonly classifier: DouyinCommentClassificationService,
    private readonly replyDrafts: DouyinReplyDraftService,
    private readonly retrospective: DouyinRetrospectiveService,
    private readonly creativeFeedbackService: DouyinCreativeFeedbackService,
    private readonly launcher?: DouyinOpsLauncher
  ) {}

  private async requireProject(projectId: string) {
    const workspace =
      await this.productFlow.getWorkspace(projectId);
    if (!workspace) {
      throw new DomainValidationError("项目不存在");
    }
    return workspace.project;
  }

  private async packageState(projectId: string): Promise<{
    pkg: PublishPackage | null;
    receipt: PublishReceipt | null;
  }> {
    const pkg = await this.publishRepo.latestPackage(projectId);
    if (!pkg) return { pkg: null, receipt: null };
    const receipts =
      await this.publishRepo.listReceiptsForPackage(pkg.id);
    return {
      pkg,
      receipt: latestTrustedReceipt(receipts)
    };
  }

  private async ensureBinding(input: {
    projectId: string;
    account: DouyinAccountMatchResult;
  }): Promise<{
    pkg: PublishPackage | null;
    receipt: PublishReceipt | null;
    binding: DouyinWorkBinding | null;
  }> {
    const state = await this.packageState(input.projectId);
    const existing = state.pkg
      ? await this.opsRepo.findWorkBindingByPackage(
          state.pkg.id
        )
      : await this.opsRepo.latestWorkBinding(input.projectId);

    if (!state.pkg) {
      return {
        ...state,
        binding: existing
      };
    }

    if (
      existing?.status === "BOUND" &&
      existing.awemeId
    ) {
      return {
        ...state,
        binding: existing
      };
    }

    const decision =
      this.workBinding.fromPublishReceipt({
        pkg: state.pkg,
        receipt: state.receipt,
        accountMatch: input.account
      });

    const binding = await this.metrics.persistBinding({
      projectId: input.projectId,
      decision,
      ...(state.pkg.publishedConfirmedAt
        ? { publishedAt: state.pkg.publishedConfirmedAt }
        : {})
    });

    return {
      ...state,
      binding
    };
  }

  private async candidates(): Promise<{
    works: DouyinOpsWork[];
    status: DouyinOpsProjectView["candidatesStatus"];
    message?: string;
  }> {
    try {
      return {
        works: await this.opsRuntime.listMyWorks(30),
        status: "READY"
      };
    } catch (error) {
      const failure = candidateFailure(error);
      return {
        works: [],
        status: failure.status,
        message: failure.message
      };
    }
  }

  async launch(): Promise<DouyinOpsLaunchResult> {
    if (!this.launcher) {
      return {
        ok: false,
        status: "UNAVAILABLE",
        message: "抖音运营启动器尚未配置。"
      };
    }
    return this.launcher.launch();
  }

  async global(): Promise<DouyinOpsGlobalView> {
    const [runtime, account, projects] =
      await Promise.all([
        this.opsRuntime.probe(),
        this.accountBinding.inspect(),
        this.productFlow.listProjects()
      ]);

    const candidateState =
      runtime.ready &&
      account.ops.available &&
      account.ops.runtimeStatus === "READY"
        ? await this.candidates()
        : {
            works: [] as DouyinOpsWork[],
            status:
              runtime.ready
                ? ("AUTH_REQUIRED" as const)
                : ("OFFLINE" as const),
            message:
              runtime.ready
                ? "请先在专用抖音浏览器完成运营账号登录。"
                : runtime.message ??
                  "抖音运营连接当前不可用。"
          };

    const linkedProjects = (
      await Promise.all(
        projects.map(async (project) => {
          const binding =
            await this.opsRepo.latestWorkBinding(project.id);
          return binding
            ? {
                projectId: project.id,
                projectName: project.name,
                binding
              }
            : null;
        })
      )
    ).filter(
      (
        item
      ): item is {
        projectId: string;
        projectName: string;
        binding: DouyinWorkBinding;
      } => Boolean(item)
    );

    return {
      runtime,
      account,
      works: candidateState.works,
      worksStatus: candidateState.status,
      ...(candidateState.message
        ? { worksMessage: candidateState.message }
        : {}),
      linkedProjects
    };
  }

  async project(
    projectId: string
  ): Promise<DouyinOpsProjectView> {
    const project = await this.requireProject(projectId);
    const [runtime, account] = await Promise.all([
      this.opsRuntime.probe(),
      this.accountBinding.inspect()
    ]);
    const state = await this.ensureBinding({
      projectId,
      account
    });

    const [snapshots, comments, replyDrafts, latestInsight, creativeFeedback, candidateState] =
      await Promise.all([
        this.metrics.history({
          projectId,
          ...(state.binding?.awemeId
            ? { awemeId: state.binding.awemeId }
            : {})
        }),
        this.comments.listComments({
          projectId,
          ...(state.binding?.awemeId
            ? { awemeId: state.binding.awemeId }
            : {}),
          parentCid: null,
          limit: 500
        }),
        state.binding?.awemeId
          ? this.replyDrafts.latestForWork({
              projectId,
              awemeId: state.binding.awemeId
            })
          : Promise.resolve([] as DouyinReplyDraft[]),
        state.binding?.awemeId
          ? this.retrospective.latest({
              projectId,
              awemeId: state.binding.awemeId
            })
          : Promise.resolve(null as DouyinInsight | null),
        this.creativeFeedbackService.active(projectId),
        runtime.ready &&
        account.ops.available &&
        account.ops.runtimeStatus === "READY"
          ? this.candidates()
          : Promise.resolve({
              works: [] as DouyinOpsWork[],
              status:
                runtime.ready
                  ? ("AUTH_REQUIRED" as const)
                  : ("OFFLINE" as const),
              message:
                runtime.ready
                  ? "请先在专用抖音浏览器完成运营账号登录。"
                  : runtime.message ??
                    "抖音运营连接当前不可用。"
            })
      ]);

    return {
      project: {
        id: project.id,
        name: project.name
      },
      runtime,
      account,
      publishPackage: state.pkg,
      publishReceipt: state.receipt,
      binding: state.binding,
      snapshots,
      comments,
      replyDrafts,
      latestInsight,
      creativeFeedback,
      candidates: candidateState.works,
      candidatesStatus: candidateState.status,
      ...(candidateState.message
        ? { candidatesMessage: candidateState.message }
        : {})
    };
  }


  async promoteCreativeFeedback(input: {
    projectId: string;
    insightId: string;
    actionIndex: number;
    confirmed: boolean;
  }): Promise<DouyinCreativeFeedback> {
    await this.requireProject(input.projectId);
    return this.creativeFeedbackService.promote(
      input
    );
  }

  async deactivateCreativeFeedback(input: {
    projectId: string;
    feedbackId: string;
    confirmed: boolean;
  }): Promise<DouyinCreativeFeedback> {
    await this.requireProject(input.projectId);
    return this.creativeFeedbackService.deactivate(
      input
    );
  }

  async generateRetrospective(
    projectId: string
  ): Promise<DouyinInsight> {
    await this.requireProject(projectId);
    return this.retrospective.generate({
      projectId
    });
  }

  async refreshMetrics(
    projectId: string
  ): Promise<DouyinMetricSnapshot> {
    await this.requireProject(projectId);
    return this.metrics.refresh({ projectId });
  }

  async syncComments(
    projectId: string
  ) {
    await this.requireProject(projectId);
    return this.comments.syncComments({
      projectId,
      maxPages: 5,
      pageSize: 20
    });
  }

  async syncReplies(
    projectId: string,
    cid: string
  ) {
    await this.requireProject(projectId);
    return this.comments.syncReplies({
      projectId,
      cid,
      maxPages: 5,
      pageSize: 20
    });
  }

  async classifyComments(input: {
    projectId: string;
    cids?: string[];
    force?: boolean;
  }) {
    await this.requireProject(input.projectId);
    const binding =
      await this.opsRepo.latestWorkBinding(
        input.projectId
      );
    if (
      !binding ||
      binding.status !== "BOUND" ||
      !binding.awemeId
    ) {
      throw new DomainValidationError(
        "当前项目尚未确认抖音作品绑定，不能进行评论 AI 分类"
      );
    }
    return this.classifier.classify({
      projectId: input.projectId,
      awemeId: binding.awemeId,
      ...(input.cids ? { cids: input.cids } : {}),
      ...(input.force !== undefined
        ? { force: input.force }
        : {}),
      limit: 20
    });
  }

  async generateReplyDraft(input: {
    projectId: string;
    cid: string;
  }): Promise<DouyinReplyDraft> {
    await this.requireProject(input.projectId);
    return this.replyDrafts.generate({
      projectId: input.projectId,
      cid: input.cid
    });
  }


  async editReplyDraft(input: {
    projectId: string;
    draftId: string;
    expectedRevision: number;
    currentText: string;
  }): Promise<DouyinReplyDraft> {
    await this.requireProject(input.projectId);
    return this.replyDrafts.edit(input);
  }

  async rejectReplyDraft(input: {
    projectId: string;
    draftId: string;
    expectedRevision: number;
  }): Promise<DouyinReplyDraft> {
    await this.requireProject(input.projectId);
    return this.replyDrafts.reject(input);
  }

  async confirmBinding(input: {
    projectId: string;
    awemeId: string;
    externalUrl?: string;
    confirmed: boolean;
  }): Promise<DouyinWorkBinding> {
    if (input.confirmed !== true) {
      throw new DomainValidationError(
        "需要明确确认后才能绑定抖音作品"
      );
    }
    await this.requireProject(input.projectId);
    const state = await this.packageState(input.projectId);
    if (!state.pkg) {
      throw new DomainValidationError(
        "当前项目还没有发布包，无法绑定抖音作品"
      );
    }
    const decision =
      this.workBinding.confirmUserSelection({
        pkg: state.pkg,
        receipt: state.receipt,
        awemeId: input.awemeId,
        ...(input.externalUrl
          ? { externalUrl: input.externalUrl }
          : {})
      });
    return this.metrics.persistBinding({
      projectId: input.projectId,
      decision,
      ...(state.pkg.publishedConfirmedAt
        ? { publishedAt: state.pkg.publishedConfirmedAt }
        : {})
    });
  }
}
