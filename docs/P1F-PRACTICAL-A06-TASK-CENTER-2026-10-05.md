# P1 Final 实用化优化 A-06 — Task Center

日期：2026-10-05  
状态：PASS

## 目标

提供一个统一任务中心，用已有持久化真值回答：

- 现在有什么任务
- 哪些正在运行
- 哪些需要用户处理
- 哪些失败
- provider / model 是什么
- 是否已经进入外部 / 付费执行
- 已知成本是什么
- 应该安全地回到哪个现有页面继续

不新增第二套 TaskRecord，不把任务中心变成新的执行真值。

## 实现

新增：

- `src/domain/task-center.ts`
- `src/application/services/task-center-service.ts`
- `src/web/task-center-ui.ts`
- `tests/task-center.test.ts`
- `tests/task-center-ui.test.ts`
- `tests/e2e/task-center.spec.mjs`

修改：

- `src/application/services/timeline-service.ts`
  - 新增只读 `listRenderJobs(projectId)`
- `src/web/server.ts`
  - WebDependencies 增加 TaskCenterService
  - `GET /tasks`
  - `GET /api/tasks`
  - `GET /api/projects/:projectId/tasks`
- `src/web/workbench-ui.ts`
  - 顶部增加“任务中心”
- `tests/e2e/support/e2e-server.mjs`
  - 增加 Task Center 浏览器测试数据

## 聚合来源

V1 直接聚合：

- ResearchRun
- AgentTask
- SmartGenerationRun
- GenerationAttempt
- RenderJob
- PublishPackage
- legacy PublishAttempt
- WorkflowBlocker（作为相关任务阻塞信息）

任务中心不修改这些底层记录。

## 统一状态

映射为：

- WAITING
- RUNNING
- NEEDS_USER
- SUCCEEDED
- FAILED
- CANCELLED
- UNKNOWN

## 付费状态

只使用可证明的信息：

- FREE
- NOT_SUBMITTED
- AUTHORIZED
- PAID_OR_EXTERNAL
- UNKNOWN

不会自己猜测积分或费用。

已有 Preflight cost 信息会显示；未知仍明确显示未知。

## 安全动作

Task Center V1 不提供统一 mutation API，也不提供通用“重试”。

只提供安全跳转：

- Research BLOCKED → 继续研究
- Agent RECONCILE_REQUIRED → 核对生成状态
- Agent / Generation REVIEW_READY → 进入审片
- Generation SUBMISSION_OUTCOME_UNKNOWN → 核对生成状态
- Render failed / queued → 返回视频剪辑
- Render succeeded → 查看成片
- Publish → 打开发布中心
- Smart Run → 打开 / 继续一键成片

这样避免：

- 自动重复提交付费 Dreamina
- 自动重复发布
- 自动覆盖 Timeline

## 发布语义

重点验证：

`HANDOFF_COMPLETED` **不是**发布成功。

任务中心中：

- HANDOFF_COMPLETED → NEEDS_USER
- 文案：交接完成，但尚未获得可信发布回执
- 不显示“发布完成时间”
- 只有 `PUBLISHED_CONFIRMED` 才映射为 SUCCEEDED

## 测试

### Unit / UI

新增 8 个重点测试：

- Blocked Research → NEEDS_USER + Resume
- Agent REVIEW_READY → NEEDS_USER
- Smart Run GENERATING → RUNNING
- Generation SUBMISSION_OUTCOME_UNKNOWN → UNKNOWN + Reconcile
- Render SUCCEEDED → SUCCEEDED
- HANDOFF_COMPLETED 不等于发布成功
- Task Center counts / filters
- Task Center 不出现通用 Retry

### Browser E2E

Task Center 浏览器用例验证：

- 从持久化 ResearchRun 聚合已完成任务
- 从持久化 BLOCKED ResearchRun 聚合需要处理任务
- 安全操作链接
- NEEDS_USER 筛选
- `GET /api/tasks`
- `GET /api/projects/:id/tasks`
- 不出现通用 Retry

## 最终 Gate

- `npm test`: **279/279 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
  - packages=38
  - external_runtimes=5
- `npx prisma validate`: **PASS**
- `npm run test:e2e`: **7/7 PASS**

## 真实公司数据浏览器验证

在当前公司 Product Video Studio 数据库（3 个项目）打开：

`http://127.0.0.1:3090/tasks`

确认：

- 任务中心正常加载
- Research / Agent / Smart Run / Generation / Render / Publish 均能显示现有持久化记录
- 运行中 / 需要处理 / 失败 / 状态待核对统计正常
- 历史发布包过期状态不会伪装成已发布
- 生成结果可显示实际 model 和已有 cost 信息
- 顶部“任务中心”入口正常
- Browser Console：**0 error / 0 warning**

## 结论

A-06 PASS。

P1 Final · 实用化优化轮 A 组（A-05、A-01、A-02、A-03、A-04、A-06）已全部达到实现级 Gate。
