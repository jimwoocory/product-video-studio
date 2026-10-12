# Product Video Studio：按分镜出镜要求进行视觉审片、逐镜结论与中文定位修复

- 日期：2026-10-10（北京时间）
- AgentDock 任务：`tsk_4b817496c28f69b3`
- 正式服务：`http://127.0.0.1:3090`，由已核验的 `.runtime/pvs-safe-launch.mjs` 安全启动
- **修复代码、全套隔离回归、真实 Chrome 只读用户界面及媒体/数据库审计已通过**。本轮没有执行用户六条视频的新版收费视觉AI复评、没有新建或重做付费视频、没有自动采用或抖音发布。

## 真实故障与判断

当前用户项目：`23d0b97f-9e0d-4c83-8e70-fc23819e7796`，Run：`35afafab-87ae-4c22-8e80-a2823f5a4d62`，停在 `WAITING_FOR_CLIP_REVIEW / CLIP_REVIEW`，revision 81。
旧版视觉检查只审查过视频1（Clip ID `4028dd5b-76fb-47a0-8939-ca45ecde3f33`），保存了 `p1f06-visual-edit-v1` 的 `UNCERTAIN/MEDIUM` 报告。导演明确其`productVisibility=NONE`，镜头为县令与师爷的公堂剧情，不要求枕头出现；而AI把未见产品错误归为产品身份和稳定性 `UNCERTAIN`，于是提前退出，其他5段没有视觉评估。

已只读核对本轮6段导演分镜的产品出镜要求为：`NONE, NONE, CLEAR, CLEAR, CLEAR, CLEAR`。6个生成 Attempt 均 `SUCCEEDED` 且有本地已下载视频、H264/AAC 轨，媒体时长约15.104、7.104、15.104、7.104、8.096、8.096秒。抽取3帧/段并与用户提供的产品主图核对：开头2段纯公堂剧情没有产品，视频3～6存在灰色带菱形纹样的护颈枕初步画面证据。但抽帧并不足以确认完整对白、嘴型、每一帧形变或跨镜叙事。

## 修复详情

1. `src/application/services/visual-edit-assessment.ts`：视觉规则版本升级为 `p1f06-visual-edit-v2-visibility`，以Clip.productVisibility的`NONE/PARTIAL/CLEAR/HERO`分别应用身份与展示程度检查。
   - `NONE` + 明确未出现产品：产品身份、稳定性为 `NOT_APPLICABLE`，不能因此降为 MEDIUM；以独立的`sceneConfidence`评价无产品画面，仍检验场景、动作、质量和截取时长。
   - `NONE`却意外出现产品：身份要求`BLOCKED`；不确定时保守`UNCERTAIN`。
   - `PARTIAL/CLEAR/HERO`：产品缺失为 `BLOCKED`，出现程度不符合设定亦不得通过，身份无法可靠辨识为 `UNCERTAIN`；严格维护主参考图约束。
   - 新增`productPresence`、`visibilityCompliance`、`storyActionAlignment`和独立`sceneConfidence`，以抽样可观察动作对导演描述进行单镜检查。不因有视频音轨而假定对白、口型或音效正确；增加只读 `audioTrackPresent` 证据。
   - v2 evaluatorVersion 纳入 cacheKey，新分析不会复用原v1错误缓存；v1的不可变评估仍作为历史记录保留。
2. `src/domain/visual-edit.ts`：仅允许不涉及实际展示的产品身份与稳定性检查记`NOT_APPLICABLE`；兼容旧不可变v1审核记录，在新v2中持久化视觉出镜、产品出现与音轨相关依据。
3. `src/application/services/smart-production-adapter.ts`：逐条审查所有待处理的独立镜头。某段缺少候选、存在人工重做指令、视觉模型暂不可用、结果为`UNCERTAIN/BLOCKED`时记录准确视频序号并继续检查其他段。**有任何失败时本轮不写任何AI ACCEPT采用决定**；仅当全部剩余镜头高置信合格，才遵照用户此前主动启用的高置信自动采用设置继续正式采用。已有人工`ACCEPT/REDO/SKIP`决定不被覆盖。用户原视频不会自动重新提交。
4. `VisualEditAssessmentService.readCurrentSummaries`：只读加载当前Clip哈希、Attempt ID、outputArtifact ID、ProductTruth哈希一致的保存报告，校验不可变记录；旧v1返回`OUTDATED`而非伪通过。完全不调用模型、写审核结果或下载视频。
5. `src/web/smart-generation-http.ts` + `workflow-inline-panels.ts`：正常GET页加入只读逐镜状态，展示视频序号、要求的产品出镜程度、可见动作是否与分镜匹配、视频轨/音频轨事实及人工审核入口。每条有`#ux-clip-1`到`#ux-clip-6`固定锚点与视频预览。旧评估标“已失效”，尚未评估标“尚未按新版检测”，不会虚构 PASS。
6. `src/web/smart-generation-ui.ts`：旧长技术报错改为用户可理解的中文摘要并提供具体视频直达链接。旧`问题处理后继续`按钮按当前视觉故障状态改为“按新版规则重新检查六条视频”；用户点击后会提示可能消耗视觉AI额度、如果全部高置信满足才可能按既有设置自动采用，以及**不会重新生成媒体或发布**；必须二次确认。
7. 保留独立音频链和最终QC。单镜视觉抽帧并不能验证准确对白、发音、角色声音、全部动作或六镜合并后的因果与爽点，界面明确提示仍需人工看/听或通过后续专门QC，不虚报端到端通过。

## 自动化测试结果

- `npm.cmd run build`：PASS。
- 可见镜头分类、NONE/ABSENT正确通过、要求CLEAR但缺产品拒绝、意外产品/HERO程度不足拒绝、旧v1缓存返回OUTDATED、视觉故事动作字段、只读证据、单镜预览状态、6镜先全检且任一不合格零AI采用，以及全部高置信才采用的专项测试：PASS。
- 完整单元与集成：**591/591 PASS，Exit0**，日志：`.runtime/pvs-visual-review-fulltest-20261010.log`。
- 完整 Chrome：**48/48 PASS，Exit0**，日志：`.runtime/pvs-visual-review-chrome-20261010.log`。
- License Gate：`38 packages / 7 external runtimes PASS`；`git diff --check` PASS。
- 无reset/clean/无关commit/推送，原历史大量未提交改动保留。

## 正式 PVS 3090、项目状态和媒体验收

- 正式进程已由受控 AgentDock session 关闭后以 `node --use-system-ca .runtime/pvs-safe-launch.mjs` 恢复，未全局恢复旧历史任务。最终 `/health` HTTP200。
- 独立真实 Chrome 使用GET打开用户 `/projects/23d0b97f-9e0d-4c83-8e70-fc23819e7796/smart`：**6个镜头、6个视频窗口**；视频1为 `OUTDATED`，视频2～6为 `NOT_RUN`，无虚构新PASS；两个产品无需出镜剧情镜头正确标出。一个需显式点击的AI重查按钮，原旧报错提供视频1锚点，GET 写请求 **0**。
- SQLite在部署前使用在线备份 `.runtime/pvs-visual-review-before-20261010.db`（63,905,792 bytes，integrity_check=ok）；审计 `.runtime/pvs-visual-review-before-20261010.json` 与 `.runtime/pvs-visual-review-after-20261010.json`：项目数9、Run数12、活跃租约0、29 Attempts、44 Requests、44 Preflights、29 Approvals与**所有项目/Run JSON内容指纹完全一致**。
- 原Run状态 `WAITING_FOR_CLIP_REVIEW / Rev81` 未发生写入，正式审核决定数**0**保持不变；6段生成视频的原始SHA-256经过部署前后逐个全文件验证完全一致。清单：`.runtime/pvs-visual-review-media-before-20261010.json`。
- 本次没有执行用户的六段真实v2视觉模型调用，因此目前并不宣称6条审核PASS；在用户点击后才会进行新的模型分析并持久化当前v2记录。

## 用户操作

1. 返回 `http://127.0.0.1:3090/projects/23d0b97f-9e0d-4c83-8e70-fc23819e7796/smart`，Ctrl+F5。
2. 展开“本轮镜头审片”：按视频1～6播放检查，前两条纯剧情无需产品，视频3～6严格核对护颈枕身份；还需要人工听取对白和核对跨镜剧情承接。
3. 如果希望再次运行AI视觉检查，点击“按新版规则重新检查六条视频”并确认可能产生的视觉模型API费用；不会再次生成视频，但全部高置信时有可能按本任务之前的自动采用开关形成采用决定。
4. 有任何不合格时直接使用对应镜头的“采用 / 仅重做此镜头 / 跳过”人工控制；重做属于新的可收费媒体任务，必须独立确认，**不要因为旧NONE缺少产品误判就付费重做**。
