# Product Video Studio — P0 PRD

版本：0.2  
状态：Frozen specification baseline  
冻结日期：2026-09-27

## 1. P0 目的

P0 只验证最关键、可恢复、可审计的真实生成闭环：

```text
产品输入
→ Product Truth 确认
→ CreativeBatch 与创意选择
→ Script 确认
→ Product Director
→ Scene / Clip / Segment
→ 确定性 Prompt Compiler
→ Cost/Capability Preflight
→ UserApproval
→ 国内即梦官方 dreamina CLI
→ Seedance 2.0
→ 任务轮询与下载
→ 人工播放
→ 接受或重做
```

P0 不等于完整 V1，不包含完整 Research、Evidence、Product QC、Human Review 工作台、Timeline 或自动剪辑。P0 中的“播放并接受/重做”是最小生成闭环，不是 P1 的完整审片系统。

## 2. 用户与范围

首期用户：
- 个人创作者
- 公司内部视频团队

P0 不做：
- 多租户 SaaS
- 外部客户自助注册、支付或计费
- 大规模并发生产
- 自动发布

## 3. P0 输入

必填：
- 产品名称
- 至少 1 张产品真实图片
- 简单产品功能介绍

可选：
- 多张产品图
- Logo
- 产品参数
- 品牌名称
- 结构化 ForbiddenChange

P0 不要求 PDF/Word/PPT 自动解析、商品链接抓取、抖音自动研究或竞品抓取。

## 4. Product Truth

正式创意前必须生成并由用户确认一个 ProductTruth 版本。ProductTruth 至少包含：
- productName
- brand
- category
- referenceImages
- canonicalImage
- logo
- standardColors
- confirmedFeatures: ProductFact[]
- sellingPoints: ProductFact[]
- forbiddenChanges: ForbiddenChange[]
- uncertainClaims: UncertainClaim[]
- evidenceRefs

### 4.1 ProductFact 与 UncertainClaim 隔离

- ProductFact 与 UncertainClaim 是不同类型、不同 ID 空间。
- 下游 requiredFactIds 只能引用当前已确认 ProductTruth 中的 ProductFact.id。
- UNVERIFIED UncertainClaim 可以保留在已确认 ProductTruth 中用于审计，但不得进入事实引用链、营销陈述或 CompiledPrompt。
- 用户必须对每条 UncertainClaim 作出明确处置：保留未验证、拒绝或提升。
- 提升必须创建新的 ProductTruth 版本和新的 ProductFact；UncertainClaim 标为 PROMOTED 并记录 promotedFactId。
- Product Truth 版本变化使全部下游当前产物进入 STALE。

### 4.2 ForbiddenChange

ForbiddenChange 始终是结构化对象，至少包含 field、description、severity。任何服务、ContinuityLock、CompiledPrompt 或 GenerationRequest 都不得把它退化为 string[]。

## 5. CreativeBatch

每次创意生成形成不可变 CreativeBatch，绑定：
- confirmedProductTruthVersion
- productTruthHash
- generatorVersion
- 4–6 个 CreativeConcept

用户只选择一个 CreativeConcept。重新生成创意必须创建新的 CreativeBatch；更换批次或选择会使 Script 及全部下游进入 STALE。

每个 CreativeConcept 至少包含：
- title
- targetAudience
- painPoint
- hook
- coreSellingPoint
- narrativePattern
- expectedDurationSec
- productShowcaseStrategy
- generationRisk
- requiredFactIds

## 6. Script

选中创意后生成 60–120 秒脚本。必须包含：
- 前 3 秒 Hook
- 痛点/需求
- 产品出现
- 功能/卖点
- 结果
- CTA
- ScriptBeat 列表
- 每个 ScriptBeat 的 requiredFactIds

所有 requiredFactIds 必须解析到当前 ProductTruth 的 ProductFact。用户确认 Script 后锁定版本；任何编辑或重写产生新版本，并使 ProductionPlan 及全部下游进入 STALE。

## 7. Product Director 与可追溯性

Product Director 输入当前 confirmed ProductTruth、所选 CreativeConcept 和 confirmed Script，输出 ProductionPlan：
- visualDirection
- productShowcaseRules
- soundDirection
- ContinuityLock
- scenes
- clips
- segments

必须建立以下可追溯链：

```text
ProductFact
→ ScriptBeat
→ Scene
→ Clip
→ Segment
→ CompiledPrompt fact/segment mapping
→ GenerationRequest
```

Scene、Clip、Segment 都必须保存 sourceBeatIds 与 requiredFactIds。任何断链、引用不存在或引用 UncertainClaim 均为 BLOCKED。

## 8. Scene / Clip / Segment 规则

### 8.1 Scene

Scene 是叙事场景，必须包含独立目的、地点/环境、sourceBeatIds、requiredFactIds 和有序 Clip。

### 8.2 Clip

一个 Clip 是一个生成意图单元；每次真实提交由新的 GenerationAttempt 表示。

硬约束：
- durationMs 在 4000–15000 之间
- 每个 Clip 至少 1 个 Segment
- 每个 Clip 有结构化 openingState 与 closingState
- 不允许用“承接上一镜头”替代完整状态
- referenceAssets 必须标记 role、priority 和 required
- strictProductIdentity 的适用范围必须显式定义
- Clip riskAssessment 是 Preflight 使用的唯一 Clip 风险权威来源

### 8.3 Segment

内部时间统一使用整数毫秒。每个 Segment 必须包含：
- startMs / endMs
- shotSize
- cameraPosition
- cameraAngle
- cameraMovement
- composition
- subjectAction
- productState
- dialogueOrNarration
- ambientSound
- lighting
- continuityIn
- continuityOut
- sourceBeatIds
- requiredFactIds

精确验证规则：
- segments.length >= 1
- 第一段 startMs = 0
- 最后一段 endMs = Clip.durationMs
- 每段 endMs > startMs
- 相邻段 previous.endMs = next.startMs
- 不允许 gap 或 overlap
- Segment 完整覆盖 `[0, Clip.durationMs]`
- 首段 continuityIn 的 stateHash = Clip.openingState.stateHash
- 末段 continuityOut 的 stateHash = Clip.closingState.stateHash

### 8.4 声音

声音字段必填，禁止 optional、null 或空字符串：
- dialogueOrNarration.kind = NONE / DIALOGUE / NARRATION
- kind 为 DIALOGUE 或 NARRATION 时 text 必填
- ambientSound.kind = NONE / AMBIENT
- kind 为 AMBIENT 时 description 必填

对白/旁白必须通过版本化、确定性的时长可执行性校验；预计朗读时长超过 Segment 时长时 Preflight 为 BLOCKED。

## 9. Prompt Compiler

Prompt Compiler 只做确定性编译，不自由创作。

输入必须绑定：
- ProductTruth 版本/hash
- CreativeBatch 与 selectedCreativeId
- Script 版本/hash
- ProductionPlan 版本/hash
- Clip 与 Segment hashes
- ContinuityLock
- 结构化 ForbiddenChange
- ReferenceAsset role/priority/hash
- compilerTemplateVersion

输出 CompiledPrompt 必须包含：
- promptText
- inputAssetManifest
- generationParams
- factMapping
- segmentMapping
- constraintMapping
- 所有输入版本/hash
- compilerTemplateVersion
- compiledPromptHash

用户可以查看、复制和审计 CompiledPrompt，但不得直接编辑 promptText。任何修改必须回到结构化 ProductionPlan、Clip、Segment、资产角色或约束，保存新版本后重新确定性编译。

## 10. GenerationRequest、Preflight 与 UserApproval

GenerationRequest 是 submit 的唯一输入快照，必须包含 requestHash，并引用当前 CompiledPrompt、资产hash、Provider、模型、参数和 capabilityFingerprint。

每个 GenerationRequest 必须经过新的 PreflightReport。PreflightReport 状态仅为：
- PASS
- BLOCKED
- STALE

只有 PASS 可以进入 UserApproval。UserApproval 必须绑定：
- generationRequestId / requestHash
- preflightReportId / preflightHash
- capabilityFingerprint
- providerIdentityHash
- cost/credit snapshot
- approvedAt

任一绑定值变化，PreflightReport 与 UserApproval 立即 STALE，禁止 submit。

### 10.1 成本/积分 UNKNOWN

成本或积分 UNKNOWN 可以提交，但必须满足：
- ProviderIdentity 已验证
- 模型、时长、参数和 submit 能力明确支持
- 登录状态满足提交要求
- 没有已知额度不足
- 用户单独确认“成本/积分未知，仍提交”

能力、模型支持、CLI 身份或参数支持 UNKNOWN 时必须 BLOCKED，fail closed。

## 11. 国内即梦官方 dreamina CLI

P0 只支持 DomesticJimengCliProvider 对接国内即梦官方 dreamina CLI 与 Seedance 2.0。

Provider 必须：
- probe
- accountStatus
- estimate
- submit
- status
- download
- reconcileSubmission

禁止：
- 国际 Dreamina
- 第三方逆向 Jimeng CLI
- 将 MIT wrapper 作为 P0 runtime 依赖
- 自动登录、绕过授权或静默触发扫码
- 在身份未验证时 submit

官方身份不能只凭命令名认定。必须验证官方来源/发布者、安装来源、可执行路径、版本、二进制hash或签名、原始 help/version、能力指纹以及官方登录域名。无法验证时创建 WorkflowBlocker，reasonCode 为 PROVIDER_IDENTITY_UNVERIFIED。

## 12. GenerationAttempt 与未知提交结果

每次提交或重提都必须创建新的不可变 GenerationAttempt，并重新执行：
- Preflight
- UserApproval
- submit

P0 submit 自动重试次数严格为 0。status/download 可进行有上限、无新提交副作用的技术重试，并记录每次命令尝试。

如果 submit 可能已产生外部副作用但未能可靠获得 task id，GenerationAttempt 进入 SUBMISSION_OUTCOME_UNKNOWN：
- 持久化 requestHash、submissionFingerprint、命令尝试、stdout/stderr、时间和退出信息
- 调用 reconcileSubmission
- 调和完成前禁止自动或人工直接重提
- 无法调和时创建 WorkflowBlocker
- 用户明确接受重复扣费/重复生成风险后，才可创建新的 GenerationAttempt；仍须新 Preflight 与新 UserApproval

## 13. WorkflowBlocker 与 WAITING_FOR_USER

WAITING_FOR_USER 是 UI/流程表现，不是 ProjectStatus，也不是 GenerationAttempt 终态。它由未解决的 WorkflowBlocker 派生。

WorkflowBlocker 可作用于 PROJECT、PREFLIGHT、GENERATION_ATTEMPT 或 PROVIDER，必须记录：
- reasonCode
- requiredUserAction
- resumeCheckpoint
- relatedEntityId
- createdAt / resolvedAt

CLI 未安装、未登录、VIP/权益不足、身份未验证、需要扫码授权、付费确认未完成或未知提交结果无法调和时，创建 WorkflowBlocker，不伪装为处理中。

## 14. 项目状态与聚合

ProjectStatus：
- DRAFT
- PRODUCT_TRUTH_REVIEW
- CREATIVE_REVIEW
- SCRIPT_REVIEW
- DIRECTOR_REVIEW
- READY_TO_GENERATE
- GENERATING
- GENERATION_REVIEW
- COMPLETED
- FAILED

聚合规则：
- 任一当前 GenerationAttempt 正在提交/处理：GENERATING
- 无运行任务，但存在成功待审、失败可重做或 SUBMISSION_OUTCOME_UNKNOWN：GENERATION_REVIEW
- 部分 Clip 成功、部分失败：GENERATION_REVIEW
- 外部条件阻塞：保留底层 ProjectStatus，同时由 WorkflowBlocker 显示 WAITING_FOR_USER
- 所有当前 Clip 均有与当前版本/hash匹配的 ACCEPT ReviewDecision，且无 STALE、无 blocker、无未知结果：COMPLETED
- FAILED 仅用于不可恢复的项目级结构化状态或持久化损坏；CLI缺失、登录失败、额度不足和单个Clip失败不得聚合为 FAILED

## 15. 下游失效规则

历史版本和历史产物不可覆盖或删除；上游变化只移动 current pointer，并将受影响下游标为 STALE。

- 原始输入/产品资产变化：ProductTruth及全部下游 STALE
- ProductTruth变化：CreativeBatch及全部下游 STALE
- CreativeBatch或选择变化：Script及全部下游 STALE
- Script变化：ProductionPlan及全部下游 STALE
- ProductionPlan、Clip、Segment、ContinuityLock、ForbiddenChange、资产角色变化：CompiledPrompt及全部提交链 STALE
- compilerTemplateVersion变化：CompiledPrompt及全部提交链 STALE
- Provider/model/生成参数变化：GenerationRequest、Preflight、UserApproval STALE
- CLI二进制hash、版本或capability/help指纹变化：Preflight、UserApproval STALE；命令序列变化时GenerationRequest也 STALE
- 成本快照过期或变化：UserApproval STALE

旧视频保留为历史 ArtifactRecord，但不能满足当前计划的 COMPLETED 条件。

## 16. P0 页面

P0 只做 7 个工作面：
1. Projects
2. Product Input
3. Product Truth Review
4. Creative Selection
5. Script Review
6. Director / Clip Planner
7. Generate / Task Monitor

每页必须展示：当前结果、当前版本/hash、当前阻塞、上游修改影响以及唯一主要下一步。

## 17. P0 Out of Scope

- 抖音自动抓取
- 完整 Research Engine / Evidence Store
- SAM2 / GroundingDINO / PaddleOCR
- 自动产品 QC
- 完整 Human Review 工作台
- 自动重生成决策
- 自动 BGM、字幕、花字、CTA 动画
- 多轨 Timeline
- FFmpeg 发布级成片
- 16:9 / 1:1 重构
- 多账号、权限、计费、SaaS
- 多 Provider 路由

## 18. 三层验收

### IMPLEMENTATION_PASS

实现、测试、恢复、License Gate、模拟/故障注入及缺少 CLI 时的正确阻塞全部通过；不代表真实 Seedance E2E 成功。

### EXTERNAL_BLOCKED

IMPLEMENTATION_PASS 已成立，但因官方 CLI、登录、账号、VIP/额度或外部服务不可用而无法完成真实 E2E。它是准确交付状态，不是 P0 PASS。

### E2E_PASS

必须通过已验证的国内官方 dreamina CLI：
- 提交至少 1 个真实 Seedance 2.0 Clip
- 保存真实 task id
- 成功轮询并下载
- 重启后可恢复任务和资产
- 用户实际播放并提交 ACCEPT ReviewDecision
- 证据记录到 docs/P0-ACCEPTANCE.md

最终 P0 PASS 仅等于 E2E_PASS。WAITING_FOR_USER 或 EXTERNAL_BLOCKED 不得替代 E2E_PASS。

## 19. 2026-09-28 P0 范围修订：成片与抖音发布

本节覆盖本文前面与其冲突的旧范围说明。剪辑能力仍属于 P1；P0 不实现 Timeline Editor、裁剪、转场、字幕、BGM、花字或多轨编辑。

P0 新增两个最小闭环能力：

1. **成片**：选片完成后进入 READY_TO_ASSEMBLE；仅使用当前 ProductionPlan 中明确 ACCEPT 且未 SKIP 的 Clip，按原顺序直接拼接；FFmpeg 只用于生成单一 FINAL_VIDEO Artifact。成片生成后进入 FINAL_REVIEW，用户明确接受后进入 READY_TO_PUBLISH。
2. **发布到抖音**：只允许抖音开放平台官方 OAuth 与内容发布 OpenAPI。每次发布都必须由用户显式勾选并确认；未配置、未授权、授权过期或权限不足时创建 WorkflowBlocker，禁止静默发布。

因此原“P0 不做自动发布”修订为：不做无人值守自动发布，但支持用户显式确认后的抖音官方 OpenAPI 发布。原“FFmpeg 发布级成片属于 P1”修订为：P0 允许 FFmpeg 仅用于已接受 Clip 的确定性拼接；完整剪辑与发布级后期仍属于 P1。
