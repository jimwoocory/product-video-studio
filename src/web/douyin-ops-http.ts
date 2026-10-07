import type {
  IncomingMessage,
  ServerResponse
} from "node:http";
import { z } from "zod";
import type {
  DouyinOpsDashboardService
} from "../application/services/douyin-ops-dashboard-service.js";
import { DouyinOpsRuntimeError } from "../application/ports/douyin-ops-runtime.js";
import { DomainValidationError } from "../domain/validation.js";
import {
  renderDouyinOpsGlobalPage,
  renderDouyinOpsProjectPage
} from "./douyin-ops-ui.js";

function json(
  res: ServerResponse,
  status: number,
  value: unknown
) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0"
  });
  res.end(JSON.stringify(value));
}

function html(
  res: ServerResponse,
  status: number,
  value: string
) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, max-age=0"
  });
  res.end(value);
}

async function body(
  req: IncomingMessage,
  maxBytes = 32_000
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.from(chunk);
    size += value.byteLength;
    if (size > maxBytes) {
      throw new DomainValidationError("请求内容过大");
    }
    chunks.push(value);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(
      Buffer.concat(chunks).toString("utf8")
    );
  } catch {
    throw new DomainValidationError(
      "请求必须是有效 JSON"
    );
  }
}

function publicError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      code: "INVALID_INPUT",
      message: "请求参数无效"
    };
  }
  if (error instanceof DomainValidationError) {
    return {
      status: 400,
      code: "INVALID_STATE",
      message: error.message
    };
  }
  if (error instanceof DouyinOpsRuntimeError) {
    if (error.code === "AUTH_REQUIRED") {
      return {
        status: 409,
        code: error.code,
        message: "抖音运营账号需要重新登录。"
      };
    }
    if (
      error.code === "BRIDGE_OFFLINE" ||
      error.code === "SITE_OFFLINE" ||
      error.code === "ENGINE_UNAVAILABLE"
    ) {
      return {
        status: 503,
        code: error.code,
        message: "抖音运营连接当前不可用。"
      };
    }
    return {
      status: 502,
      code: error.code,
      message: "读取抖音数据失败，请稍后重试。"
    };
  }
  return {
    status: 500,
    code: "DOUYIN_OPS_FAILED",
    message: "抖音运营操作失败，请重试。"
  };
}

export async function handleDouyinOpsHttp(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: {
    douyinOpsDashboard?: DouyinOpsDashboardService;
  }
): Promise<boolean> {
  const globalPage = url.pathname === "/douyin-ops";
  const globalApi =
    url.pathname === "/api/douyin/ops/status";
  const launch =
    url.pathname === "/api/douyin/ops/launch";
  const projectPage = url.pathname.match(
    /^\/projects\/([^/]+)\/douyin$/
  );
  const projectApi = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/douyin$/
  );
  const metricRefresh = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/douyin\/metrics\/refresh$/
  );
  const commentSync = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/douyin\/comments\/sync$/
  );
  const commentClassify = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/douyin\/comments\/classify$/
  );
  const replySync = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/douyin\/comments\/([^/]+)\/replies\/sync$/
  );
  const bindingConfirm = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/douyin\/binding\/confirm$/
  );

  if (
    !globalPage &&
    !globalApi &&
    !launch &&
    !projectPage &&
    !projectApi &&
    !metricRefresh &&
    !commentSync &&
    !commentClassify &&
    !replySync &&
    !bindingConfirm
  ) {
    return false;
  }

  const service = deps.douyinOpsDashboard;
  if (!service) {
    json(res, 503, {
      code: "DOUYIN_OPS_UNAVAILABLE",
      message: "抖音运营服务尚未配置"
    });
    return true;
  }

  try {
    if (globalPage) {
      if (req.method !== "GET") {
        json(res, 405, { message: "不支持此请求方法" });
        return true;
      }
      html(
        res,
        200,
        renderDouyinOpsGlobalPage(
          await service.global()
        )
      );
      return true;
    }

    if (globalApi) {
      if (req.method !== "GET") {
        json(res, 405, { message: "不支持此请求方法" });
        return true;
      }
      json(res, 200, await service.global());
      return true;
    }

    if (launch) {
      if (req.method !== "POST") {
        json(res, 405, { message: "不支持此请求方法" });
        return true;
      }
      const result = await service.launch();
      json(res, result.ok ? 200 : 503, result);
      return true;
    }

    const projectMatch =
      projectPage ??
      projectApi ??
      metricRefresh ??
      commentSync ??
      commentClassify ??
      replySync ??
      bindingConfirm;
    const projectId = decodeURIComponent(
      projectMatch![1]!
    );

    if (projectPage) {
      if (req.method !== "GET") {
        json(res, 405, { message: "不支持此请求方法" });
        return true;
      }
      html(
        res,
        200,
        renderDouyinOpsProjectPage(
          await service.project(projectId)
        )
      );
      return true;
    }

    if (projectApi) {
      if (req.method !== "GET") {
        json(res, 405, { message: "不支持此请求方法" });
        return true;
      }
      json(res, 200, await service.project(projectId));
      return true;
    }

    if (req.method !== "POST") {
      json(res, 405, { message: "不支持此请求方法" });
      return true;
    }

    if (metricRefresh) {
      json(res, 200, {
        snapshot:
          await service.refreshMetrics(projectId)
      });
      return true;
    }

    if (commentSync) {
      json(res, 200, {
        result: await service.syncComments(projectId)
      });
      return true;
    }

    if (commentClassify) {
      const input = z
        .object({
          cids: z
            .array(
              z.string().regex(/^\d{1,40}$/)
            )
            .min(1)
            .max(20)
            .optional(),
          force: z.boolean().optional()
        })
        .strict()
        .parse(await body(req));
      json(res, 200, {
        result: await service.classifyComments({
          projectId,
          ...(input.cids ? { cids: input.cids } : {}),
          ...(input.force !== undefined
            ? { force: input.force }
            : {})
        })
      });
      return true;
    }

    if (replySync) {
      const cid = decodeURIComponent(replySync[2]!);
      if (!/^\d{1,40}$/.test(cid)) {
        throw new DomainValidationError(
          "评论 ID 格式无效"
        );
      }
      json(res, 200, {
        result:
          await service.syncReplies(projectId, cid)
      });
      return true;
    }

    if (bindingConfirm) {
      const input = z
        .object({
          awemeId: z
            .string()
            .regex(/^\d{8,30}$/),
          externalUrl: z.string().url().optional(),
          confirmed: z.literal(true)
        })
        .strict()
        .parse(await body(req));

      json(res, 200, {
        binding: await service.confirmBinding({
          projectId,
          awemeId: input.awemeId,
          ...(input.externalUrl
            ? { externalUrl: input.externalUrl }
            : {}),
          confirmed: true
        })
      });
      return true;
    }

    json(res, 404, { message: "不存在的抖音运营操作" });
    return true;
  } catch (error) {
    const mapped = publicError(error);
    json(res, mapped.status, {
      code: mapped.code,
      message: mapped.message
    });
    return true;
  }
}
