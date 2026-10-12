# PVS 全站 UI 整改工程收口记录（2026-10-09）

> **状态：工程层整改与正式 3090 安全切换已完成；真实用户完整交互验收未完成。** 切勿将“UI Shell 接线”误表述为已完成所有业务体验的终验。

## 1. 本轮真正查出的遗留问题

上一轮 UX-R2～R5 的验收范围偏向 `/projects/:id/smart`，却未将**所有 URL + 所有独立 HTML 模板**作为完成条件。导致：
- 工作台已换新，点击研究、专家分镜/剪辑、运营、创作参考、发布设置后仍像另一套产品。
- 重复顶栏由工作台内 JavaScript 追加，交互时容易重复或跳转不清楚。
- 没有按路由数量逐页验证；旧 37 个浏览器测试不足以证明全站统一。
- 手机安全发布交接、自动剪辑、错误提示页此前不在统一组件覆盖范围内。

## 2. 实际修改的源码与内容

| 文件 | 实际改动 |
|---|---|
| `src/web/pvs-global-shell.ts`（新增） | 唯一品牌导航、页面上下文、全站样式、响应式移动导航、当前项目与“回到制作工作台”、手机交接安全变体 |
| `src/web/workbench-ui.ts` | 为项目页、研究、参考、旧专业工作流、Timeline、成片、任务、诊断、模型设置统一外壳；保留升级前已生效的工作流状态与高级信息开关 |
| `src/web/smart-generation-ui.ts` | 默认工作台接入同一品牌外壳，原 R2 动态插入的第二层全局导航降级为当前项目工具条；仍保留 `?ui=legacy` 回退和既有素材、审核、付费闸门 |
| `src/web/douyin-ops-ui.ts` | 运营首页及项目详情统一顶部导航/主题；详情显示当前项目回程，不改平台数据和账号权限 |
| `src/web/creative-reference-ui.ts` | 研究创作参考素材池统一导航，并保留原参考素材审核/来源及权限功能 |
| `src/web/auto-edit-http.ts` | 独立自动剪辑专家页统一外壳，保持原音频/剪辑决策、已确认视频和版本保留机制 |
| `src/web/publish-ui.ts` | 发布设置统一外壳及项目回程，手机安全交接只用品牌外壳，**不**注入本机地址的普通全局链接 |
| `src/web/blocked-step-ui.ts` | HTML 异常/失效提示页也使用统一外壳；JSON API 错误处理不变 |
| `src/web/server.ts` | 浏览器遇到项目页异常时回到该项目的制作工作台，不再无理由退回产品资料；其他业务服务未改 |
| `tests/douyin-ops-web.test.ts` | 原测试只比对 workbench 源码中硬编码导航链接，改为测试共享导航实际渲染，不再绑定旧架构 |
| `tests/e2e/ux-fullsite-shell.spec.mjs`（新增） | 24 个页面入口 × 桌面/手机，验证 200、唯一导航、无整页 iframe、390px 无页面横向溢出 |
| `scripts/ux-fullsite-audit.mjs`（新增） | 独立 Chrome 全路由截图工具，额外采集 JS 异常、宽度溢出、截图文件，保存 `.runtime/ux-fullsite-audit/report.json` |
| `docs/PVS-UX-FULL-SITE-AUDIT-2026-10-09.md`（新增） | 本次完整旧页追查、24 路由矩阵、测试边界 |

以上只覆盖 UI / 错误路由 / 回归测试。不重写产品设计真值、视频任务状态机、项目数据库，也不偷改既有工作区的其他未提交代码。

## 3. 验证结果

| 验证项 | 结果 | 证据 |
|---|---|---|
| TypeScript 编译 | PASS | `npm run build` |
| 许可证依赖 Gate | PASS | `LICENSE_GATE_PASS packages=38 external_runtimes=7` |
| 原有与新加 Chrome Playwright E2E | **39/39 PASS** | `.runtime/ux-fullsite-browser.log`；新增 2 项为 24 路由×2 的全站门禁 |
| 正式端切换后的定向 E2E | **6/6 PASS** | `.runtime/pvs-rollout-targeted-e2e.log`：阻断页、导航、24路由桌面与手机复测 |
| 独立 Chrome 24×2 截图、导航与手机溢出审计 | **48/48 PASS，0异常** | `.runtime/ux-fullsite-audit/report.json` 与逐页 PNG，`FULL_SITE_AUDIT total=48 failures=0` |
| 单元/集成隔离重测 | **495/495 PASS，0失败** | `.runtime/ux-fullsite-unit-FINAL.log`，`tests 495; pass 495; fail 0` |
| `git diff --check` | **PASS** | 最后一次编译、license gate 与 diff --check 均 exit 0，`FINAL_GATES_PASS` |
| 真实 Seedream / Seedance 积分扣费与视频生成 | 未执行 | 安全要求：必须独立显式批准 |
| 抖音真实账号发布/评论发送 | 未执行 | 安全要求：不使用现场账号验收 UI |

注意：第一次截图审计 45/48，其中两项是测试人员把路由 `/projects/:id/douyin` 错写为 `/douyin-ops`；另一次为手机端慢载入超时。路径与超时已调整，最终必须以重测结果为准，不能篡改首次错误。

## 4. 部署隔离与遗留验收

- **用户在本轮明确要求“继续”之后**，3090 已于 2026-10-09 约 11:58 安全切换到当前编译版本：`http://127.0.0.1:3090/projects`，现场确认 HTTP 200 且 `data-pvs-ui-shell="unified-v2"`。使用原 `.runtime/pvs-safe-launch.mjs` 与持久 AgentDock 命令会话，`PVS_SMART_WORKER_DISABLED=1`，自动恢复旧编排与付费执行器未开启。启动命令一次因超时回收子进程，已改用持久会话重启并验证端口再次在线。
- 新源码的隔离 Chrome 预览在 `http://127.0.0.1:3197/projects`，使用 `fullsite-e2e.db` 与 `fullsite-e2e-projects`，禁用付费 worker；只有虚构示例项目，不是正式用户数据。浏览器 E2E 另用3193隔离服务。
- 面向真实用户的交互和视觉盲测尚未签字：需要按 `docs/PVS-UX-R5-HUMAN-ACCEPTANCE-CHECKLIST-2026-10-09.md` 逐一走**研究→参考→创意→脚本→分镜→生成→剪辑→成片/运营**，含旧项目恢复、登录失效、缓存、账号绑定等状态。
- 独立专家模块的业务功能仍保留；虽然这次已经统一外壳、返回入口及主题，部分专业表单深层布局尚未经过真人逐控件评测。**如果用户要求所有内页每个控件也重新设计，仍需下一轮页面内容级改造及人工签收，不得误报已全部完成。**
- 已确认原 8 个真实项目的 Project 状态保留，没有清理旧数据库或素材目录。`node .runtime/pvs-3090-smoke.mjs` 使用 Chrome 对 8 项目×8页面+项目首页进行 65 次只读页面检查，结果为 **65/65 PASS、0个非GET/HEAD请求、0个项目状态变化**；检查 HTML 200/统一外壳/唯一全局导航/无iframe/无溢出/无页面脚本错误。`node .runtime/pvs-3090-workflow-audit.mjs` 对 8 个项目的 WorkflowReadModel 做只读校验，**0个跨项目下一步**（有一个历史已发布项目的新SmartRun仍待审片，已独立展示）。
- 正式服务仍需运维保障持久进程驻留；当前运行于 AgentDock 持久命令会话，并非已经安装 Windows 服务。浏览器中尚未保存的表单内容无法仅凭只读检查恢复；切换前用户已通过“继续”同意操作。

## 5. 防止今后出现同类问题的验收门禁

任何宣称“全站 UI 改造完成”的变更必须满足：登记当前源码路由全集；新增/调整路由必须更新独立全站 E2E 清单；新页面禁用自定义第二套全局顶栏；页面进出必须保留原项目/原任务的稳定链接；真实 Chrome 逐页截图及手机视口通过；所有 P0/P1 业务回归正常；部署服务的新旧版本实际可验证；用户真实场景抽检签收。不能再用“主工作台测试通过”代替“整个产品已经统一”。
