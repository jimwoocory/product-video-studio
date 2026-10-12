import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const port = Number(process.env.PVS_AUDIT_PORT || "3197");
const base = `http://127.0.0.1:${port}`;
const project = process.env.PVS_AUDIT_PROJECT || "e2e-ready";
const p = `/projects/${encodeURIComponent(project)}`;
const output = path.resolve(".runtime/ux-fullsite-audit");
await fs.mkdir(output, { recursive: true });
const routes = [
  "/projects", "/agent", "/tasks", "/health-center", "/settings/ai",
  "/douyin-ops", p + "/douyin", p + "/smart", p + "/product", p + "/truth",
  p + "/research", p + "/reference-video", p + "/creative-references",
  p + "/creative", p + "/script", p + "/director", p + "/generate",
  p + "/single-video", p + "/auto-edit", p + "/models", p + "/timeline",
  p + "/final", p + "/publish-settings", "/publish/mobile/test-package"
];
const viewportCases = [
  { name: "desktop", viewport: { width: 1366, height: 768 } },
  { name: "mobile", viewport: { width: 390, height: 844 } }
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const viewportCase of viewportCases) {
    const context = await browser.newContext({ viewport: viewportCase.viewport, locale: "zh-CN" });
    for (const [i, route] of routes.entries()) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", e => pageErrors.push(String(e.message).slice(0, 300)));
      const item = { route, viewport: viewportCase.name, status: 0, shell: false, nav: 0, iframe: 0, overflow: null, title: "", h1: "", pageErrors };
      try {
        const response = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 40000 });
        item.status = response?.status() || 0;
        item.title = await page.title();
        item.shell = await page.locator('[data-pvs-ui-shell="unified-v2"]').count() === 1;
        item.nav = await page.locator('nav[aria-label="全局导航"]').count();
        item.iframe = await page.locator("iframe").count();
        item.h1 = (await page.locator("h1").first().textContent().catch(() => ""))?.trim().slice(0, 90) || "";
        item.overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const file = `${viewportCase.name}-${String(i + 1).padStart(2, "0")}-${route.split("/").filter(Boolean).join("-") || "home"}.png`;
        await page.screenshot({ path: path.join(output, file), animations: "disabled", timeout: 24000 });
        item.screenshot = file;
      } catch (error) {
        item.error = String(error?.message || error).slice(0, 340);
      }
      results.push(item);
      console.log(JSON.stringify({ route: item.route, viewport: item.viewport, status: item.status, shell: item.shell, nav: item.nav, iframe: item.iframe, overflow: item.overflow, pageErrors: pageErrors.length, ...(item.error ? { error: item.error } : {}) }));
      await page.close().catch(() => {});
    }
    await context.close();
  }
} finally {
  await browser.close();
}
const report = { at: new Date().toISOString(), base, project, results };
await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2), "utf8");
const failed = results.filter(r => r.status !== 200 || !r.shell || (r.route.startsWith("/publish/mobile/") ? r.nav !== 0 : r.nav !== 1) || r.iframe || (r.overflow != null && r.overflow > 2) || r.error || r.pageErrors.length);
console.log(`FULL_SITE_AUDIT total=${results.length} failures=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
