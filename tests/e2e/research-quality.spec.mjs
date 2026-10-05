import { test, expect } from "@playwright/test";

test("research page exposes candidate rejection and recovery audit", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/projects/e2e-research/research");

  await expect(page.getByRole("heading", { name: "搜索质量与淘汰记录" })).toBeVisible();
  await expect(page.locator("body")).toContainText("2 轮");
  await expect(page.locator("body")).toContainText("哔哩哔哩首页");
  await expect(page.locator("body")).toContainText("平台首页且未命中产品身份，直接淘汰");
  await expect(page.locator("body")).toContainText("Test Product 官方 说明书 PDF");
  await expect(page.locator("body")).toContainText("形成证据");
  await expect(page.locator("body")).not.toContainText("VALIDATION_ERROR");

  expect(errors).toEqual([]);
});
