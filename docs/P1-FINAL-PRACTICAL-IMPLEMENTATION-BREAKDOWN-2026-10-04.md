# Product Video Studio · P1 Final 实用化优化轮实施级拆解

日期：2026-10-04
范围：A-01 ～ A-06
基线：0.3.0-p1-final
原则：不沿用旧 P2；不重做 P1 已验收底层链路；优先复用现有持久化状态和服务，不新增第二套真值。

---

## 0. 总体实施决策

### 0.1 先做工程基线，再改代码

A-05 必须作为第 0 步。当前公司工作目录的 master 没有 commit，remote 为空。
在任何 A-01～A-06 代码改动前，先完成远端历史核对、P1 Final 基线 commit/tag、P0 Freeze 哈希复核。

### 0.2 数据库策略

本轮 A-01～A-06 默认不新增业务数据库表。

- A-01：纯状态解析层，不迁移数据库。
- A-02：页面访问/错误呈现层，不迁移数据库。
- A-03：研究发现审计优先写入 ResearchRun.browserStateJson 的扩展字段，不新增表。
- A-04：测试基础设施，不迁移生产数据库。
- A-05：Git/Release 工程治理，不迁移数据库。
- A-06：任务中心 V1 做现有持久化任务的聚合投影，不新增“大一统任务表”。

只有在实现中确认现有 JSON 字段无法安全承载 A-03 审计信息时，才单独提出 migration，不允许顺手加表。

### 0.3 新依赖策略

只有 A-04 需要新增测试依赖：
- @playwright/test

同时必须更新：
- package.json
- package-lock.json
- dependency-allowlist.json
- THIRD_PARTY_NOTICES.md
- License Gate fixture / test（如当前 Gate 要求）

Playwright E2E 禁止调用真实付费 Dreamina。

---

# A-05 正式 Git / Release 基线

优先级：Blocker / 第 0 步
负责角色：工程 / Release

## A-05.1 目标

让当前 0.3.0-p1-final 具备可追踪、可 diff、可 rollback 的正式 Git 基线，同时保留 P0 Freeze 不变。

## A-05.2 操作步骤

1. 对当前工作目录生成文件清单和安全备份。
2. 复核：
   - docs/P0-FREEZE.md
   - P0 source/runtime ZIP SHA256
   - .gitignore
   - .env、数据库、projects、runtime secret 不进入 Git。
3. 在独立临时目录克隆远端仓库，确认远端是否已有 P0 历史。
4. 禁止直接在“本地无 commit 的 master”上强推。
5. 如果远端已有 P0 历史：
   - 以远端默认分支为祖先
   - 新建 baseline/p1-final-20261004
   - 把当前已验收 P1 Final 工作树同步进去
   - 检查 diff
   - commit
6. 如果远端为空：
   - 当前 P1 Final 建 root baseline commit
   - 明确记录 P0 Freeze Artifact hash
7. 建 tag：
   - v0.3.0-p1-final
8. 配置 origin。
9. 重新跑完整 Gate。
10. 后续 A-01～A-06 每项单独 feature branch。

## A-05.3 需要更新的文档

新增：
- docs/RELEASE-BASELINE-P1-FINAL-2026-10-04.md

建议记录：
- commit SHA
- tag
- remote
- P0 Freeze hashes
- 250/250 或当前最新 tests 数
- typecheck
- License Gate
- Prisma validate
- 工作树状态

## A-05.4 验收 Gate

- git status 能明确显示 clean/dirty。
- git log 能看到 P1 Final baseline。
- tag 可解析到 baseline commit。
- origin 可 fetch。
- P0 Freeze hash 不变。
- .env、数据库、projects、secret 未进入版本库。
- npm test PASS。
- npm run typecheck PASS。
- npm run license:gate PASS。
- npx prisma validate PASS。

---

# A-01 主流程状态机与导航提示统一

优先级：P0
负责角色：产品状态机 + Web UI
依赖：A-05

## A-01.1 当前问题定位

当前相关逻辑集中在：
- src/web/workbench-ui.ts
  - workflowProgressIndex()
  - recommendedNextStep()
  - layout()
  - projectHeader()

现有 recommendedNextStep 主要按 Project.status 推导，因此用户回看上游页面时，会把“项目全局恢复点”误显示成“本页当前要做”。

## A-01.2 核心设计

新增纯应用层状态解析器：

新文件：
- src/application/services/workflow-navigation.ts

新增核心类型：
- WorkflowPageKind
  - product
  - research
  - truth
  - creative
  - script
  - director
  - generate
  - timeline
  - final

- WorkflowStepState
  - LOCKED
  - AVAILABLE
  - CURRENT
  - COMPLETE
  - OPTIONAL
  - RESUME

- WorkflowNavigationState
  - currentPage
  - pageTaskText
  - globalResumeStep
  - globalResumeHref
  - globalResumeText
  - steps[]
  - staleImpactText?
  - blockers[]

关键原则：
1. “本页任务”和“继续主流程”必须分开。
2. 本页任务由 pageKind 决定，不能直接用 Project.status 替换。
3. 项目全局状态只决定 globalResumeStep / RESUME badge。
4. 回看已完成上游页面时：
   - 当前页仍显示 CURRENT
   - 原流程恢复位置显示 RESUME
   - 不再把 RESUME 文案写成当前页任务。
5. 修改旧步骤时，继续显示 staleImpact 警告。

## A-01.3 Resolver 输入

resolveWorkflowNavigation(input) 至少接收：

- workspace
- currentPage
- blockers
- attempts
- reviewDecisions
- timeline?
- finalAssembly?

第一版不允许只传 project.status，因为需要为后续精确状态留接口。

## A-01.4 UI 改动

修改：
- src/web/workbench-ui.ts

删除/降级：
- workflowProgressIndex()
- recommendedNextStep()

layout() 改为接收已经解析好的 WorkflowNavigationState。

顶部结构调整为：

- 当前位置：产品输入
- 本页任务：检查或更新产品资料
- 继续主流程：视频生成 → 完成生成前检查

而不是：
- 当前位置：产品输入 · 推荐下一步：完成生成前检查

## A-01.5 Server 改动

修改：
- src/web/server.ts

在 renderProjectPage 前调用 workflow resolver，把 navigation state 显式传入。

renderProjectPage 输入新增：
- navigation: WorkflowNavigationState

禁止 UI 层再次自行推导全局流程状态。

## A-01.6 测试

新增：
- tests/workflow-navigation.test.ts

覆盖至少：
1. DRAFT + product
2. READY_TO_GENERATE + product
3. READY_TO_GENERATE + generate
4. GENERATION_REVIEW + research
5. READY_TO_ASSEMBLE + timeline
6. READY_TO_PUBLISH + final
7. PUBLISHED + 上游任意页
8. FAILED + blocker
9. optional research step
10. stale 上游版本

扩展：
- tests/review-actions-ui.test.ts
- tests/timeline-ui.test.ts

## A-01.7 Browser Gate

真实浏览器至少验证：
- 在已经推进到视频生成的项目里依次点击：
  产品输入 → 联网研究 → 产品事实 → 创意 → 脚本 → 导演 → 视频生成
- 每页“本页任务”正确。
- “继续主流程”始终指向真正恢复位置。
- badge 不出现两个“当前”。
- optional research 不被错误标记完成。

## A-01.8 完成标准

- 页面提示不再由 Project.status 直接拼接。
- 任意历史页均能区分“查看/编辑本页”和“继续主流程”。
- 单测 + Browser Gate PASS。

---

# A-02 所有阻塞步骤产品化

优先级：P0
负责角色：Workflow / Web
依赖：A-01

## A-02.1 当前问题定位

Timeline 路径：
- src/web/server.ts
  - kind === "timeline" 时直接调用 deps.timeline.getOrCreate(projectId)
- src/application/services/timeline-service.ts
  - acceptedSources() 在无 ACCEPT 视频时抛 DomainValidationError：
    At least one accepted generated video is required for Timeline
- server 全局 catch 对 DomainValidationError 返回 JSON 400。

所以浏览器访问页面时会直接看到 API JSON。

## A-02.2 核心设计

新增两层保护：

### 层 1：Step Access Readiness

新文件：
- src/application/services/workflow-step-access.ts

类型：
- StepAccessResult
  - allowed: boolean
  - reasonCode?
  - title?
  - message?
  - requiredAction?
  - actionHref?
  - technicalDetail?

至少实现：
- inspectTimelineAccess(projectId)
- inspectFinalAccess(projectId)

Timeline readiness 不创建 Timeline，只检查：
- 当前 ProductionPlan 是否存在
- 当前镜头是否已完成 ACCEPT / SKIP 决策
- 至少一个当前 Clip 有 ACCEPT
- 对应输出 Artifact READY

建议 TimelineService 新增只读方法：
- readiness(projectId)
或
- acceptedSourceSummary(projectId)

禁止 readiness 创建数据库记录。

### 层 2：HTML Fallback

新增：
- src/web/blocked-step-ui.ts

提供：
- renderBlockedStepPage(...)

server catch 规则改为：
- /api/**：继续 JSON error
- 浏览器 GET /projects/**：DomainValidationError 转产品化 HTML
- 未知 500：仍显示安全错误页，不泄漏 stack

这保证未来其他页面即使漏了 readiness，也不会再把 JSON 直接暴露给用户。

## A-02.3 中文 reasonCode

第一批至少统一：

- TIMELINE_NO_ACCEPTED_VIDEO
- TIMELINE_DECISION_INCOMPLETE
- TIMELINE_PLAN_MISSING
- FINAL_TIMELINE_MISSING
- FINAL_TIMELINE_NOT_CONFIRMED
- FINAL_RENDER_MISSING
- PROVIDER_NOT_READY
- STALE_UPSTREAM

普通 UI 只显示中文。
reasonCode、resumeCheckpoint、原异常文本放高级信息。

## A-02.4 修改文件

新增：
- src/application/services/workflow-step-access.ts
- src/web/blocked-step-ui.ts

修改：
- src/application/services/timeline-service.ts
- src/web/server.ts
- src/web/workbench-ui.ts（统一视觉样式/导航）
- src/domain/validation.ts（如需要 typed blocked error；优先不扩大异常层）

## A-02.5 测试

新增：
- tests/workflow-step-access.test.ts
- tests/project-page-error-ui.test.ts

扩展：
- tests/timeline-ui.test.ts

必须验证：
1. 无 ACCEPT → Timeline 返回 HTML 阻塞页，不是 JSON。
2. 有 SKIP 无 ACCEPT → 正确提示至少采用一个镜头。
3. 有 ACCEPT → Timeline 正常创建/读取。
4. final 无 Timeline → 中文阻塞说明。
5. API 同样错误仍返回 JSON，不破坏客户端契约。
6. 技术信息默认隐藏。

## A-02.6 Browser Gate

直接访问深链：
- /projects/:id/timeline
- /projects/:id/final

在各种不满足条件的 fixture 下验证：
- 页面能渲染
- 200 或明确 409 HTML 均可，但不能 JSON body
- 有主 CTA
- CTA 能回到正确步骤
- 浏览器 console 无未处理异常

## A-02.7 完成标准

任何普通项目页面不得裸露：
- VALIDATION_ERROR JSON
- 英文内部异常
- stack
- UUID-only 恢复说明

---

# A-03 Research 相关性重排与证据质量门禁

优先级：P0
负责角色：Research / AI / Data
依赖：A-05
可与 A-01/A-02 并行开发，尽量避免同时改 workbench-ui.ts。

## A-03.1 当前问题定位

当前主要文件：
- src/adapters/research/public-search-research-provider.ts
- src/application/ports/research-provider.ts
- src/application/services/research-service.ts
- src/application/ports/research-repository.ts
- src/web/workbench-ui.ts
- tests/public-search-research.test.ts
- tests/research.test.ts

当前 PublicSearchResearchProvider 基本流程：
- search query
- 提取 URL
- 每 query 截取前 N 条
- classifySource()
- 去重
- 直接交给 ResearchService fetch

ResearchService 已有 documentMatchesProduct()，但属于“抓取后再跳过”，缺少搜索候选阶段的重排、审计和自动二次搜索。

## A-03.2 Provider 类型扩展

修改：
- src/application/ports/research-provider.ts

WebResearchSource 从：
- url
- sourceType

扩展为可选 discovery metadata：
- discoveryQuery?
- discoveryEngine?
- discoveryRank?
- resultTitle?
- resultSnippet?

保持字段 optional，避免破坏 External Browser Provider。

## A-03.3 搜索结果解析升级

修改：
- src/adapters/research/public-search-research-provider.ts

Bing / Duck parser 不再只返回 URL，而返回：
- url
- title
- snippet（可获得时）
- query
- engine
- rank

仍保留：
- blockedSearchHost
- unsafeOrAdultHost
- URL normalization
- dedupe

## A-03.4 新增质量评分服务

新文件：
- src/application/services/research-source-quality.ts

类型：

ResearchCandidateScore：
- deterministicScore: 0–100
- semanticScore?: 0–100
- finalScore: 0–100
- decision: ACCEPT | HOLD | REJECT
- reasons[]
- identityMatched: boolean
- sourceQualityClass

Deterministic score 至少考虑：
- 品牌完整命中
- 产品名完整命中
- 型号 token 命中
- category 命中
- title 命中
- snippet 命中
- host identity 命中
- 官方/说明书/support 加权
- 平台首页/频道页/搜索页降权
- 泛首页降权
- 重复域名降权
- generic query-only 命中降权

硬拒绝：
- unsafe/adult
- search engine redirect
- 明显平台首页且无产品 identity
- 标题/摘要/URL 三者均无产品 identity（有明确产品真值时）

## A-03.5 Semantic Re-rank

在 ResearchService 中新增一个小范围 rerank 步骤：

输入：
- 最多 12～20 个候选
- Product Truth 的 productName / brand / category
- 搜索标题/摘要/URL
- research goal

输出严格 schema：
- candidateId
- relevanceScore 0–100
- reason

规则：
- AI 只能做相关度排序，不能产生产品事实。
- AI 输出 candidateId 必须来自输入白名单。
- AI 失败时 fallback 到 deterministic score，不阻断研究。
- semantic score 不得把硬拒绝候选救回来。

## A-03.6 两阶段 Gate

### Gate 1：抓取前

根据搜索元数据：
- ACCEPT → 进入 fetch
- HOLD → 仅在 ACCEPT 数量不足时补位
- REJECT → 不 fetch

### Gate 2：抓取后

把现有 documentMatchesProduct() 升级为 fetched-document scoring：
- title
- finalUrl
- text
- product identity terms

低于阈值：
- 不创建主 Evidence
- 记录为 rejected discovery candidate

媒体 Evidence：
- productIdentityMatch == CONFIRMED → 可作为产品证据
- UNCERTAIN / NOT_PRODUCT → 不进入产品主 Evidence 结论支持；可进入 Creative Reference 候选池

## A-03.7 自动 Search Recovery

首轮有效 Evidence 低于阈值时自动生成第二轮 query。

第二轮 query 来源：
- 第一轮缺失项
- productName + 型号
- brand + productName
- productName + 官方
- productName + 说明书
- productName + 商品详情
- productName + 使用方法
- category + productName + 评测

最多 2 轮。
第二轮仍无有效证据：
- FAILED / BLOCKED
- 明确告诉用户“没有找到足够相关来源”
- 不再把无关来源包装成研究成功。

## A-03.8 审计数据持久化

不新增数据库表。

扩展 ResearchBrowserState（保存在 browserStateJson）：
- discoveryRounds[]
  - round
  - queries[]
  - candidateCount
  - acceptedCount
  - rejectedCount
  - candidates[]
    - url
    - title?
    - sourceType
    - deterministicScore
    - semanticScore?
    - finalScore
    - decision
    - reasons[]

Prisma schema 无迁移。

修改：
- src/application/ports/research-repository.ts
- src/adapters/db/prisma-research-repository.ts（确认 JSON decode/encode 兼容）

## A-03.9 Research UI

修改：
- src/web/workbench-ui.ts

研究页增加折叠区：
“搜索质量与淘汰记录”

显示：
- 搜索候选 N
- 正式抓取 N
- 有效 Evidence N
- 淘汰 N
- 自动改写轮次
- 典型淘汰原因

默认不显示复杂分数；高级信息显示 score。

## A-03.10 测试

扩展：
- tests/public-search-research.test.ts
- tests/research.test.ts

新增：
- tests/research-source-quality.test.ts

关键用例：
1. Bilibili 首页无产品词 → REJECT。
2. 官方产品页品牌+型号 → ACCEPT。
3. 淘宝商品详情含准确产品名 → ACCEPT/HOLD。
4. 泛行业文章只命中 category → HOLD。
5. 同域名大量结果 → 只保留有限条。
6. AI rerank 输出未知 candidateId → fail closed / fallback。
7. AI rerank 服务失败 → deterministic 继续。
8. 第一轮 0 有效证据 → 自动第二轮。
9. 第二轮仍 0 → 不生成伪 ResearchBrief。
10. NOT_PRODUCT 图片不能独立支持 candidateClaim / usageRule。
11. discoveryRounds 重启后仍能读取。

## A-03.11 Browser Gate

使用“瑶药护颈枕”真实项目重跑研究，但禁止自动把网络结论升级为 Product Truth。

验收：
- B站首页/无关游戏图不进入主 Evidence。
- 页面能看到淘汰原因。
- 有效来源优先官方/说明书/商品页。
- 若确实找不到，页面诚实显示“证据不足”，而不是显示无关研究结论。

---

# A-04 浏览器级完整 E2E

优先级：P0
负责角色：QA / Web
依赖：A-05
测试框架搭建可与 A-01/A-03 并行；最终 Gate 在 A-01/A-02/A-03 合并后执行。

## A-04.1 新增依赖和脚本

修改：
- package.json
- package-lock.json
- dependency-allowlist.json
- THIRD_PARTY_NOTICES.md

新增：
- @playwright/test

package scripts：
- test:e2e
- test:e2e:headed
- test:gate（可选，串联 unit + typecheck + license + e2e）

## A-04.2 配置

新增：
- playwright.config.ts

要求：
- 默认 Chromium / 已安装 Chrome
- 单 worker 起步，避免共享 SQLite 互撞
- 自动截图 only-on-failure
- trace retain-on-failure
- video retain-on-failure
- timeout 明确
- 禁止真实外部付费调用

## A-04.3 测试 Server

createAppServer(deps) 已经支持依赖注入，无需重构 Server API。

新增：
- tests/e2e/support/e2e-dependencies.ts
- tests/e2e/support/e2e-server.ts
- tests/e2e/support/e2e-media.ts

E2E dependencies 原则：
- SQLite 临时库
- 临时 PROJECTS_ROOT
- Fake Structured AI Runtime
- Fake Dreamina Provider
- Fake Research Provider
- 本地 fixture MP4 / PNG / audio
- 真实 ProductFlow / Repository / Timeline / Render 层尽可能保留

Fake Dreamina：
- submit 不扣费
- status 可控
- download 复制本地合法 MP4
- 支持注入 SUCCESS / FAILED / UNKNOWN

## A-04.4 第一批 spec

新增：
- tests/e2e/project-navigation.spec.ts
- tests/e2e/blocked-steps.spec.ts
- tests/e2e/research-quality.spec.ts
- tests/e2e/standard-flow.spec.ts
- tests/e2e/resume-retry.spec.ts

standard-flow 覆盖：
1. 创建项目
2. 填产品
3. Research
4. Product Truth
5. Creative
6. Script
7. Director
8. Preflight
9. Approval
10. Fake Generation
11. Review ACCEPT/SKIP
12. Timeline
13. Render
14. Final
15. Manual Publish fallback

## A-04.5 必测异常

- Timeline 无 ACCEPT
- stale ProductionPlan
- Provider not ready
- Fake Dreamina FAILED
- submit unknown
- 重复点击 approval / batch submit
- 页面刷新后任务状态恢复
- file picker 上传与删除
- Research low relevance
- Render 失败
- Final 无音轨或媒体校验失败
- Publish provider unavailable

## A-04.6 完成标准

- E2E 不使用生产数据库。
- E2E 不读取真实 API Key。
- E2E 不提交真实 Dreamina。
- 失败自动保留 trace/screenshot。
- A-01/A-02/A-03 的用户级 bug 都有回归用例。
- test:e2e PASS 才能合并实用化优化轮。

---

# A-06 全局任务中心 / 运行状态中心

优先级：P0/P1
负责角色：Workflow / Observability / Web
依赖：A-05；建议 A-01/A-02 合并后接入导航，减少 workbench-ui.ts 冲突。

## A-06.1 核心决策

V1 不新增统一 TaskRecord 表。

原因：
当前已有多个可靠持久化真值：
- ResearchRun
- AgentTask
- SmartGenerationRun
- GenerationAttempt
- RenderJob
- PublishAttempt / PublishPackage / Receipt
- WorkflowBlocker
- Provider CommandAttempt

任务中心只做“Projection / 聚合视图”。

## A-06.2 新增 Task Center domain

新文件：
- src/domain/task-center.ts

TaskCenterItem：
- id
- projectId
- projectName
- sourceType
  - RESEARCH
  - AGENT
  - SMART_RUN
  - GENERATION
  - RENDER
  - PUBLISH
- sourceId
- title
- phase
- status
  - WAITING
  - RUNNING
  - NEEDS_USER
  - SUCCEEDED
  - FAILED
  - CANCELLED
  - UNKNOWN
- progressText
- provider?
- model?
- paidState
  - FREE
  - NOT_SUBMITTED
  - AUTHORIZED
  - PAID_OR_EXTERNAL
  - UNKNOWN
- costText?
- startedAt?
- updatedAt
- completedAt?
- blocker?
- safeActions[]
- detailHref
- technical?

不把不同底层状态强制改写回数据库。

## A-06.3 新增聚合服务

新文件：
- src/application/services/task-center-service.ts

依赖：
- ProductFlowService
- WorkflowRepository
- ResearchService
- AgentModeService
- SmartGenerationService?
- TimelineService
- FinalOutputRepository
- PublishBridgeService
- ProviderAuditRepository
- GenerationRepository

新增 TimelineService 公共只读方法：
- listRenderJobs(projectId)

Task Center Service：
- listProject(projectId)
- listAll()

每类转换函数单独写：
- fromResearchRun()
- fromAgentTask()
- fromSmartRun()
- fromGenerationAttempt()
- fromRenderJob()
- fromPublishAttempt()

## A-06.4 GenerationAttempt 映射规则

示例：
- CREATED → WAITING
- SUBMITTING/SUBMITTED/PROCESSING → RUNNING
- SUCCEEDED + output 未 review → NEEDS_USER
- FAILED → FAILED
- RECONCILING → NEEDS_USER / UNKNOWN
- ACCEPTED 的 review 决策 → SUCCEEDED

实际枚举以 domain schema 为准，测试必须覆盖全部当前状态。

## A-06.5 安全动作原则

任务中心不做通用“Retry”。

每个 safeAction 必须映射到已有安全语义：
- Research BLOCKED → resume
- SmartRun BLOCKED → resume
- SmartRun active → cancel（已有幂等语义）
- Generation unknown → reconcile
- Generation FAILED → 跳回 generation 页，由用户新建 retry
- Render FAILED → 回 Timeline/Final，不自动重渲染
- Publish HANDOFF → 查看状态

禁止任务中心：
- 自动重新提交付费 Dreamina
- 自动重复发布
- 自动覆盖 Timeline

## A-06.6 API

修改：
- src/web/server.ts

新增：
- GET /api/tasks
- GET /api/projects/:projectId/tasks

第一版 action API 不做统一 mutation，优先返回 actionHref / actionType，复用现有安全 endpoint。

## A-06.7 UI

新增：
- src/web/task-center-ui.ts

页面：
- GET /tasks
- GET /projects/:id/tasks（可选）

顶部导航增加：
- 任务中心

筛选：
- 全部项目 / 当前项目
- 运行中
- 需要处理
- 失败
- 已完成

卡片显示：
- 项目
- 任务
- 当前阶段
- provider/model
- 是否付费
- 更新时间
- 阻塞原因
- 安全动作

技术日志默认折叠。

## A-06.8 “最后日志”

优先从现有 ProviderAudit CommandAttempt 关联 GenerationAttempt。
没有日志的任务不伪造“日志”。

V1 显示：
- lastCommandOperation
- lastCommandAt
- lastKnownError

不直接把大段 stdout/stderr 展开到普通 UI。

## A-06.9 成本

A-06 只显示已有成本信息：
- estimatedCredits
- costEstimateStatus
- UNKNOWN

真实积分账本属于 B-03，不在 A-06 重复实现。

## A-06.10 测试

新增：
- tests/task-center.test.ts
- tests/task-center-ui.test.ts

覆盖：
1. Research BLOCKED → NEEDS_USER + resume。
2. Agent REVIEW_READY → NEEDS_USER。
3. SmartRun running → RUNNING。
4. Generation RECONCILING → UNKNOWN/NEEDS_USER。
5. Render SUCCEEDED → SUCCEEDED。
6. Publish AUTH_REQUIRED → NEEDS_USER。
7. 同一项目多任务按 updatedAt 排序。
8. 多项目聚合。
9. 付费任务不显示虚假成本。
10. safeActions 不包含危险自动 retry。

Browser E2E：
- tests/e2e/task-center.spec.ts

验证：
- 运行中任务刷新后仍存在
- 点击“处理”回到正确项目页
- BLOCKED / FAILED 区分
- 技术信息默认折叠

---

# 7. 开发波次与并行方式

## Wave 0：基线

A-05
完成前禁止进入大改动。

## Wave 1：两条并行线

### 线 A：Workflow UX
- A-01
- A-02

同一批开发，顺序 A-01 → A-02，因为共享 workbench-ui.ts / server.ts。

### 线 B：Research
- A-03

主要修改 research provider/service/ports/tests，可与线 A 并行。

### QA 线
- A-04.1～A-04.3
  - Playwright 基础设施
  - Fake provider
  - E2E server fixture

可以与 A-01/A-03 并行。

## Wave 2：任务中心

A-06
在 A-01/A-02 合并后接入顶部导航和统一阻塞文案，减少冲突。

## Wave 3：完整 Browser Gate

完成 A-04.4～A-04.6：
- 把 A-01、A-02、A-03、A-06 全部纳入 E2E。
- 最后跑全套 Gate。

---

# 8. 建议 branch 划分

在正式 Git baseline 后：

- feat/p1f-practical-a01-workflow-nav
- feat/p1f-practical-a02-blocked-pages
- feat/p1f-practical-a03-research-quality
- test/p1f-practical-a04-browser-e2e
- feat/p1f-practical-a06-task-center

A-05 属于 baseline/release，不放进普通 feature branch。

---

# 9. 每个 PR / Gate 的统一要求

每项合并前必须：

1. npm test
2. npm run typecheck
3. npm run license:gate
4. npx prisma validate
5. 对涉及页面的 Browser E2E
6. 无真实 Dreamina 付费调用
7. 无 P0 Freeze 文件改动
8. 无 API Key / .env / 数据库 / projects 文件进入 Git
9. 更新对应 docs
10. 真实浏览器人工抽查一次

---

# 10. 最终 Definition of Done

A 组不是“代码都写了”就结束。

必须达到：

- 用户回看任何步骤，知道“本页能做什么”和“主流程该继续去哪”。
- 深链进入未满足条件步骤，不再看到原始 JSON/英文内部异常。
- Research 不再把明显无关平台首页/图片当作有效产品研究证据。
- Browser E2E 可以无付费、可重复地跑完整标准流程。
- 当前 P1 Final 和后续改动均可 Git diff / rollback。
- 用户有统一任务中心，可以看到真正持久化的长任务状态和安全处理动作。
