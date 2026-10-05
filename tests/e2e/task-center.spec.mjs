import { test, expect } from "@playwright/test";

test("Task Center aggregates persisted runs and exposes only safe navigation actions", async ({ page, request }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/tasks");

  await expect(page.getByRole("heading", { name: "任务中心", level: 1 })).toBeVisible();
  await expect(page.locator(".task-card")).toHaveCount(2);

  const blocked = page.locator('.task-card[data-project-id="e2e-ready"]');
  await expect(blocked).toHaveAttribute("data-task-status", "NEEDS_USER");
  await expect(blocked).toContainText("E2E Ready Project");
  await expect(blocked).toContainText("需要登录平台后继续研究");
  await expect(blocked.getByRole("link", { name: "继续研究" })).toHaveAttribute(
    "href",
    "/projects/e2e-ready/research"
  );

  const completed = page.locator('.task-card[data-project-id="e2e-research"]');
  await expect(completed).toHaveAttribute("data-task-status", "SUCCEEDED");
  await expect(completed).toContainText("E2E Research Project");

  await expect(page.locator("body")).not.toContainText("自动重试");
  await expect(page.locator("body")).not.toContainText(">重试<");

  await page.getByRole("link", { name: "需要处理", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\?status=NEEDS_USER$/);
  await expect(page.locator(".task-card")).toHaveCount(1);
  await expect(page.locator(".task-card")).toContainText("E2E Ready Project");

  const allResponse = await request.get("/api/tasks");
  expect(allResponse.ok()).toBeTruthy();
  const all = await allResponse.json();
  expect(all.items).toHaveLength(2);
  expect(all.items.some((item) => item.status === "NEEDS_USER")).toBeTruthy();
  expect(all.items.some((item) => item.status === "SUCCEEDED")).toBeTruthy();

  const projectResponse = await request.get("/api/projects/e2e-ready/tasks");
  expect(projectResponse.ok()).toBeTruthy();
  const project = await projectResponse.json();
  expect(project.items).toHaveLength(1);
  expect(project.items[0].projectId).toBe("e2e-ready");
  expect(project.items[0].safeActions.every((action) => !/retry|重试/i.test(action.label))).toBeTruthy();

  expect(errors).toEqual([]);
});
