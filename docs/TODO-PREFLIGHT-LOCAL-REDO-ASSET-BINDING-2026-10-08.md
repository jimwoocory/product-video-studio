# 待修复：单镜头重新运行生成前检查丢失资产引用、误使整组授权失效

- 记录时间：2026-10-08
- 项目：Product Video Studio（Tonemay Q8 实测发现）
- 优先级：高（会阻塞单镜头重做且破坏已有生成请求/授权状态）
- 状态：**程序根因已修复并通过隔离数据库事务测试；历史 Stale 授权仍需用户在新请求上重新确认，真实 Seedance 付费 E2E 未执行**
- 触发场景：在“视频生成”页面，镜头 3 选择重做后点击 **「为此镜头重新运行生成前检查」**。

## 已核实的现象与原因

1. 页面报错：`Required reference asset missing: production-asset:a4333e97-978d-4991-9662-369e02c5ebc5:CHARACTER_A`。
2. 实际闺蜜 A（CHARACTER_A）图片并未丢失：原任务 ProductionAssetSet 记录为 READY 且有人工作品确认；图片文件、Artifact 记录与网页内容接口均可读取。
3. 初次智能生成 Preflight（`smart-production-adapter.ts`）会把已确认生成资产通过 `productionAssets.toAssetRefs(...)` 引入校验与编译；但单镜头重检走的 `workbench-ui.ts -> /api/projects/:id/preflight/run -> server.ts`，当前仅使用普通上传素材和研究参考素材，遗漏已确认的角色/场景 ProductionAssetSet 及相应素材对象，造成 `prompt-compiler.ts` 报错。
4. 单镜头重检会走 `generation-preflight.ts`；当前它在完整校验成功前调用 `markSubmissionChainStale(projectId)`，按项目范围使旧请求、Preflight 报告和 Approval 全部失效，属于过早且范围过大的副作用。
5. 本次 Tonemay Q8 项目诊断时：3 条 GenerationAttempt 为 SUCCEEDED，视频仍存在；但原 3 条 GenerationRequest、3 条 PreflightReport、3 条 UserApproval 已变成 STALE。**不得因为记录为 STALE 就宣称已经恢复批准或允许复用旧授权。**

## 后续修复要求

1. 统一两条 Preflight 输入装配路径：标准页面单镜头重检必须按实际确认状态加载对应 ProductionAssetSet、生成角色/场景 AssetRef、研究参考素材、产品主参考图和 Director V3 的 Clip Contract/Prompt；严格校验各引用的来源、归属、哈希、文件存在性、人工确认和版本绑定。不得仅忽略 Required reference asset missing 异常。
2. **先预校验、后提交状态更改**：缺素材、模型不匹配、无效引用或编译失败时应向用户返回中文可理解原因，旧请求/审核/授权和成功视频不应被意外批量改为 STALE。
3. 单镜头重做仅处理目标 clipId 的请求链；不能跨镜头作废其他已成功镜头的请求、Preflight 或授权。确保事务/幂等与异常回滚，旧版本保留供审计和观看。
4. 生成前检查 **不等于再次生成视频**：成功重检也不能自动发起 Seedance 或沿用旧的付费同意；新一轮生成必须针对明确的镜头和最新费用范围获得用户再次确认。
5. 为 Tonemay Q8 的既有 STALE 记录提供安全、可审计的恢复或迁移处理方案；严禁直接把旧 Approval 设回 ACTIVE 作为新的扣费授权。保留 3 条 SUCCEEDED 视频和其归属历史，不创建重复视频。
6. 检查 Director V3 原生声音策略（环境声、交互声、对白/OS，禁 BGM）在单镜头重检中是否被正确保持；本问题与当前 AI 不能可靠判断 BGM 的审片警告是两条独立链路。
7. 统一用户可读错误提示，避免直接弹出内部的 `production-asset:...` 英文技术错误；需保留可展开技术详情供诊断。

## 验收与回归测试（必须真实执行）

- A：存在并已确认闺蜜 A 的原图片时，镜头 3 单独运行 Preflight 能正确识别该资产；无需重新生图。
- B：模拟缺少素材/校验不通过，旧请求与 Approval 状态不发生无关变化；已生成的视频仍可播放。
- C：只选镜头 3 重新检查，仅该镜头的后续链路需要新授权；其他两个镜头保持原状态，不受牵连。
- D：Director V3 正式提示词、角色/场景绑定、声音策略与现有智能生成流程一致，不能使用过时或漏字段的模板。
- E：重检与实际提交付费生成彻底分离；无显式新授权不产生新 Seedance 提交。
- F：核对原任务的历史数据、审计和版本，保证能够辨认旧成功结果与新待生成结果。
- G：单元测试、集成测试、Web E2E、TypeScript 构建与既有生成门禁通过。

## 2026-10-08 实施与回归结果

- 已按当前 SmartRun 的 Project、Plan ID + SHA256、ProductionAssetSet 版本恢复手动单镜头 Preflight 所需的已确认角色/场景图及 Director V3 合同/提示词；视频提交下载路径也按明确绑定的资产版本解析。
- 新 Preflight 先全部校验和编译，再用 Prisma 事务只使目标 Clip 的旧 Request/Report/Approval 失效并保存新链；失败或部分 Blocked 不改变旧付费授权。局部检查只读取目标镜头实际引用图片，不牵连无关镜头图片缺失。
- REDO 决策同步调整为仅作废目标 GenerationRequest，不对整个项目调用 markSubmissionChainStale。
- 回归：`tests/preflight-chain-atomic.test.ts`、`tests/production-asset-context.test.ts`、`tests/production-planner-assets.test.ts`、`tests/generation-execution-review.test.ts`、`tests/generation-preflight.test.ts`，以及浏览器隔离回归，均已通过。
- **真实 Tonemay Q8 原任务只读检查：**3 个导演镜头、9 处引用、3 张人工确认的生成图，3 份图片实际文件的 SHA-256 完整性均通过；旧已 STALE 的审批不自动恢复，不重复扣费。
- 验收边界：未未经授权触发真实 Seedance 重新生成/发布。用户后续选择真实重新生成时仍需新费用确认，外部扣费链路需按用户明确许可另行验证。

## 初次记录时的操作边界

只新增此待办文档。**不修改业务代码、不触发重新检查、不重启服务、不修改数据库、不创建或批准付费任务。**
