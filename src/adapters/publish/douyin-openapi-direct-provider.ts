import type {
  PublishDirectInput,
  PublishDirectResult,
  PublishProvider,
  PublishProviderProbe
} from "../../application/ports/publish-provider.js";
import type { OfficialDouyinOpenApiProvider } from "./official-douyin-openapi-provider.js";
import { DomainValidationError } from "../../domain/validation.js";

export class DouyinOpenApiDirectProviderAdapter
  implements PublishProvider
{
  readonly type = "DOUYIN_OPENAPI_DIRECT" as const;
  readonly displayName = "抖音 OpenAPI 直发";
  readonly mode = "DIRECT" as const;

  constructor(private readonly legacy: OfficialDouyinOpenApiProvider) {}

  async probe(projectId: string): Promise<PublishProviderProbe> {
    if (process.env.PVS_DOUYIN_OPENAPI_DIRECT_ENABLED?.trim() !== "1") {
      return {
        providerType: this.type,
        displayName: this.displayName,
        mode: this.mode,
        code: "DISABLED",
        reason: "OpenAPI 直发默认关闭，需管理员显式启用。",
        supportsTrustedFinalConfirmation: true,
        requiresMobileDevice: false
      };
    }
    const probe = await this.legacy.probe(projectId);
    if (probe.code === "READY") {
      return {
        providerType: this.type,
        displayName: this.displayName,
        mode: this.mode,
        code: "READY",
        supportsTrustedFinalConfirmation: true,
        requiresMobileDevice: false,
        complianceNotice:
          "仅在应用已取得实际发布权限时使用；仍需用户明确确认本次发布。"
      };
    }
    return {
      providerType: this.type,
      displayName: this.displayName,
      mode: this.mode,
      code: probe.code,
      reason: probe.reason,
      supportsTrustedFinalConfirmation: true,
      requiresMobileDevice: false
    };
  }

  async directPublish(input: PublishDirectInput): Promise<PublishDirectResult> {
    const probe = await this.probe(input.projectId);
    if (probe.code !== "READY") {
      throw new DomainValidationError(
        "抖音 OpenAPI 直发尚不可用：" +
          (probe.reason ?? probe.code)
      );
    }
    const result = await this.legacy.publish({
      projectId: input.projectId,
      videoPath: input.videoPath,
      title: input.title,
      ...(input.description ? { description: input.description } : {})
    });
    return {
      trusted: true,
      externalReference: result.itemId || result.videoId,
      videoId: result.videoId,
      itemId: result.itemId
    };
  }
}
