import test from "node:test";
import assert from "node:assert/strict";
import {
  DouyinBrowserAutomationProvider
} from "../src/adapters/publish/douyin-browser-automation-provider.js";
import type {
  DouyinBrowserAccountStatus,
  DouyinBrowserEngineProbe,
  DouyinBrowserLoginResult,
  DouyinBrowserPublishRequest,
  DouyinBrowserPublishResult,
  DouyinBrowserPublisherRuntime
} from "../src/application/ports/douyin-browser-publisher-runtime.js";
import { PublishSubmissionUnknownError } from "../src/application/ports/publish-provider.js";

class FakeRuntime implements DouyinBrowserPublisherRuntime {
  publishRequest?: DouyinBrowserPublishRequest;
  publishResult: DouyinBrowserPublishResult = {
    ok: true,
    account: "jimwoo",
    status: "PUBLISHED_CONFIRMED",
    verified: true,
    externalReference: "https://creator.douyin.com/creator-micro/content/manage"
  };

  async resolveAccountName(): Promise<string> {
    return "jimwoo";
  }

  async probe(): Promise<DouyinBrowserEngineProbe> {
    return {
      ok: true,
      status: "READY",
      engine: "social-auto-upload",
      bridgeVersion: 1
    };
  }

  async check(accountName?: string): Promise<DouyinBrowserAccountStatus> {
    return {
      ok: true,
      account: accountName ?? "jimwoo",
      status: "VALID",
      valid: true
    };
  }

  async login(accountName: string): Promise<DouyinBrowserLoginResult> {
    return {
      ok: true,
      account: accountName,
      status: "success"
    };
  }

  async publish(
    request: DouyinBrowserPublishRequest,
    accountName?: string
  ): Promise<DouyinBrowserPublishResult> {
    this.publishRequest = request;
    return {
      ...this.publishResult,
      account: accountName ?? "jimwoo"
    };
  }
}

test("Douyin browser provider exposes valid account and publishes only verified result", async () => {
  const runtime = new FakeRuntime();
  const provider = new DouyinBrowserAutomationProvider(runtime);

  const probe = await provider.probe("project-browser");
  assert.equal(probe.code, "READY");
  assert.equal(probe.accountName, "jimwoo");

  const result = await provider.directPublish({
    projectId: "project-browser",
    packageId: "package-browser",
    videoPath: "C:\\tmp\\final.mp4",
    title: "测试视频",
    description: "正文内容 #AI #产品视频"
  });

  assert.equal(result.trusted, true);
  assert.equal(runtime.publishRequest?.description, "正文内容");
  assert.deepEqual(runtime.publishRequest?.tags, ["AI", "产品视频"]);
  assert.equal(runtime.publishRequest?.declaration, "内容由AI生成");
});

test("Douyin browser provider treats unverified submission as unknown and blocks automatic retry", async () => {
  const runtime = new FakeRuntime();
  runtime.publishResult = {
    ok: true,
    account: "jimwoo",
    status: "SUBMISSION_UNKNOWN",
    verified: false,
    externalReference:
      "https://creator.douyin.com/creator-micro/content/manage",
    verificationMessage: "管理页尚未看到本次标题"
  };
  const provider = new DouyinBrowserAutomationProvider(runtime);

  await assert.rejects(
    provider.directPublish({
      projectId: "project-browser",
      packageId: "package-browser",
      videoPath: "C:\\tmp\\final.mp4",
      title: "测试视频"
    }),
    (error: unknown) =>
      error instanceof PublishSubmissionUnknownError &&
      /管理页尚未看到本次标题/.test(error.message)
  );
});
