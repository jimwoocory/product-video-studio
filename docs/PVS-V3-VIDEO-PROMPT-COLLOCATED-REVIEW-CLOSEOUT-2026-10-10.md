# Product Video Studio · V3 已生成视频与 Seedance Prompt 同卡审片布局验收

- 时间：2026-10-10 北京时间
- AgentDock 任务：`tsk_ed4548587629c45d`
- 正式服务：`http://127.0.0.1:3090`，已使用原 `.runtime/pvs-safe-launch.mjs` 安全 Managed 模式完成正式部署
- 状态：**UI、回归、生产只读审计 PASS**；本轮没有触发真实视觉模型重新质检、生成新视频、重做付费图片、自动采用或发布。

## 用户确认需求（适用于所有对应的 V3 工作流）

1. **整轮「重新进行视觉质检」**：放在当前任务底部、紧挨「停止后续编排」正上方，而不是顶部或六个视频播放器之前。按钮名称和逻辑通用，不包含固定数量。
2. **已生成视频与 Prompt 一一对应**：去掉顶部重复的独立六视频审片页面，改在 `③ 最终 Seedance Prompt` 中根据正式分镜 `ClipId` 逐条显示播放器、版本/视觉状态、采用/仅重做此镜头/跳过。每条对应 Seedance Prompt 在视频已生成并可播放时默认**折叠**，用户点击时再展开；未生成阶段仍可查看/编辑提示词。
3. 顶部「当前工作流」仍显示进度和下一步，但只链接到 `③` 对应的生成视频与提示词区域。脚本、分镜在审片阶段默认收起，详细素材留在可展开的对应模块。
4. 「完成本轮已采用镜头的选择」保留在 `③` 中六段视频末尾。其它未走V3的旧式/V8原生审片入口不受本次结构调整破坏。

## 代码变更

- `src/web/workflow-inline-panels.ts`：把此前单独集中渲染的镜头审核重构为可重用的 `renderClipReviewRow`，新增 `renderClipReviewForPrompt` 和 `renderClipReviewFinalization`。所有播放器以当前正式ClipId、当前最新成功GenerationAttempt、经Artifact READY匹配的视频、审核状态与匹配prompt绑定。若缺匹配Prompt，不错误拿另一个Clip的文本替代；提示用户核查。
- `src/web/director-v3-ui.ts`：`renderDirectorV3Panels(run, reviewData?)` 在实际V3审片阶段按正式ProductionPlan镜头顺序渲染视频卡片，逐张放播放器与原有审核/人工作业控件，已生成片段的 `.v3-prompt-details` 关闭，用户可按需展开原提示词；缺少视频或尚未生成阶段维持提示词可见/可编辑。当前审片阶段将①剧本/②分镜折叠，③视频与提示词展开。
- `src/web/smart-generation-ui.ts`：当前选中V3审片任务有匹配inline数据时，不再生成 `.embedded-review` 顶部六视频列表，而是在③注入新的reviewData。顶部「下一步」链接 `#v3-seedance-workbench-<runId>`。「重新进行视觉质检」只在任务末尾靠近「停止后续编排」处渲染，原视觉模型API额度/全部高置信可能自动采用的二次确认保持。
- 页面CSS对新的逐镜卡和折叠提示词做最小适配。其他项目实际镜头数量不作硬编码。

## 离线与隔离测试

- `npm.cmd run build` PASS。
- V3显式2段ClipId与逆序Seedance Prompts故意错位场景的Node测试：两个视频均绑定自己的原始prompt与成功Attempt；提示词默认收起；缺失Prompt时视频仍可审核；未生成阶段Prompt保持展开可编辑；整轮recheck正好位于停止按钮前。Node专项 **16/16 PASS**。
- 新增 Chrome 专项 `tests/e2e/v3-video-prompt-review.spec.mjs`：原有受控按钮不写用户数据库；3镜头逐镜视频/Prompt完整映射；默认提示词折叠；含原生审片控件、完结动作与footer按钮精确次序；确认取消后无POST。**1/1 PASS**。
- 完整隔离单元及集成：**594/594 PASS，exit0**，日志 `.runtime/pvs-v3-video-prompt-fulltest-20261010.log`。
- 完整 Chrome：**49/49 PASS，exit0**，日志 `.runtime/pvs-v3-video-prompt-fullchrome-20261010.log`。
- `npm.cmd run license:gate` PASS（38 packages/7 external runtimes），`git diff --check` PASS。
- 测试使用独立的 E2E 数据库和模拟媒体，没有执行用户正式付费动作，保留所有既有dirty文件，不执行git reset/clean/无关commit或push。

## 正式数据库与现有六段视频的核验

- 正式 SQLite 在线备份 `.runtime/pvs-v3-video-prompt-layout-before-20261010.db`，64,167,936 bytes，`integrity_check=ok`。
- 部署紧前和正式上线后的`.runtime/pvs-v3-video-prompt-layout-before-restart-20261010.json` 与 `.runtime/pvs-v3-video-prompt-layout-after-20261010.json` 比对：**9 Projects / 12 SmartRuns，29 Attempts / 44 Requests / 44 Preflights / 29 Approvals，活跃租约及全量 Project/Run JSON内容完全一致**。
- 原项目 `23d0b97f-9e0d-4c83-8e70-fc23819e7796`、原 Run `35afafab-87ae-4c22-8e80-a2823f5a4d62` 仍为 `WAITING_FOR_CLIP_REVIEW / Rev83`，6条已生成 Attempt仍是成功记录，审核决定数0未变。
- 六段正式视频在上线后重新读取完整MP4并重算SHA256，与备份前的 `.runtime/pvs-v3-video-prompt-layout-before-media-20261010.json` **6/6精确一致**。

## 真实 Chrome UI 验收（正式3090）

- HTTP200，桌面1366px：顶部“下一步”=「查看生成视频与审核结果」，目标直接为 `#v3-seedance-workbench-<runId>`。
- `③`下 **6张Prompt卡 / 6个视频播放器 / 各1组采用操作、共1个人工完结按钮**。6个正式ClipId严格按分镜顺序且每个Prompt正文与正式Run保存的对应 `seedancePromptDrafts.find(clipId)` **全部一致**；没有按数组下标错配。6个有视频卡的Prompt均为默认折叠。
- **顶部重复视频播放器数0**；①剧本和②分镜在审片时默认折叠；④对照仍保留折叠。
- `重新进行视觉质检` 只出现1次，位于 `③`结束和声音设置后，**紧挨着下一项 `停止后续编排`**。模拟点击后触发人工确认且选择取消，**POST请求0**。
- 390px 移动宽度：6张对应卡、6个播放器、折叠提示词、footer质检按钮仍存在；document.scrollWidth=390px，无横向溢出。
- 实际页面审稿截图留在 `.runtime/pvs-v3-prompt-layout-first-real-20261010.png` 与 `.runtime/pvs-v3-prompt-layout-footer-real-20261010.png`，仅供本机私有调试。

## 用户后续操作

返回当前项目工作台，刷新页面，从顶部“查看生成视频与审核结果”直接跳到③。逐条播放视频并核对音效、对白、剧情转场；如需查看提示词，点“展开查看本视频生成提示词”；如果全部视觉检查需要刷新，页面底部“停止后续编排”上方有整轮「重新进行视觉质检」，会显式提示潜在视觉模型API费用与原先启用的自动采用行为。用户未明确点击前，不触发重新生成或费用操作。 
