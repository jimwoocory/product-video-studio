# Codex /goal — Product Video Studio P0 V0.2

状态：Frozen specification baseline  
冻结日期：2026-09-27

## 1. Goal

在 `C:\Users\Administrator\AgentDock\Product-Video-Studio` 中实现Product Video Studio P0最小可运行纵向闭环：

> 用户输入真实产品名称、说明和图片，确认Product Truth，选择CreativeBatch中的创意，确认60–120秒Script，通过Product Director生成可追溯的Scene → Clip → Segment计划，确定性编译CompiledPrompt，建立GenerationRequest，完成PASS Preflight和UserApproval，通过已验证的国内即梦官方dreamina CLI提交至少一个真实Seedance 2.0 Clip，轮询、下载、播放并由用户接受或重做。

不要扩展到P1。

## 2. 规格Gate

功能编码开始前必须确认以下六份拆分文档均为V0.2且相互一致：
1. `docs/P0-PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SCHEMAS.md`
4. `docs/UX-FLOW.md`
5. `docs/THIRD-PARTY-POLICY.md`
6. `docs/CODEX-GOAL.md`

这六份文件是当前唯一冻结规格基线。README.md与`Product-Video-Studio-V0.1-开发文档.md`当前不作为V0.2实现依据，后者后续再同步。

规格Gate未通过前禁止功能编码。若发现术语、枚举、必填字段、状态或PASS口径冲突，停止实现并修正规格，不得自行选择解释。

## 3. P0硬约束

### 3.1 Scope

不得实现：
- 抖音爬虫或完整Research Engine
- 完整Evidence Store
- SAM2 / GroundingDINO / PaddleOCR
- 自动Product QC
- 完整Human Review工作台
- Timeline Editor
- BGM、字幕、花字、CTA动画
- FFmpeg发布级成片
- SaaS、多租户、支付、自动发布
- 多Provider路由

P0必须实现下载后播放及ReviewDecision(minimal)，但这不等于完整Human Review系统。

### 3.2 统一术语

实现必须使用：
- WorkflowBlocker
- CreativeBatch
- GenerationRequest
- GenerationAttempt
- UserApproval
- ProviderIdentity
- ArtifactRecord
- ReviewDecision(minimal)
- SUBMISSION_OUTCOME_UNKNOWN
- PASS / BLOCKED / STALE

不得继续使用GenerationTask承载多次提交；一个Clip可以有多个GenerationAttempt。

### 3.3 Product Truth

- ProductTruth是下游事实权威输入。
- 未确认ProductTruth不得生成CreativeBatch。
- ProductFact与UncertainClaim类型和ID空间隔离。
- UNVERIFIED claim不得进入requiredFactIds、营销陈述或CompiledPrompt。
- 提升claim必须创建新ProductTruth版本和新ProductFact。
- ForbiddenChange始终为结构化对象，不得退化为string[]。

### 3.4 Scene / Clip / Segment

- Clip durationMs为4000–15000整数毫秒。
- 每个Clip至少1个Segment。
- 第一段startMs=0，最后一段endMs=Clip.durationMs。
- 相邻Segment首尾精确相等，无gap、无overlap，完整覆盖。
- 每段endMs>startMs。
- 首Segment continuityIn.stateHash等于Clip.openingState.stateHash。
- 末Segment continuityOut.stateHash等于Clip.closingState.stateHash。
- dialogueOrNarration和ambientSound必填，使用显式NONE结构。
- DIALOGUE/NARRATION预计时长不得超过Segment时长。
- ProductFact → ScriptBeat → Scene → Clip → Segment → CompiledPrompt → GenerationRequest全链可追溯。

### 3.5 Prompt Compiler

- Compiler必须确定性。
- 相同规范化输入和compilerTemplateVersion产生相同compiledPromptHash。
- ProductFact、结构化ForbiddenChange、ContinuityLock、Segment和Asset映射必须进入编译结果。
- CompiledPrompt保存所有输入版本/hash及fact/segment/constraint mapping。
- 用户不得直接编辑最终promptText；只能修改结构化Plan后创建新版本并重编译。

### 3.6 Preflight、审批与提交

submit前必须同时满足：
- GenerationRequest为当前版本且requestHash有效
- PreflightReport.status=PASS
- UserApproval.status=ACTIVE
- requestHash、preflightHash、approvalHash绑定一致
- providerIdentityHash和capabilityFingerprint一致
- 所有输入ArtifactRecord为READY

成本/积分UNKNOWN允许在能力与身份明确时由用户强化确认；能力、模型、参数或身份UNKNOWN必须BLOCKED。

每次重提必须：
- 新GenerationAttempt
- 新PreflightReport
- 新UserApproval

submit自动重试次数严格为0。status/download可有限技术重试，但不得创建新生成任务，且每次命令尝试必须持久化。

### 3.7 未知提交结果

如果submit可能已产生外部副作用但task id未可靠持久化：
- 状态设为SUBMISSION_OUTCOME_UNKNOWN
- 保存requestHash、submissionFingerprint、命令尝试和日志
- 调用reconcileSubmission
- 调和前禁止重提
- 无法调和时创建WorkflowBlocker
- 用户明确接受重复成本风险后才可创建新GenerationAttempt；仍需新Preflight和新UserApproval

### 3.8 WAITING_FOR_USER

WAITING_FOR_USER由独立WorkflowBlocker表现，不是ProjectStatus或GenerationAttempt终态。

CLI未安装、身份未验证、未登录、需要用户扫码/授权、权益不足或调和未完成时创建blocker，保留底层业务状态并提供requiredUserAction与resumeCheckpoint。

### 3.9 存储权威

- SQLite是结构化工作流权威源。
- 文件系统是不可变字节权威源。
- project.json只是派生快照。
- ArtifactRecord使用PENDING → READY可恢复写入协议。
- 应用重启必须调和PENDING、缺失文件和孤儿文件。

## 4. 国内即梦官方CLI

只实现DomesticJimengCliProvider，目标仅为国内即梦官方dreamina CLI和Seedance 2.0。

禁止：
- 国际Dreamina
- 第三方逆向Jimeng CLI
- MIT wrapper作为P0 runtime依赖
- 将官方二进制提交到仓库
- 自动登录、绕过权限或静默扫码
- 未验证ProviderIdentity时submit

Provider接口必须实现：
- probe
- accountStatus
- estimate
- submit
- status
- download
- reconcileSubmission

ProviderIdentity必须验证官方来源/发布者、安装来源、可执行路径、版本、二进制hash或签名、原始help/version、capabilityFingerprint和官方登录域名。无法证明官方身份时Preflight=BLOCKED并创建PROVIDER_IDENTITY_UNVERIFIED blocker。

## 5. License Gate

严格执行`docs/THIRD-PARTY-POLICY.md`。

在安装或提交任何业务依赖前：
- 登记`dependency-allowlist.json`
- 更新`THIRD_PARTY_NOTICES.md`
- 保存许可证到`third_party/licenses/`

License Gate default-deny；GPL、AGPL、SSPL、UNKNOWN、无LICENSE及未登记依赖必须失败。必须扫描直接和传递依赖。

官方dreamina仅作为external-runtime登记，不提交或分发二进制。第三方Jimeng CLI和MIT wrapper不得作为runtime依赖。

## 6. 建议技术栈

建议但非强制：
- Next.js + TypeScript
- Zod + JSON Schema
- Prisma + SQLite
- Vitest

不得为了技术栈便利破坏domain/application/ports/adapters/web边界。

## 7. 必需交付物

### 7.1 App skeleton

可运行Web工作台和Application API。

### 7.2 Core schemas

至少实现：
- Project
- AssetRef
- ArtifactRecord
- ProductTruth / ProductFact / UncertainClaim / ForbiddenChange
- CreativeBatch / CreativeConcept
- ScriptDraft / ScriptBeat
- ProductionPlan / Scene / Clip / Segment / ContinuityLock
- CompiledPrompt
- ProviderIdentity / ProviderCapability
- GenerationRequest
- PreflightReport
- UserApproval
- GenerationAttempt
- WorkflowBlocker
- ReviewDecision(minimal)

### 7.3 Persistent store

- SQLite保存结构化权威状态
- 文件系统保存不可变输入、快照、Prompt、请求、probe、日志和输出
- project.json为派生快照
- restart后恢复

### 7.4 七页Product flow

- Projects
- Product Input
- Product Truth Review
- Creative Selection
- Script Review
- Director / Clip Planner
- Generate / Task Monitor

每页必须显示当前结果、版本/hash、阻塞、失效影响和唯一主要下一步。

### 7.5 Prompt Compiler

实现确定性规范化、编译、映射和hash；不提供最终Prompt编辑入口。

### 7.6 DomesticJimengCliProvider

实现官方身份验证、能力探测、账号状态、估算、提交、轮询、下载和调和；保存脱敏命令证据与ArtifactRecord。

### 7.7 最小人工结果闭环

视频下载后必须播放，并创建ACCEPT或REDO ReviewDecision。REDO不自动submit。

## 8. 必需测试

### 8.1 Domain validator

- Clip <4秒或>15秒阻止
- 0个Segment阻止
- 非整数毫秒阻止
- 非0起点、非duration终点阻止
- gap/overlap/倒序/零长度阻止
- continuity首尾hash不一致阻止
- 声音缺失、null、空字符串阻止
- 对白时长不可执行阻止
- UncertainClaim ID进入requiredFactIds阻止
- ForbiddenChange退化为string[]阻止

### 8.2 Version与审批

- 未确认ProductTruth阻止CreativeBatch
- 上游变化使正确下游STALE
- STALE Preflight或UserApproval阻止submit
- requestHash/preflightHash/approvalHash不一致阻止submit
- CLI版本/help/capability变化使旧批准STALE
- 每次重提创建新Attempt、Preflight和Approval

### 8.3 Provider与恢复

- DREAMINA_NOT_FOUND创建WorkflowBlocker
- ProviderIdentity未验证时BLOCKED
- 交互登录不会自动触发
- submit自动重试=0
- CLI command failure和每次尝试持久化
- task id返回后写库前崩溃进入SUBMISSION_OUTCOME_UNKNOWN
- reconcile找到/失败/无结论路径
- polling失败不丢handle
- download重试不创建新GenerationAttempt
- Artifact PENDING/rename/DB更新各崩溃点恢复
- 重启后不丢task id、attempt、approval或blocker

### 8.4 License Gate

- 未登记依赖失败
- GPL/AGPL/SSPL/UNKNOWN/无LICENSE失败
- 传递依赖命中禁用许可失败
- 缺少license副本或NOTICE失败
- 第三方Jimeng CLI或MIT wrapper作为runtime时失败

## 9. 三层验收

### IMPLEMENTATION_PASS

必须同时满足：
- 六份V0.2规格未被破坏
- 核心测试、集成测试和故障注入通过
- 七页流程可运行
- 状态和Artifact可恢复
- License Gate通过
- 实际探测本机dreamina；不存在时准确创建DREAMINA_NOT_FOUND blocker

IMPLEMENTATION_PASS不代表真实Seedance生成成功。

### EXTERNAL_BLOCKED

只有在IMPLEMENTATION_PASS成立后，且唯一剩余问题为官方CLI、身份验证、登录、账号、VIP/额度或外部服务时可判定。

EXTERNAL_BLOCKED不是P0 PASS。

### E2E_PASS

必须：
- ProviderIdentity=VERIFIED
- 真实账号环境可用
- 提交至少1个真实Seedance 2.0 Clip
- 记录真实task id
- 成功轮询并下载
- 重启后恢复任务和输出
- 用户实际播放并提交ACCEPT ReviewDecision
- `docs/P0-ACCEPTANCE.md`记录真实证据

最终P0 PASS仅等于E2E_PASS。WAITING_FOR_USER不得替代真实E2E。

## 10. 当前环境事实

截至2026-09-27，已知本机状态为DREAMINA_NOT_FOUND。实现不得伪造版本、身份、登录、task id或E2E结果；应完成其余可验证项并停在WorkflowBlocker/WAITING_FOR_USER。

## 11. 完成时输出

- 实现摘要
- 测试与故障注入结果
- License Gate结果
- 实际CLI探测和ProviderIdentity结果
- IMPLEMENTATION_PASS / EXTERNAL_BLOCKED / E2E_PASS判定
- 唯一剩余阻塞
- git status

不得merge、publish或进入P1。

## 12. 2026-09-28 Scope Amendment

本节覆盖前文与其冲突的 P0 scope。Timeline Editor、裁剪、转场、字幕、BGM、花字、多轨编辑仍禁止进入 P0，继续属于 P1。

P0 增加最小成片：用户完成 ACCEPT/SKIP 选片后进入 READY_TO_ASSEMBLE，把已 ACCEPT 且未 SKIP 的 Clip 按 ProductionPlan 原顺序直接拼接为 FINAL_VIDEO，允许使用已登记的非捆绑 FFmpeg external-runtime。

P0 增加发布到抖音：只使用抖音开放平台官方 OAuth + video.create API；每次发布必须有当前用户显式确认。禁止无人值守自动发布、绕过授权、复用过期 token、把 secret 写入项目 Artifact/日志。

新增完成链：ACCEPT/SKIP selection → READY_TO_ASSEMBLE → FINAL_VIDEO → FINAL_REVIEW → user accepts final → READY_TO_PUBLISH → explicit Douyin publish confirmation → PUBLISHED。

本文件旧语境中的“不得 publish”指 Codex/开发流程不得擅自发布代码包；不再解释为禁止产品用户显式将已确认成片发布到抖音。
