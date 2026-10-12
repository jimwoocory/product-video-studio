/**
 * Local-only supervisor for the existing douyin-cli Bridge Server.
 * Runs inside the scoped Product Video Studio process.
 * Never opens a browser, logs in, posts content, or touches video approvals.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SERVER = path.join(ROOT, "douyin-cli", "server.js");
const URL = "http://127.0.0.1:19422/api/health";
let child = null;
let checking = false;
let previouslyHealthy = null;
let stopping = false;

async function healthy() {
  try {
    const response = await fetch(URL, {
      signal: AbortSignal.timeout(1800)
    });
    if (!response.ok) return false;
    const status = await response.json();
    return status.ok === true && status.version === "1.0.0";
  } catch {
    return false;
  }
}

async function tick() {
  if (stopping || checking) return;
  checking = true;
  try {
    if (await healthy()) {
      if (previouslyHealthy !== true) console.log("PVS_DOUYIN_LOCAL_BRIDGE_READY");
      previouslyHealthy = true;
      return;
    }
    if (previouslyHealthy !== false) console.log("PVS_DOUYIN_LOCAL_BRIDGE_OFFLINE_RECOVERING");
    previouslyHealthy = false;
    if (child && child.exitCode === null && !child.killed) return;
    if (!fs.existsSync(SERVER)) {
      console.error("PVS_DOUYIN_LOCAL_BRIDGE_SOURCE_MISSING");
      return;
    }
    // Spawn only our reviewed, existing local Bridge server; no shell.
    const candidate = spawn(process.execPath, [SERVER], {
      cwd: path.dirname(SERVER),
      windowsHide: true,
      stdio: "ignore",
      shell: false
    });
    candidate.on("error", () => {
      if (child === candidate) child = null;
      console.error("PVS_DOUYIN_LOCAL_BRIDGE_PROCESS_ERROR");
    });
    candidate.on("exit", (code) => {
      if (child === candidate) child = null;
      if (!stopping) console.error("PVS_DOUYIN_LOCAL_BRIDGE_EXITED code=" + code);
    });
    child = candidate;
    console.log("PVS_DOUYIN_LOCAL_BRIDGE_START_REQUESTED");
  } finally {
    checking = false;
  }
}

const loop = setInterval(() => void tick(), 3000);
void tick();
function shutdown() {
  stopping = true;
  clearInterval(loop);
  // A child launched by this supervisor is owned by this process only.
  if (child && child.exitCode === null) {
    try { child.kill(); } catch {}
  }
}
process.once("exit", shutdown);
