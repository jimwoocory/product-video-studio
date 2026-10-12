# Product Video Studio｜剧本内容驱动动态时长与叙事质量升级验收

- 日期：2026-10-10，北京时间
- AgentDock 任务：`tsk_b02724110d3fa614`
- 本机应用：`http://127.0.0.1:3090`，仍使用 `.runtime/pvs-safe-launch.mjs`；Managed 新任务调度，V8 试点默认未开启。
- 最终状态：源码修复、隔离 QA / 全仓集成 / Chrome 全站回归、生产只读验收通过；**未触发任何真实图片或视频生成，未调用本轮真实脚本修订模型，也未向抖音写入。**

## 原因与真实旧样本

用户当前项目「广西金秀康瑶堂瑶药3」：
- 项目 ID `23d0b97f-9e0d-4c83-8e70-fc23819e7796`
- Run ID `35afafab-87ae-4c22-8e80-a2823f5a4d62`
- 当前正式旧稿仍为 `READY_FOR_PAID_CONFIRM` / `PREFLIGHT` / Revision **32**，目标 60,000ms，8 个剧情 Beat 各 7,500ms。
- 原始 ScriptDraft hash：`9ab976ab1fea254c752e10adb9b58e12c34040d39bd8af7537d012aed42131ab`
- 原始 ProductionPlan hash：`df029893b6e910240797e2e1ce35d45a182f6100f6764310e8e332bda2591d3e`
- 原 QA `PASS`，主要只检查总时长、动作数量、场景/产品变化与音频意图，没有机械均分、对白自然朗读时间、长段过薄/重复、衔接信息缺失等检查。生成提示有粗略“4–6s 每 Beat”引导，且脚本生成容许总时长约±10%，ScriptFeasibility QA 却要求±8%，口径不一致。
- 修复后的纯只读 `ScriptFeasibilityService.review` 针对冻结的真实旧稿返回 `REVISE / BEAT_DURATION_UNIFORM`，不再错误地当作已通过。

原始 Run 原样保存在 `.runtime/pvs-script-rhythm-original-run-20261010.json`，没有自动再生成或重置。

## 代码变更

1. **纯只读剧情时长审计**：新增 `src/application/services/script-narrative-timing.ts`，统一`±10%`总时长（60s 允许54–66s；11s 基于10s亦允许）。逐段输出 `estimatedSpeechMs` / `estimatedActionMs` / `minimumPlausibleMs` / `assignedMs` / `sceneChanged`。估计自然中文朗读与有声停顿、多个动作、人物反应、转场；考虑说话和动作可并行，避免直接把全部时间机械相加。
2. **剧本生成和 AI 修订提示**：`src/application/services/ai-generation.ts` 与 `script-feasibility-service.ts` 明确要求各 Beat 由内容与节奏决定长度；描述具体人物所处环境、目标动机、情绪、动作、被他人观察到的反应、事件状态变化、前后因果。重要人物决定须在当下/此前通过自然台词或事件让观众知情；不得靠事后补丁或自说自话。对白/OS 必须明确、自然且与动作完整对应，不能因目标时长删除台词。禁止把8个段落平均分7.5s的无依据分配当作合格，也不建议以镜头硬切替代剧本叙事。
3. **质量门禁升级**：`src/domain/director-v3.ts` 扩展 Issue 枚举和兼容旧报告的可选时间明细；`ScriptFeasibilityService.review` 判别`BEAT_DURATION_UNIFORM`、`BEAT_SPEECH_OVERLOAD`、`BEAT_ACTION_OVERLOAD`、`BEAT_DURATION_IDLE`、`NARRATIVE_DESCRIPTION_THIN`、`NARRATIVE_TRANSITION_UNCLEAR`、`NARRATIVE_DUPLICATE_BEAT`，并对总时长使用精确目标±10%而非另一个8%门槛。不合格 `REVISE`，自动规划阶段最多两次 AI **文本**修订后必须通过复查，失败不能默许。
4. **导演分镜尊重剧本时长**：`src/application/services/director-v3-planner-service.ts` 采用 ScriptDraft 各 Beat 合计的自然总时长，在±10%且符合可用模型整秒边界时分配 Clip；不把全部时长强行重压到原用户目标。分镜要保留逐段 ScriptBeatId/动作/语音及顺序。`src/adapters/ai/hermes-product-director-generator.ts` 对V3把权威 Clip duration 总和与发给模型的精确计划一致，V8和旧流程的权威导演/分镜独立机制不变。
5. **明确的人类修订与版本安全**：`src/application/services/smart-production-adapter.ts` 与 `src/application/services/smart-generation-service.ts` 加入仅由用户显式调用的 `repairNarrativeScriptV3` / `repairScriptV3`。POST `/api/projects/:projectId/smart-runs/:runId/repair-script-v3` 需要匹配`expectedRevision`及`confirmScriptRepair=true`，仅限尚未真实视频提交/授权的 V3 Run。采用原已审核创意、产品事实、角色与场景资产，创建 ScriptDraft 新版本，强制 `WAITING_FOR_SCRIPT_REVIEW`；使旧 ProductionPlan、DirectorV3Plan、Seedance Prompt 和 PaidScope 失效，不复用旧付费许可。任务自动恢复后也不得自行确认用户脚本。
6. **旧稿付款前再审核**：即使原持久化报告显示`PASS`，只要实际 ScriptDraft 仍未通过新内容/时长规则，`SmartGenerationService.confirmPaid` 会拒绝新付费授权。`src/web/smart-generation-ui.ts` 付费卡同步隐藏旧提交按钮和旧费用勾选，提示“费用确认已暂停：请先修订剧本”。
7. **完整 UI**：`src/web/director-v3-ui.ts` 显示剧本目标及允许范围、逐段耗时依据、重新审核问题；提供逐段可修改秒数与明确的“按剧情重新编排剧本与时长（AI 文本修订）”按钮。浏览器手工保存校验总时长±10%，仅在用户确认后发请求。若已有真实生成 Attempt 则只读，不允许改旧提交范围。

## 隔离验收

- TypeScript `npm.cmd run build` **PASS**。
- 目标测试（AI剧本/导演V3/质量审计/修订及旧付费门禁等）**41/41 PASS**；追加用户费用控件隐藏专项 **12/12 PASS**。
- 最终完整单元和集成：**585/585 PASS、Exit 0**，日志 `.runtime/pvs-script-rhythm-final-fulltest-20261010.log`。
- 最终 Chrome Playwright 全站：**48/48 PASS、Exit 0**，日志 `.runtime/pvs-script-rhythm-final-chrome-20261010.log`。Chrome 工具以隔离 `e2e.db` 和`e2e-projects`运行，不触碰正式项目。
- License Gate **38 packages / 7 external runtimes PASS**；`git diff --check` PASS。数百原已存在的未提交文件未经 reset、clean 或无关 commit。
- 质量专项覆盖：60s→54/66合法边界、8×7.5s必退回、少数时长相同并非禁止、长对白与动作时间不足拒绝、描述过薄/转场不清/重复拒绝、21s剧本自然20s可供导演采用、±10外拒绝、旧错稿不得授权付费、显式修订创建新稿并移除旧Prompt/Scope、QA不合格时旧按钮隐藏。

## 正式服务部署与只读验收

正式服务通过受控 AgentDock 关闭旧 PVS 3090 进程、未触碰用户日常 Chrome/抖音专用浏览器后，以 `node --use-system-ca .runtime/pvs-safe-launch.mjs` 安全恢复，服务 `/health` HTTP200。全局 SmartRun worker 仍禁用，只执行明确获准的新/精确旧作用域任务，V8试点禁用。

实际 Chrome 只读打开 `http://127.0.0.1:3090/projects/23d0b97f-9e0d-4c83-8e70-fc23819e7796/smart`：
- HTTP200，原8×7.5s节奏告警可见，允许54–66s；
- **8**个可编辑时长输入，**1**个 AI 脚本修订按钮；
- 正式旧稿费用区域明确显示“费用确认已暂停：请先修订剧本”，**0**个旧`paid`按钮，**0**个`confirm-paid`勾选；
- 页面加载 **0**个POST或其他写入请求。

生产 SQLite 先行在线备份：`.runtime/pvs-script-rhythm-predeploy-20261010.db` 57,311,232 bytes，`integrity_check=ok`。原快照 `.runtime/pvs-script-rhythm-before-20261010.json` 与正式部署后的 `.runtime/pvs-script-rhythm-final-after-20261010.json` 对比：**项目数9、SmartRun数12、活跃租约0、attempts23、generationRequests38、preflights38、approvals23**；全部 SmartRun/Project JSON指纹及目标旧`READY_FOR_PAID_CONFIRM`状态 **MATCH**。用户古装短剧仍在Rev32、无视频付费许可、attemptIds 0，scriptHash与planHash均未变。

## 操作与限制

用户在原项目工作台按 Ctrl+F5 刷新，在`① 剧本 · Director V3`中查看旧稿质量问题：
- 若自己修订剧情与时长：逐段调整后点击“保存剧本修改并重做下游分镜”；
- 若希望AI重编：主动点击“按剧情重新编排剧本与时长（AI 文本修订）”并确认；该按钮会调用连接的文本模型，可能产生文本 API 用量，**不会自动调用收费图/视频生成**；
- 只要修改或 AI 修订成功，均需重新审核新剧本、分镜、提示词和费用范围，旧费用授权无效。

朗读速率与动作耗时是审稿用的**保守启发式估计**，不是对特定演员或生成模型的精确表演测量；剧情真实的逻辑、语气和叙事质量仍需用户人工读稿/导演审稿。此任务未进行新的真实文本/媒体生成，也不把未运行的AI修订称为已完成。
