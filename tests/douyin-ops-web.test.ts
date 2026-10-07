import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DouyinOpsGlobalView,
  DouyinOpsProjectView,
  DouyinOpsDashboardService
} from "../src/application/services/douyin-ops-dashboard-service.js";
import {
  renderDouyinOpsGlobalPage,
  renderDouyinOpsProjectPage
} from "../src/web/douyin-ops-ui.js";
import { handleDouyinOpsHttp } from "../src/web/douyin-ops-http.js";
import { WindowsDouyinOpsLauncher } from "../src/adapters/douyin/windows-douyin-ops-launcher.js";

const work = {
  awemeId: "7685693367372964337",
  description: "可以的#拳击 #AIGC",
  publishedAt: "2026-09-15T09:35:34.000Z",
  author: {
    nickname: "WC",
    uid: "uid",
    secUid: "sec",
    uniqueId: "50805615998"
  },
  metrics: {
    plays: 310,
    likes: 9,
    comments: 2,
    shares: 0
  },
  durationMs: 30047,
  coverUrl: "",
  externalUrl:
    "https://www.douyin.com/video/7685693367372964337"
};

const account = {
  status: "MATCHED" as const,
  reason: "STRONG_ID_MATCH" as const,
  publish: {
    valid: true,
    displayName: "WC",
    platformUserId: "50805615998",
    runtimeStatus: "VALID"
  },
  ops: {
    available: true,
    nickname: "WC",
    uid: "uid",
    secUid: "sec",
    uniqueId: "50805615998",
    shortId: "0",
    runtimeStatus: "READY"
  },
  nicknameMatched: true,
  canAutoBindPublishedWork: true,
  checkedAt: "2026-10-07T05:30:00.000Z",
  message: "发布账号与运营账号的抖音号一致。"
};

const binding = {
  id: "binding-1",
  projectId: "project-1",
  packageId: "package-1",
  publishReceiptId: "receipt-1",
  awemeId: work.awemeId,
  source: "PUBLISH_RECEIPT" as const,
  confidence: "TRUSTED" as const,
  status: "BOUND" as const,
  boundAt: "2026-10-07T05:10:00.000Z",
  externalUrl: work.externalUrl,
  createdAt: "2026-10-07T05:10:00.000Z",
  updatedAt: "2026-10-07T05:10:00.000Z"
};

const globalView: DouyinOpsGlobalView = {
  runtime: {
    ok: true,
    ready: true,
    status: "READY",
    contractVersion: 1,
    connection: {
      id: "conn",
      url: "https://www.douyin.com/"
    }
  },
  account,
  works: [work],
  worksStatus: "READY",
  linkedProjects: [
    {
      projectId: "project-1",
      projectName: "耳机宣传",
      binding
    }
  ]
};

const projectView: DouyinOpsProjectView = {
  project: {
    id: "project-1",
    name: "耳机宣传"
  },
  runtime: {
    ok: false,
    ready: false,
    status: "SITE_OFFLINE",
    message: "抖音主页面未连接"
  },
  account,
  publishPackage: null,
  publishReceipt: null,
  binding,
  snapshots: [
    {
      id: "snapshot-1",
      projectId: "project-1",
      bindingId: "binding-1",
      awemeId: work.awemeId,
      captureKey: "one",
      capturedAt: "2026-10-07T05:20:00.000Z",
      plays: 300,
      likes: 8,
      comments: 1,
      shares: 0,
      rawJson: "{}",
      contentHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: "2026-10-07T05:20:00.000Z"
    },
    {
      id: "snapshot-2",
      projectId: "project-1",
      bindingId: "binding-1",
      awemeId: work.awemeId,
      captureKey: "two",
      capturedAt: "2026-10-07T05:30:00.000Z",
      plays: 310,
      likes: 9,
      comments: 2,
      shares: 0,
      rawJson: "{}",
      contentHash:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      createdAt: "2026-10-07T05:30:00.000Z"
    }
  ],
  comments: [
    {
      id: "comment-1",
      projectId: "project-1",
      bindingId: "binding-1",
      awemeId: work.awemeId,
      cid: "1001",
      nickname: "MJ",
      text: "帅呀",
      diggCount: 1,
      replyCount: 2,
      platformCreatedAt: "2026-10-07T05:21:00.000Z",
      syncedAt: "2026-10-07T05:30:00.000Z",
      rawJson: "{}",
      contentHash:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      createdAt: "2026-10-07T05:30:00.000Z",
      updatedAt: "2026-10-07T05:30:00.000Z"
    }
  ],
  candidates: [],
  candidatesStatus: "OFFLINE",
  candidatesMessage: "当前无法读取账号作品。"
};

test("global Douyin ops page is visual, Chinese and read-only", () => {
  const html = renderDouyinOpsGlobalPage(globalView);
  assert.match(html, /抖音运营/);
  assert.match(html, /账号已匹配/);
  assert.match(html, /50805615998/);
  assert.match(html, /可以的#拳击/);
  assert.match(html, /启动 \/ 打开抖音运营连接/);
  assert.match(html, /查看发布后表现/);
  assert.doesNotMatch(html, /确认回复|发送私信|自动点赞|campaign run/);
});

test("project page keeps persisted metrics/comments visible while runtime is offline", () => {
  const html = renderDouyinOpsProjectPage(projectView);
  assert.match(html, /发布后表现/);
  assert.match(html, /运营连接当前不可用；下方已保存的历史指标和评论仍可查看/);
  assert.match(html, />310</);
  assert.match(html, /MJ/);
  assert.match(html, /帅呀/);
  assert.match(html, /刷新数据/);
  assert.match(html, /同步评论/);
  assert.match(html, /同步这条评论的回复/);
  assert.doesNotMatch(html, /确认回复|发布回复|发送私信|自动点赞/);
});

test("publisher account check has a bounded UI timeout", async () => {
  const source = await fs.readFile(
    path.resolve(
      "src/adapters/publish/social-auto-upload-runtime.ts"
    ),
    "utf8"
  );
  assert.match(
    source,
    /ACCOUNT_CHECK_TIMEOUT_MS\s*=\s*8_000/
  );
  assert.match(
    source,
    /\["check", "--account", account\],[\s\S]*ACCOUNT_CHECK_TIMEOUT_MS/
  );
});

test("Windows launcher fails closed when the fixed launcher is missing", async () => {
  const launcher = new WindowsDouyinOpsLauncher(
    path.resolve("definitely-missing-douyin-launcher.cmd")
  );
  const result = await launcher.launch();
  assert.equal(result.ok, false);
  assert.equal(result.status, "UNAVAILABLE");

  const source = await fs.readFile(
    path.resolve(
      "src/adapters/douyin/windows-douyin-ops-launcher.ts"
    ),
    "utf8"
  );
  assert.match(source, /execFile\(/);
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /exec\(/);
});

test("Douyin ops HTTP exposes only P0 local/read actions", async () => {
  const calls: string[] = [];
  const service = {
    async global() {
      calls.push("global");
      return globalView;
    },
    async project() {
      calls.push("project");
      return projectView;
    },
    async launch() {
      calls.push("launch");
      return {
        ok: true,
        status: "STARTED",
        message: "started"
      };
    },
    async refreshMetrics() {
      calls.push("metrics");
      return projectView.snapshots.at(-1)!;
    },
    async syncComments() {
      calls.push("comments");
      return {
        projectId: "project-1",
        awemeId: work.awemeId,
        pages: 1,
        syncedCount: 1,
        cursor: "0",
        hasMore: false,
        truncated: false
      };
    },
    async syncReplies(_projectId: string, cid: string) {
      calls.push("replies:" + cid);
      return {
        projectId: "project-1",
        awemeId: work.awemeId,
        pages: 1,
        syncedCount: 1,
        cursor: "0",
        hasMore: false,
        truncated: false
      };
    },
    async confirmBinding() {
      calls.push("binding");
      return binding;
    }
  } as unknown as DouyinOpsDashboardService;

  const server = http.createServer(async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      "http://127.0.0.1"
    );
    const handled = await handleDouyinOpsHttp(
      req,
      res,
      url,
      { douyinOpsDashboard: service }
    );
    if (!handled) {
      res.writeHead(404, {
        "content-type": "application/json"
      });
      res.end(JSON.stringify({ message: "not found" }));
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve)
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base =
    "http://127.0.0.1:" + address.port;

  try {
    const globalPageResponse = await fetch(base + "/douyin-ops");
    assert.equal(globalPageResponse.status, 200);
    assert.match(
      await globalPageResponse.text(),
      /我的抖音作品/
    );

    const status = await fetch(
      base + "/api/douyin/ops/status"
    );
    assert.equal(status.status, 200);

    const launch = await fetch(
      base + "/api/douyin/ops/launch",
      { method: "POST" }
    );
    assert.equal(launch.status, 200);

    const projectPageResponse = await fetch(
      base + "/projects/project-1/douyin"
    );
    assert.equal(projectPageResponse.status, 200);

    for (const route of [
      "/api/projects/project-1/douyin/metrics/refresh",
      "/api/projects/project-1/douyin/comments/sync",
      "/api/projects/project-1/douyin/comments/1001/replies/sync"
    ]) {
      const response = await fetch(base + route, {
        method: "POST"
      });
      assert.equal(response.status, 200);
    }

    const bind = await fetch(
      base + "/api/projects/project-1/douyin/binding/confirm",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          awemeId: work.awemeId,
          externalUrl: work.externalUrl,
          confirmed: true
        })
      }
    );
    assert.equal(bind.status, 200);

    for (const forbidden of [
      "/api/projects/project-1/douyin/post",
      "/api/projects/project-1/douyin/like",
      "/api/projects/project-1/douyin/dm",
      "/api/projects/project-1/douyin/campaign",
      "/api/projects/project-1/douyin/comments/1001/reply"
    ]) {
      const response = await fetch(base + forbidden, {
        method: "POST"
      });
      assert.equal(response.status, 404);
    }

    assert.deepEqual(calls, [
      "global",
      "global",
      "launch",
      "project",
      "metrics",
      "comments",
      "replies:1001",
      "binding"
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error ? reject(error) : resolve()
      )
    );
  }
});

test("main PVS server and workbench navigation register Douyin ops", async () => {
  const [serverSource, workbenchSource] =
    await Promise.all([
      fs.readFile(
        path.resolve("src/web/server.ts"),
        "utf8"
      ),
      fs.readFile(
        path.resolve("src/web/workbench-ui.ts"),
        "utf8"
      )
    ]);
  assert.match(
    serverSource,
    /handleDouyinOpsHttp\(req, res, url, deps\)/
  );
  assert.match(
    workbenchSource,
    /href="\/douyin-ops">抖音运营/
  );
});
