import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  BrowserResearchProvider,
  ResearchMediaAnalyzer,
  WebResearchProvider,
  WebResearchSource
} from "../ports/research-provider.js";
import type {
  ResearchBrief,
  ResearchBrowserState,
  ResearchCandidateClaim,
  ResearchConfidence,
  ResearchEvidence,
  ResearchEvidenceSourceType,
  ResearchMode,
  ResearchRepository,
  ResearchRun,
  ResearchUsageRule
} from "../ports/research-repository.js";
import type { StructuredAiRuntime } from "../ports/structured-ai-runtime.js";
import { generateStructuredJson } from "../ports/structured-ai-runtime.js";
import type { ProductFlowService } from "./product-flow.js";
import { productTruthSchema } from "../../domain/schemas.js";
import { hashValue } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";
import {
  fetchedDocumentMatchesIdentity,
  scoreResearchCandidate,
  type ResearchIdentity
} from "./research-source-quality.js";

const briefProposalSchema = z.object({
  summary: z.string().trim().min(1),
  findings: z.array(
    z.object({
      statement: z.string().trim().min(1),
      evidenceIds: z.array(z.string().trim().min(1)).min(1),
      confidence: z.enum(["LOW", "MEDIUM", "HIGH"])
    })
  ).max(40),
  candidateClaims: z.array(
    z.object({
      statement: z.string().trim().min(1),
      evidenceIds: z.array(z.string().trim().min(1)).min(1),
      confidence: z.enum(["LOW", "MEDIUM", "HIGH"])
    })
  ).max(30),
  usageRules: z.array(
    z.object({
      category: z.enum([
        "USAGE_METHOD",
        "WEARING_POSITION",
        "PRECAUTION",
        "FUNCTION_EFFECT",
        "USAGE_SCENARIO",
        "PRODUCT_STATE",
        "LIMITATION"
      ]),
      polarity: z.enum(["MUST", "MUST_NOT", "CONTEXT"]),
      statement: z.string().trim().min(1),
      evidenceIds: z.array(z.string().trim().min(1)).min(1),
      confidence: z.enum(["LOW", "MEDIUM", "HIGH"])
    })
  ).max(30).default([]),
  contentOpportunities: z.array(z.string().trim().min(1)).max(30),
  uncertainties: z.array(z.string().trim().min(1)).max(30)
});

const researchRerankSchema = z.object({
  candidates: z.array(
    z.object({
      candidateId: z.string().trim().min(1),
      relevanceScore: z.number().min(0).max(100),
      reason: z.string().trim().min(1).max(300)
    })
  ).max(20)
});

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

type DiscoveryRoundAudit = NonNullable<
  ResearchBrowserState["discoveryRounds"]
>[number];

function discoveredSourceSelection(input: {
  sources: WebResearchSource[];
  identity: ResearchIdentity;
  round: number;
  queries: string[];
  semanticScores?: Map<string, { score: number; reason: string }>;
}): {
  selected: WebResearchSource[];
  audit: DiscoveryRoundAudit;
} {
  const hostCounts = new Map<string, number>();
  const scored = input.sources.map((source) => {
    let host = "";
    try {
      host = new URL(source.url).hostname.toLowerCase();
    } catch {
      // Invalid URLs will be rejected by downstream fetch validation.
    }
    const baseScore = scoreResearchCandidate({
      source,
      identity: input.identity,
      sameHostAcceptedCount: hostCounts.get(host) ?? 0
    });
    const semantic = input.semanticScores?.get(source.url);
    const hardReject = baseScore.reasons.some((reason) =>
      reason.includes("直接淘汰")
    );
    const finalScore =
      semantic && !hardReject
        ? Math.round(baseScore.deterministicScore * 0.6 + semantic.score * 0.4)
        : baseScore.deterministicScore;
    const decision: "ACCEPT" | "HOLD" | "REJECT" =
      !semantic || hardReject
        ? baseScore.decision
        : finalScore >= 55
          ? "ACCEPT"
          : finalScore >= 22
            ? "HOLD"
            : "REJECT";
    const score = {
      ...baseScore,
      finalScore,
      decision,
      reasons:
        semantic && !hardReject
          ? [
              ...baseScore.reasons,
              "语义相关度 " + semantic.score + "：" + semantic.reason
            ]
          : baseScore.reasons
    };
    if (score.decision === "ACCEPT" && host) {
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    }
    return { source, score };
  });
  const accepted = scored.filter((item) => item.score.decision === "ACCEPT");
  const held = scored
    .filter((item) => item.score.decision === "HOLD")
    .sort((a, b) => b.score.finalScore - a.score.finalScore);
  const selected = [...accepted];
  const minFetch = 6;
  for (const item of held) {
    if (selected.length >= minFetch) break;
    selected.push(item);
  }
  const selectedUrls = new Set(selected.map((item) => item.source.url));
  return {
    selected: selected.map((item) => item.source),
    audit: {
      round: input.round,
      queries: [...input.queries],
      candidateCount: scored.length,
      acceptedCount: accepted.length,
      heldCount: held.length,
      rejectedCount: scored.filter(
        (item) => item.score.decision === "REJECT"
      ).length,
      fetchedCount: selected.length,
      candidates: scored.map(({ source, score }) => ({
        url: source.url,
        ...(source.resultTitle ? { title: source.resultTitle } : {}),
        sourceType: source.sourceType,
        ...(source.discoveryQuery ? { query: source.discoveryQuery } : {}),
        ...(source.discoveryEngine
          ? { engine: source.discoveryEngine }
          : {}),
        ...(source.discoveryRank ? { rank: source.discoveryRank } : {}),
        deterministicScore: score.deterministicScore,
        ...(input.semanticScores?.get(source.url)
          ? { semanticScore: input.semanticScores.get(source.url)!.score }
          : {}),
        finalScore: score.finalScore,
        decision: score.decision,
        selectedForFetch: selectedUrls.has(source.url),
        reasons: [...score.reasons]
      }))
    }
  };
}

function confidenceForSource(
  sourceType: ResearchEvidenceSourceType
): ResearchConfidence {
  if (sourceType === "OFFICIAL") return "HIGH";
  if (
    sourceType === "USER_URL" ||
    sourceType === "PUBLIC_PRODUCT" ||
    sourceType === "COMPETITOR" ||
    sourceType === "INDUSTRY"
  ) {
    return "MEDIUM";
  }
  return "LOW";
}

function evidenceSummary(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function automaticDeepQueries(input: {
  goal: string;
  productName?: string;
  brand?: string;
  category?: string;
}): string[] {
  const brand = input.brand?.trim() ?? "";
  const productName = input.productName?.trim() ?? "";
  const identity =
    brand && productName.toLowerCase().includes(brand.toLowerCase())
      ? productName
      : [brand, productName].filter(Boolean).join(" ");
  const subject = identity || input.productName?.trim() || input.goal.trim();
  if (!subject) return [];
  return uniqueStrings([
    `${subject} 官网`,
    `${subject} 说明书 使用说明`,
    `${subject} 使用方法 操作方法`,
    `${subject} 佩戴位置 佩戴方法 安装位置`,
    `${subject} 注意事项 使用限制 防水 充电`,
    `${subject} 功能 作用 使用场景`,
    `${subject} 参数 规格`,
    `${subject} 评测 review`,
    input.category ? `${input.category} 竞品 对比 使用场景` : "",
    input.goal
  ]).slice(0, 12);
}

function recoveryDeepQueries(input: {
  goal: string;
  productName?: string;
  brand?: string;
  category?: string;
}): string[] {
  const identity = [input.brand?.trim(), input.productName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();
  const subject = identity || input.productName?.trim() || input.goal.trim();
  if (!subject) return [];
  return uniqueStrings([
    subject + " 官方 产品详情",
    subject + " 官方 说明书 PDF",
    subject + " 售后 支持 使用说明",
    subject + " 使用方法 注意事项",
    subject + " 型号 参数 规格",
    subject + " 商品详情",
    input.category ? subject + " " + input.category : "",
    input.goal
  ]).slice(0, 8);
}

function productIdentityTerms(input: {
  productName?: string;
  brand?: string;
}): string[] {
  const generic = new Set([
    "pro",
    "plus",
    "max",
    "mini",
    "new",
    "耳机",
    "蓝牙",
    "产品"
  ]);
  const values = [input.brand, input.productName]
    .map((item) => item?.trim().toLowerCase())
    .filter((item): item is string => Boolean(item));
  const terms = new Set<string>(values);
  for (const value of values) {
    for (const token of value.match(/[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu) ?? []) {
      if (!generic.has(token)) terms.add(token);
    }
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

function documentMatchesProduct(
  doc: { finalUrl: string; title: string; text: string },
  identity: { productName?: string; brand?: string }
): boolean {
  const terms = productIdentityTerms(identity);
  if (!terms.length) return true;
  const haystack = `${doc.finalUrl}\n${doc.title}\n${doc.text.slice(0, 16000)}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function validateSourceUrl(input: {
  url: string;
  sourceType: ResearchEvidenceSourceType;
}): WebResearchSource {
  const url = input.url.trim();
  if (!url) throw new DomainValidationError("研究来源网址不能为空");
  return { url, sourceType: input.sourceType };
}

function researchTruthHash(value: Record<string, unknown>): string {
  const copy = structuredClone(value);
  delete copy.contentHash;
  delete copy.confirmedAt;
  return hashValue(copy);
}

export class ResearchService {
  constructor(
    private readonly repo: ResearchRepository,
    private readonly webProvider: WebResearchProvider,
    private readonly browserProvider: BrowserResearchProvider,
    private readonly runtime: StructuredAiRuntime,
    private readonly productFlow: ProductFlowService,
    private readonly mediaAnalyzer?: ResearchMediaAnalyzer
  ) {}

  private async semanticRerankScores(input: {
    projectId: string;
    sources: WebResearchSource[];
    identity: ResearchIdentity;
    goal: string;
  }): Promise<Map<string, { score: number; reason: string }>> {
    if (
      input.sources.length < 2 ||
      !input.sources.some(
        (source) => source.resultTitle || source.resultSnippet
      )
    ) {
      return new Map();
    }
    const candidates = input.sources.slice(0, 20).map((source, index) => ({
      candidateId: "candidate-" + index,
      url: source.url,
      title: source.resultTitle ?? "",
      snippet: source.resultSnippet ?? "",
      sourceType: source.sourceType
    }));
    const byId = new Map(
      candidates.map((candidate, index) => [
        candidate.candidateId,
        input.sources[index]!
      ])
    );
    try {
      const generation = await generateStructuredJson(this.runtime, {
        task:
          "Rank public-search candidates by relevance to the user's exact product research goal.",
        instructions: [
          "Score only relevance, not factual truth.",
          "Do not invent product claims.",
          "A platform homepage or generic category page without product identity should score low.",
          "Exact brand, product name and model matches should score higher.",
          "Only return candidateId values from the supplied candidates."
        ].join(" "),
        input: {
          goal: input.goal,
          productIdentity: input.identity,
          candidates
        },
        outputContract: {
          candidates: [
            {
              candidateId: "candidate-id",
              relevanceScore: "0..100",
              reason: "short reason"
            }
          ]
        },
        context: {
          projectId: input.projectId,
          step: "RESEARCH"
        }
      });
      const parsed = researchRerankSchema.parse(generation.data);
      const scores = new Map<string, { score: number; reason: string }>();
      for (const item of parsed.candidates) {
        const source = byId.get(item.candidateId);
        if (!source) continue;
        scores.set(source.url, {
          score: Math.round(item.relevanceScore),
          reason: item.reason
        });
      }
      return scores;
    } catch {
      return new Map();
    }
  }

  async startRun(input: {
    projectId: string;
    mode: ResearchMode;
    goal: string;
    sourceUrls: Array<{
      url: string;
      sourceType: ResearchEvidenceSourceType;
    }>;
    queries: string[];
  }): Promise<{
    run: ResearchRun;
    evidence: ResearchEvidence[];
    brief?: ResearchBrief;
  }> {
    const project = await this.productFlow.getProject(input.projectId);
    if (!project) throw new DomainValidationError("项目不存在");

    const mode = input.mode;
    let sourceUrls = input.sourceUrls.map(validateSourceUrl);
    const goal = input.goal.trim();
    const workspace = await this.productFlow.getWorkspace(input.projectId);
    const identity: ResearchIdentity = {
      productName: workspace?.productTruth?.productName,
      brand: workspace?.productTruth?.brand,
      category: workspace?.productTruth?.category
    };
    if (mode === "DEEP") {
      const known = new Map(sourceUrls.map((item) => [item.url, item]));
      const previousRuns = await this.repo.listRuns(input.projectId);
      for (const previous of previousRuns.slice(0, 6)) {
        const previousEvidence = await this.repo.listEvidence(previous.id);
        for (const item of previousEvidence) {
          if (
            item.status !== "ACTIVE" ||
            item.sourceType !== "OFFICIAL" ||
            item.mediaContext
          ) {
            continue;
          }
          if (!known.has(item.sourceUrl)) {
            known.set(item.sourceUrl, {
              url: item.sourceUrl,
              sourceType: "OFFICIAL"
            });
          }
        }
      }
      sourceUrls = [...known.values()].slice(0, 8);
    }
    const automaticQueries = automaticDeepQueries({
      goal,
      productName: workspace?.productTruth?.productName,
      brand: workspace?.productTruth?.brand,
      category: workspace?.productTruth?.category
    });
    const queries =
      mode === "DEEP"
        ? uniqueStrings([
            ...automaticQueries,
            ...input.queries
          ]).slice(0, 12)
        : uniqueStrings(input.queries);
    const trustedSourceUrls = new Set(sourceUrls.map((item) => item.url));

    if (mode !== "OFF" && !goal) {
      throw new DomainValidationError("请填写研究目标");
    }
    if (mode === "BASIC" && sourceUrls.length === 0) {
      throw new DomainValidationError(
        "基础研究至少需要 1 个官网、商品页或指定网页"
      );
    }
    if (
      mode === "DEEP" &&
      sourceUrls.length === 0 &&
      queries.length === 0
    ) {
      throw new DomainValidationError(
        "深度研究至少需要来源网址或研究关键词"
      );
    }

    const now = new Date().toISOString();
    let run = await this.repo.createRun({
      id: randomUUID(),
      projectId: input.projectId,
      mode,
      status: mode === "OFF" ? "COMPLETED" : "RUNNING",
      goal,
      sourceUrls,
      queries,
      createdAt: now,
      updatedAt: now
    });

    if (mode === "OFF") {
      return { run, evidence: [] };
    }

    const discovered: WebResearchSource[] = [...sourceUrls];
    let discoveryRounds: DiscoveryRoundAudit[] = [];
    let browserBlocked:
      | {
          blockerCode: string;
          message: string;
          requiredUserAction: string;
          browserState?: ResearchRun["browserState"];
        }
      | undefined;

    if (mode === "DEEP" && queries.length) {
      const browser = await this.browserProvider.discover({
        projectId: input.projectId,
        goal,
        queries
      });
      if (browser.status === "READY") {
        const semanticScores = await this.semanticRerankScores({
          projectId: input.projectId,
          sources: browser.sources,
          identity,
          goal
        });
        const selection = discoveredSourceSelection({
          sources: browser.sources,
          identity,
          round: 1,
          queries,
          semanticScores
        });
        discoveryRounds = [selection.audit];
        discovered.push(...selection.selected);
        let effectiveBrowserState = browser.browserState;
        if (selection.audit.acceptedCount === 0) {
          const recoveryQueries = recoveryDeepQueries({
            goal,
            productName: identity.productName,
            brand: identity.brand,
            category: identity.category
          });
          if (recoveryQueries.length) {
            const retry = await this.browserProvider.discover({
              projectId: input.projectId,
              goal,
              queries: recoveryQueries
            });
            if (retry.status === "READY") {
              const retrySemanticScores = await this.semanticRerankScores({
                projectId: input.projectId,
                sources: retry.sources,
                identity,
                goal
              });
              const retrySelection = discoveredSourceSelection({
                sources: retry.sources,
                identity,
                round: 2,
                queries: recoveryQueries,
                semanticScores: retrySemanticScores
              });
              discoveryRounds.push(retrySelection.audit);
              discovered.push(...retrySelection.selected);
              effectiveBrowserState =
                retry.browserState ?? effectiveBrowserState;
            } else if (selection.selected.length === 0) {
              browserBlocked = {
                blockerCode: retry.blockerCode,
                message: retry.message,
                requiredUserAction: retry.requiredUserAction,
                browserState: {
                  provider:
                    retry.browserState?.provider ??
                    browser.browserState?.provider ??
                    this.browserProvider.id,
                  ...(retry.browserState?.resumeToken
                    ? { resumeToken: retry.browserState.resumeToken }
                    : {}),
                  lastCheckedAt: new Date().toISOString(),
                  discoveryRounds
                }
              };
            }
          }
        }
        run = await this.repo.updateRun(run.id, {
          browserState: {
            provider:
              effectiveBrowserState?.provider ?? this.browserProvider.id,
            ...(effectiveBrowserState?.resumeToken
              ? { resumeToken: effectiveBrowserState.resumeToken }
              : {}),
            lastCheckedAt: new Date().toISOString(),
            discoveryRounds
          }
        });
      } else {
        browserBlocked = {
          blockerCode: browser.blockerCode,
          message: browser.message,
          requiredUserAction: browser.requiredUserAction,
          ...(browser.browserState
            ? {
                browserState: {
                  ...browser.browserState,
                  lastCheckedAt: new Date().toISOString()
                }
              }
            : {})
        };
      }
    }

    const fetchFailures: string[] = [];
    const evidence: ResearchEvidence[] = [];
    const deduped = new Map<string, WebResearchSource>();
    for (const source of discovered) {
      const key = source.url.trim();
      if (!deduped.has(key)) deduped.set(key, source);
    }

    for (const source of deduped.values()) {
      const discoveryAudit = discoveryRounds
        .flatMap((round) => round.candidates)
        .find((candidate) => candidate.url === source.url);
      try {
        const doc = await this.webProvider.fetchSource(source);
        const fetchedIdentity =
          workspace?.productTruth && !trustedSourceUrls.has(source.url)
            ? fetchedDocumentMatchesIdentity({
                finalUrl: doc.finalUrl,
                title: doc.title,
                text: doc.text,
                identity
              })
            : undefined;
        if (
          mode === "DEEP" &&
          !trustedSourceUrls.has(source.url) &&
          (source.sourceType === "OFFICIAL" ||
            source.sourceType === "PUBLIC_PRODUCT" ||
            source.sourceType === "INDUSTRY" ||
            source.sourceType === "PLATFORM") &&
          workspace?.productTruth &&
          fetchedIdentity &&
          !fetchedIdentity.matched
        ) {
          if (discoveryAudit) {
            discoveryAudit.fetchedIdentityScore = fetchedIdentity.score;
            discoveryAudit.fetchedIdentityMatched = false;
            discoveryAudit.fetchOutcome = "REJECTED";
            discoveryAudit.reasons.push(
              "抓取后正文仍未命中当前产品身份，未进入 Evidence"
            );
          }
          fetchFailures.push(
            source.url + "：来源正文与当前产品身份不匹配，已跳过"
          );
          continue;
        }
        if (discoveryAudit && fetchedIdentity) {
          discoveryAudit.fetchedIdentityScore = fetchedIdentity.score;
          discoveryAudit.fetchedIdentityMatched = fetchedIdentity.matched;
        }
        const createdAt = new Date().toISOString();
        const item = await this.repo.createEvidence({
          id: randomUUID(),
          projectId: input.projectId,
          runId: run.id,
          sourceUrl: doc.finalUrl,
          title: doc.title,
          fetchedAt: doc.fetchedAt,
          sourceType: source.sourceType,
          excerpt: doc.excerpt,
          summary: evidenceSummary(doc.text),
          contentHash: doc.contentHash,
          confidence: confidenceForSource(source.sourceType),
          relatedClaims: [],
          status: "ACTIVE",
          createdAt
        });
        evidence.push(item);
        if (discoveryAudit) discoveryAudit.fetchOutcome = "EVIDENCE";

        if (
          mode === "DEEP" &&
          this.mediaAnalyzer &&
          doc.media?.length
        ) {
          const media = await this.mediaAnalyzer.analyze({
            projectId: input.projectId,
            runId: run.id,
            parentSourceUrl: doc.finalUrl,
            pageTitle: doc.title,
            sourceType: source.sourceType,
            ...(workspace?.productTruth
              ? {
                  productIdentity: {
                    productName: workspace.productTruth.productName,
                    brand: workspace.productTruth.brand,
                    category: workspace.productTruth.category
                  }
                }
              : {}),
            media: doc.media
          });
          fetchFailures.push(
            ...media.failures.map((message) => "媒体分析：" + message)
          );
          for (const analysis of media.analyses) {
            if (
              analysis.mediaContext.productIdentityMatch &&
              analysis.mediaContext.productIdentityMatch !== "CONFIRMED"
            ) {
              fetchFailures.push(
                "媒体分析：" +
                  analysis.sourceUrl +
                  " 产品身份未确认，未进入主 Evidence"
              );
              continue;
            }
            const mediaEvidence = await this.repo.createEvidence({
              id: randomUUID(),
              projectId: input.projectId,
              runId: run.id,
              sourceUrl: analysis.sourceUrl,
              title: analysis.title,
              fetchedAt: new Date().toISOString(),
              sourceType: source.sourceType,
              excerpt: analysis.text.slice(0, 4000),
              summary: evidenceSummary(analysis.text),
              contentHash: analysis.contentHash,
              confidence: analysis.confidence,
              mediaContext: analysis.mediaContext,
              relatedClaims: [],
              status: "ACTIVE",
              createdAt: new Date().toISOString()
            });
            evidence.push(mediaEvidence);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        if (discoveryAudit) discoveryAudit.fetchOutcome = "FAILED";
        fetchFailures.push(source.url + "：" + message);
      }
    }

    if (discoveryRounds.length && run.browserState) {
      run = await this.repo.updateRun(run.id, {
        browserState: {
          ...run.browserState,
          lastCheckedAt: new Date().toISOString(),
          discoveryRounds
        }
      });
    }

    let brief: ResearchBrief | undefined;
    if (evidence.length) {
      brief = await this.generateBrief(
        run,
        evidence,
        fetchFailures
      );
    }

    if (browserBlocked) {
      run = await this.repo.updateRun(run.id, {
        status: "BLOCKED",
        blockerCode: browserBlocked.blockerCode,
        blockerMessage: browserBlocked.message,
        requiredUserAction: browserBlocked.requiredUserAction,
        ...(browserBlocked.browserState
          ? { browserState: browserBlocked.browserState }
          : {})
      });
    } else if (evidence.length) {
      run = await this.repo.updateRun(run.id, {
        status: "COMPLETED",
        blockerCode: undefined,
        blockerMessage: undefined,
        requiredUserAction: undefined
      });
    } else {
      run = await this.repo.updateRun(run.id, {
        status: "FAILED",
        blockerCode: "NO_EVIDENCE",
        blockerMessage:
          fetchFailures.join("；") || "没有获取到可用证据",
        requiredUserAction:
          "检查来源 URL 或研究关键词后重新运行。"
      });
    }

    return {
      run,
      evidence,
      ...(brief ? { brief } : {})
    };
  }

  async resumeRun(projectId: string, runId: string): Promise<{
    run: ResearchRun;
    evidence: ResearchEvidence[];
    brief?: ResearchBrief;
  }> {
    let run = await this.repo.findRun(runId);
    if (!run) throw new DomainValidationError("研究任务不存在");
    if (run.projectId !== projectId) {
      throw new DomainValidationError("研究任务不属于当前项目");
    }
    if (run.mode !== "DEEP" || run.status !== "BLOCKED") {
      throw new DomainValidationError("当前研究任务不需要浏览器接管恢复");
    }

    const result = await this.browserProvider.discover({
      projectId: run.projectId,
      goal: run.goal,
      queries: run.queries,
      resumeToken: run.browserState?.resumeToken
    });
    if (result.status === "BLOCKED") {
      run = await this.repo.updateRun(run.id, {
        status: "BLOCKED",
        blockerCode: result.blockerCode,
        blockerMessage: result.message,
        requiredUserAction: result.requiredUserAction,
        browserState: {
          provider:
            result.browserState?.provider ??
            run.browserState?.provider ??
            this.browserProvider.id,
          ...(result.browserState?.resumeToken
            ? { resumeToken: result.browserState.resumeToken }
            : run.browserState?.resumeToken
              ? { resumeToken: run.browserState.resumeToken }
              : {}),
          lastCheckedAt: new Date().toISOString(),
          ...(run.browserState?.discoveryRounds
            ? { discoveryRounds: run.browserState.discoveryRounds }
            : {})
        }
      });
      return {
        run,
        evidence: await this.repo.listEvidence(run.id),
        ...(await this.repo.findBriefByRun(run.id)
          ? { brief: (await this.repo.findBriefByRun(run.id))! }
          : {})
      };
    }

    const workspace = await this.productFlow.getWorkspace(run.projectId);
    const identity: ResearchIdentity = {
      productName: workspace?.productTruth?.productName,
      brand: workspace?.productTruth?.brand,
      category: workspace?.productTruth?.category
    };
    const semanticScores = await this.semanticRerankScores({
      projectId: run.projectId,
      sources: result.sources,
      identity,
      goal: run.goal
    });
    const previousRounds = run.browserState?.discoveryRounds ?? [];
    const selection = discoveredSourceSelection({
      sources: result.sources,
      identity,
      round: previousRounds.length + 1,
      queries: run.queries,
      semanticScores
    });
    const discoveryRounds = [...previousRounds, selection.audit];
    const trustedSourceUrls = new Set(
      run.sourceUrls.map((item) => item.url)
    );
    const existing = await this.repo.listEvidence(run.id);
    const existingUrls = new Set(
      existing.map((item) => item.sourceUrl)
    );
    const fetchFailures: string[] = [];
    for (const source of selection.selected) {
      if (existingUrls.has(source.url)) continue;
      const discoveryAudit = selection.audit.candidates.find(
        (candidate) => candidate.url === source.url
      );
      try {
        const doc = await this.webProvider.fetchSource(source);
        const fetchedIdentity =
          workspace?.productTruth && !trustedSourceUrls.has(source.url)
            ? fetchedDocumentMatchesIdentity({
                finalUrl: doc.finalUrl,
                title: doc.title,
                text: doc.text,
                identity
              })
            : undefined;
        if (
          !trustedSourceUrls.has(source.url) &&
          (source.sourceType === "OFFICIAL" ||
            source.sourceType === "PUBLIC_PRODUCT" ||
            source.sourceType === "INDUSTRY" ||
            source.sourceType === "PLATFORM") &&
          fetchedIdentity &&
          !fetchedIdentity.matched
        ) {
          if (discoveryAudit) {
            discoveryAudit.fetchedIdentityScore = fetchedIdentity.score;
            discoveryAudit.fetchedIdentityMatched = false;
            discoveryAudit.fetchOutcome = "REJECTED";
            discoveryAudit.reasons.push(
              "恢复后抓取正文仍未命中当前产品身份，未进入 Evidence"
            );
          }
          fetchFailures.push(
            source.url + "：来源正文与当前产品身份不匹配，已跳过"
          );
          continue;
        }
        if (discoveryAudit && fetchedIdentity) {
          discoveryAudit.fetchedIdentityScore = fetchedIdentity.score;
          discoveryAudit.fetchedIdentityMatched = fetchedIdentity.matched;
        }
        await this.repo.createEvidence({
          id: randomUUID(),
          projectId: run.projectId,
          runId: run.id,
          sourceUrl: doc.finalUrl,
          title: doc.title,
          fetchedAt: doc.fetchedAt,
          sourceType: source.sourceType,
          excerpt: doc.excerpt,
          summary: evidenceSummary(doc.text),
          contentHash: doc.contentHash,
          confidence: confidenceForSource(source.sourceType),
          relatedClaims: [],
          status: "ACTIVE",
          createdAt: new Date().toISOString()
        });
        if (discoveryAudit) discoveryAudit.fetchOutcome = "EVIDENCE";
        if (this.mediaAnalyzer && doc.media?.length) {
          const media = await this.mediaAnalyzer.analyze({
            projectId: run.projectId,
            runId: run.id,
            parentSourceUrl: doc.finalUrl,
            pageTitle: doc.title,
            sourceType: source.sourceType,
            ...(workspace?.productTruth
              ? {
                  productIdentity: {
                    productName: workspace.productTruth.productName,
                    brand: workspace.productTruth.brand,
                    category: workspace.productTruth.category
                  }
                }
              : {}),
            media: doc.media
          });
          fetchFailures.push(
            ...media.failures.map((message) => "媒体分析：" + message)
          );
          for (const analysis of media.analyses) {
            if (
              analysis.mediaContext.productIdentityMatch &&
              analysis.mediaContext.productIdentityMatch !== "CONFIRMED"
            ) {
              fetchFailures.push(
                "媒体分析：" +
                  analysis.sourceUrl +
                  " 产品身份未确认，未进入主 Evidence"
              );
              continue;
            }
            await this.repo.createEvidence({
              id: randomUUID(),
              projectId: run.projectId,
              runId: run.id,
              sourceUrl: analysis.sourceUrl,
              title: analysis.title,
              fetchedAt: new Date().toISOString(),
              sourceType: source.sourceType,
              excerpt: analysis.text.slice(0, 4000),
              summary: evidenceSummary(analysis.text),
              contentHash: analysis.contentHash,
              confidence: analysis.confidence,
              mediaContext: analysis.mediaContext,
              relatedClaims: [],
              status: "ACTIVE",
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        if (discoveryAudit) discoveryAudit.fetchOutcome = "FAILED";
        fetchFailures.push(
          source.url +
            "：" +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }
    const evidence = await this.repo.listEvidence(run.id);
    const brief = evidence.length
      ? await this.generateBrief(run, evidence, fetchFailures)
      : undefined;
    run = await this.repo.updateRun(run.id, {
      status: evidence.length ? "COMPLETED" : "FAILED",
      blockerCode: undefined,
      blockerMessage: undefined,
      requiredUserAction: undefined,
      browserState: {
        provider:
          result.browserState?.provider ??
          this.browserProvider.id,
        ...(result.browserState?.resumeToken
          ? { resumeToken: result.browserState.resumeToken }
          : {}),
        lastCheckedAt: new Date().toISOString(),
        discoveryRounds
      }
    });
    return {
      run,
      evidence,
      ...(brief ? { brief } : {})
    };
  }

  async pageData(projectId: string): Promise<{
    runs: ResearchRun[];
    latestRun?: ResearchRun;
    evidence: ResearchEvidence[];
    brief?: ResearchBrief;
  }> {
    const runs = await this.repo.listRuns(projectId);
    const latestRun = runs[0];
    const evidence = latestRun
      ? await this.repo.listEvidence(latestRun.id)
      : [];
    const brief = await this.repo.latestBrief(projectId);
    return {
      runs,
      ...(latestRun ? { latestRun } : {}),
      evidence,
      ...(brief ? { brief } : {})
    };
  }

  async sendClaimsToProductTruth(input: {
    projectId: string;
    briefId: string;
    claimIds: string[];
    usageRuleIds?: string[];
  }): Promise<{
    brief: ResearchBrief;
    productTruthId: string;
  }> {
    const brief = await this.repo.findBrief(input.briefId);
    if (!brief || brief.projectId !== input.projectId) {
      throw new DomainValidationError("研究报告不存在");
    }
    if (brief.status !== "READY") {
      throw new DomainValidationError("研究报告已失效");
    }

    const claimIds = new Set(uniqueStrings(input.claimIds));
    const usageRuleIds = new Set(uniqueStrings(input.usageRuleIds ?? []));
    if (!claimIds.size && !usageRuleIds.size) {
      throw new DomainValidationError(
        "至少选择 1 条研究候选事实或产品使用规则"
      );
    }

    const selected = brief.candidateClaims.filter(
      (claim) =>
        claimIds.has(claim.id) &&
        claim.status === "PROPOSED"
    );
    if (selected.length !== claimIds.size) {
      throw new DomainValidationError(
        "包含不存在、已处理或失效的研究候选事实"
      );
    }
    const selectedUsageRules = brief.usageRules.filter(
      (rule) =>
        usageRuleIds.has(rule.id) &&
        rule.status === "PROPOSED"
    );
    if (selectedUsageRules.length !== usageRuleIds.size) {
      throw new DomainValidationError(
        "包含不存在、已处理或失效的产品使用规则"
      );
    }

    const evidence = await this.repo.listEvidence(brief.runId);
    const evidenceById = new Map(
      evidence.map((item) => [item.id, item])
    );
    for (const claim of selected) {
      if (
        claim.evidenceIds.length === 0 ||
        claim.evidenceIds.some((id) => !evidenceById.has(id))
      ) {
        throw new DomainValidationError(
          "研究候选事实缺少可追溯的研究证据"
        );
      }
    }
    for (const rule of selectedUsageRules) {
      if (
        rule.evidenceIds.length === 0 ||
        rule.evidenceIds.some((id) => !evidenceById.has(id))
      ) {
        throw new DomainValidationError(
          "产品使用规则缺少可追溯的研究证据"
        );
      }
    }

    const workspace =
      await this.productFlow.getWorkspace(input.projectId);
    if (!workspace?.productTruth) {
      throw new DomainValidationError(
        "请先生成产品事实，再把研究结果送入事实审核"
      );
    }
    const current = productTruthSchema.parse(workspace.productTruth);
    const version = await this.productFlow.nextVersion(
      input.projectId,
      "ProductTruth",
      "product-truth"
    );

    const researchClaims = selected.map((claim) => ({
      id: randomUUID(),
      statement: claim.statement,
      reason:
        "Research Evidence 候选；只有用户在 Product Truth Review 明确选择“提升为事实”后才能成为 ProductFact。",
      sourceType: "research" as const,
      evidenceRefs: claim.evidenceIds.map(
        (id) => "research-evidence:" + id
      ),
      status: "UNVERIFIED" as const,
      dispositionConfirmedByUser: false
    }));
    const researchUsageRules = selectedUsageRules.map((rule) => ({
      id: randomUUID(),
      category: rule.category,
      polarity: rule.polarity,
      statement: rule.statement,
      sourceType: "research" as const,
      evidenceRefs: rule.evidenceIds.map(
        (id) => "research-evidence:" + id
      ),
      confidence: rule.confidence,
      status: "UNVERIFIED" as const,
      dispositionConfirmedByUser: false
    }));

    const selectedEvidenceIds = [
      ...selected.flatMap((item) => item.evidenceIds),
      ...selectedUsageRules.flatMap((item) => item.evidenceIds)
    ];
    const evidenceRefs = [
      ...current.evidenceRefs,
      ...selectedEvidenceIds.map((id) => {
        const item = evidenceById.get(id)!;
        return (
          "research-evidence:" +
          item.id +
          "#" +
          item.contentHash
        );
      })
    ];

    const base: Record<string, unknown> = {
      ...structuredClone(current),
      id: randomUUID(),
      version,
      status: "DRAFT",
      uncertainClaims: [
        ...current.uncertainClaims,
        ...researchClaims
      ],
      usageRules: [
        ...(current.usageRules ?? []),
        ...researchUsageRules
      ],
      evidenceRefs: uniqueStrings(evidenceRefs)
    };
    delete base.contentHash;
    delete base.confirmedAt;
    delete base.aiExecution;
    const draft = productTruthSchema.parse({
      ...base,
      contentHash: researchTruthHash(base)
    });
    await this.productFlow.saveProductTruthDraft(draft);

    const updatedClaims: ResearchCandidateClaim[] =
      brief.candidateClaims.map((claim) =>
        claimIds.has(claim.id)
          ? { ...claim, status: "SENT_TO_TRUTH" }
          : claim
      );
    const updatedBrief = await this.repo.updateBriefClaims(
      brief.id,
      updatedClaims
    );
    const updatedUsageRules: ResearchUsageRule[] =
      updatedBrief.usageRules.map((rule) =>
        usageRuleIds.has(rule.id)
          ? { ...rule, status: "SENT_TO_TRUTH" }
          : rule
      );
    const finalBrief = await this.repo.updateBriefUsageRules(
      brief.id,
      updatedUsageRules
    );
    return {
      brief: finalBrief,
      productTruthId: draft.id
    };
  }

  private async generateBrief(
    run: ResearchRun,
    evidence: ResearchEvidence[],
    fetchFailures: string[]
  ): Promise<ResearchBrief> {
    const evidenceIds = new Set(evidence.map((item) => item.id));
    const workspace = await this.productFlow.getWorkspace(run.projectId);
    const currentTruth = workspace?.productTruth
      ? productTruthSchema.parse(workspace.productTruth)
      : undefined;
    const materialFailures = fetchFailures
      .filter(
        (item) =>
          !item.includes("来源正文与当前产品身份不匹配，已跳过")
      )
      .slice(0, 12);
    const generation = await generateStructuredJson(this.runtime, {
      task:
        "Create a sourced ResearchBrief for product-video planning from the supplied Evidence only.",
      instructions: [
        "Every finding, candidateClaim and usageRule must cite one or more evidenceIds from the supplied Evidence.",
        "Do not introduce factual product claims that are absent from the excerpts.",
        "A candidateClaim is only a proposal for Product Truth review; it is never automatically a ProductFact.",
        "Extract product usage rules with special attention to: correct usage method, wearing/install position, precautions and limitations, function effect, valid usage scenarios and required product state.",
        "Use MUST when the evidence requires a particular action/state, MUST_NOT for prohibited or unsafe/invalid use, and CONTEXT for scenario/applicability boundaries.",
        "Prefer official/manual/support evidence for usage rules. Competitor, trend or generic-category material must never become a usage rule for the user's product.",
        "currentProductTruth is conflict-checking context only and is not a Research Evidence source. Do not cite it through evidenceIds and do not create new research findings solely from it.",
        "If a media Evidence has mediaContext.productIdentityMatch other than CONFIRMED, it must not be the sole support for a ProductFact candidate or a hard usage rule.",
        "If a visual/media observation conflicts with currentProductTruth confirmed product identity or confirmed usage rules, put the conflict in uncertainties and do not promote that observation into a usage rule.",
        "If a usage instruction is ambiguous, marketing-only or conflicts across evidence, do not make it a high-confidence hard rule; lower confidence and explain the conflict in uncertainties.",
        "Clearly separate factual findings, content opportunities and uncertainty.",
        "Do not treat competitor claims, trend opinions or marketing copy as facts about the user's product.",
        "If evidence conflicts or is weak, lower confidence and explain it in uncertainties."
      ].join(" "),
      input: {
        goal: run.goal,
        mode: run.mode,
        currentProductTruth: currentTruth
          ? {
              productName: currentTruth.productName,
              brand: currentTruth.brand,
              category: currentTruth.category,
              confirmedFacts: [
                ...currentTruth.confirmedFeatures,
                ...currentTruth.sellingPoints
              ].map((fact) => ({
                id: fact.id,
                statement: fact.statement
              })),
              confirmedUsageRules: (currentTruth.usageRules ?? [])
                .filter((rule) => rule.status === "CONFIRMED")
                .map((rule) => ({
                  id: rule.id,
                  category: rule.category,
                  polarity: rule.polarity,
                  statement: rule.statement
                }))
            }
          : null,
        evidence: evidence.map((item) => ({
          id: item.id,
          sourceUrl: item.sourceUrl,
          title: item.title,
          sourceType: item.sourceType,
          fetchedAt: item.fetchedAt,
          confidence: item.confidence,
          contentHash: item.contentHash,
          excerpt: item.excerpt,
          mediaContext: item.mediaContext
        })),
        fetchFailures: materialFailures
      },
      outputContract: {
        summary: "string",
        findings: [
          {
            statement: "string",
            evidenceIds: ["evidence-id"],
            confidence: "LOW|MEDIUM|HIGH"
          }
        ],
        candidateClaims: [
          {
            statement: "string",
            evidenceIds: ["evidence-id"],
            confidence: "LOW|MEDIUM|HIGH"
          }
        ],
        usageRules: [
          {
            category:
              "USAGE_METHOD|WEARING_POSITION|PRECAUTION|FUNCTION_EFFECT|USAGE_SCENARIO|PRODUCT_STATE|LIMITATION",
            polarity: "MUST|MUST_NOT|CONTEXT",
            statement: "string",
            evidenceIds: ["evidence-id"],
            confidence: "LOW|MEDIUM|HIGH"
          }
        ],
        contentOpportunities: ["string"],
        uncertainties: ["string"]
      },
      context: {
        projectId: run.projectId,
        step: "RESEARCH"
      }
    });
    const proposal = briefProposalSchema.parse(generation.data);
    const validateRefs = (
      refs: string[],
      label: string
    ): void => {
      for (const id of refs) {
        if (!evidenceIds.has(id)) {
          throw new DomainValidationError(
            label + " 引用了不存在的 Evidence：" + id
          );
        }
      }
    };
    proposal.findings.forEach((item) =>
      validateRefs(item.evidenceIds, "Research finding")
    );
    proposal.candidateClaims.forEach((item) =>
      validateRefs(item.evidenceIds, "Research candidate")
    );
    proposal.usageRules.forEach((item) =>
      validateRefs(item.evidenceIds, "Research usage rule")
    );

    const evidenceByIdForIdentity = new Map(
      evidence.map((item) => [item.id, item])
    );
    const hasIdentitySafeSupport = (refs: string[]): boolean =>
      refs.some((id) => {
        const item = evidenceByIdForIdentity.get(id);
        if (!item) return false;
        if (!item.mediaContext) return true;
        return item.mediaContext.productIdentityMatch === "CONFIRMED";
      });
    const unsafeIdentityNotes: string[] = [];
    const safeCandidateClaims = proposal.candidateClaims.filter((item) => {
      const safe = hasIdentitySafeSupport(item.evidenceIds);
      if (!safe) {
        unsafeIdentityNotes.push(
          "候选事实仅由产品身份未确认的媒体证据支持，已降级为不确定项：" +
            item.statement
        );
      }
      return safe;
    });
    const safeUsageRules = proposal.usageRules.filter((item) => {
      const safe = hasIdentitySafeSupport(item.evidenceIds);
      if (!safe) {
        unsafeIdentityNotes.push(
          "产品使用规则仅由产品身份未确认的媒体证据支持，已阻止进入规则候选：" +
            item.statement
        );
      }
      return safe;
    });

    const findings = proposal.findings.map((item) => ({
      id: randomUUID(),
      ...item
    }));
    const candidateClaims: ResearchCandidateClaim[] =
      safeCandidateClaims.map((item) => ({
        id: randomUUID(),
        ...item,
        status: "PROPOSED"
      }));
    const usageRules: ResearchUsageRule[] = safeUsageRules.map(
      (item) => ({
        id: randomUUID(),
        ...item,
        status: "PROPOSED"
      })
    );

    const relatedByEvidence = new Map<string, string[]>();
    for (const item of [...findings, ...candidateClaims, ...usageRules]) {
      for (const evidenceId of item.evidenceIds) {
        const values = relatedByEvidence.get(evidenceId) ?? [];
        values.push(item.id);
        relatedByEvidence.set(evidenceId, values);
      }
    }
    await Promise.all(
      [...relatedByEvidence.entries()].map(
        ([evidenceId, claims]) =>
          this.repo.updateEvidenceRelatedClaims(
            evidenceId,
            uniqueStrings(claims)
          )
      )
    );

    const createdAt = new Date().toISOString();
    const withoutHash = {
      id: randomUUID(),
      projectId: run.projectId,
      runId: run.id,
      status: "READY" as const,
      summary: proposal.summary,
      findings,
      candidateClaims,
      usageRules,
      contentOpportunities: proposal.contentOpportunities,
      uncertainties: [
        ...proposal.uncertainties,
        ...unsafeIdentityNotes,
        ...materialFailures.map(
          (item) => "来源抓取失败：" + item
        )
      ],
      ...(generation.metadata
        ? { aiExecution: generation.metadata }
        : {}),
      createdAt
    };
    const brief: ResearchBrief = {
      ...withoutHash,
      contentHash: hashValue(withoutHash)
    };
    return this.repo.createBrief(brief);
  }
}
