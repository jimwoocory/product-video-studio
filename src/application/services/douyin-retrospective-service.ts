import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DouyinOpsRepository } from "../ports/douyin-ops-repository.js";
import {
  generateStructuredJson,
  type StructuredAiRuntime
} from "../ports/structured-ai-runtime.js";
import type { ProductFlowService } from "./product-flow.js";
import {
  douyinInsightEvidenceItemSchema,
  douyinInsightSchema,
  type DouyinInsight
} from "../../domain/douyin-ops.js";
import { sha256Text } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";

const outputSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  strengths: z.array(douyinInsightEvidenceItemSchema).max(8),
  weaknesses: z.array(douyinInsightEvidenceItemSchema).max(8),
  audienceQuestions: z.array(douyinInsightEvidenceItemSchema).max(12),
  nextCreativeActions: z.array(douyinInsightEvidenceItemSchema).max(8)
});

function allItems(output: z.infer<typeof outputSchema>) {
  return [
    ...output.strengths,
    ...output.weaknesses,
    ...output.audienceQuestions,
    ...output.nextCreativeActions
  ];
}

export class DouyinRetrospectiveService {
  constructor(
    private readonly repo: DouyinOpsRepository,
    private readonly productFlow: Pick<
      ProductFlowService,
      "getWorkspace"
    >,
    private readonly runtime: StructuredAiRuntime
  ) {}

  async generate(input: {
    projectId: string;
    createdAt?: string;
  }): Promise<DouyinInsight> {
    const workspace =
      await this.productFlow.getWorkspace(
        input.projectId
      );
    if (!workspace) {
      throw new DomainValidationError("项目不存在");
    }
    const truth = workspace.productTruth;
    if (!truth || truth.status !== "CONFIRMED") {
      throw new DomainValidationError(
        "当前项目没有已确认的产品事实，不能生成发布后 AI 复盘"
      );
    }

    const binding =
      await this.repo.latestWorkBinding(
        input.projectId
      );
    if (
      !binding ||
      binding.status !== "BOUND" ||
      !binding.awemeId
    ) {
      throw new DomainValidationError(
        "当前项目尚未确认抖音作品绑定，不能生成发布后 AI 复盘"
      );
    }

    const [snapshots, comments] =
      await Promise.all([
        this.repo.listMetricSnapshots({
          projectId: input.projectId,
          awemeId: binding.awemeId,
          limit: 100
        }),
        this.repo.listComments({
          projectId: input.projectId,
          awemeId: binding.awemeId,
          limit: 500
        })
      ]);

    if (!snapshots.length) {
      throw new DomainValidationError(
        "至少需要一条已保存的作品指标快照才能生成发布后 AI 复盘"
      );
    }

    const metricEvidence = snapshots.map(
      (snapshot) => ({
        evidenceRef: "metric:" + snapshot.id,
        capturedAt: snapshot.capturedAt,
        plays: snapshot.plays,
        likes: snapshot.likes,
        comments: snapshot.comments,
        shares: snapshot.shares,
        ...(snapshot.collects !== undefined
          ? { collects: snapshot.collects }
          : {})
      })
    );
    const commentEvidence = comments.map(
      (comment) => ({
        evidenceRef: "comment:" + comment.id,
        cid: comment.cid,
        text: comment.text,
        diggCount: comment.diggCount,
        replyCount: comment.replyCount,
        ...(comment.sentiment
          ? { sentiment: comment.sentiment }
          : {}),
        ...(comment.category
          ? { category: comment.category }
          : {}),
        ...(comment.priority
          ? { priority: comment.priority }
          : {})
      })
    );

    const allowedRefs = new Set([
      ...metricEvidence.map((item) => item.evidenceRef),
      ...commentEvidence.map((item) => item.evidenceRef)
    ]);

    const evidencePayload = {
      productTruthHash: truth.contentHash,
      metrics: metricEvidence,
      comments: commentEvidence
    };
    const evidenceHash = sha256Text(
      JSON.stringify(evidencePayload)
    );

    const aiResult = await generateStructuredJson(
      this.runtime,
      {
        task: "DOUYIN_POST_PUBLISH_RETROSPECTIVE",
        instructions: [
          "你负责对一个已经发布的抖音作品做发布后复盘。",
          "只能使用输入中的 metricEvidence、commentEvidence 和 confirmedProductFacts；绝对不能编造播放、点赞、评论、分享、收藏、完播率、转化率或任何平台未提供的指标。",
          "分析指标变化时，要引用实际 metric:<snapshotId>；分析用户关注点时，要引用实际 comment:<commentId>。",
          "strengths、weaknesses、audienceQuestions、nextCreativeActions 中每一项都必须包含至少一个 evidenceRefs。",
          "evidenceRefs 只能使用输入中提供的 evidenceRef，不能创造新 ID。",
          "如果证据不足，不要推断因果关系；应明确使用保守表述。",
          "下一条创意建议必须能追溯到真实指标或真实评论，不要根据行业常识凭空补结论。",
          "confirmedProductFacts 只能用于理解产品，不能替代平台表现证据。",
          "输出中文。"
        ].join("\n"),
        input: {
          work: {
            awemeId: binding.awemeId,
            externalUrl: binding.externalUrl
          },
          confirmedProductFacts: [
            ...truth.confirmedFeatures,
            ...truth.sellingPoints
          ].map((fact) => ({
            id: fact.id,
            statement: fact.statement
          })),
          metricEvidence,
          commentEvidence
        },
        outputContract: {
          summary: "基于实际证据的简短复盘",
          strengths: [
            {
              text: "已验证的表现优势",
              evidenceRefs: ["metric:<id> 或 comment:<id>"]
            }
          ],
          weaknesses: [
            {
              text: "需要改进的问题",
              evidenceRefs: ["metric:<id> 或 comment:<id>"]
            }
          ],
          audienceQuestions: [
            {
              text: "用户真实关注或问题",
              evidenceRefs: ["comment:<id>"]
            }
          ],
          nextCreativeActions: [
            {
              text: "下一条视频可执行建议",
              evidenceRefs: ["metric:<id> 或 comment:<id>"]
            }
          ]
        },
        context: {
          projectId: input.projectId,
          step: "DOUYIN_OPS"
        }
      }
    );

    const parsedResult =
      outputSchema.safeParse(aiResult.data);
    if (!parsedResult.success) {
      throw new Error(
        "AI 发布后复盘结果格式无效"
      );
    }
    const output = parsedResult.data;

    const unknownRefs = [
      ...new Set(
        allItems(output)
          .flatMap((item) => item.evidenceRefs)
          .filter((ref) => !allowedRefs.has(ref))
      )
    ];
    if (unknownRefs.length) {
      throw new DomainValidationError(
        "AI 发布后复盘引用了不存在的证据：" +
          unknownRefs.join("、")
      );
    }

    const now =
      input.createdAt ?? new Date().toISOString();
    const metadata = aiResult.metadata;
    const insight = douyinInsightSchema.parse({
      id: randomUUID(),
      projectId: input.projectId,
      bindingId: binding.id,
      awemeId: binding.awemeId,
      productTruthHash: truth.contentHash,
      metricSnapshotIds: snapshots.map(
        (item) => item.id
      ),
      commentIds: comments.map((item) => item.id),
      evidenceHash,
      summary: output.summary,
      strengths: output.strengths,
      weaknesses: output.weaknesses,
      audienceQuestions: output.audienceQuestions,
      nextCreativeActions: output.nextCreativeActions,
      runtimeId: this.runtime.id,
      runtimeVersion: this.runtime.version,
      ...(metadata?.providerId
        ? { providerId: metadata.providerId }
        : {}),
      ...(metadata?.modelId
        ? { modelId: metadata.modelId }
        : {}),
      ...(metadata?.executionId
        ? { executionId: metadata.executionId }
        : {}),
      ...(metadata?.configVersion
        ? { configVersion: metadata.configVersion }
        : {}),
      createdAt: now
    });

    return this.repo.createInsight(insight);
  }

  latest(input: {
    projectId: string;
    awemeId?: string;
  }): Promise<DouyinInsight | null> {
    return this.repo.latestInsight(
      input.projectId,
      input.awemeId
    );
  }
}
