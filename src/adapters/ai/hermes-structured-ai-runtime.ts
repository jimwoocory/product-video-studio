import { execFile } from "node:child_process";
import type {
  StructuredAiRequest,
  StructuredAiRuntime
} from "../../application/ports/structured-ai-runtime.js";

export class StructuredAiRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredAiRuntimeError";
  }
}

export type HermesCommandRunner = (
  executable: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }>;

async function defaultRunner(
  executable: string,
  args: readonly string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(
      executable,
      [...args],
      {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: String(stdout ?? ""),
          stderr: String(stderr || error?.message || ""),
          exitCode: error ? 1 : 0,
          timedOut: Boolean(
            error &&
              ((error as NodeJS.ErrnoException).code === "ETIMEDOUT" ||
                /timed out|timeout/i.test(error.message))
          )
        });
      }
    );
  });
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

export function parseStrictJsonResponse(text: string): unknown {
  const cleaned = stripJsonFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new StructuredAiRuntimeError(
      "Hermes structured output was not valid standalone JSON"
    );
  }
}

export class HermesStructuredAiRuntime implements StructuredAiRuntime {
  readonly id = "hermes-agent";
  readonly version = "0.21.3";

  constructor(
    private readonly projectRoot: string,
    private readonly executable = "hermes",
    private readonly runner: HermesCommandRunner = defaultRunner
  ) {}

  async generateJson(request: StructuredAiRequest): Promise<unknown> {
    const prompt = [
      "你是 Product Video Studio P0 的结构化生成器。",
      "只返回一个合法 JSON 值，不要 Markdown，不要解释，不要代码围栏。",
      "不得修改任何文件，不得执行有副作用操作。",
      "禁止把推测当事实；无法确认的信息必须按任务约定放入不确定字段。",
      "",
      "TASK:",
      request.task,
      "",
      "INSTRUCTIONS:",
      request.instructions,
      "",
      "INPUT_JSON:",
      JSON.stringify(request.input),
      "",
      "OUTPUT_CONTRACT_JSON:",
      JSON.stringify(request.outputContract),
      "",
      "再次强调：最终响应必须是严格 JSON，不能有 JSON 之外的任何字符。"
    ].join("\n");

    const result = await this.runner(
      this.executable,
      [
        "--in",
        this.projectRoot,
        "--reasoning",
        "medium",
        "-z",
        prompt
      ],
      420_000
    );

    if (result.timedOut) {
      throw new StructuredAiRuntimeError("Hermes structured generation timed out");
    }
    if (result.exitCode !== 0) {
      throw new StructuredAiRuntimeError(
        `Hermes structured generation failed: ${result.stderr.trim() || "unknown error"}`
      );
    }
    if (!result.stdout.trim()) {
      throw new StructuredAiRuntimeError("Hermes returned empty structured output");
    }
    return parseStrictJsonResponse(result.stdout);
  }
}
