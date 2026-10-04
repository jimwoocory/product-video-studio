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

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function embeddedJsonCandidates(text: string): unknown[] {
  const values: unknown[] = [];
  let start = -1;
  let stack: string[] = [];
  let inString = false;
  let escaped = false;

  const reset = () => {
    start = -1;
    stack = [];
    inString = false;
    escaped = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index]!;
    if (start < 0) {
      if (ch === "{" || ch === "[") {
        start = index;
        stack = [ch === "{" ? "}" : "]"];
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      continue;
    }
    if (ch !== "}" && ch !== "]") continue;
    if (stack.at(-1) !== ch) {
      reset();
      continue;
    }
    stack.pop();
    if (stack.length) continue;
    const candidate = text.slice(start, index + 1);
    reset();
    try {
      values.push(JSON.parse(candidate));
    } catch {
      // A balanced log fragment is not necessarily JSON. Keep scanning for
      // one complete structured value later in stdout.
    }
  }
  return values;
}

export function parseStrictJsonResponse(text: string): unknown {
  const cleaned = stripJsonFence(stripAnsi(text));
  try {
    return JSON.parse(cleaned);
  } catch {
    const candidates = embeddedJsonCandidates(cleaned);
    if (candidates.length === 1) return candidates[0];
    throw new StructuredAiRuntimeError(
      candidates.length > 1
        ? "Hermes 结构化输出包含多个 JSON，无法确定唯一结果，请重试"
        : "Hermes 结构化输出不是唯一且完整的 JSON，请重试"
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
      "你是 Product Video Studio 的结构化生成器。",
      "只返回一个合法 JSON 值，不要 Markdown，不要解释，不要代码围栏。",
      "不得修改任何文件，不得执行有副作用操作。",
      "禁止把推测当事实；无法确认的信息必须按任务约定放入不确定字段。",
      ...(request.media?.length
        ? [
            "此任务包含视觉采样帧。INPUT_JSON 中会提供本机只读采样帧路径；如果当前 Hermes 环境支持图像查看，请读取这些帧进行分析，但不得修改文件。"
          ]
        : []),
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
