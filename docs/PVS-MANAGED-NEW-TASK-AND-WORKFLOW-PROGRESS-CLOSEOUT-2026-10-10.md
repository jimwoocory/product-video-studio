# Product Video Studio：新项目自动编排与制作进度同步修复

- 时间：2026-10-10（北京时间）
- AgentDock 任务：`tsk_c523741adb6b2f69`
- 范围：新任务持久授权 / 自动调度，以及项目工作台左侧阶段与当前任务的一致性。
- 状态：**本机工程、隔离自动化和实际用户任务定向恢复 PASS**；真实后续图片 / 视频制作依然受独立人工审核及费用门禁约束。

## 问题与根因

原 3090 服务通过 `.runtime/pvs-safe-launch.mjs` 启动，仅允许以前授权的精确项目与 Run 进入后台执行器。用户新建的「广西金秀康瑶堂瑶药3」创作 Run `35afafab-87ae-4c22-8e80-a2823f5a4d62` 处于 `PLANNING/SOURCES`，创建时 Revision 1，没有授权进入旧 scoped worker；程序虽然能创建新 Run，却不会自动往下推进。旧项目「广西金秀康瑶堂瑶药2」的精确作用域仍是 `21a89ce0-599e-4840-8a5d-53156a6d64cc/576430e9-bcb2-459e-ae0e-06c09a072b76`，旧任务处于费用确认前，不应自动再次提交。

此外，上述新项目已保存确认版 ProductTruth（版本 2），项目兼容阶段为 `CREATIVE_REVIEW`，但左侧进度默认只根据新 Run 的 `SOURCES` 显示“产品与事实 当前”，未区分“项目事实已经确认”与“新 Run 尚在关联资料”，导致进度看起来倒退。

## 实施

1. **持久的新任务授权**：`src/domain/smart-generation.ts` 新增严格 schema `autoAdvanceGrant`，绑定唯一 `projectId` + `runId` + 授权时间 + 来源（`USER_CREATED`/`USER_RESUMED`）。新 V2 Run 在明确启用托管模式的服务内由用户主动创建时持久登记；既有历史 Run 默认没有授权。
2. **托管调度器**：`src/application/services/smart-generation-worker.ts` 新增 `MANAGED` 执行策略。可只读枚举任务，但仅推进具有精确、有效授权的新 Run，或保留的原精确 scoped Run；死租约仅对被授权 Run 定向核验，不调用全局恢复。原 `DISABLED`、`SCOPED`、`ALL` 兼容逻辑保留。资源费用仍必须经过既有人工确认 Gate。
3. **人工恢复旧维修期间新建的 Run**：`SmartGenerationService.authorizeAutoAdvance` 和严格的 POST `/api/projects/:projectId/smart-runs/:runId/authorize-worker`，要求准确 Revision 与 `confirmCurrentTask=true`。只准仍在 V2 `PLANNING/SOURCES`、尚未安装结果、无视频尝试、无任何付费 Consent 的原 Run；不允许无限期批量恢复历史任务。
4. **正式本机安全启动**：原 `.runtime/pvs-safe-launch.mjs` 启用 `PVS_SMART_WORKER_MANAGED_NEW_RUNS=1`，维持全局 worker 禁用和原 scoped 兼容白名单、跳过 startup 全局恢复；PVS 3090 通过该已核验的 launcher 启动。注意：不要在本机改用未核验的旧 `npm start` 全局恢复方式重新启动服务。
5. **左侧进度与任务操作**：`workflow-read-model.ts` 对“真实产品输入、主图和已确认事实存在，但本轮 Run 仍在 SOURCES 核对”的情况：产品与事实为 DONE，研究与创意为 CURRENT；仍保留真实 `SOURCES` 阶段和说明“本轮尚未产出创意”。`smart-generation-ui.ts` 将“已过”优化为“已确认”，增加清晰阶段说明，并针对暂停且未授权的新任务提供明确的“恢复本任务自动规划（不包含付费生成）”按钮和顶部下一步入口。所有确认动作继续 POST，打开页面不产生写请求。

## 隔离回归与安全证据

- TypeScript `npm.cmd run build` PASS。
- 托管调度 / 历史 Run 隔离 / 显式授权 / 费用边界 / 工具条状态定向测试：**16/16 PASS**。
- 真实 Chrome 隔离新任务创建/持久授权 + 原任务中心专项：**2/2 PASS**。
- 完整单元及集成测试：**573/573 PASS，exit 0**，日志 `.runtime/pvs-managed-worker-fulltest-20261010.log`。
- 完整 Chrome Playwright 回归：**48/48 PASS，exit 0**，日志 `.runtime/pvs-managed-worker-chrome-final-20261010.log`。第一次全站回归发现测试夹具额外留下已取消的共享 Run；改用全新独立测试 Project 并在 E2E 中清理后，后续 2/2 与完整 48/48 复跑成功。
- LicenseGate PASS（38 packages / 7 external runtimes）、`git diff --check` PASS。
- 正式 SQLite `.runtime/pvs-managed-worker-predeploy-20261010.db` 在线备份完成，`integrity_check=ok`；原始快照 `.runtime/pvs-managed-worker-before-20261010.json`。
- 3090 安全重启后、尚未授权旧暂停 Run 前，**9 Projects、12 SmartRuns、全部记录及授权状态、33 GenerationRequest / 23 Attempt / 33 Preflight / 23 Approval 逐项完全一致**；快照 `.runtime/pvs-managed-worker-after-deploy-before-authorize-20261010.json`。

## 原用户任务真实恢复与页面验收

用户已明确要求合并修复后，向 **唯一** 当前 Run `35afafab-87ae-4c22-8e80-a2823f5a4d62` 提交精确版本及确认的 POST 授权。创建/恢复记录：
- 授权后：Revision 2，原状态 `PLANNING/SOURCES`，无费用许可、尝试 0。
- 后台自行通过资料来源核查进入 `PLANNING/CREATIVE`，Revision 3。
- 生成并持久安装 5 项创意备选后，进入 `WAITING_FOR_CREATIVE_REVIEW/CREATIVE`，Revision 5，释放执行租约，**等待人工选择创意**；无图片/视频付费授权及生成尝试。

独立 headless Chrome 实际只读访问 `http://127.0.0.1:3090/projects/23d0b97f-9e0d-4c83-8e70-fc23819e7796/smart`：
- 左侧显示 `✓ 产品与事实 已确认`、`2 研究与创意 当前`；后续制作准备、视频与审片、剪辑与成片为未开始。
- 顶部“当前工作流 · 创意策划”，创意方案人工选择按钮 **5 个**。
- 本项目暂停错误提示 **0**，页面载入时 POST/其他写请求 **0**。

终态只读数据快照 `.runtime/pvs-managed-worker-after-current-20261010.json` 与原快照比较：
- 9 Projects / 12 SmartRuns、请求/尝试/预检/审批计数、活动租约数 **MATCH**。
- **只有当前 Run 和当前 Project** 因明确授权及成功生成创意而发生内容版本变化；其余旧 11 条 Run 和另外 8 个项目逐条指纹 **完全一致**。
- 旧项目费用范围及同意状态不变，用户的本次 Run 从未触发付费图片/视频生成。

## 用户接下来应该做什么

打开本项目工作台，查看 5 个创意方案并明确选择其中一个，后续可自动规划非付费步骤，在资产及视频收费前仍必须独立确认。无须新建同名项目或再次开启后台。

**限制**：本机正式网页已经用安全 Managed Launcher 恢复；未来若制作可分发 Windows 安装包，应将该启动策略正式纳入发行启动程序，避免其他入口沿用旧 `ALL` 模式。没有擅自 Git reset/clean/commit 或推送原混合未提交工作树。
