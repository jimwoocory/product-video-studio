import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { DomainValidationError } from "../domain/validation.js";
import type { SmartGenerationService } from "../application/services/smart-generation-service.js";
import type { BatchGenerationService } from "../application/services/batch-generation-service.js";
import type { ProductFlowService } from "../application/services/product-flow.js";
import { renderSmartGenerationPage } from "./smart-generation-ui.js";
const batchSchema = z.object({ attemptIds: z.array(z.string().min(1)).min(1).max(120), scopeHash: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let count = 0;
  for await (const chunk of req) { const b = Buffer.from(chunk); count += b.length; if (count > 100_000) throw new DomainValidationError("请求内容过大"); chunks.push(b); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new DomainValidationError("请求必须是有效 JSON"); }
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); }
export async function handleSmartGenerationHttp(req: IncomingMessage, res: ServerResponse, url: URL, deps: {
  smartGeneration?: SmartGenerationService; batchGeneration?: BatchGenerationService; productFlow: ProductFlowService
}): Promise<boolean> {
  const page = url.pathname.match(/^\/projects\/([^/]+)\/smart$/);
  const batch = url.pathname.match(/^\/api\/projects\/([^/]+)\/generation-batch$/);
  const smart = url.pathname.match(/^\/api\/projects\/([^/]+)\/smart-runs(?:\/([^/]+)(?:\/([a-z-]+))?)?$/);
  if (!page && !batch && !smart) return false;
  if (page && req.method === "GET") {
    if (!deps.smartGeneration) { json(res, 503, { message: "一键成片服务尚未配置" }); return true; }
    const projectId = decodeURIComponent(page[1]!);
    const workspace = await deps.productFlow.getWorkspace(projectId);
    if (!workspace) { json(res, 404, { message: "项目不存在" }); return true; }
    const runs = await deps.smartGeneration.list(projectId);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderSmartGenerationPage(workspace, runs)); return true;
  }
  if (batch) {
    if (!deps.batchGeneration) { json(res, 503, { message: "批量生成服务尚未配置" }); return true; }
    const projectId = decodeURIComponent(batch[1]!);
    if (req.method === "GET") json(res, 200, { selection: await deps.batchGeneration.preview(projectId) });
    else if (req.method === "POST") json(res, 200, { result: await deps.batchGeneration.submit({ projectId, ...batchSchema.parse(await body(req)) }) });
    else json(res, 405, { message: "不支持此请求方法" });
    return true;
  }
  if (!smart) { json(res, 405, { message: "不支持此请求方法" }); return true; }
  if (!deps.smartGeneration) { json(res, 503, { message: "一键成片服务尚未配置" }); return true; }
  const service = deps.smartGeneration;
  const projectId = decodeURIComponent(smart[1]!), runId = smart[2] ? decodeURIComponent(smart[2]) : undefined, action = smart[3];
  if (req.method === "GET" && !action) {
    if (!runId) json(res, 200, { runs: await service.list(projectId) });
    else { const run = await service.get(projectId, runId); json(res, run ? 200 : 404, run ? { run } : { message: "任务不存在" }); }
    return true;
  }
  if (req.method !== "POST") { json(res, 405, { message: "不支持此请求方法" }); return true; }
  if (!runId) {
    const input = z.object({ requestKey: z.string().min(1).max(120), options: z.unknown() }).strict().parse(await body(req));
    json(res, 201, { run: await service.create(projectId, input.requestKey, input.options) }); return true;
  }
  switch (action) {
    case "paid": json(res, 200, { run: await service.confirmPaid(projectId, runId, z.object({ scopeHash: z.string().regex(/^[a-f0-9]{64}$/i), confirmPaidGeneration: z.boolean(), acceptedUnknownCostRisk: z.boolean() }).strict().parse(await body(req))) }); break;
    case "review": json(res, 200, { run: await service.review(projectId, runId, z.object({ action: z.enum(["SELECT_CREATIVE", "CONFIRM_SCRIPT", "CONFIRM_PLAN"]), expectedRevision: z.number().int().positive(), creativeId: z.string().optional() }).strict().parse(await body(req))) }); break;
    case "resume": json(res, 200, { run: await service.resume(projectId, runId) }); break;
    case "post-production": json(res, 200, { run: await service.configurePostProduction(projectId, runId, z.object({ expectedRevision: z.number().int().positive(), settings: z.unknown() }).strict().parse(await body(req))) }); break;
    case "adopt-timeline": json(res, 200, { run: await service.adoptTimeline(projectId, runId, z.object({ expectedRevision: z.number().int().positive(), timelineId: z.string().min(1), timelineHash: z.string().regex(/^[a-f0-9]{64}$/i) }).strict().parse(await body(req))) }); break;
    case "cancel": json(res, 200, { run: await service.cancel(projectId, runId) }); break;
    case "final-confirmed": json(res, 200, { run: await service.confirmFinal(projectId, runId) }); break;
    default: json(res, 404, { message: "不存在的编排操作" });
  }
  return true;
}
