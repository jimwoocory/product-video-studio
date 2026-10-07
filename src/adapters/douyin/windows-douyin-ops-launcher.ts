import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DouyinOpsLauncher,
  DouyinOpsLaunchResult
} from "../../application/ports/douyin-ops-launcher.js";

export class WindowsDouyinOpsLauncher
  implements DouyinOpsLauncher
{
  constructor(
    private readonly launcherPath =
      process.env.PVS_DOUYIN_OPS_LAUNCHER?.trim() ||
      path.resolve(
        process.cwd(),
        "..",
        "douyin-cli-start.cmd"
      )
  ) {}

  async launch(): Promise<DouyinOpsLaunchResult> {
    if (process.platform !== "win32") {
      return {
        ok: false,
        status: "UNAVAILABLE",
        message: "当前只配置了 Windows 抖音运营启动器。"
      };
    }

    try {
      await fs.access(this.launcherPath);
    } catch {
      return {
        ok: false,
        status: "UNAVAILABLE",
        message: "未找到抖音运营启动器。"
      };
    }

    return new Promise((resolve) => {
      execFile(
        "cmd.exe",
        ["/d", "/c", this.launcherPath],
        {
          cwd: path.dirname(this.launcherPath),
          windowsHide: true,
          shell: false,
          timeout: 20_000,
          maxBuffer: 1024 * 1024
        },
        (error) => {
          if (error) {
            resolve({
              ok: false,
              status: "FAILED",
              message: "启动抖音运营连接失败。"
            });
            return;
          }
          resolve({
            ok: true,
            status: "STARTED",
            message:
              "已启动抖音运营连接；如未登录，请在打开的专用浏览器中完成登录。"
          });
        }
      );
    });
  }
}
