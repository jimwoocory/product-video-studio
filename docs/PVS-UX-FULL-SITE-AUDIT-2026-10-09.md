# PVS 全站页面审计与整改矩阵（2026-10-09）

## 结论：先前 R2–R5 并非全站统一

- R2–R5 已改造的主要是 `/projects/:id/smart` 工作台及其内部同源审核面板；研发报告明确说独立研究、多版本、Timeline 专家页仍独立保留。其 495/495 单测、37/37 浏览器测试不能代表所有页面已经换成一致的新体验。
- 本轮从 `src/web/server.ts`、`smart-generation-http.ts`、`douyin-ops-http.ts`、`creative-reference-http.ts`、`auto-edit-http.ts` 核对实际 HTML 路由，发现多个渲染器分别内置完整 DOCTYPE、CSS 和导航：
  `workbench-ui.ts`、`smart-generation-ui.ts`、`douyin-ops-ui.ts`、`creative-reference-ui.ts`、`publish-ui.ts`、`auto-edit-http.ts`。
- 原先的问题不仅是视觉旧：默认智能工作台由浏览器端 DOM 迁移生成新导航，旧模板又保留独立导航；从工作台进入专业页后出现风格跳变。原先 R5 用户盲测仍未完成。
- 本轮不触碰 Project、SmartRun、Timeline、Final 业务真值与生成/发布授权，仅统一显示层并做原任务安全返回；对存量的旧数据继续兼容。

## 页面清单与优先级

| 实际网页入口 | 原 UI 实现 | 原问题 | 本轮整改范围 |
|---|---|---|---|
| `/projects` | workbench-ui | 独立旧顶栏，和 Smart 页不同 | 共享全站外壳及项目卡 |
| `/agent` | workbench-ui | “智能生成”入口与工作台定位重叠 | 共享导航；主入口命名为视频制作 |
| `/tasks` | task-center-ui + workbench layout | 独立任务页 | 共享导航/样式 |
| `/health-center` | health-center-ui + workbench layout | 旧顶栏/工具页 | 共享导航/样式 |
| `/settings/ai` | workbench-ui | 旧顶栏/技术设置 | 共享导航/样式 |
| `/douyin-ops` | douyin-ops-ui | 完全独立黑色导航条与视觉 | 统一全站导航与主题 |
| `/projects/:id/douyin` | douyin-ops-ui | 独立运营详情、缺当前项目回程 | 全局导航、当前项目与工作台回程 |
| `/projects/:id/smart` | smart-generation-ui | R2 新主工作台仍有手写头部/旧专业页跳变 | 接共享 Shell，移除重复全局导航，保留局部工作台与旧版回退 |
| `/projects/:id/product` | workbench-ui | 旧风格与步骤栏 | 共享导航 + 真实 WorkflowReadModel |
| `/projects/:id/truth` | workbench-ui | 同上 | 同上 |
| `/projects/:id/research` | workbench-ui | 研究专家页样式、上下文回程 | 共享导航 + 研究原功能 |
| `/projects/:id/reference-video` | workbench-ui | 参考视频专家页旧风格 | 共享导航 + 视频预览保留 |
| `/projects/:id/creative-references` | creative-reference-ui | 完全独立页面/导航 | 共用 Shell、回工作台、保留素材权利确认 |
| `/projects/:id/creative` | workbench-ui | 旧兼容专家页 | 共用 Shell，不删除高级创意工具 |
| `/projects/:id/script` | workbench-ui | 同上 | 共用 Shell |
| `/projects/:id/director` | workbench-ui | 同上 | 共用 Shell |
| `/projects/:id/generate` | workbench-ui | 同上 | 共用 Shell/原有审片权限 |
| `/projects/:id/single-video` | workbench-ui | 独立单片段生成 | 共用 Shell/保留单独费用确认 |
| `/projects/:id/auto-edit` | auto-edit-http | 完全独立自动剪辑 HTML | 统一 Shell、回工作台与原剪辑决策 |
| `/projects/:id/models` | workbench-ui | 旧模型设置样式 | 统一 Shell |
| `/projects/:id/timeline` | workbench-ui + timeline-ui | 旧时间线专家 UI | 共用 Shell、保留手动剪辑与版本 |
| `/projects/:id/final` | workbench-ui + publish-ui | 原成片/发布页面与其他页跳变 | 共用 Shell、保留确认回执 |
| `/projects/:id/publish-settings` | publish-ui | 完全独立发布设置 HTML | 共用 Shell、展示当前项目返回 |
| `/publish/mobile/:packageId` | publish-ui | 完全独立手机交接页 | 品牌一致的轻量外壳；**不**露出无效本地全局导航 |

涉及页面的审核、待付费、发布前确认、历史项目、API 未就绪状态仍由原业务服务控制，不应把“成功打开网页”误报成真正完成生成/发布。

## 当前进度与证据

- 建立共享组件 `src/web/pvs-global-shell.ts`：品牌、统一导航、中文入口、当前项目回程、响应式设计。
- 已将上述六个 HTML 渲染入口接入共享外壳；默认智能工作台取消重复全站导航，保留该项目的模型/旧版回退入口。
- 新增 `scripts/ux-fullsite-audit.mjs`（桌面1366px+手机390px，实际 Chrome、24路由×2、截图/HTTP/导航/iframe/溢出/JS错误）与 `tests/e2e/ux-fullsite-shell.spec.mjs` 持续防回归。
- 第一轮截图审计 48 项有 3 异常：其中 2 项为测试中错写 `/douyin-ops`，源代码实际路由是 `/projects/:id/douyin`；另 1 项手机发布设置页在10秒测试超时，直接复测服务返回200。现已修正路径、加长限时，最终轮必须重跑且不得把首次 45/48 冒称完全通过。
- 正式 3090 使用关闭后台自动执行的安全启动方式；所有 GET 逐页回归均在独立 3197 临时 SQLite 与禁用 worker 环境进行，未进行付费生成/真实抖音发送。
- 真实三名未参与开发者独立盲测以及真实积分/发布未执行，不能替其签字。

## 验收准则

1. 全部路由逐项200，统一外壳且只有一个全局导航（安全手机交接页无全局导航），工作台内0个完整网页 iframe。
2. 桌面/手机无明显内容横向溢出，主要入口和回程可见；可直接访问、刷新、返回。
3. 已有素材、产品事实、创意、审核、Timeline 与成片不被替换；不产生未授权付费或抖音对外动作。
4. 隔离端单元+集成、真实 Chrome 全路由及原P1 E2E通过；不得将旧项目依赖的数据强行迁移。
5. 人工盲测另按 `docs/PVS-UX-R5-HUMAN-ACCEPTANCE-CHECKLIST-2026-10-09.md` 独立执行。

