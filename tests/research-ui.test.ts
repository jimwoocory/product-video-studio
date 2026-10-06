import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectWorkspace } from "../src/application/services/product-flow.js";
import type { ResearchRun } from "../src/application/ports/research-repository.js";
import { renderResearchPage } from "../src/web/workbench-ui.js";

const ISO = "2026-10-04T00:00:00.000Z";

function workspace(): ProjectWorkspace {
  return {
    project: {
      id: "research-ui-project",
      name: "Research UI",
      status: "READY_TO_GENERATE",
      targetPlatform: "douyin",
      targetDurationMs: 30000,
      aspectRatio: "9:16",
      createdAt: ISO,
      updatedAt: ISO
    }
  };
}

function run(): ResearchRun {
  return {
    id: "research-run-ui",
    projectId: "research-ui-project",
    mode: "DEEP",
    status: "COMPLETED",
    goal: "核实产品资料",
    sourceUrls: [],
    queries: ["Test Product 评测"],
    browserState: {
      provider: "public-search",
      lastCheckedAt: ISO,
      discoveryRounds: [
        {
          round: 1,
          queries: ["Test Product 评测"],
          candidateCount: 2,
          acceptedCount: 0,
          heldCount: 1,
          rejectedCount: 1,
          fetchedCount: 1,
          candidates: [
            {
              url: "https://www.bilibili.com/",
              title: "哔哩哔哩首页",
              sourceType: "PLATFORM",
              query: "Test Product 评测",
              engine: "bing",
              rank: 1,
              deterministicScore: 0,
              finalScore: 0,
              decision: "REJECT",
              selectedForFetch: false,
              reasons: [
                "首页/聚合入口降权",
                "平台首页且未命中产品身份，直接淘汰"
              ]
            },
            {
              url: "https://example.com/category",
              title: "行业文章",
              sourceType: "INDUSTRY",
              deterministicScore: 30,
              finalScore: 30,
              decision: "HOLD",
              selectedForFetch: true,
              reasons: ["产品身份信息较弱"],
              fetchOutcome: "FAILED"
            }
          ]
        },
        {
          round: 2,
          queries: ["Test Product 官方 说明书 PDF"],
          candidateCount: 1,
          acceptedCount: 1,
          heldCount: 0,
          rejectedCount: 0,
          fetchedCount: 1,
          candidates: [
            {
              url: "https://support.example.com/test-product/manual",
              title: "Test Product Official Manual",
              sourceType: "OFFICIAL",
              deterministicScore: 90,
              semanticScore: 96,
              finalScore: 92,
              decision: "ACCEPT",
              selectedForFetch: true,
              reasons: ["搜索标题完整命中产品名", "官方来源加权"],
              fetchedIdentityScore: 75,
              fetchedIdentityMatched: true,
              fetchOutcome: "EVIDENCE"
            }
          ]
        }
      ]
    },
    createdAt: ISO,
    updatedAt: ISO
  };
}

test("Research UI shows discovery quality summary and human-readable rejection reasons", () => {
  const latestRun = run();
  const html = renderResearchPage({
    workspace: workspace(),
    runs: [latestRun],
    latestRun,
    evidence: []
  });

  assert.match(html, /搜索质量与淘汰记录/);
  assert.match(html, />2 轮</);
  assert.match(html, /搜索候选/);
  assert.match(html, /进入抓取/);
  assert.match(html, /形成证据/);
  assert.match(html, /淘汰 \/ 失败/);
  assert.match(html, /哔哩哔哩首页/);
  assert.match(html, /平台首页且未命中产品身份，直接淘汰/);
  assert.match(html, /每轮搜索审计/);
  assert.match(html, /第 2 轮 · 候选 1 · ACCEPT 1/);
  assert.match(html, /class="technical"/);
  assert.match(html, /score=0/);
});

test("Research UI shows independent Douyin market-video candidates and explicit analysis action", () => {
  const latestRun = run();
  latestRun.status = "FAILED";
  latestRun.browserState = {
    ...latestRun.browserState!,
    marketVideoResearch: {
      status: "READY",
      provider: "douyin-cli-search",
      sort: "MOST_LIKED",
      timeRange: "HALF_YEAR",
      searchedQueries: ["瑶药护颈枕"],
      checkedAt: ISO,
      candidates: [
        {
          id: "7599999999999999999",
          platform: "DOUYIN",
          videoId: "7599999999999999999",
          url: "https://www.douyin.com/video/7599999999999999999",
          title: "高赞护颈枕演示",
          authorName: "公开视频作者",
          query: "瑶药护颈枕",
          rank: 1,
          metrics: {
            likes: 128000,
            comments: 4300,
            shares: 900
          },
          metricsAvailability: "PLATFORM_PUBLIC",
          sourceProvider: "douyin-cli-search",
          status: "DISCOVERED"
        }
      ]
    }
  };
  const html = renderResearchPage({
    workspace: workspace(),
    runs: [latestRun],
    latestRun,
    evidence: []
  });

  assert.match(html, /抖音爆款 \/ 竞品视频/);
  assert.match(html, /高赞护颈枕演示/);
  assert.match(html, /点赞 12\.8万/);
  assert.match(html, /拆解为创作参考/);
  assert.match(html, /market-videos/);
  assert.match(html, /当前产品公开证据暂未找到/);
  assert.doesNotMatch(html, /<h3>研究失败<\/h3>/);
});
