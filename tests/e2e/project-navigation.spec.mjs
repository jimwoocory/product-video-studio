import { test, expect } from "@playwright/test";

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("historical page keeps its own task while resume points to the real workflow position", async ({ page }) => {
  const errors = collectBrowserErrors(page);

  await page.goto("/projects/e2e-ready/product");
  await expect(page.getByRole("heading", { name: "产品输入", level: 1 })).toBeVisible();
  await expect(page.locator(".workflow-nav")).toContainText("当前位置：产品输入 · 本页任务：检查或更新产品资料");
  await expect(page.locator(".workflow-nav")).toContainText("继续主流程：");
  await expect(page.locator('.workflow-nav-head a[href="/projects/e2e-ready/generate"]')).toHaveText("视频生成");
  await expect(page.locator(".step-current")).toHaveCount(1);
  await expect(page.locator(".step-next")).toHaveCount(1);

  await page.getByRole("link", { name: /2 联网研究/ }).click();
  await expect(page).toHaveURL(/\/projects\/e2e-ready\/research$/);
  await expect(page.locator(".workflow-nav")).toContainText("当前位置：联网研究 · 本页任务：补充公开证据并筛选可用研究结果");
  await expect(page.locator('.workflow-nav-head a[href="/projects/e2e-ready/generate"]')).toHaveText("视频生成");
  await expect(page.locator(".step-current")).toHaveCount(1);

  expect(errors).toEqual([]);
});
