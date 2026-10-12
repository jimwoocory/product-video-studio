# PVS W1 统一下一步与原任务回程：首批实现验收

- 日期：2026-10-08
- AgentDock 任务：`tsk_7e29e13195c811ac`
- 工程范围：W0 全场景审计 + W1 下一动作决策与任务回程；W2/W3/W4 不在本次“已完成”范围
- 路线：确定性 Workflow + 可恢复任务，不使用自主 Agent

## 已完成的代码改动

1. `src/application/services/workflow-next-action.ts`：纯只读 `resolveProductionNextAction`，覆盖 **21 个 SmartRun 状态 / 13 个阶段**，优先使用当前项目最新未关闭 SmartRun；否则按真实 Project 状态、产品资料/事实检查或最后确认的成片进行兼容兜底。
2. `src/web/smart-generation-http.ts`：新增 **GET `/api/projects/:projectId/workflow`** 返回唯一下一步与具体 Run 回程信息；POST 等其他方法返回 405。既有 `smart-runs` API 不变。
3. `src/web/smart-generation-ui.ts`：智能生成页顶部新增「当前工作流」卡片，显示当前阶段、状态、唯一下一步和解释；原 Run 每张卡有固定锚点；真实付费动作仍必须经既有按钮/范围确认。
4. `src/web/workbench-ui.ts`：通过受控 `fromSmartRun` 参数进入产品事实、视频生成、最终成片等兼容页面时，向原项目 `/smart#smart-run-...` 提供回程入口；**先 GET 校验 Run 确属本项目**，不信任外部 returnTo URL。
5. `src/web/creative-reference-ui.ts`：创作参考素材池同样支持经过项目归属验证的原 Run 返回入口，不改变已有素材审核与使用权确认。
6. `tests/workflow-next-action.test.ts`、`tests/e2e/workflow-next-action.spec.mjs`：覆盖每个 Run status、跨项目隔离、取消任务恢复、付款 Gate、只读 API、独立浏览器端的下一步和返回入口。
7. `docs/PVS-W0-WORKFLOW-AUDIT-2026-10-08.md`：12 类真实业务/异常场景、现有页面/状态冲突、初步实施决策及后续 W2/W3/W4 边界。

## 已运行的验证

- `npm.cmd run build`：PASS。
- `node --test dist/tests/workflow-next-action.test.js dist/tests/workflow-navigation.test.js dist/tests/smart-generation.test.js dist/tests/review-actions-ui.test.js`：**36/36 PASS**（包含覆盖所有 21 个 Run status 的参数化检查）。
- Playwright 真实浏览器：`tests/e2e/project-navigation.spec.mjs` + `tests/e2e/workflow-next-action.spec.mjs`：**2/2 PASS**，在隔离 E2E 数据库和 3190 服务运行，避免污染当前生产项目。
- `npm.cmd run license:gate`：PASS。
- `git diff --check`（相关 Web 文件）：退出码 0；Git 仅提示既有行尾格式将规范化。
- 更新后的正式 3090 服务：`GET /health` → 200；`GET /api/projects/:id/workflow` → 200；`GET /projects/:id/smart` → 200，界面包含新状态卡片及 Run 锚点。
- 真实 `Tonemay 耳机宣传1` 项目：正确返回 `SMART_RUN / CLIP_REVIEW / 播放并确认待审镜头`，明确链接至本项目 `generate?fromSmartRun=<原 run id>`；另一个已发布 Tonemay 项目只返回 `final`，不会错误提示重新生成。共抽查 6 个已保存项目的下一步映射。

## 安全与兼容性验证结论

- 新接口与回程链接仅查询/导航，不改动原审批、生成、成片或抖音平台数据。
- 不增加自动发布、自动评论或调用付费 Seedream/Seedance 的逻辑；付费提示独立于确认按钮。
- 原有生产代码存在大量用户/其他开发进程尚未提交的改动；本轮未清空、回退或覆盖它们，尚未进行 Git commit。
- 正式服务启动前核查：**自动执行型 SmartRun = 0**；任务中心有两个早期深度研究记录仍标记 RUNNING，但它们的最后更新时间为 2026-10-05 / 10-06，本轮没有重提研究、没有删除或篡改这两条记录。
- 此处 **W0 是代码实证基础上的工程初审，不代表已召开或获取多位独立团队成员签字的正式会议**。

## 仍需完成，不得当作本轮已交付

- **W2：** 将深度研究、参考视频、角色场景资产、剧本/分镜/Prompt、低置信审片、后期音频原位嵌入或统一子流程。当前仍需要进入部分独立页面，W1 只提供安全回程，不会自动完成所有人工确认。
- **W3：** 局部镜头重做 Preflight 引用与整组授权误失效 BUG；发布成功后的抖音运营连接与作品绑定；失败/费用未知的精确恢复。
- **W4：** 从零、参考爆款、剧情广告、单镜头重做、剪辑后渲染、发布到抖音运营全部真实全链路的端到端回归；需要独立确认外部付费/发布风险。
- 原有 `docs/TODO-AI-MODEL-CAPABILITY-AUTO-ROUTING-2026-10-08.md` 等待办不属于 W1。

## 后续建议

先围绕用户最痛的「待审镜头 → 当前 SmartRun → 继续原任务」完成 W2，避免新增另一套状态机；之后按照依赖修复 W3 单镜头重检，才可宣称该重做流程真正连通。
