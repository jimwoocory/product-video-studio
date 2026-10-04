import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type {
  BrowserResearchProvider,
  BrowserResearchResult,
  WebResearchDocument,
  WebResearchProvider,
  WebResearchSource
} from "../src/application/ports/research-provider.js";
import type {
  ResearchBrief,
  ResearchCandidateClaim,
  ResearchEvidence,
  ResearchRepository,
  ResearchRun,
  ResearchUsageRule
} from "../src/application/ports/research-repository.js";
import type {
  StructuredAiRequest,
  StructuredAiRuntime
} from "../src/application/ports/structured-ai-runtime.js";
import type { ProductFlowService } from "../src/application/services/product-flow.js";
import { ResearchService } from "../src/application/services/research-service.js";
import { HttpWebResearchProvider } from "../src/adapters/research/http-web-research-provider.js";
import { confirmProductTruthDraft } from "../src/application/services/review-actions.js";
import { makeProductTruth } from "./fixtures.js";
import type { ProductTruth, Project } from "../src/domain/schemas.js";
import { hashValue } from "../src/domain/hashing.js";

class MemoryResearchRepository implements ResearchRepository {
  readonly runs = new Map<string, ResearchRun>();
  readonly evidence = new Map<string, ResearchEvidence>();
  readonly briefs = new Map<string, ResearchBrief>();

  async createRun(run: ResearchRun): Promise<ResearchRun> {
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  async updateRun(
    id: string,
    update: Partial<
      Pick<
        ResearchRun,
        | "status"
        | "browserState"
        | "blockerCode"
        | "blockerMessage"
        | "requiredUserAction"
      >
    >
  ): Promise<ResearchRun> {
    const current = this.runs.get(id);
    if (!current) throw new Error("missing run");
    const next = {
      ...current,
      ...structuredClone(update),
      updatedAt: new Date().toISOString()
    } as ResearchRun;
    this.runs.set(id, next);
    return structuredClone(next);
  }

  async findRun(id: string): Promise<ResearchRun | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async listRuns(projectId: string): Promise<ResearchRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((run) => structuredClone(run));
  }

  async createEvidence(
    evidence: ResearchEvidence
  ): Promise<ResearchEvidence> {
    this.evidence.set(evidence.id, structuredClone(evidence));
    return structuredClone(evidence);
  }

  async updateEvidenceRelatedClaims(
    id: string,
    relatedClaims: string[]
  ): Promise<ResearchEvidence> {
    const current = this.evidence.get(id);
    if (!current) throw new Error("missing evidence");
    const next = {
      ...current,
      relatedClaims: structuredClone(relatedClaims)
    };
    this.evidence.set(id, next);
    return structuredClone(next);
  }

  async listEvidence(runId: string): Promise<ResearchEvidence[]> {
    return [...this.evidence.values()]
      .filter((item) => item.runId === runId)
      .map((item) => structuredClone(item));
  }

  async createBrief(brief: ResearchBrief): Promise<ResearchBrief> {
    for (const current of this.briefs.values()) {
      if (
        current.projectId === brief.projectId &&
        current.status === "READY"
      ) {
        current.status = "STALE";
      }
    }
    this.briefs.set(brief.id, structuredClone(brief));
    return structuredClone(brief);
  }

  async updateBriefClaims(
    id: string,
    claims: ResearchCandidateClaim[]
  ): Promise<ResearchBrief> {
    const current = this.briefs.get(id);
    if (!current) throw new Error("missing brief");
    const next = {
      ...current,
      candidateClaims: structuredClone(claims)
    };
    this.briefs.set(id, next);
    return structuredClone(next);
  }

  async updateBriefUsageRules(
    id: string,
    usageRules: ResearchUsageRule[]
  ): Promise<ResearchBrief> {
    const current = this.briefs.get(id);
    if (!current) throw new Error("missing brief");
    const next = {
      ...current,
      usageRules: structuredClone(usageRules)
    };
    this.briefs.set(id, next);
    return structuredClone(next);
  }

  async findBrief(id: string): Promise<ResearchBrief | null> {
    const brief = this.briefs.get(id);
    return brief ? structuredClone(brief) : null;
  }

  async latestBrief(
    projectId: string
  ): Promise<ResearchBrief | null> {
    return (
      [...this.briefs.values()]
        .filter(
          (item) =>
            item.projectId === projectId && item.status === "READY"
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null
    );
  }

  async findBriefByRun(
    runId: string
  ): Promise<ResearchBrief | null> {
    return (
      [...this.briefs.values()]
        .filter((item) => item.runId === runId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null
    );
  }

  async listBriefs(projectId: string): Promise<ResearchBrief[]> {
    return [...this.briefs.values()]
      .filter((item) => item.projectId === projectId)
      .map((item) => structuredClone(item));
  }
}

class MemoryWebResearchProvider implements WebResearchProvider {
  readonly seen: WebResearchSource[] = [];
  constructor(
    private readonly documents: Record<string, string> = {}
  ) {}

  async fetchSource(
    source: WebResearchSource
  ): Promise<WebResearchDocument> {
    this.seen.push(structuredClone(source));
    const text =
      this.documents[source.url] ??
      "Official product page states the device supports 4K input and USB-C connectivity.";
    return {
      sourceUrl: source.url,
      finalUrl: source.url,
      title: "Source " + source.url,
      fetchedAt: "2026-09-29T01:00:00.000Z",
      sourceType: source.sourceType,
      text,
      excerpt: text,
      contentHash: hashValue(text)
    };
  }
}

class EvidenceBoundRuntime implements StructuredAiRuntime {
  readonly id = "research-runtime";
  readonly version = "1";
  readonly requests: StructuredAiRequest[] = [];

  async generateJson(request: StructuredAiRequest): Promise<unknown> {
    this.requests.push(request);
    return this.result(request);
  }

  async generateJsonWithMetadata(request: StructuredAiRequest) {
    this.requests.push(request);
    return {
      data: this.result(request),
      metadata: {
        executionId: "research-execution",
        providerId: "research-provider",
        modelId: "research-model",
        configVersion: 4
      }
    };
  }

  private result(request: StructuredAiRequest) {
    const evidence = (
      request.input as {
        evidence: Array<{ id: string }>;
      }
    ).evidence;
    const first = evidence[0]!.id;
    return {
      summary: "公开来源支持一个可审核的研究摘要。",
      findings: [
        {
          statement: "公开页面提到支持 4K input。",
          evidenceIds: [first],
          confidence: "HIGH"
        }
      ],
      candidateClaims: [
        {
          statement: "产品支持 4K input。",
          evidenceIds: [first],
          confidence: "HIGH"
        }
      ],
      contentOpportunities: ["用 4K input 作为演示主题"],
      uncertainties: ["仍需用户确认该公开页面对应当前具体 SKU"]
    };
  }
}

class RerankAwareRuntime implements StructuredAiRuntime {
  readonly id = "rerank-runtime";
  readonly version = "1";

  async generateJson(request: StructuredAiRequest): Promise<unknown> {
    if (request.task.startsWith("Rank public-search candidates")) {
      const candidates = (
        request.input as {
          candidates: Array<{ candidateId: string; url: string }>;
        }
      ).candidates;
      return {
        candidates: candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          relevanceScore: 100,
          reason: "fixture semantic relevance"
        }))
      };
    }
    const evidence = (
      request.input as { evidence: Array<{ id: string }> }
    ).evidence;
    return {
      summary: "语义重排后的来源可用于研究。",
      findings: evidence.length
        ? [
            {
              statement: "相关来源已通过质量门禁。",
              evidenceIds: [evidence[0]!.id],
              confidence: "MEDIUM"
            }
          ]
        : [],
      candidateClaims: [],
      usageRules: [],
      contentOpportunities: [],
      uncertainties: []
    };
  }
}

class UnsourcedRuntime implements StructuredAiRuntime {
  readonly id = "unsourced";
  readonly version = "1";
  async generateJson(request: StructuredAiRequest): Promise<unknown> {
    const evidence = (
      request.input as { evidence: Array<{ id: string }> }
    ).evidence;
    return {
      summary: "bad",
      findings: [
        {
          statement: "bad finding",
          evidenceIds: [evidence[0]!.id],
          confidence: "LOW"
        }
      ],
      candidateClaims: [
        {
          statement: "unsupported candidate",
          evidenceIds: ["evidence-does-not-exist"],
          confidence: "HIGH"
        }
      ],
      contentOpportunities: [],
      uncertainties: []
    };
  }
}

class StaticBrowserProvider implements BrowserResearchProvider {
  readonly id = "browser-test";
  calls = 0;
  readonly inputs: Array<{
    projectId: string;
    goal: string;
    queries: string[];
    resumeToken?: string;
  }> = [];
  constructor(
    private readonly first: BrowserResearchResult,
    private readonly second?: BrowserResearchResult
  ) {}
  async discover(input: {
    projectId: string;
    goal: string;
    queries: string[];
    resumeToken?: string;
  }): Promise<BrowserResearchResult> {
    this.calls += 1;
    this.inputs.push(structuredClone(input));
    return structuredClone(
      this.calls === 1 || !this.second ? this.first : this.second
    );
  }
}

class UsageRuleRuntime implements StructuredAiRuntime {
  readonly id = "usage-rule-runtime";
  readonly version = "1";
  async generateJson(request: StructuredAiRequest): Promise<unknown> {
    const evidence = (
      request.input as { evidence: Array<{ id: string }> }
    ).evidence;
    const first = evidence[0]!.id;
    return {
      summary: "官方资料给出了明确的佩戴与使用限制。",
      findings: [],
      candidateClaims: [],
      usageRules: [
        {
          category: "WEARING_POSITION",
          polarity: "MUST",
          statement: "耳夹应佩戴在耳廓指定夹持位置，不应塞入耳道。",
          evidenceIds: [first],
          confidence: "HIGH"
        }
      ],
      contentOpportunities: [],
      uncertainties: []
    };
  }
}

function makeProductFlow(projectId: string) {
  const project: Project = {
    id: projectId,
    name: "Research Project",
    status: "PRODUCT_TRUTH_REVIEW",
    targetPlatform: "douyin",
    targetDurationMs: 30000,
    aspectRatio: "9:16",
    createdAt: "2026-09-29T01:00:00.000Z",
    updatedAt: "2026-09-29T01:00:00.000Z"
  };
  const initial = makeProductTruth();
  const truth: ProductTruth = {
    ...initial,
    projectId,
    uncertainClaims: []
  };
  let currentTruth = structuredClone(truth);
  let savedDraft: ProductTruth | undefined;
  return {
    flow: {
      async getProject(id: string) {
        return id === projectId ? structuredClone(project) : null;
      },
      async getWorkspace(id: string) {
        if (id !== projectId) return null;
        return {
          project: structuredClone(project),
          productTruth: structuredClone(currentTruth)
        };
      },
      async nextVersion() {
        return currentTruth.version + 1;
      },
      async saveProductTruthDraft(draft: ProductTruth) {
        savedDraft = structuredClone(draft);
        currentTruth = structuredClone(draft);
        return structuredClone(project);
      }
    } as unknown as ProductFlowService,
    getSavedDraft: () =>
      savedDraft ? structuredClone(savedDraft) : undefined
  };
}

test("HttpWebResearchProvider extracts text/title/hash from an explicitly allowed local HTML source", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<html><head><title>Official Product</title><style>bad</style></head><body><h1>Feature</h1><p>Supports USB-C and 4K input for public product documentation.</p><script>bad()</script></body></html>"
    );
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve)
  );
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("bad address");
    const url = `http://127.0.0.1:${address.port}/product`;
    const provider = new HttpWebResearchProvider({
      allowPrivateNetwork: true,
      timeoutMs: 5000
    });
    const doc = await provider.fetchSource({
      url,
      sourceType: "OFFICIAL"
    });
    assert.equal(doc.title, "Official Product");
    assert.match(doc.text, /Supports USB-C and 4K input/);
    assert.doesNotMatch(doc.text, /bad\(\)/);
    assert.equal(doc.contentHash.length, 64);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("HttpWebResearchProvider blocks loopback/private addresses by default", async () => {
  const provider = new HttpWebResearchProvider();
  await assert.rejects(
    provider.fetchSource({
      url: "http://127.0.0.1:9876/private",
      sourceType: "USER_URL"
    }),
    /私有网络/
  );
});

test("basic Research persists Evidence, produces a sourced ResearchBrief, and records actual AI model metadata", async () => {
  const projectId = "research-basic";
  const repo = new MemoryResearchRepository();
  const web = new MemoryWebResearchProvider();
  const runtime = new EvidenceBoundRuntime();
  const { flow } = makeProductFlow(projectId);
  const browser = new StaticBrowserProvider({
    status: "BLOCKED",
    blockerCode: "BROWSER_PROVIDER_NOT_CONFIGURED",
    message: "not configured",
    requiredUserAction: "connect browser"
  });
  const service = new ResearchService(
    repo,
    web,
    browser,
    runtime,
    flow
  );
  const result = await service.startRun({
    projectId,
    mode: "BASIC",
    goal: "核实产品公开信息",
    sourceUrls: [
      {
        url: "https://example.com/product",
        sourceType: "OFFICIAL"
      }
    ],
    queries: []
  });

  assert.equal(result.run.status, "COMPLETED");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.sourceType, "OFFICIAL");
  assert.equal(result.evidence[0]?.confidence, "HIGH");
  assert.equal(result.evidence[0]?.contentHash.length, 64);
  assert.equal(result.brief?.candidateClaims.length, 1);
  assert.equal(
    result.brief?.candidateClaims[0]?.evidenceIds[0],
    result.evidence[0]?.id
  );
  assert.deepEqual(result.brief?.aiExecution, {
    executionId: "research-execution",
    providerId: "research-provider",
    modelId: "research-model",
    configVersion: 4
  });
  assert.equal(browser.calls, 0);
  assert.equal(
    repo.evidence.get(result.evidence[0]!.id)?.relatedClaims.length,
    2
  );
});

test("ResearchBrief generation fails closed when AI cites a nonexistent Evidence id", async () => {
  const projectId = "research-unsourced";
  const repo = new MemoryResearchRepository();
  const { flow } = makeProductFlow(projectId);
  const service = new ResearchService(
    repo,
    new MemoryWebResearchProvider(),
    new StaticBrowserProvider({
      status: "BLOCKED",
      blockerCode: "BROWSER_PROVIDER_NOT_CONFIGURED",
      message: "not configured",
      requiredUserAction: "connect browser"
    }),
    new UnsourcedRuntime(),
    flow
  );

  await assert.rejects(
    service.startRun({
      projectId,
      mode: "BASIC",
      goal: "research",
      sourceUrls: [
        {
          url: "https://example.com/product",
          sourceType: "OFFICIAL"
        }
      ],
      queries: []
    }),
    /不存在的 Evidence/
  );
  assert.equal(repo.briefs.size, 0);
});

test("deep Research persists Human Takeover blocker instead of pretending to keep processing, then resumes", async () => {
  const projectId = "research-deep";
  const repo = new MemoryResearchRepository();
  const { flow } = makeProductFlow(projectId);
  const browser = new StaticBrowserProvider(
    {
      status: "BLOCKED",
      blockerCode: "LOGIN_REQUIRED",
      message: "需要登录目标平台",
      requiredUserAction: "在浏览器完成登录后继续",
      browserState: {
        provider: "browser-test",
        resumeToken: "resume-1"
      }
    },
    {
      status: "READY",
      sources: [
        {
          url: "https://competitor.example.com/item",
          sourceType: "COMPETITOR"
        }
      ],
      browserState: {
        provider: "browser-test",
        resumeToken: "resume-2"
      }
    }
  );
  const service = new ResearchService(
    repo,
    new MemoryWebResearchProvider(),
    browser,
    new EvidenceBoundRuntime(),
    flow
  );
  const first = await service.startRun({
    projectId,
    mode: "DEEP",
    goal: "研究竞品",
    sourceUrls: [
      {
        url: "https://example.com/official",
        sourceType: "OFFICIAL"
      }
    ],
    queries: ["competitor video"]
  });
  assert.equal(first.run.status, "BLOCKED");
  assert.equal(first.run.blockerCode, "LOGIN_REQUIRED");
  assert.match(
    first.run.requiredUserAction ?? "",
    /完成登录/
  );
  assert.equal(first.evidence.length, 1);
  assert.ok(first.brief);

  const resumed = await service.resumeRun(projectId, first.run.id);
  assert.equal(resumed.run.status, "COMPLETED");
  assert.equal(resumed.run.blockerCode, undefined);
  assert.equal(resumed.evidence.length, 2);
  assert.equal(browser.calls, 2);
});

test("Research candidate enters Product Truth only as UNVERIFIED, and becomes ProductFact only after explicit user PROMOTE", async () => {
  const projectId = "research-truth";
  const repo = new MemoryResearchRepository();
  const product = makeProductFlow(projectId);
  const service = new ResearchService(
    repo,
    new MemoryWebResearchProvider(),
    new StaticBrowserProvider({
      status: "BLOCKED",
      blockerCode: "BROWSER_PROVIDER_NOT_CONFIGURED",
      message: "not configured",
      requiredUserAction: "connect browser"
    }),
    new EvidenceBoundRuntime(),
    product.flow
  );
  const run = await service.startRun({
    projectId,
    mode: "BASIC",
    goal: "核实产品公开卖点",
    sourceUrls: [
      {
        url: "https://example.com/product",
        sourceType: "OFFICIAL"
      }
    ],
    queries: []
  });
  const brief = run.brief!;
  const candidate = brief.candidateClaims[0]!;
  await service.sendClaimsToProductTruth({
    projectId,
    briefId: brief.id,
    claimIds: [candidate.id]
  });

  const draft = product.getSavedDraft();
  assert.ok(draft);
  assert.equal(draft!.status, "DRAFT");
  const researchClaim = draft!.uncertainClaims.find(
    (claim) => claim.sourceType === "research"
  );
  assert.ok(researchClaim);
  assert.equal(researchClaim!.status, "UNVERIFIED");
  assert.equal(researchClaim!.dispositionConfirmedByUser, false);
  assert.equal(
    draft!.confirmedFeatures.some(
      (fact) => fact.statement === candidate.statement
    ),
    false
  );

  const confirmed = confirmProductTruthDraft(
    draft!,
    Object.fromEntries(
      draft!.uncertainClaims.map((claim) => [
        claim.id,
        claim.id === researchClaim!.id
          ? "PROMOTE"
          : "KEEP_UNVERIFIED"
      ])
    )
  );
  const promoted = confirmed.confirmedFeatures.find(
    (fact) => fact.statement === candidate.statement
  );
  assert.ok(promoted);
  assert.equal(promoted!.sourceType, "external");
  assert.match(promoted!.evidenceRef ?? "", /^research-evidence:/);
});

test("deep Research automatically expands product usage, wearing and precaution queries", async () => {
  const projectId = "research-auto-queries";
  const repo = new MemoryResearchRepository();
  const { flow } = makeProductFlow(projectId);
  const browser = new StaticBrowserProvider({
    status: "BLOCKED",
    blockerCode: "BROWSER_PROVIDER_NOT_CONFIGURED",
    message: "not configured",
    requiredUserAction: "connect browser"
  });
  const service = new ResearchService(
    repo,
    new MemoryWebResearchProvider(),
    browser,
    new EvidenceBoundRuntime(),
    flow
  );

  await service.startRun({
    projectId,
    mode: "DEEP",
    goal: "核实产品的正确使用方式",
    sourceUrls: [],
    queries: []
  });

  const queries = browser.inputs[0]?.queries.join("\n") ?? "";
  assert.match(queries, /说明书 使用说明/);
  assert.match(queries, /使用方法 操作方法/);
  assert.match(queries, /佩戴位置 佩戴方法 安装位置/);
  assert.match(queries, /注意事项 使用限制 防水 充电/);
  assert.match(queries, /功能 作用 使用场景/);
});

test("deep Research rejects unrelated platform homepage before fetch and persists discovery audit", async () => {
  const projectId = "research-quality-gate";
  const repo = new MemoryResearchRepository();
  const { flow } = makeProductFlow(projectId);
  const web = new MemoryWebResearchProvider({
    "https://www.bilibili.com/":
      "动画 游戏 音乐 热门视频，与 Test Product 无关。",
    "https://support.example.com/test-product/manual":
      "Test Product official manual. Feature one is documented for the current product."
  });
  const browser = new StaticBrowserProvider({
    status: "READY",
    sources: [
      {
        url: "https://www.bilibili.com/",
        sourceType: "PLATFORM",
        discoveryQuery: "Test Product 评测",
        discoveryEngine: "bing",
        discoveryRank: 1,
        resultTitle: "哔哩哔哩首页",
        resultSnippet: "动画 游戏 音乐 热门视频"
      },
      {
        url: "https://support.example.com/test-product/manual",
        sourceType: "OFFICIAL",
        discoveryQuery: "Test Product 官网 说明书",
        discoveryEngine: "bing",
        discoveryRank: 1,
        resultTitle: "Test Product Official Manual",
        resultSnippet: "Official support and usage guide for Test Product"
      }
    ],
    browserState: { provider: "browser-test" }
  });
  const service = new ResearchService(
    repo,
    web,
    browser,
    new EvidenceBoundRuntime(),
    flow
  );

  const result = await service.startRun({
    projectId,
    mode: "DEEP",
    goal: "核实 Test Product 的公开资料",
    sourceUrls: [],
    queries: ["Test Product 评测"]
  });

  assert.equal(
    web.seen.some((item) => item.url === "https://www.bilibili.com/"),
    false
  );
  assert.equal(
    web.seen.some(
      (item) =>
        item.url === "https://support.example.com/test-product/manual"
    ),
    true
  );
  assert.equal(
    result.evidence.some((item) => item.sourceUrl === "https://www.bilibili.com/"),
    false
  );
  const round = result.run.browserState?.discoveryRounds?.[0];
  assert.ok(round);
  assert.equal(round!.candidateCount, 2);
  assert.equal(round!.rejectedCount, 1);
  const rejected = round!.candidates.find(
    (item) => item.url === "https://www.bilibili.com/"
  );
  assert.equal(rejected?.decision, "REJECT");
  assert.equal(rejected?.selectedForFetch, false);
  assert.ok(rejected?.reasons.some((item) => item.includes("平台首页")));
});

test("deep Research automatically retries with stronger recovery queries when round one has no accepted candidate", async () => {
  const projectId = "research-quality-recovery";
  const repo = new MemoryResearchRepository();
  const { flow } = makeProductFlow(projectId);
  const web = new MemoryWebResearchProvider({
    "https://support.example.com/test-product/manual":
      "Test Product official manual and usage instructions."
  });
  const browser = new StaticBrowserProvider(
    {
      status: "READY",
      sources: [
        {
          url: "https://www.bilibili.com/",
          sourceType: "PLATFORM",
          discoveryQuery: "Test Product 评测",
          discoveryEngine: "bing",
          discoveryRank: 1,
          resultTitle: "哔哩哔哩首页",
          resultSnippet: "动画 游戏 音乐 热门"
        }
      ],
      browserState: { provider: "browser-test" }
    },
    {
      status: "READY",
      sources: [
        {
          url: "https://support.example.com/test-product/manual",
          sourceType: "OFFICIAL",
          discoveryQuery: "Test Product 官方 说明书 PDF",
          discoveryEngine: "bing",
          discoveryRank: 1,
          resultTitle: "Test Product Official Manual",
          resultSnippet: "Official manual for Test Product"
        }
      ],
      browserState: { provider: "browser-test" }
    }
  );
  const service = new ResearchService(
    repo,
    web,
    browser,
    new EvidenceBoundRuntime(),
    flow
  );

  const result = await service.startRun({
    projectId,
    mode: "DEEP",
    goal: "核实 Test Product 使用方法",
    sourceUrls: [],
    queries: ["Test Product 评测"]
  });

  assert.equal(browser.calls, 2);
  assert.match(browser.inputs[1]?.queries.join("\n") ?? "", /官方 说明书 PDF/);
  assert.equal(result.run.browserState?.discoveryRounds?.length, 2);
  assert.equal(result.run.browserState?.discoveryRounds?.[0]?.acceptedCount, 0);
  assert.equal(result.run.browserState?.discoveryRounds?.[1]?.acceptedCount, 1);
  assert.ok(
    result.evidence.some(
      (item) =>
        item.sourceUrl === "https://support.example.com/test-product/manual"
    )
  );
});

test("semantic rerank can promote a relevant HOLD candidate but never rescues a hard-rejected platform homepage", async () => {
  const projectId = "research-semantic-rerank";
  const repo = new MemoryResearchRepository();
  const { flow } = makeProductFlow(projectId);
  const web = new MemoryWebResearchProvider({
    "https://example.com/test-product-review":
      "Test Product review and usage notes for the current product."
  });
  const browser = new StaticBrowserProvider({
    status: "READY",
    sources: [
      {
        url: "https://www.bilibili.com/",
        sourceType: "PLATFORM",
        discoveryQuery: "Test Product 评测",
        discoveryEngine: "bing",
        discoveryRank: 1,
        resultTitle: "哔哩哔哩首页",
        resultSnippet: "动画 游戏 音乐 热门"
      },
      {
        url: "https://example.com/test-product-review",
        sourceType: "INDUSTRY",
        discoveryQuery: "Test Product 评测",
        discoveryEngine: "bing",
        discoveryRank: 2,
        resultTitle: "Test Product 使用评测",
        resultSnippet: "Test Product 日常使用体验"
      }
    ],
    browserState: { provider: "browser-test" }
  });
  const service = new ResearchService(
    repo,
    web,
    browser,
    new RerankAwareRuntime(),
    flow
  );

  const result = await service.startRun({
    projectId,
    mode: "DEEP",
    goal: "核实 Test Product 使用体验",
    sourceUrls: [],
    queries: ["Test Product 评测"]
  });

  const round = result.run.browserState?.discoveryRounds?.[0];
  assert.ok(round);
  const platform = round!.candidates.find(
    (item) => item.url === "https://www.bilibili.com/"
  );
  const review = round!.candidates.find(
    (item) => item.url === "https://example.com/test-product-review"
  );
  assert.equal(platform?.semanticScore, 100);
  assert.equal(platform?.decision, "REJECT");
  assert.equal(platform?.selectedForFetch, false);
  assert.equal(review?.semanticScore, 100);
  assert.equal(review?.decision, "ACCEPT");
  assert.equal(review?.selectedForFetch, true);
  assert.ok(
    result.evidence.some(
      (item) => item.sourceUrl === "https://example.com/test-product-review"
    )
  );
});

test("research usage rule enters Product Truth as UNVERIFIED and becomes a confirmed hard rule only after user confirmation", async () => {
  const projectId = "research-usage-rule";
  const repo = new MemoryResearchRepository();
  const product = makeProductFlow(projectId);
  const service = new ResearchService(
    repo,
    new MemoryWebResearchProvider({
      "https://example.com/manual":
        "官方说明：耳夹应佩戴在耳廓指定夹持位置，不应塞入耳道。"
    }),
    new StaticBrowserProvider({
      status: "BLOCKED",
      blockerCode: "BROWSER_PROVIDER_NOT_CONFIGURED",
      message: "not configured",
      requiredUserAction: "connect browser"
    }),
    new UsageRuleRuntime(),
    product.flow
  );

  const run = await service.startRun({
    projectId,
    mode: "BASIC",
    goal: "核实佩戴方法",
    sourceUrls: [
      {
        url: "https://example.com/manual",
        sourceType: "OFFICIAL"
      }
    ],
    queries: []
  });
  const brief = run.brief!;
  assert.equal(brief.usageRules.length, 1);
  const proposed = brief.usageRules[0]!;

  await service.sendClaimsToProductTruth({
    projectId,
    briefId: brief.id,
    claimIds: [],
    usageRuleIds: [proposed.id]
  });

  const draft = product.getSavedDraft();
  assert.ok(draft);
  const rule = draft!.usageRules?.find(
    (item) => item.sourceType === "research"
  );
  assert.ok(rule);
  assert.equal(rule!.status, "UNVERIFIED");
  assert.equal(rule!.dispositionConfirmedByUser, false);

  const confirmed = confirmProductTruthDraft(
    draft!,
    {},
    new Date("2026-09-29T08:00:00.000Z"),
    { [rule!.id]: "CONFIRM" }
  );
  const confirmedRule = confirmed.usageRules?.find(
    (item) => item.id === rule!.id
  );
  assert.equal(confirmedRule?.status, "CONFIRMED");
  assert.equal(confirmedRule?.dispositionConfirmedByUser, true);
});
