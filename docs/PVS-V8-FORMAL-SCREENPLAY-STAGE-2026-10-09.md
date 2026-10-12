# Product Video Studio V8 — 正式剧本编辑与审核接线阶段

日期：2026-10-09（北京时间）  
关联主任务：V8 统一导演 + 工作流 UX 遗留修复（AgentDock 主任务 `tsk_85baac1d2a85b3fc`）  
本阶段任务：`tsk_e22d3e278379162d`

## 本阶段实现

本轮只对**新建、明确选择 V8 的人工审核工作流**接线；不会追溯迁移历史 SmartRun，不影响原 V2/V3。

- **默认关闭**：只有服务器环境变量 `PVS_V8_UNIFIED_DIRECTOR_AUTHORING=1` 时，创建页显示可选的“试用 V8 详细短剧剧本”。服务器创建操作仍要求 `directorPipeline=V8`、`directorVersion=3`（复用 V3 兼容模型层）、`workflowVersion=2`、`reviewMode=MANUAL`。已存在的任务不会被改变。
- **权威剧本结构**：新增 `src/domain/v8-screenplay.ts` 的 `v8DetailedProposalSchema` 与 `v8ScreenplayRecordSchema`，并由原 V8 detailed screenplay generator 共用，包含场景、人物目标、阻碍、可拍事件、声线和逐句对白、观众知情变化、后期文字与精确时间。
- **正式 SmartRun 接线**：`ApplicationSmartProduction.scriptV8` 通过项目既有 `AiRuntimeRouter` 调用详细剧本生成器，生成并在一个 SmartRun 检查点保存 `v8Screenplay` 和绑定制作资产的 `ScriptDraft`；后续沿用 `ProductFlow` 的脚本 Draft 安装语义，不创建新的独立第二工作流。
- **人工确认**：不同于旧 V2 自动跳过脚本，V8 必须进入 `WAITING_FOR_SCRIPT_REVIEW`；工作台展示完整剧本和配音、人物目标、观众知情节点；需勾选人工确认并携带精确 `screenplayHash` 调用 `CONFIRM_SCRIPT`。任何旧 hash、未明确确认、不同 revision 都被拒绝。
- **可编辑、可回退**：工作台已提供详细剧本的原地编辑区域，支持调整故事/人物目标/障碍/动作/对白/语气/表现/时长/后期音效。保存走新 `POST /script-v8`，以用户已有版本为来源，无额外模型调用，重建新的 `ScriptDraft`（新版本，稳定的 Beat ID），原版本不删除；校验总时长、产品 Fact ID、演员身份与 Beat 数，旧剧本确认失效，必须重新确认才能继续。旧的 V3 编辑动作不得覆盖 V8。
- **安全阻塞**：当前正式 V8 Director / ProductionPlan / PromptPackage 采用链路尚未完成，确认后的新 V8 Run 在 DIRECTOR 阶段明确进入 `BLOCKED`（`V8_DIRECTOR_ADOPTION_NOT_READY`），不调用旧 V3/ProductDirector 并冒充 V8，不进入旧 Preflight、付费审批、视频生成。
- **数据与向下兼容**：`directorPipeline` 和 `v8Screenplay` 都是选填且旧任务不解析补假值；V8 schema 额外拒绝继承旧 paidScope、consent 和 attemptIds，并验证 screenplayHash + ScriptDraftHash / 目标时长。

## 验收与测试记录

- TypeScript 编译 PASS。
- `tests/v8-smart-run-authoring.test.ts`：包括开关隔离、V2/V3 原任务独立、创建/恢复/显式审核、旧 hash 拒绝、改写后新版本和人工重审、后续 DIRECTOR 阻塞；模拟内存仓库，不调用付费 AI 或视频生成。
- `tests/v8-detailed-screenplay-service.test.ts`：包括模糊创意→详细剧本、产品事实和口播时长、人工改写有效性，拒绝未知 Fact ID 或违法时长；所有纯函数和 fixture。
- 工作台 HTML 内联 JS 使用 `node:vm.Script` 解析验证（避免 TS 编译通过但浏览器代码语法错误）。
- **本轮全量单元/集成**：541/541 PASS、0 fail、EXIT_CODE=0（日志 `.runtime/pvs-v8-authoring-fulltest-20261009.log`）；**隔离 Chrome 全站 Playwright**：44/44 PASS、EXIT_CODE=0（日志 `.runtime/pvs-v8-authoring-e2e-20261009.log`）；**V8 剧本专项**：8/8 PASS；License Gate `packages=38 external_runtimes=7`，`git diff --check` PASS。

## 后续必须开发（不是本轮已完成）

1. `Screenplay → V8DirectorDecision`：依实际模型能力生成 Shot-first / Clip 规划，持久记录导演镜头来源、站位/语气与台词语义段，并由人工编辑审核，不得越过因果/观众知情节点。
2. ProductDirector 按已确认 V8DirectorDecision 产生正式 `ProductionPlan.scenes[].clips[].segments[]` 并通过镜头/资产/角色/音频锁定 Gate；人工采用后的版本 Hash 精确匹配。
3. `V8PromptPackage` 逐 Clip 从确认的分镜编译，产出 speaker/voice、完整台词和后期 Cue；用户可修改 Prompt 后再次审核，所有下游失效与付费许可重新确认。
4. 正式 Preflight、生成请求及 Timeline/Final QC 的 V8 集成与真实只读/人审样片评估。技术测试 PASS 不代表 Seedance 真实叙事表现已通过。
5. 新功能白名单上线、人工试点与可逆部署后，才能扩大到正式默认流程。

## 安全约束

绝不删除/重置当前 Git 未提交工作；不自动启动现有旧 Run 的 V8；不复用上轮付费许可。保留 3090 的 PVS safe launch（全局 SmartRun worker 关闭、仅精确 scoped 原 Run）；除非另有安全部署验收，本阶段**只报告代码与隔离测试，不宣称生产 3090 已启用 V8 开关**。
