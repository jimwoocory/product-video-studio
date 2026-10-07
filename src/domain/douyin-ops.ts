import { z } from "zod";
import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  sha256Schema
} from "./schemas.js";

export const douyinWorkBindingStatusSchema = z.enum([
  "BOUND",
  "PENDING_DISCOVERY",
  "BLOCKED_ACCOUNT_MISMATCH",
  "NEEDS_USER_SELECTION"
]);

export const douyinWorkBindingSourceSchema = z.enum([
  "PUBLISH_RECEIPT",
  "AUTO_DISCOVERY",
  "USER_CONFIRMED"
]);

export const douyinWorkBindingConfidenceSchema = z.enum([
  "TRUSTED",
  "HIGH",
  "USER_CONFIRMED",
  "NONE"
]);

export const douyinAwemeIdSchema = z
  .string()
  .trim()
  .regex(/^\d{8,30}$/, "invalid Douyin aweme id");

export const douyinWorkBindingSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  packageId: entityIdSchema,
  publishReceiptId: entityIdSchema.optional(),
  awemeId: douyinAwemeIdSchema.optional(),
  source: douyinWorkBindingSourceSchema.optional(),
  confidence: douyinWorkBindingConfidenceSchema,
  status: douyinWorkBindingStatusSchema,
  publishedAt: isoDateTimeSchema.optional(),
  boundAt: isoDateTimeSchema.optional(),
  externalUrl: nonEmptyStringSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
}).superRefine((value, ctx) => {
  if (value.status === "BOUND" && !value.awemeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["awemeId"],
      message: "BOUND binding requires awemeId"
    });
  }
  if (value.status === "BOUND" && !value.source) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source"],
      message: "BOUND binding requires source"
    });
  }
  if (value.status === "BOUND" && !value.boundAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["boundAt"],
      message: "BOUND binding requires boundAt"
    });
  }
});

export const douyinMetricSnapshotSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  bindingId: entityIdSchema,
  awemeId: douyinAwemeIdSchema,
  captureKey: nonEmptyStringSchema,
  capturedAt: isoDateTimeSchema,
  plays: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  collects: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  rawJson: z.string(),
  contentHash: sha256Schema,
  createdAt: isoDateTimeSchema
});

export type DouyinWorkBindingStatus = z.infer<
  typeof douyinWorkBindingStatusSchema
>;
export type DouyinWorkBindingSource = z.infer<
  typeof douyinWorkBindingSourceSchema
>;
export type DouyinWorkBindingConfidence = z.infer<
  typeof douyinWorkBindingConfidenceSchema
>;
export type DouyinWorkBinding = z.infer<
  typeof douyinWorkBindingSchema
>;
export type DouyinMetricSnapshot = z.infer<
  typeof douyinMetricSnapshotSchema
>;
