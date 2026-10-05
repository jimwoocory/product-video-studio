# P1 Final 实用化优化 B-02 — Health / 系统诊断中心

日期：2026-10-05  
状态：PASS

## 目标

提供一个只读系统诊断页，统一检查：

- 大模型 Provider
- Dreamina CLI / Seedance / 登录状态
- FFmpeg / FFprobe
- SQLite / Prisma
- 浏览器 Research Provider
- Publish Providers

诊断不得生成视频、不得抓取研究内容、不得发布，也不得消耗 Dreamina 积分。

## 实现

新增：

- `src/domain/health.ts`
- `src/application/services/system-health-service.ts`
- `src/web/health-center-ui.ts`
- `tests/system-health.test.ts`
- `tests/health-center-ui.test.ts`
- `tests/e2e/health-center.spec.mjs`

修改：

- `src/web/server.ts`
  - `GET /health-center`
  - `GET /api/health/report`
  - WebDependencies 增加 `SystemHealthService`
- `src/web/workbench-ui.ts`
  - 顶部增加“系统诊断”

## 诊断等级

统一四档：

- READY：正常
- WARN：警告
- BLOCKED：需要处理
- UNKNOWN：未知

## 只读安全边界

Health Center 只调用：

- AI Provider 本地配置/历史连接状态
- Dreamina `probe()` / `accountStatus()`
- FFmpeg / FFprobe `-version`
- SQLite `SELECT 1`
- Research Provider 配置状态
- Publish Provider `probe()`

不会调用：

- Dreamina `submit()`
- Dreamina `status()`
- Dreamina `download()`
- Research `discover()`
- Publish `directPublish()`
- Publish `prepareHandoff()`

## AI Provider 诊断

判断：

- 没有 Provider → BLOCKED
- enabled 但缺 API Key → BLOCKED
- FAILED → BLOCKED
- UNTESTED → WARN
- UNCONFIGURED → BLOCKED
- CONNECTED → READY
- disabled → WARN

同时显示默认模型与模型数量。

## Dreamina 诊断

- CLI 不存在 → BLOCKED
- Provider 身份未验证 → BLOCKED
- CLI 可用但未登录 → BLOCKED
- 登录状态 UNKNOWN → BLOCKED
- CLI READY + AUTHENTICATED → READY

此检查不会提交生成任务。

## Research 诊断

当前逻辑：

- `PVS_BROWSER_RESEARCH_URL` 已配置 → READY
- 未配置 → WARN

未配置不标 BLOCKED，因为 Public Search fallback 仍然可用；但遇到登录/验证码/平台内搜索时无法自动接管浏览器。

## Publish 诊断

按所选项目显示：

- READY → 正常
- DISABLED / NOT_CONFIGURED / AUTH_REQUIRED → 警告
- UNAVAILABLE → 需要处理

Manual Export 永久兜底保持可见。

## 自动测试

- Health unit/UI：4/4 PASS
- Browser E2E：8/8 PASS（包含 Health Center）

最终完整 Gate：

- `npm test`: **283/283 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
  - packages=38
  - external_runtimes=5
- `npx prisma validate`: **PASS**
- `npm run test:e2e`: **8/8 PASS**

## 真实公司环境验证

地址：

`http://127.0.0.1:3090/health-center`

真实结果：

### 正常（6）

1. AIHubMix Provider
   - CONNECTED
   - 默认模型：`deepseek-v4.1-flash`

2. Dreamina / Seedance
   - CLI 可用
   - 已登录
   - CLI version：`ec1b9fa-dirty`
   - 当前 probe 可见模型：2 个

3. FFmpeg
   - `9.0.1-full_build-www.gyan.dev`

4. FFprobe
   - `9.0.1-full_build-www.gyan.dev`

5. SQLite / Prisma
   - SELECT 1 正常

6. Manual Export Provider
   - READY

### 警告（4）

1. 外部浏览器 Research Provider 未配置
   - Public Search fallback 仍可用

2. Douyin SDK handoff
   - disabled

3. Douyin H5 handoff
   - disabled

4. Douyin OpenAPI direct
   - disabled

### 需要处理

- 0

### 未知

- 0

浏览器 Console：

- 0 errors
- 0 warnings

## 结论

B-02 Health / 系统诊断中心 PASS。

下一步进入 B-06：Final QC / 发布前质量检查。
