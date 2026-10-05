import type {
  PublishDirectInput,
  PublishDirectResult,
  PublishProvider,
  PublishProviderProbe
} from "../../application/ports/publish-provider.js";
import { PublishSubmissionUnknownError } from "../../application/ports/publish-provider.js";
import type { DouyinBrowserPublisherRuntime } from "../../application/ports/douyin-browser-publisher-runtime.js";
import { DomainValidationError } from "../../domain/validation.js";

function extractTopics(description: string | undefined): {
  description: string;
  tags: string[];
} {
  if (!description?.trim()) {
    return { description: "", tags: [] };
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  const cleaned = description.replace(
    /(^|\s)#([^\s#]+)/g,
    (match, prefix: string, raw: string) => {
      const tag = raw.trim().replace(/[，。！？、,.!?;；:：]+$/u, "");
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
      return prefix;
    }
  );
  return {
    description: cleaned.replace(/[ 	]{2,}/g, " ").trim(),
    tags
  };
}

export class DouyinBrowserAutomationProvider implements PublishProvider {
  readonly type = "DOUYIN_BROWSER_AUTOMATION" as const;
  readonly displayName = "抖音浏览器自动发布";
  readonly mode = "DIRECT" as const;

  constructor(
    private readonly runtime: DouyinBrowserPublisherRuntime
  ) {}

  async probe(_projectId: string): Promise<PublishProviderProbe> {
    const engine = await this.runtime.probe();
    if (!engine.ok || engine.status !== "READY") {
      return {
        providerType: this.type,
        displayName: this.displayName,
        mode: this.mode,
        code: "UNAVAILABLE",
        reason:
          engine.message ??
          "抖音浏览器发布引擎当前不可用。",
        supportsTrustedFinalConfirmation: true,
        requiresMobileDevice: false,
        complianceNotice:
          "通过已登录的抖音创作者中心完成上传；仍需遵守抖音平台规则与账号权限。"
      };
    }

    const accountKey = await this.runtime.resolveAccountName();
    const account = await this.runtime.check(accountKey);
    if (!account.valid) {
      return {
        providerType: this.type,
        displayName: this.displayName,
        mode: this.mode,
        code: "AUTH_REQUIRED",
        reason:
          account.message ??
          "抖音账号尚未登录或登录状态已经失效。",
        ...(account.displayName
          ? { accountDisplayName: account.displayName }
          : {}),
        ...(account.platformUserId
          ? { platformUserId: account.platformUserId }
          : {}),
        supportsTrustedFinalConfirmation: true,
        requiresMobileDevice: false,
        complianceNotice:
          "点击“登录抖音”后会打开浏览器，由用户扫码完成登录；Cookie 仅保存在本机运行时秘密目录。"
      };
    }

    return {
      providerType: this.type,
      displayName: this.displayName,
      mode: this.mode,
      code: "READY",
      ...(account.displayName
        ? { accountDisplayName: account.displayName }
        : {}),
      ...(account.platformUserId
        ? { platformUserId: account.platformUserId }
        : {}),
      supportsTrustedFinalConfirmation: true,
      requiresMobileDevice: false,
      complianceNotice:
        "使用本机已登录的抖音创作者中心发布。只有作品管理页再次确认到本次作品时，系统才标记为已发布。"
    };
  }

  async directPublish(
    input: PublishDirectInput
  ): Promise<PublishDirectResult> {
    const probe = await this.probe(input.projectId);
    if (probe.code !== "READY") {
      throw new DomainValidationError(
        "抖音浏览器自动发布尚不可用：" +
          (probe.reason ?? probe.code)
      );
    }

    const accountKey = await this.runtime.resolveAccountName();
    const copy = extractTopics(input.description);
    const result = await this.runtime.publish(
      {
        videoPath: input.videoPath,
        title: input.title,
        description: copy.description,
        tags: copy.tags,
        headed:
          process.env.PVS_DOUYIN_BROWSER_HEADED?.trim() !== "0",
        declaration: "内容由AI生成"
      },
      accountKey
    );

    if (!result.ok) {
      throw new Error(
        result.message ??
          result.verificationMessage ??
          "抖音浏览器自动发布失败"
      );
    }

    const externalReference =
      result.externalReference?.trim() ||
      result.currentUrl?.trim() ||
      "";

    if (!result.verified || result.status !== "PUBLISHED_CONFIRMED") {
      throw new PublishSubmissionUnknownError(
        result.verificationMessage ||
          "抖音已经接受发布动作，但暂时无法在作品管理页确认本次作品。请先人工核对，禁止自动重试。",
        externalReference || undefined
      );
    }

    if (!externalReference) {
      throw new PublishSubmissionUnknownError(
        "抖音作品已在管理页确认，但缺少可审计的平台引用。请人工核对，禁止自动重试。"
      );
    }

    return {
      trusted: true,
      externalReference
    };
  }
}
