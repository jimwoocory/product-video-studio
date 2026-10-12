/**
 * Product Video Studio / Douyin read-only research CDP Bridge.
 *
 * Connects to the user's EXISTING, dedicated Chromium CDP 9223 profile.
 * Does not create/close tabs, log in, read/export cookies, install extensions,
 * post videos, send messages, like content, or submit any paid jobs.
 *
 * The local Bridge request protocol remains authenticated with the existing
 * douyin-cli config token; no credential is exposed in stdout or HTTP status.
 *
 * Reviewed source is pinned. Changes require renewed source-code review and
 * manual digest update, rather than accepting an unknown userscript.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "playwright-core";

const PROJECT = path.resolve(import.meta.dirname, "..");
const CLI = path.resolve(PROJECT, "..", "douyin-cli");
const SOURCE = path.join(CLI, "scripts", "douyin.user.js");
const CONFIG = path.join(CLI, "config.json");
const CDP_URL = "http://127.0.0.1:9223";
const STATUS_PORT = 19423;
const PINNED_SOURCE_SHA256 = "2de4dbb09acbf7fe8e43a6509521ab695481d26e0e9cc970a96322d6e15c26a8";
const REQUIRED = ["identity", "myPosts", "search", "getDetail", "getComments", "replies"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isMain = raw => {
  try {
    const x = new URL(raw);
    return x.protocol === "https:" && (x.hostname === "www.douyin.com" || x.hostname === "douyin.com");
  } catch { return false; }
};
const state = {
  startedAt: new Date().toISOString(),
  runnerPid: process.pid,
  running: true,
  ready: false,
  cdpConnected: false,
  registered: false,
  mainPage: false,
  lastActivity: null,
  lastError: "等待专用抖音浏览器",
  handledRequests: 0,
  connectionGeneration: 0
};
let shutdown = false;
let activePage = null;
let browser = null;
const initScriptInstalled = new WeakSet();

function reviewedCode() {
  const source = fs.readFileSync(SOURCE, "utf8");
  if (sha256(source) !== PINNED_SOURCE_SHA256)
    throw Error("Reviewed Douyin Bridge source changed; manual security review required");
  function extract(name) {
    const startToken = "var " + name + " = (function () {/*";
    const start = source.indexOf(startToken);
    if (start < 0 || source.indexOf(startToken, start + 1) >= 0)
      throw Error("Unexpected reviewed Bridge block " + name);
    const from = start + startToken.length;
    const to = source.indexOf("*/}).toString().match", from);
    if (to < 0 || to - from < 1000) throw Error("Invalid reviewed Bridge code " + name);
    const chunk = source.slice(from, to).trim();
    // The injected page context never receives the local bridge token or
    // the Tampermonkey permissions wrapper.
    if (/GM_xmlhttpRequest|CONFIG\.token/.test(chunk))
      throw Error("Invalid privileged code in reviewed Bridge block " + name);
    return chunk;
  }
  return [extract("DM_BRIDGE_CODE"), extract("BRIDGE_CODE")].join("\n;\n");
}

function bridgeSettings() {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  if (config.bridge?.host !== "127.0.0.1" ||
      config.bridge?.port !== 19422 ||
      typeof config.bridge?.token !== "string" ||
      config.bridge.token.length < 24)
    throw Error("Existing localhost Bridge config is not valid");
  return {
    base: "http://127.0.0.1:" + config.bridge.port,
    token: config.bridge.token
  };
}

function redactedError(e) {
  // Never echo response bodies, URL query strings, cookies, or credentials.
  const value = String(e?.name ?? "ERR");
  return ["AbortError", "TimeoutError", "TypeError"].includes(value)
    ? "Bridge/CDP 网络超时或暂不可用"
    : "Bridge/CDP 会话需要重新连接";
}

function healthResponse() {
  return {
    ok: true,
    version: 1,
    running: state.running,
    ready: state.ready &&
      state.registered &&
      state.cdpConnected &&
      state.mainPage &&
      Date.now() - Date.parse(state.lastActivity || "") < 40_000,
    cdpConnected: state.cdpConnected,
    mainPage: state.mainPage,
    registered: state.registered,
    handledRequests: state.handledRequests,
    connectionGeneration: state.connectionGeneration,
    startedAt: state.startedAt,
    lastActivity: state.lastActivity,
    message: state.ready ? "正在服务" : state.lastError
  };
}
function runStatusServer() {
  const server = createServer((req, res) => {
    const pathname = (req.url || "").split("?")[0];
    if (req.method !== "GET" || !["/health", "/status"].includes(pathname)) {
      res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end('{"ok":false}');
      return;
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(healthResponse()));
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(STATUS_PORT, "127.0.0.1", () => resolve(server));
  });
}
async function request(settings, method, endpoint, data, timeout = 33000, cancelSignal) {
  const own = AbortSignal.timeout(timeout);
  const signal = cancelSignal ? AbortSignal.any([own, cancelSignal]) : own;
  const response = await fetch(settings.base + endpoint, {
    method,
    headers: {
      Authorization: "Bearer " + settings.token,
      ...(data !== undefined ? { "Content-Type": "application/json" } : {})
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    signal
  });
  if (!response.ok) throw Error("Bridge refused request");
  const result = await response.json();
  if (!result.ok) throw Error("Bridge returned non-ok result");
  return result;
}

function selectPage(context) {
  const pages = context.pages().filter(page => isMain(page.url()));
  // Ambiguity must never be resolved by guessing another user's tab.
  return pages.length === 1 ? pages[0] : null;
}
async function injectReviewed(page, script) {
  // Initialization is scoped to this one tab, NOT all browser contexts/tabs.
  // Page navigations use this exact single combined initialization script.
  if (!initScriptInstalled.has(page)) {
    await page.addInitScript({ content: script });
    initScriptInstalled.add(page);
  }
  await page.evaluate(script);
  const found = await page.evaluate(required => ({
    bridge: typeof window.__bridge === "object",
    methods: required.map(name => typeof window.__bridge?.[name] === "function")
  }), REQUIRED);
  if (!found.bridge || !found.methods.every(Boolean))
    throw Error("Reviewed Douyin Bridge page API did not initialize");
}
async function handleConnection(page, settings, script) {
  let pageChanged = false;
  let cancel = new AbortController();
  const onFrame = frame => {
    if (frame === page.mainFrame()) {
      pageChanged = true;
      cancel.abort();
      state.ready = false;
    }
  };
  const onClose = () => {
    pageChanged = true;
    cancel.abort();
    state.ready = false;
  };
  page.on("framenavigated", onFrame);
  page.on("close", onClose);
  try {
    await injectReviewed(page, script);
    const meta = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      userAgent: navigator.userAgent
    }));
    if (!isMain(meta.url)) throw Error("Target Douyin page changed origin");
    const connect = await request(settings, "POST", "/api/connect", {
      site: "douyin.com",
      url: meta.url,
      title: meta.title,
      userAgent: meta.userAgent
    }, 4000);
    if (typeof connect.id !== "string" || connect.id.length < 5)
      throw Error("Bridge registration did not return an id");
    const connId = connect.id;
    state.connectionGeneration++;
    state.registered = true;
    state.ready = true;
    state.mainPage = true;
    state.lastError = "";
    state.lastActivity = new Date().toISOString();
    console.log("PVS_DOUYIN_CDP_REGISTERED generation=" + state.connectionGeneration);
    let count = 0;
    while (!shutdown && !pageChanged && !page.isClosed()) {
      if (!isMain(page.url())) throw Error("Douyin page left the expected origin");
      const message = await request(settings, "GET",
        "/api/poll?site=douyin.com&id=" + encodeURIComponent(connId),
        undefined, 31000, cancel.signal);
      state.lastActivity = new Date().toISOString();
      if (message.type === "eval") {
        if (typeof message.expression !== "string" ||
            message.expression.length > 32_000 ||
            typeof message.id !== "string") {
          throw Error("Invalid authenticated Bridge command");
        }
        let answer;
        try {
          // Authenticated localhost Bridge requests only, from the same
          // source used by the existing PVS provider. Never log expressions.
          const value = await page.evaluate(message.expression);
          answer = { id: message.id, value: value === undefined ? null : value };
        } catch (e) {
          answer = { id: message.id, error: "CDP evaluation failed; refresh source and retry" };
        }
        await request(settings, "POST", "/api/result", answer, 7000, cancel.signal);
        state.handledRequests++;
      }
      // A competing legacy Tampermonkey registration must not steal commands.
      // The router replaces older polling registrations, so verify membership.
      if (++count % 3 === 0) {
        const status = await fetch(settings.base + "/api/status", {
          signal: AbortSignal.timeout(3500)
        }).then(response => response.json());
        if (!status.connections?.["douyin.com"]?.some(c => c.id === connId)) {
          throw Error("Bridge registration was replaced");
        }
      }
    }
  } finally {
    cancel.abort();
    page.off("framenavigated", onFrame);
    page.off("close", onClose);
    state.registered = false;
    state.ready = false;
  }
}

async function daemon() {
  const script = reviewedCode();
  bridgeSettings(); // Validate credentials without printing or caching them indefinitely.
  console.log("PVS_DOUYIN_CDP_REVIEWED_SOURCE_PASS");
  const statusServer = await runStatusServer();
  console.log("PVS_DOUYIN_CDP_HEALTH=http://127.0.0.1:" + STATUS_PORT + "/health");
  const finish = () => {
    shutdown = true;
    state.running = false;
    state.ready = false;
    statusServer.close();
    // The user's dedicated Chromium must remain open; process exit only
    // disconnects this Node CDP socket. Never invoke Browser.close.
  };
  process.once("SIGINT", finish);
  process.once("SIGTERM", finish);

  let retry = 0;
  while (!shutdown) {
    try {
      if (!browser?.isConnected()) {
        browser = await chromium.connectOverCDP(CDP_URL, { timeout: 4_000 });
        state.cdpConnected = true;
        state.lastError = "";
      }
      const context = browser.contexts()[0];
      if (!context) throw Error("Dedicated browser context not available");
      const page = selectPage(context);
      state.mainPage = Boolean(page);
      if (!page) {
        state.registered = false;
        state.ready = false;
        state.lastError = "等待唯一的专用抖音主页；没有自动打开新标签页";
        await sleep(1200);
        continue;
      }
      activePage = page;
      await handleConnection(page, bridgeSettings(), script);
      retry = 0;
    } catch (error) {
      state.ready = false;
      state.registered = false;
      state.cdpConnected = Boolean(browser?.isConnected());
      state.lastError = redactedError(error);
      if (!state.cdpConnected) {
        browser = null;
      }
      retry = Math.min(retry + 1, 7);
      await sleep(Math.min(2500, 300 * (2 ** Math.min(retry, 3))));
    } finally {
      activePage = null;
    }
  }
}

if (process.argv.includes("--check")) {
  reviewedCode();
  bridgeSettings();
  console.log("PVS_DOUYIN_CDP_SOURCE_AND_CONFIG_PASS");
} else {
  try {
    await daemon();
  } catch (err) {
    if (err?.code === "EADDRINUSE") {
      console.log("PVS_DOUYIN_CDP_ALREADY_RUNNING");
      process.exitCode = 0;
    } else {
      console.error("PVS_DOUYIN_CDP_START_FAILED", redactedError(err));
      process.exitCode = 1;
    }
  }
}
