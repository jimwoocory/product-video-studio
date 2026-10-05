import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const dbPath = path.join(root, "prisma", "e2e.db");
const projectsRoot = path.join(root, ".tmp", "e2e-projects");
const port = Number(process.env.PVS_E2E_PORT ?? "3190");

await fs.rm(dbPath, { force: true });
await fs.rm(projectsRoot, { recursive: true, force: true });
await fs.mkdir(projectsRoot, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: "file:./e2e.db",
  PROJECTS_ROOT: projectsRoot,
  PORT: String(port),
  PVS_SMART_WORKER_DISABLED: "1",
  PVS_LOCAL_TTS_DISABLED: "1"
};

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const migration = spawnSync(
  process.execPath,
  [prismaCli, "migrate", "deploy"],
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false
  }
);
if (migration.error) {
  console.error("E2E Prisma migration failed to start:", migration.error);
}
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}

Object.assign(process.env, env);

const [{ prisma }, { createAppServer, createDefaultDependencies }] =
  await Promise.all([
    import("../../../dist/src/adapters/db/prisma-client.js"),
    import("../../../dist/src/web/server.js")
  ]);

const now = new Date("2026-10-04T00:00:00.000Z");
await prisma.project.createMany({
  data: [
    {
      id: "e2e-draft",
      name: "E2E Draft Project",
      status: "DRAFT",
      targetPlatform: "douyin",
      targetDurationMs: 30000,
      aspectRatio: "9:16",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "e2e-ready",
      name: "E2E Ready Project",
      status: "READY_TO_GENERATE",
      targetPlatform: "douyin",
      targetDurationMs: 30000,
      aspectRatio: "9:16",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "e2e-research",
      name: "E2E Research Project",
      status: "READY_TO_GENERATE",
      targetPlatform: "douyin",
      targetDurationMs: 30000,
      aspectRatio: "9:16",
      createdAt: now,
      updatedAt: now
    }
  ]
});

await prisma.researchRunRecord.create({
  data: {
    id: "e2e-research-run",
    projectId: "e2e-research",
    mode: "DEEP",
    status: "COMPLETED",
    goal: "核实 Test Product 公开资料",
    sourceUrlsJson: "[]",
    queriesJson: JSON.stringify(["Test Product 评测"]),
    browserStateJson: JSON.stringify({
      provider: "public-search",
      lastCheckedAt: "2026-10-04T00:00:00.000Z",
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
              title: "泛行业文章",
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
    }),
    createdAt: now,
    updatedAt: now
  }
});

await prisma.researchRunRecord.create({
  data: {
    id: "e2e-research-blocked",
    projectId: "e2e-ready",
    mode: "DEEP",
    status: "BLOCKED",
    goal: "登录后继续深度研究",
    sourceUrlsJson: "[]",
    queriesJson: JSON.stringify(["E2E Product 抖音 高点赞"]),
    browserStateJson: JSON.stringify({
      provider: "external-browser",
      resumeToken: "e2e-resume",
      lastCheckedAt: "2026-10-04T00:05:00.000Z"
    }),
    blockerCode: "LOGIN_REQUIRED",
    blockerMessage: "需要登录平台后继续研究",
    requiredUserAction: "完成登录后点击继续深度研究",
    createdAt: new Date("2026-10-04T00:05:00.000Z"),
    updatedAt: new Date("2026-10-04T00:05:00.000Z")
  }
});

const deps = createDefaultDependencies();
const blockedExternalCall = async () => {
  throw new Error("E2E_EXTERNAL_CALL_BLOCKED");
};
deps.provider.probe = async () => ({
  code: "DREAMINA_NOT_FOUND",
  cliFound: false,
  providerIdentityHash: "1".repeat(64),
  capabilityFingerprint: "2".repeat(64),
  rawStdout: "",
  rawStderr: "E2E provider intentionally disabled"
});
deps.provider.accountStatus = async () => ({ status: "NOT_AUTHENTICATED" });
deps.provider.estimate = async () => ({ status: "UNKNOWN" });
deps.provider.submit = blockedExternalCall;
deps.provider.status = blockedExternalCall;
deps.provider.download = blockedExternalCall;
deps.provider.reconcileSubmission = blockedExternalCall;
const server = createAppServer(deps);
server.listen(port, "127.0.0.1", () => {
  console.log("PVS E2E listening on http://127.0.0.1:" + port);
});

async function stop() {
  await new Promise((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
}

process.once("SIGINT", () => {
  void stop().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void stop().finally(() => process.exit(0));
});
