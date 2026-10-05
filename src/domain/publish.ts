import { z } from "zod";
import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  sha256Schema
} from "./schemas.js";

export const publishProviderTypeSchema = z.enum([
  "DOUYIN_BROWSER_AUTOMATION",
  "DOUYIN_SDK_HANDOFF",
  "DOUYIN_H5_HANDOFF",
  "DOUYIN_OPENAPI_DIRECT",
  "MANUAL_EXPORT"
]);

export const publishProviderModeSchema = z.enum([
  "HANDOFF",
  "DIRECT",
  "MANUAL"
]);

export const publishProviderProbeCodeSchema = z.enum([
  "READY",
  "DISABLED",
  "NOT_CONFIGURED",
  "AUTH_REQUIRED",
  "UNAVAILABLE"
]);

export const publishPackageStatusSchema = z.enum([
  "PACKAGE_READY",
  "HANDOFF_STARTED",
  "AWAITING_USER_ACTION",
  "DIRECT_PUBLISHING",
  "SUBMISSION_UNKNOWN",
  "HANDOFF_COMPLETED",
  "PUBLISHED_CONFIRMED",
  "FAILED",
  "EXPIRED"
]);

export const publishReceiptKindSchema = z.enum([
  "PACKAGE_CLAIMED",
  "HANDOFF_STARTED",
  "HANDOFF_COMPLETED",
  "SUBMISSION_UNKNOWN",
  "PUBLISHED_CONFIRMED",
  "FAILED"
]);

export const publishPreferenceSchema = z.object({
  projectId: entityIdSchema,
  providerType: publishProviderTypeSchema,
  updatedAt: isoDateTimeSchema
});

export const publishPackageSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  finalAssemblyId: entityIdSchema,
  finalArtifactId: entityIdSchema,
  finalArtifactHash: sha256Schema,
  providerType: publishProviderTypeSchema,
  titleDraft: nonEmptyStringSchema,
  descriptionDraft: z.string().trim().optional(),
  coverArtifactId: entityIdSchema.optional(),
  expiresAt: isoDateTimeSchema,
  singleUseTokenHash: sha256Schema,
  tokenConsumedAt: isoDateTimeSchema.optional(),
  sessionTokenHash: sha256Schema.optional(),
  sessionExpiresAt: isoDateTimeSchema.optional(),
  mediaTokenHash: sha256Schema.optional(),
  mediaExpiresAt: isoDateTimeSchema.optional(),
  status: publishPackageStatusSchema,
  handoffReference: nonEmptyStringSchema.optional(),
  errorCode: nonEmptyStringSchema.optional(),
  errorMessage: nonEmptyStringSchema.optional(),
  createdAt: isoDateTimeSchema,
  claimedAt: isoDateTimeSchema.optional(),
  handoffStartedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  publishedConfirmedAt: isoDateTimeSchema.optional()
}).superRefine((value, ctx) => {
  if (value.tokenConsumedAt && !value.claimedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["claimedAt"],
      message: "Consumed publish token requires claimedAt"
    });
  }
  if (value.sessionTokenHash && !value.sessionExpiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sessionExpiresAt"],
      message: "Publish session hash requires sessionExpiresAt"
    });
  }
  if (value.mediaTokenHash && !value.mediaExpiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mediaExpiresAt"],
      message: "Publish media token hash requires mediaExpiresAt"
    });
  }
  if (value.status === "PUBLISHED_CONFIRMED" && !value.publishedConfirmedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publishedConfirmedAt"],
      message: "PUBLISHED_CONFIRMED requires publishedConfirmedAt"
    });
  }
});

export const publishReceiptSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  packageId: entityIdSchema,
  providerType: publishProviderTypeSchema,
  kind: publishReceiptKindSchema,
  trusted: z.boolean(),
  externalReference: nonEmptyStringSchema.optional(),
  evidenceHash: sha256Schema.optional(),
  note: z.string().trim().optional(),
  createdAt: isoDateTimeSchema
}).superRefine((value, ctx) => {
  if (value.kind === "PUBLISHED_CONFIRMED" && !value.trusted) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trusted"],
      message: "PUBLISHED_CONFIRMED receipt must be trusted"
    });
  }
});

export type PublishProviderType = z.infer<typeof publishProviderTypeSchema>;
export type PublishProviderMode = z.infer<typeof publishProviderModeSchema>;
export type PublishProviderProbeCode = z.infer<
  typeof publishProviderProbeCodeSchema
>;
export type PublishPackageStatus = z.infer<typeof publishPackageStatusSchema>;
export type PublishReceiptKind = z.infer<typeof publishReceiptKindSchema>;
export type PublishPreference = z.infer<typeof publishPreferenceSchema>;
export type PublishPackage = z.infer<typeof publishPackageSchema>;
export type PublishReceipt = z.infer<typeof publishReceiptSchema>;
