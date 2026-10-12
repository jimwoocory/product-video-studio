# PVS 抖音深度研究连接检测误报：修复与验收

日期：2026-10-10（北京时间）  
AgentDock 任务：`tsk_d8718a37fe47c7cb`

## 根因（已确认）

此前研究前置脚本 `src/web/douyin-research-preflight-ui.ts` 使用 6 秒 `AbortController` 检查 `GET /api/douyin/ops/status`。但该端点为**完整运营仪表盘**：调用 `DouyinOpsDashboardService.global()`，顺序执行 runtime probe、发布账号与运营账号核验、`listMyWorks(30)`、项目/作品绑定查询。此前连接正常时实测该接口用时约 7.15–7.48 秒，修复期间未启动专用抖音浏览器时再次测得 8.157 秒；所以浏览器过早中断请求并显示“连接检测超时”，不等于账号真的掉线。

研究页另在市场视频 `PROVIDER_NOT_AVAILABLE` 结果卡与研究表单重复插入相同连接面板。现有 `douyin-cli` Bridge 与浏览器降级搜索 Provider 已接入，**无需更换搜索或下载引擎**。

## 实施范围

1. 新增 `src/application/services/douyin-research-readiness.ts`：只执行现有只读 `opsRuntime.probe()` 和 `opsRuntime.identity()`。成功要求 Bridge 就绪且有实际运营身份；无身份、认证过期、风控和 CDP 未注册时返回不同的已知状态；不访问发布账号、作品列表、项目绑定记录，不泄露抖音 UID/凭据。
2. `DouyinOpsDashboardService.researchReadiness()` 和 `GET /api/douyin/ops/research-readiness`；仅允许 GET，旧 `/api/douyin/ops/status` 保留给完整运营页面，保持兼容性。
3. 研究前置调用新接口，GET 最多等待 9 秒；用户明确点击恢复时 POST 最多等待 28 秒。连接检查超时返回“**未能确认，不等于已断线**”，不自行启动浏览器或搜索。并发检查在同一表单复用 Promise；真正搜索仍须原提交动作。
4. `workbench-ui.ts` 中被阻断的市场研究卡只提示用户操作上方连接面板，不再重复渲染控件。
5. 旧 `YhtDouyinOpsMarketVideoSearchProvider`、浏览器 Provider、视频素材下载和抖音运营只读/发布 API 保持原有路径；无自动发布、无付费视频生成、无 Cookie 输出。

## 已验证的隔离回归

- TypeScript 编译 PASS（`npm.cmd run build`）
- 只读连接新契约、HTTP GET-only、登录过期、Bridge 离线、风控、真实身份、禁止隐含作品查询：专项 **21/21 PASS**（包括旧抖音运营页面和研究 UI）
- Chrome 定向 **14/14 PASS**：包括模拟 6.5 秒延迟但不误报断线、Bridge 离线阻断抖音研究、跳过后继续普通研究、旧运营接口从不被研究连接检查调用
- 全仓隔离单元/集成 **568/568 PASS，exit 0**，日志 `.runtime/pvs-research-readiness-fulltest-20261010.log`
- 全站 Chrome Playwright **47/47 PASS，exit 0**，日志 `.runtime/pvs-research-readiness-e2e-full-20261010.log`
- License Gate **38 packages / 7 external runtimes PASS**，`git diff --check` PASS

## 本机安全恢复和真实只读验收

恢复正式网站 `http://127.0.0.1:3090`，使用原 `.runtime/pvs-safe-launch.mjs`，关闭全局 SmartRun worker，保留唯一原 scoped Run（无支付许可）。网站 /health HTTP 200。

上线时原专用浏览器未打开，新接口 **113ms** 以 `SITE_OFFLINE` 正确报告“专用抖音网页尚未注册”；旧完整运营状态接口此时耗时 **8157ms**。随后仅按既有专用配置打开一个抖音主页并恢复已有 CDP Bridge；没有搜索、自动登录、发布或支付。CDP 健康状态：`ready=true`、`registered=true`、`mainPage=true`，一个抖音主页。新接口连续三次真实调用分别 **938ms、455ms、538ms**，均 `HTTP 200 / READY`，且不输出抖音账号身份字段。

通过独立 headless Chrome 只读打开现有 PVS 产品研究页，选择 DEEP（不点击“开始研究”）：页面显示“抖音研究连接与账号均已确认”，**连接面板 1**，新接口调用 **1** 次，旧运营状态接口 **0** 次，POST/其他写请求 **0** 次。

生产数据库已预先通过 SQLite 原生在线备份（`.runtime/pvs-research-readiness-predeploy-20261010.db`，55,685,120 字节，`integrity_check=ok`）。启动及浏览器恢复后，与部署前生产快照逐字段对比：
- 9 Projects、11 SmartRuns、0 活跃任务租约：MATCH
- GenerationRequests 33、GenerationAttempts 23、Preflights 33、Approvals 23：MATCH
- 目标 Run `READY_FOR_PAID_CONFIRM / revision30`，`consent=false`，新增付费尝试 `0`：MATCH

审计证据：`.runtime/pvs-research-readiness-before-20261010.json`、`.runtime/pvs-research-readiness-final-20261010.json`。原大量 Git 未提交改动不 reset/clean，不擅自提交/推送。

## 浏览器运行生命周期的补充复核

诊断期间，第一次专用 Chromium 是从临时 AgentDock 命令会话直接启动，随后该命令会话超时，浏览器进程消失，CDP 9223 关闭，而 PVS 3090、Bridge 19422 与 CDP 读端 19423 服务仍运行；新接口正确返回 SITE_OFFLINE。这是**实际浏览器进程消失**，与原先“连接明明可用却因旧完整状态查询超时而误报掉线”不同。它与临时命令的超时在时间上相关，尚不能仅凭这些证据断言浏览器为何被 OS 结束。

随后改从已有 PVS `POST /api/douyin/ops/launch` 的明确恢复入口启动专用浏览器，没有碰正常 Chrome、发布内容、自动登录或付费生成；请求约 4.13 秒返回 STARTED，CDP 注册正常。连续 20、40、60 秒的轻量读状态分别 548、560、538ms，均 HTTP 200/READY。只验证此窗口，**不宣称已经证明长时间运行永不掉线**。

## 边界

该修复解决的是**研究前置连接误报**，不等同于证明实际竞品搜索/媒体下载一定成功。抖音平台仍可能进行登录验证、风控，或对公开视频数据设置可见范围。真实搜索效果需用户按“开始研究”后由已接入的 Provider 输出证明。本次没有提交真实搜索任务，也没有绕过平台验证。已打开的旧研究页面若仍运行缓存脚本，用户需要刷新页面加载修复后的前端。
