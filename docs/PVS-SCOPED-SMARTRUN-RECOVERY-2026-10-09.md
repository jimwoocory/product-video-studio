# PVS 智能生成安全恢复：指定单任务执行器（2026-10-09）

## 故障与根因

- 目标项目：`21a89ce0-599e-4840-8a5d-53156a6d64cc`（广西金秀康瑶堂瑶药2）。
- 原 SmartRun：`576430e9-bcb2-459e-ae0e-06c09a072b76`，创建于 2026-10-09 13:12（北京时间），停在 `SOURCES / PLANNING / revision 1`，没有任何实际自动执行。
- 3090 服务此前由 `.runtime/pvs-safe-launch.mjs` 启动，设置 `PVS_SMART_WORKER_DISABLED=1`，同时跳过全局项目恢复。因此网页可以新建任务，但后台不会推进任何 SmartRun；界面却误显示「正在规划」。
- 原本全局 Worker 会扫描所有 SmartRun（含旧项目）；用户授权仅安全恢复当前任务，不允许直接全局开启旧任务。

## 本次改动

- `src/application/services/smart-generation-worker.ts`：新增 `SmartWorkerPolicy`、精确作用域选择；在全局禁止状态下只有明确设置 `PVS_SMART_WORKER_SCOPED_ENABLED=1` 且匹配项目和任务 ID，才执行这个 Run。作用域模式不扫描旧 Run、不调用全局租约恢复、不触碰其它任务。
- `src/web/server.ts`：根据运行策略启动全局/指定执行器；现有安全启动配置仅允许指定 Run。
- `src/web/smart-generation-http.ts` / `src/web/smart-generation-ui.ts`：工作台感知后台执行状态；处于可执行状态但没有启用的 Run 显示「后台自动编排已暂停」，禁用误导性的「查看当前任务进度」跳转；等待人工确认的任务仍显示准确的下一步。
- `tests/smart-worker-scope.test.ts`：验证作用域白名单、旧项目完全隔离、自动执行禁用时 UI 明确暂停及匹配作用域时正常展示。
- 本机现有 `.runtime/pvs-safe-launch.mjs`：保持 `PVS_SMART_WORKER_DISABLED=1`，仅设置上述目标 Run 的 scope，使用持久进程会话运行；禁用启动时全局恢复。

## 真实验证结果

- TypeScript Build：PASS；目标相关 27/27 定向单元测试 PASS。
- 启动前已保存只读全项目快照：`.runtime/scoped-worker-pre-restart-snapshot.json`（共 11 个 SmartRun、8 个项目）。
- 3090 以安全 scoped 配置重启并返回 HTTP 200。
- 指定 Run 自动从 `SOURCES / PLANNING / revision 1` 推进到 `CREATIVE / WAITING_FOR_CREATIVE_REVIEW / revision 4`，新增实际创意结果 **5 个候选方案**，等待用户选择；用户没有进行任何付费确认。
- 对比重启前快照：另外 10 个历史 SmartRun 的 `status/revision/updatedAt` 全部保持不变，只有指定项目数据因本轮创意安装更新。
- 真实 Chrome 页面：工作台 200、能看到 5 个创意选择按钮、无脚本错误。
- 无视频生成请求、无新增图/视频付费授权、无抖音写入；原人工审批机制和旧项目版本均保留。
- License Gate：PASS（38 packages / 7 runtimes）；`git diff --check`：PASS。
- 全仓单元/集成：**498/498 PASS**，命令退出码 0；日志 `.runtime/pvs-scoped-worker-full-test.log`。
- Chrome 浏览器 E2E：**39/39 PASS**，命令退出码 0；日志 `.runtime/pvs-scoped-worker-e2e.log`。
- 收口只读复核：另外 **10 条历史 SmartRun 零变化**、**0 条新增 Run**、其他项目状态零变化；目标仍 `WAITING_FOR_CREATIVE_REVIEW / revision 4`、5 个创意可选择、0 个付费范围及 0 个视频请求。
- 3090 运行中（HTTP 200），已切换为 AgentDock 长时会话，后台全局 Worker 仍关闭，只有目标 Run 在白名单；已验证工作台实际显示等待选择创意。

## 2026-10-09 14:14–14:22：遗留租约复发的定点修复与防复发验证

- 用户发现同一 SmartRun 在制作资产准备阶段卡住。正式数据库记录 `ASSET_PREPARING / ASSET_PREP / revision 17`，最后于 13:55:30 更新；租约 PID `6504` 已退出（系统进程检查确认），而 3090 为另一个仍在运行的 scoped 进程。旧版 scoped worker 不会清理本任务租约，导致新的每轮推进无法获取执行锁。
- 修改前检查：3 个 AI 制作资产中已有 1 个 `NEEDS_REVIEW`，另 2 个均为 `PROCESSING` 且保存原始 `submitId`；不存在 `PLANNED` 或 `SUBMISSION_UNKNOWN` 的新增候选，没有需重新提交的资产。
- 先通过 SQLite Online Backup 保存完整恢复前数据库：`.runtime/pvs-target-lease-backup-20261009-141534.db`（仅保存在本机，不对外分享）。
- 通过项目现成 `PrismaSmartRunRepository.releaseAbandoned(projectId,runId,owner)` **只释放一条任务**的租约；脚本在写入前精确核对项目 ID、Run ID、revision、资产状态、原提交编号、owner、死亡 PID，且用 owner 匹配防止抢占并发新租约。首次尝试因缺少 `dotenv` 依赖在模块加载阶段失败且未写入，第二次使用 `node --env-file=.env` 成功完成安全释放。
- 已存在的 scoped worker随后通过**原始图片提交号仅查询/接收**结果，目标进度从 revision 17 到 `WAITING_FOR_ASSET_REVIEW / revision 18`，三张 AI 图片全部返回并等待审核，没有重新提交图片生成。
- 用户操作确认资产后，任务自行推进到 `PREFLIGHT / READY_FOR_PAID_CONFIRM / revision 30`；此时租约已释放、没有视频生成请求或视频付费许可。严格等到该人工费用确认节点才重启 3090，避免中断正在执行的 Director V3 模型调用。
- **根因防复发**：在 `SmartGenerationService.recoverAbandonedScoped(projectId,runId)` 新增“仅对该 Run 检查 PID，只有明确 `ESRCH` 死亡才调用 owner-guarded releaseAbandoned”；在 `startSmartGenerationWorker` 的 scoped 启动路径先执行此方法再推进任务。绝不调用扫描全局历史任务的 recoverAbandoned；PID 仍存活、未知权限/错误则保持 fail-closed。
- 构建及 28 项相关自动化单测 **28/28 PASS**（含活进程不得抢锁、仅目标死锁恢复、其他项目隔离）；License Gate 与 `git diff --check` PASS。
- 安全关卡中重启后，`3090 /health` 与实际工作台均 HTTP 200，Run 仍是 `READY_FOR_PAID_CONFIRM / revision 30`，`consent=false`、视频生成尝试 `0`，未越过费用确认。
- 将完整恢复前数据库与当前库只读对比：**3 个原图片提交编号全部一致，没有新增图片任务**；其它 SmartRun 完全没变化、其它项目完全没变化；指定 Run 的租约为空。未调用抖音发布或评论写入。
- 旧服务端进程退出后才切换新启动会话；重启恢复功能现已由新版已编译服务加载。Git 工作区仍有其它历史未提交修改，因此本轮不混合提交或 reset/clean。

**最终状态：已恢复原任务、已修复 scoped worker 启动时对指定 Run 的死租约恢复缺陷；现等待用户审核本轮镜头费用，未取得授权不会提交 Seedance 生成。**

## 运行与安全边界

- 当前 3090 为本机持久 AgentDock 会话，后台只处理用户授权的指定 Run。不可将 `PVS_SMART_WORKER_DISABLED` 直接改成非 1，否则会恢复全局扫描旧任务。
- 当前 Run 在 `WAITING_FOR_CREATIVE_REVIEW` 等待用户选择 5 个创意之一。后续新增制作资产或视频积分请求，仍必须获得当前 Run 对应的新范围的明确确认。
- 今后新建其它 SmartRun 时，除非另有审批并授权精确作用域，其工作台应诚实显示自动执行暂停。请不要将本次 scope 扩大到所有项目。
- 安全回退：先结束当前 3090 的 scoped AgentDock 会话，把 `.runtime/pvs-safe-launch.mjs` 中 `PVS_SMART_WORKER_SCOPED_ENABLED` 调回 `0`，保持 `PVS_SMART_WORKER_DISABLED=1` 再重启；不需要回滚数据库。
- 当前 Git 工作区有其它历史任务的较大量未提交更改。本次没有执行 reset/clean，也没有提交其它人的修改；正式独立提交须先划清变更边界。
