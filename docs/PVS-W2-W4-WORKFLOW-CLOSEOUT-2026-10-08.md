# Product Video Studio W2–W4 工作流改造与安全验收报告

- 日期：2026-10-08
- 执行任务：AgentDock `tsk_62d165220397c6b6`
- 范围：业务确定性 Workflow 操作路径 / 原任务恢复 / 单镜头安全重做 / 发布后运营 / 多场景回归
- 决策：**不实施 Agent 架构；继续沿用 PVS 原有 SmartRun、Project、Preflight、Review、Timeline、Publish、DouyinOps。**
- W0/W1 参考：`docs/PVS-W0-WORKFLOW-AUDIT-2026-10-08.md`、`docs/PVS-W1-UNIFIED-WORKFLOW-CLOSEOUT-2026-10-08.md`
- 交付性质：已有真实本地代码和正式浏览器隔离回归；**不宣称已执行产生积分费用的 Seedance/Seedream E2E，也不宣称真实抖音发布 E2E**（需要另行授权）。

## W2：工作流按目的进入、原任务内处理并安全恢复

1. `src/web/smart-generation-ui.ts`：主流程顶部按目的提供明确路径：完整视频、同类爆款研究、已有参考视频、单片段生成、已有素材重新剪辑、已有成片发布运营。专业编辑页保留，没有增加 Agent 模式。
2. 当前运行中的 SmartRun 优先于旧 Project.status。每个 Run 都具有稳定锚点 `#smart-run-...`；项目列表直接显示当前阶段及最重要的下一步，点击“继续项目”进入具体原任务而非随意跳到旧分镜或旧生成页。
3. 当前待审的产品事实、创作参考、镜头及最终成片，在 `#review-panel-...` 展开内嵌的受控同源审核页；仍允许独立打开完整专业页面。审核后可在原任务一键刷新真实状态，不假装自动审片通过。
4. 研究、上传参考视频和研究素材池在当前智能生成页内的受控工具面板打开，保持项目/Run 上下文和用户手动编辑能力。确认事实及素材使用权的原门禁保留。
5. 从被打开的子页面返回时，必须先验证 `fromSmartRun` 对应 Run 真实属于同项目；不接受任意重定向 URL、跨项目 Run 或伪造路径。
6. `GET /api/projects/:id/workflow` 依旧只读，展示状态和下一动作不创建视频任务、不确认费用、不发布平台。

## W3-A：单镜头重检/重做与制作资产根因修复

根因包括：旧的手动 Preflight 缺 ProductionAssetSet 绑定和 Director V3 参考图；进入 Preflight 就先按项目调用 `markSubmissionChainStale`，使其它成功镜头授权失效；`ReviewService.decide(REDO)` 也曾按项目作废；即使 Preflight 修复，后续 `resolveGenerationAssets` 也未识别生成资产。

已落地：

- `src/web/server.ts` 在单镜头预检时按 **ProductionPlan id+hash+projectId** 读取对应真实 SmartRun 的 ProductionAssetSet，校验生成图片 **READY / 实际 Artifact / 人工确认 / 版本**，并把确认的参考素材与 Director V3 的 Clip Contract、每镜头 Prompt 和生成设置一起送入 Preflight；错误中文提示，不通过字符串绕过素材门禁。
- `src/application/services/generation-preflight.ts` **先编译/全部验证，后保存状态**；任一镜头被 Blocked 或失败不覆盖原 CURRENT Request，不篡改旧 Approval；只处理指定 clipIds，其他镜头的未知提交结果不应阻挡此次局部预检。
- `src/application/ports/generation-repository.ts` + `src/adapters/db/prisma-generation-repository.ts` 新增 Prisma 事务 `replacePreflightChain`：同事务作用于目标 clip 的 CompiledPrompt、GenerationRequest、PreflightReport、UserApproval；任何插入失败整笔回滚，其它 clip 不变。模拟历史记录、受控故障与成功替换的回归已通过。
- `src/application/services/review-service.ts` 选择 REDO 时由按项目 stale 改为仅调用 `markRequestChainStale(attempt.generationRequestId)`。另一个镜头在同项目仍保持 Request=CURRENT、Report=PASS、Approval=ACTIVE，专项数据库集成回归通过。
- `src/application/services/production-asset-context.ts`、`src/application/services/production-asset-service.ts` 和 `src/web/server.ts` 实际视频提交前按请求记录的 **ProductionAssetSet id+hash** 重建固定角色/场景生成资产；局部重检仅解析目标镜头引用的图片，避免其它镜头不相关图片异常影响目标镜头。缺失或版本不匹配即拒绝并保留既有成功视频。隔离测试证明目标图片可用时跳过其它图片缺失；完整未筛选制作仍拒绝缺图。

重要历史数据政策：旧 Tonemay Q8 的 3 个真实视频 SUCCEEDED 保留；先前已被旧 Bug 标成 STALE 的请求/预检/授权记录**不会自动改回 ACTIVE**，用户若重新提交视频须按目标镜头重新生成新的 Preflight 和明确的新积分确认。此前错误动作造成的旧 STALE 审计记录仍有诊断价值。

**真实 Q8 只读验证通过**：项目 3 个导演镜头、9 处 `production-asset:` 引用、3 张已人工确认的生成资产，Director V3 版本=3；且用真实本地图片字节逐一核对 **3/3 SHA-256 完整性通过**（检查脚本 `.runtime/w4-verify-q8-asset-bytes.mjs`）。这些引用按新生产资产绑定解析器全部通过。未调用外部 Dreamina probe/submit/生成或改动该项目数据库。

## W3-B：已发布作品进入抖音运营

- `src/application/services/published-ops-entry.ts` 对可信回执进行严格验证：当前项目、当前成片的 Assembly + Artifact ID + SHA256、已确认可用的最终文件、匹配的 Douyin PublishPackage `PUBLISHED_CONFIRMED` + confirmedAt、同包同服务商的 trusted Receipt。
- `src/web/workbench-ui.ts` 的成片页下方仅满足以上所有条件才出现「进入抖音运营」，指向 `/projects/:projectId/douyin`。
- 抖音账号会话 READY、作品管理页绑定成功、发布交接、手机领取、手动导出、`SUBMISSION_UNKNOWN`、旧成片回执都不能单独证明已发布；按钮不会执行发布、绑定或回复评论。
- `tests/publish-ops-entry.test.ts` 逐项测试所有不可信路径及最终页面底部只出现一个按钮；浏览器 E2E 测试 synthetic trusted receipt → 运营页导航和未完成成片不显示按钮。

## W4：回归证据及剩余外部 Gate

### 已真实执行的本地和隔离验证

- `npm.cmd test`：在最终加入「目标镜头资产过滤」后再次执行**完整单元/集成测试 476/476 PASS**，包含 SQLite、FFmpeg、Dreamina mock、研究、剪辑和发布；最新日志为 `.runtime/workflow-w4-final-unit-after-scoped-asset.log`。
- TypeScript `npm.cmd run build`：PASS（包含最新的工作流按目的入口及单镜头素材过滤）。最新正式 3090 服务器已从重新编译的 dist 重启，健康检查 200、6 个原有项目保留，真实 Q8 仍正确提示镜头审片且有任务内审核入口；已发布 Tonemay 成片页仍且只显示 1 个可信抖音运营入口。
- Playwright Chrome：在加入目标镜头素材过滤保护后，**最终完整浏览器套件 20/20 PASS**，包括「按目的选择工作流」的 W2–W4 专项 **6/6 PASS**。最终日志 `.runtime/workflow-w4-final-browser-after-scoped-asset.log`。
- `tests/preflight-chain-atomic.test.ts`：实际 Prisma 事务刻意制造后段失败，验证回滚和只 stale 目标 clip；已通过。
- `tests/generation-execution-review.test.ts`：模拟同项目其他已授权镜头，REDO 后该镜头旧请求链 stale、另一镜头 CURRENT/PASS/ACTIVE；通过。
- `tests/generation-preflight.test.ts`：模型能力异常/未确认远端结果/不相关镜头提交结果不会批量污染旧授权；通过。
- `tests/production-asset-context.test.ts`：项目隔离、版本哈希、人工确认、引用准确性；通过。
- `tests/e2e/workflow-w2-w4.spec.mjs`：跨页审核、任务锚点、研究/参考 iframe、项目列表恢复、可信发布后运营、跨项目隔离、无额外支付/平台写入；通过。
- `npm.cmd run license:gate`：**PASS**（38 个依赖包/7 个外部运行时）；`git diff --check -- src tests docs`：**退出码 0**。

### W0 初始场景矩阵覆盖

| 场景 | 覆盖与结果 |
|---|---|
| 从零制作 | 有产品基础 / 缺产品基础的导航、创建入口、真实资料/图片上传 E2E；原付费链路测试由 Mock 验证 |
| 同类爆款研究 | 原研究质量/登录风控 E2E + 原任务内研究和参考素材链接；数据接口仍遵守平台限制 |
| 用户提供参考视频 | 原参考视频分析与资产测试 + 任务内参考视频页、回程和独立入口 |
| Director V3 多镜头 | 现有 Director QA/Clip Contract/Prompt V3 测试 + 真实 Q8 只读资产版本绑定 |
| 单片段制作 | 独立入口 + 原 Agent/单片段付费门禁测试；未额外真实扣费生成 |
| 局部镜头重做 | REDO 单请求失效 + clipIds Preflight + 原子回滚 + 可读缺失资产提示；未再真实付费生视频 |
| 资产失败/远端未知 | 远端 unknown/stale 处理模拟、不可绕过人审和新付费确认，旧资产保留 |
| 已有片段重新剪辑 | Timeline/AutoEdit/音轨和 FFmpeg 集成测试，工作流直达/门禁可用 |
| 已有成片发布 | 最终成片 QC/发布设置 E2E 与可信结果绑定；外部平台真实发布未重复执行 |
| 发布后运营 | 可信回执注入测试、作品绑定/评论路由只读检查、进入同项目运营页面 |
| 刷新/断线/跨项目 | SmartRun 持久化/租约、工作流精确回程、跨项目与未知 Run 拦截测试 |
| 多模型能力不足 | 属于另一个独立 TODO：`docs/TODO-AI-MODEL-CAPABILITY-AUTO-ROUTING-2026-10-08.md`，**不属于本轮 W2–W4 工作流验收** |

### 剩余操作限制，不可虚报完成

- **不执行未经确认的真实付费 Seedance / Seedream E2E**；隔离回归验证程序门禁与版本一致性，但不等于平台真实调用。
- **不执行未经确认的真实抖音发布/回复 E2E**；可信回执为隔离数据，正式环境只能用真正来源回执触发运营入口。
- 已有历史 Q8 审批 STALE 不自动恢复；涉及新的真实生成必须单独明确授权。
- 保留现有大量其它功能未提交更改；未进行任何 `git reset` 或强制清理，也不把本轮改造和其它任务混进不相关的 commit。
