# Product Video Studio 抖音 Bridge 长期稳定连接修复（2026-10-09）

## 结论和根因

旧方案：专用 Chromium + Tampermonkey `Bridge: Douyin` + douyin-cli Bridge Server。浏览器、扩展和抖音网页都可以正常打开，但 Tampermonkey 将本地安装脚本标为 **`enabler_warning`：来源未确定、需要用户检查并保存**；关闭/重启该专用 Chromium 后，相同代码、相同令牌也会重新进入警告状态。用新建的无关测试脚本交叉验证，同样复发，所以不是单一脚本语法或账号失效。

原 PVS Windows launcher 还有两个隐患：把“已有抖音标签页”当作连接成功；重启专用浏览器时可能在恢复旧标签页之外再开第二个抖音主页。实验性的 CDP polling 客户端只运行约 120 秒，结束后 Bridge 注册表仍可短暂保留旧连接，形成虚假可用。

## 已实施的方案

**运行原则：PVS 本机网页启动后才运行监督程序，不依赖 Tampermonkey，仍在用户已有正常登录的专用 Chromium Profile 操作。**

- `scripts/douyin-ops-cdp-bridge.mjs`：持久 CDP 客户端。只附着到本机 `127.0.0.1:9223` 的**唯一** `douyin.com` 主标签页。注入此前实际审核过、按 SHA-256 固定版本的两个页面脚本片段；从本机 `douyin-cli/config.json` 读取 Bridge 凭据，不输出凭据。使用现有经认证的 `19422 /api/connect`、`/api/poll` 和 `/api/result` 协议，不自行发起视频发布、点赞、评论或付费视频任务。页面刷新或浏览器/Bridge 重启后重新注册；来源脚本哈希改变时拒绝接受未知代码。
- `scripts/douyin-bridge-supervisor.mjs`：每 3 秒检查已有 douyin-cli Bridge Server 健康状态，只在不存在或离线时尝试启动**现有本机** `douyin-cli/server.js`；避免重复启动其它服务，不打开 Chrome。
- `.runtime/pvs-safe-launch.mjs`：沿用 `PVS_SMART_WORKER_DISABLED=1` 与原单任务 scoped 白名单，不改 PVS 付费状态或全局 worker；3090 成功监听后在同一个进程中加载上述两项监督组件。19423 `/health` 仅返回安全的 CDP 连接状态，不返回 Cookie 或 token。
- `src/adapters/douyin/windows-douyin-ops-launcher.ts`：只有 Bridge 与 CDP 服务真实可用才可返回成功；缺失时尝试启动现有本地配置并等待恢复。使用 `spawn(..., stdio:"ignore")`，避免 cmd 后代 Chromium 继承输出管道导致长时间悬挂；不能恢复时明确返回失败，不虚报 `READY`。
- `C:\Users\Administrator\AgentDock\douyin-cli-browser.cmd`：仅使用固定的专用 Profile。新启动改用 `about:blank`，避免会话恢复时重复打开抖音；本地 CDP 运行时复用现有浏览器，不启动第二个 Chrome。专用 Profile 新启动不再依赖 Tampermonkey 扩展。
- `scripts/ensure-douyin-main-tab.mjs`：**仅在用户明确点击启动/恢复时**检查该专用浏览器；已有一个抖音主页则复用，没有主页则复用空白标签页导航到抖音；多个主页时拒绝随机选择。没有对日常 Chrome/Edge 执行任何修改。
- `douyin-cli/scripts/prepare-pvs-userscript.mjs` 及 `PVS_BRIDGE.md`：保留旧 Tampermonkey 回退路径和私有令牌安装文件，用于明确回退时人工审核。新 CDP 方案不依赖此用户脚本运行；原浏览器 Profile 未删除。

**端口**：PVS 3090；douyin-cli Bridge Server 19422；CDP 客户端健康服务 19423；专用 Chromium DevTools 9223。上述端口均监听 `127.0.0.1`。

## 真实验收

1. Tampermonkey 来源受限故障：独立复现；更换安装方式后不再依赖 Tampermonkey 启用状态。
2. CDP 原生连接：`douyin-cli pvs_bridge.js probe` 返回 `READY`，所需页面函数 identity / myPosts / search / getDetail / getComments / replies 均通过检查。
3. 专用浏览器重启与恢复：
   - 首次测试曾发现会话恢复 + 额外打开 douyin.com 形成两张相同标签，状态如实 `FAILED`。修复为 about:blank 并校验唯一主页。
   - 后续三次独立重启通过：正式 3090 启动接口 HTTP 200、`STARTED`；每次最终只有 **1 个抖音主页**、Bridge 成功注册。包含完整冷启动中“只打开空白页”的边界情况，启动器复用该页后正常恢复，实测约 **4.6 秒**。
   - 另行刷新原抖音网页，CDP 注册代数增长且未丢失页面；实测 `CDP_PAGE_RELOAD_REATTACH_PASS`。
4. douyin-cli Bridge Server 真实进程恢复：仅终止 PVS 自己启动且 ParentPID 已核对的 Server，约数秒内由 Supervisor 自动重启，CDP 注册代数增长；`BRIDGE_PROCESS_CRASH_AUTO_RECOVERY_PASS`。
5. PVS 真实账号状态：`/api/douyin/ops/status` 返回 `runtime READY`、`account MATCHED`、`ops READY`，只读读取 **5 条**运营作品；`/api/douyin/ops/launch` 已连接时重复点击约 **0.1 秒**完成，且主标签页仍为 1。
6. 全量测试：`npm.cmd test` **536/536 PASS，EXIT_CODE=0**（日志 `.runtime/pvs-douyin-cdp-resume-fulltest-20261009.log`）。隔离 Chrome Playwright 全站 **44/44 PASS，EXIT_CODE=0**（日志 `.runtime/pvs-douyin-cdp-resume-e2e-20261009.log`）。更新过的启动器专项 **12/12 PASS**；TypeScript Build、License Gate 与 `git diff --check` 通过。
7. SQLite Online Backup `.runtime/pvs-douyin-cdp-predeploy-20261009-1905.db` 通过 `integrity_check=ok`。部署前后严格比对了**11 个 SmartRun 的数据指纹、9 个 Project 记录**；GenerationRequest / GenerationAttempt / Preflight / Approval 数量分别仍为 **33 / 23 / 33 / 23**，目标 `PREFLIGHT / READY_FOR_PAID_CONFIRM / revision 30`，`consent=false`、`attemptIds=0`、无活租约。无新增远端视频任务，无抖音发布/评论写入。

## 用户操作

在 PVS 当前研究步骤点击 **「启动/恢复抖音连接」**。若浏览器未打开，启动唯一专用 Chromium；若已打开，则只复用它。成功后点击 **「重新检测抖音连接」**，以运营接口的 `READY`、账号状态与只读搜索结果为准。

相关本机只读诊断：

```powershell
Invoke-RestMethod http://127.0.0.1:3090/health
Invoke-RestMethod http://127.0.0.1:19422/api/health
Invoke-RestMethod http://127.0.0.1:19423/health
Invoke-RestMethod http://127.0.0.1:3090/api/douyin/ops/status
```

不要仅以 19422 连接数判断可用性：在旧脚本模式，断开的 polling 客户端有可能保留旧注册记录。新 19423 `/health` 的 `ready` 与 PVS 的实际 probe / status 必须一起核对。

## 安全、回退和已知边界

- 本修复未添加自动发布、自动评论、私信或自动点赞；PVS 原先的发布/互动功能必须继续经过各自明确的用户操作及原有权限校验。连接服务本身**不会主动**执行这些动作。
- 专用浏览器仍依赖抖音实际登录态、网站响应和验证机制。若平台要求人工登录或出现风控，必须诚实报告 `AUTH_REQUIRED` / `RISK_CONTROL`，不能绕过。
- PVS 服务停止时，同进程 CDP Reader 会停止；PVS 重新启动后能重新建立连接。若 Chrome 因操作系统/启动会话退出，专用 Profile 会被保留，使用原启动按钮恢复即可；不承诺程序未启动时仍有全天候监控。
- 固定 SHA 指纹用于防止未审查的本地源文件变化被悄悄执行。正常更新 douyin-cli 脚本时必须复审再更新指纹，不得直接移除检查。
- Tampermonkey 原安装脚本及专用 Profile 保持存在，仅 CDP 模式停止依赖它。回退：在安全人工审批节点停止 3090，在 `.runtime/pvs-safe-launch.mjs` 中移除两项本地 bridge import，并将 `douyin-cli-browser.cmd` 恢复为本机备份 `C:\Users\Administrator\.agentdock\backups\pvs-douyin-tampermonkey-20261009\douyin-cli-browser-before-repair.cmd`，最后沿用既有 PVS scoped 配置启动。**旧模式仍可能复发 Tampermonkey 来源警告**，不应作为长期首选。
- 本次保留了 Git 中既有未提交修改，未执行 `reset`/`clean`，未混合提交其他功能。
