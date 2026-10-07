import type {
  PublishPackage,
  PublishReceipt
} from "../../domain/publish.js";
import type {
  DouyinAccountMatchResult
} from "./douyin-account-binding-service.js";

export type DouyinWorkBindingSource =
  | "PUBLISH_RECEIPT"
  | "AUTO_DISCOVERY"
  | "USER_CONFIRMED";

export type DouyinWorkBindingStatus =
  | "BOUND"
  | "PENDING_DISCOVERY"
  | "BLOCKED_ACCOUNT_MISMATCH"
  | "NEEDS_USER_SELECTION";

export type DouyinWorkBindingDecision = {
  status: DouyinWorkBindingStatus;
  source?: DouyinWorkBindingSource;
  awemeId?: string;
  externalUrl?: string;
  confidence:
    | "TRUSTED"
    | "HIGH"
    | "USER_CONFIRMED"
    | "NONE";
  canAutoDiscover: boolean;
  requiresUserSelection: boolean;
  reason:
    | "TRUSTED_RECEIPT_VIDEO_ID"
    | "NO_TRUSTED_RECEIPT"
    | "TRUSTED_RECEIPT_WITHOUT_VIDEO_ID"
    | "ACCOUNT_MATCH_REQUIRED"
    | "ACCOUNT_MISMATCH"
    | "USER_SELECTED_WORK";
  packageId: string;
  receiptId?: string;
  message: string;
};

function isDouyinHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "douyin.com" || host.endsWith(".douyin.com");
}

export function extractAwemeIdFromTrustedReference(
  reference: string | undefined
): string | null {
  const value = reference?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!isDouyinHost(url.hostname)) return null;
    const match = url.pathname.match(
      /(?:^|\/)video\/(\d{8,30})(?:\/|$)/
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function trustedPublishedReceipt(
  receipt: PublishReceipt | null | undefined
): PublishReceipt | null {
  if (
    receipt &&
    receipt.kind === "PUBLISHED_CONFIRMED" &&
    receipt.trusted === true
  ) {
    return receipt;
  }
  return null;
}

function accountAllowsDiscovery(
  accountMatch: DouyinAccountMatchResult
): boolean {
  return (
    accountMatch.status === "MATCHED" &&
    accountMatch.canAutoBindPublishedWork === true
  );
}

export class DouyinWorkBindingService {
  fromPublishReceipt(input: {
    pkg: PublishPackage;
    receipt?: PublishReceipt | null;
    accountMatch: DouyinAccountMatchResult;
  }): DouyinWorkBindingDecision {
    const { pkg, receipt, accountMatch } = input;
    const confirmedReceipt =
      trustedPublishedReceipt(receipt);

    if (!confirmedReceipt) {
      return {
        status: "PENDING_DISCOVERY",
        confidence: "NONE",
        canAutoDiscover: false,
        requiresUserSelection: false,
        reason: "NO_TRUSTED_RECEIPT",
        packageId: pkg.id,
        ...(receipt?.id ? { receiptId: receipt.id } : {}),
        message:
          "尚无可信的抖音发布确认回执，不能建立作品绑定。"
      };
    }

    const awemeId = extractAwemeIdFromTrustedReference(
      confirmedReceipt.externalReference
    );
    if (awemeId) {
      return {
        status: "BOUND",
        source: "PUBLISH_RECEIPT",
        awemeId,
        externalUrl: confirmedReceipt.externalReference!,
        confidence: "TRUSTED",
        canAutoDiscover: false,
        requiresUserSelection: false,
        reason: "TRUSTED_RECEIPT_VIDEO_ID",
        packageId: pkg.id,
        receiptId: confirmedReceipt.id,
        message:
          "已从可信发布回执取得抖音作品 ID。"
      };
    }

    if (accountMatch.status === "MISMATCHED") {
      return {
        status: "BLOCKED_ACCOUNT_MISMATCH",
        confidence: "NONE",
        canAutoDiscover: false,
        requiresUserSelection: true,
        reason: "ACCOUNT_MISMATCH",
        packageId: pkg.id,
        receiptId: confirmedReceipt.id,
        message:
          "发布账号与运营账号不一致，禁止通过运营账号自动发现本次作品。"
      };
    }

    if (!accountAllowsDiscovery(accountMatch)) {
      return {
        status: "PENDING_DISCOVERY",
        confidence: "NONE",
        canAutoDiscover: false,
        requiresUserSelection: true,
        reason: "ACCOUNT_MATCH_REQUIRED",
        packageId: pkg.id,
        receiptId: confirmedReceipt.id,
        message:
          "发布已确认，但回执未包含作品 ID；需先确认发布账号与运营账号一致，或由用户手动选择作品。"
      };
    }

    return {
      status: "PENDING_DISCOVERY",
      confidence: "NONE",
      canAutoDiscover: true,
      requiresUserSelection: false,
      reason: "TRUSTED_RECEIPT_WITHOUT_VIDEO_ID",
      packageId: pkg.id,
      receiptId: confirmedReceipt.id,
      message:
        "发布已确认，但回执未包含作品 ID；允许在同账号最近作品中执行受限发现。"
    };
  }

  requireUserSelection(input: {
    pkg: PublishPackage;
    receipt: PublishReceipt;
    accountMatch: DouyinAccountMatchResult;
  }): DouyinWorkBindingDecision {
    const base = this.fromPublishReceipt(input);
    if (base.status === "BOUND") return base;
    return {
      ...base,
      status:
        input.accountMatch.status === "MISMATCHED"
          ? "BLOCKED_ACCOUNT_MISMATCH"
          : "NEEDS_USER_SELECTION",
      canAutoDiscover: false,
      requiresUserSelection: true,
      message:
        input.accountMatch.status === "MISMATCHED"
          ? base.message
          : "无法唯一确认本次发布对应的抖音作品，需要用户明确选择。"
    };
  }

  confirmUserSelection(input: {
    pkg: PublishPackage;
    receipt?: PublishReceipt | null;
    awemeId: string;
    externalUrl?: string;
  }): DouyinWorkBindingDecision {
    const awemeId = input.awemeId.trim();
    if (!/^\d{8,30}$/.test(awemeId)) {
      throw new Error("awemeId 格式无效");
    }

    const externalUrl =
      input.externalUrl?.trim() ||
      "https://www.douyin.com/video/" + awemeId;
    const urlAwemeId =
      extractAwemeIdFromTrustedReference(externalUrl);
    if (urlAwemeId !== awemeId) {
      throw new Error(
        "人工选择的作品 URL 与 awemeId 不一致"
      );
    }

    return {
      status: "BOUND",
      source: "USER_CONFIRMED",
      awemeId,
      externalUrl,
      confidence: "USER_CONFIRMED",
      canAutoDiscover: false,
      requiresUserSelection: false,
      reason: "USER_SELECTED_WORK",
      packageId: input.pkg.id,
      ...(input.receipt?.id
        ? { receiptId: input.receipt.id }
        : {}),
      message: "已由用户明确确认抖音作品绑定。"
    };
  }
}
