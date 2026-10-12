# PVS 抖音 Bridge 连接故障核查（2026-10-09 17:53–18:00 CST）

## 核查范围
仅执行只读检查：3090 PVS /status、19422 douyin-cli Bridge /api/status、9223 已有 Chromium CDP 页面、Tampermonkey 扩展运行状态、专用 Profile 用户脚本存储，以及本机配置文件。没有结束/新建浏览器、刷新抖音页、修改脚本配置、触发登录或发起研究搜索。

## 已证实的事实
- PVS `http://127.0.0.1:3090/health` HTTP 200，`/api/douyin/ops/status` HTTP 200，但 Douyin runtime 回报 `SITE_OFFLINE`，账号 Ops 状态不可用。
- douyin-cli Bridge `http://127.0.0.1:19422/api/health` 正常；`/api/status` `totalConnections=0`。
- 独立 Chrome for Testing 使用 Profile `AgentDock/douyin-cli-browser-profile`、CDP 9223，主页面 `https://www.douyin.com/jingxuan` 正常加载。
- 从该真实页面只读读取：`typeof window.__bridge === "undefined"`，`typeof window.__bridge?.identity === "undefined"`，`typeof window.__bridge?.search === "undefined"`，没有相关注入全局。
- Tampermonkey 5.5.1 MV3 扩展已加载（ID **仅用于本机排查** `fleejhhdahiofpginbjnpgjcnamejjjc`），Service Worker 存在，`chrome.userScripts` API 可用，`chrome.permissions.contains({ origins:["https://www.douyin.com/*"] }) === true`；用户脚本 API 有两项通用 `<all_urls>` 注册，无法仅凭注册记录判定目标脚本已经正常执行。
- Tampermonkey Profile 持久存储包含 `Bridge: Douyin` 和与当前 douyin-cli `config.json` 相同的连接令牌，但**未证明该记录正在运行或已启用**。
- 磁盘源文件 `douyin-cli/scripts/douyin.user.js` 的令牌与 `douyin-cli/config.json` 的令牌**不同**。由于浏览器持久存储包含当前 config 令牌，不能将“磁盘源文件不一致”直接当作当前激活脚本的令牌不一致；但后续从该源文件重新安装会面临配置错误。
- 当前 Chromium 命令行明确只加载 `douyin-cli-tampermonkey` 扩展，未加载 PVS 另一个自研研究扩展。当前报错是 douyin-cli Bridge 注册表为空，不能混为一谈。

## 结论及未验证假设
**直接故障点：douyin.com 主页面没有建立应有的脚本注入及本地 Bridge 注册；这不是 PVS 3090 服务崩溃，也不是尚未打开抖音主页面。** Tampermonkey 整体运行、具有站点权限，但需要针对单个 `Bridge: Douyin` 确认是否启用、有没有运行时脚本异常、油猴连接权限/注入上下文是否导致脚本未运行或注册失败。目前不能凭只读证据声称根因已精确锁定为“被禁用”、“CSP 拦截”或“活动令牌不匹配”。

## 建议安全修复顺序（尚未执行）
1. 在**现有**专用 Chromium 的 Tampermonkey 管理面板核对 `Bridge: Douyin` 是否已启用、`@match`、脚本执行计数及报错；不关闭用户日常浏览器或启动新 Profile。
2. 在 Tampermonkey 脚本日志/控制台确认是未注入、`unsafeWindow.eval` 异常、`GM_xmlhttpRequest` 失败还是 `/api/connect` 身份验证错误；不要通过取消认证或绕开平台限制解决。
3. 修正磁盘用户脚本和当前 Bridge 配置一致性，再安全更新实际安装的用户脚本；令牌不得显示在 UI、日志或报告中。
4. 仅重新加载已有抖音标签页进行受控验证；检查页面 `window.__bridge` 函数、Bridge `totalConnections>0`、PVS `/api/douyin/ops/status` READY。随后在授权范围内做只读搜索验证；不进行发布、互动和积分消耗。

## 本机只读诊断工具
`.runtime/pvs-douyin-cdp-inspect.mjs`：使用已启动的 CDP 9223，对主页面及 Tampermonkey Service Worker 做有限只读状态查询。不要在其中添加随意关闭浏览器、Cookie 抓取或授权外发逻辑。
