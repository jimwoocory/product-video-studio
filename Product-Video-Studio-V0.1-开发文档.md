# Product Video Studio V0.1 — 开发文档

> AI 产品营销视频生产系统  
> 目标平台：抖音  
> 视频生成：国内即梦官方 `dreamina` CLI + Seedance 2.0  
> 当前阶段：P0 开发基线

---

## 文档说明

本文件合并当前 P0 的产品需求、技术架构、核心数据模型、页面流程、第三方授权策略、Codex 开发 Goal 与环境检查。  
如后续拆分文档与本文件出现冲突，以项目仓库中的最新拆分文档为准。

---


# Product Video Studio — P0 PRD

版本：0.1  
状态：Draft for implementation

## 1. P0 目的

P0 不是完整 V1，也不是完整剪辑器。P0 只验证最关键的生成闭环能真实运行：

```
产品输入
→ Product Truth
→ Creative
→ Script
→ Product Director
→ Scene / Clip / Segment
→ Prompt Compiler
→ Cost/Capability Preflight
→ 国内即梦 dreamina CLI
→ Seedance 2.0
→ Task Polling
→ 视频下载与项目留档
```

P0 成功后再进入 P1：Research、Evidence、Product QC、Human Review、Timeline、自动剪辑。

## 2. 用户

首期：
- 个人创作者
- 公司内部视频团队

不做：
- 多租户 SaaS
- 外部客户自助注册/付费
- 大规模并发生产

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
- 禁止修改项

P0 不要求：
- PDF/Word/PPT 自动解析
- 商品链接抓取
- 抖音自动研究
- 竞品自动抓取

但数据模型必须为这些 V1 输入预留扩展位。

## 4. Product Truth

系统在正式创意前必须生成并让用户确认 Product Truth。

至少包含：
- product_name
- brand
- category
- reference_images
- canonical_image
- logo
- standard_colors
- confirmed_features
- selling_points
- forbidden_changes
- uncertain_claims
- evidence_refs

原则：
- 未确认信息不能自动当作产品事实。
- 产品颜色、Logo、结构、包装、型号等禁改项向下游透传。
- 用户可人工修改并确认。

## 5. Creative

基于 Product Truth 生成 4–6 个营销创意卡。

每张卡至少包含：
- title
- target_audience
- pain_point
- hook
- core_selling_point
- narrative_pattern
- expected_duration
- product_showcase_strategy
- generation_risk

P0 由用户选择一个创意，不自动评分选胜者。

## 6. Script

选中创意后生成 60–120 秒完整脚本草案。

P0 要求：
- 前 3 秒 Hook
- 痛点/需求
- 产品出现
- 功能/卖点
- 结果
- CTA
- 标记每一段对应的产品事实

用户确认脚本后才进入 Director。

## 7. Product Director

P0 Director 应吸收 MIT/Apache 许可的导演方法，但实现独立的 Product Director。

输出：
- visual_direction
- product_showcase_rules
- sound_direction
- continuity_lock
- scenes
- clips
- segments

## 8. Scene / Clip / Segment 规则

### Scene
内容/叙事场景。

### Clip
一次 Seedance 生成任务。

硬约束：
- duration_sec >= 4
- duration_sec <= 15
- 每个 Clip 有独立开场状态和结束状态
- 不允许写“承接上一镜头”代替必要描述

### Segment
Clip 内部短镜头。

每个 Segment 必须明确：
- start_sec / end_sec
- shot_size
- camera_position
- camera_angle
- camera_movement
- composition
- subject_action
- product_state
- dialogue_or_narration
- ambient_sound
- lighting
- continuity_in
- continuity_out

一个 12 秒 Clip 示例：
- 0–3s：中景/低机位/缓推
- 3–7.5s：近景/右前方/小幅环绕
- 7.5–12s：产品特写/缓推/Logo朝镜头

## 9. Prompt Compiler

Prompt 不允许由不同 Agent 自由发挥。

Compiler 输入：
- Product Truth
- Director Plan
- Clip
- Segments
- Continuity Lock
- Reference Assets

输出：
- seedance_prompt
- input_asset_manifest
- generation_params
- safety/constraint notes

## 10. 国内即梦 CLI

只支持国内即梦官方 `dreamina` CLI 路线。

P0 Provider 名称：
`DomesticJimengCliProvider`

职责：
1. 检测 CLI 是否存在
2. 读取版本
3. 运行 help/capability discovery
4. 检查登录/账号状态
5. 查询积分/额度（CLI支持时）
6. 提交 Seedance 任务
7. 保存 task/submit id
8. 轮询任务
9. 下载视频
10. 保存原始 stdout/stderr 与解析结果

禁止：
- 把某个第三方逆向 CLI 直接写死到核心
- 复制无许可证仓库源码
- 静默切换到国际 Dreamina

## 11. Preflight

开始生成前必须显示：
- 总目标时长
- Clip 数量
- 每个 Clip 时长
- 预计生成总秒数
- 当前 CLI/模型能力
- 当前已知积分/成本信息
- 高风险 Clip 数量

用户明确点击“开始生成”后才提交付费/耗积分任务。

## 12. P0 状态机

项目级：
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

Clip级：
- PLANNED
- READY
- SUBMITTED
- PROCESSING
- SUCCEEDED
- FAILED
- NEEDS_REVIEW
- ACCEPTED

## 13. P0 页面

P0 只做 7 个工作面：

1. Projects
2. Product Input
3. Product Truth Review
4. Creative Selection
5. Script Review
6. Director / Clip Planner
7. Generate / Task Monitor

P0 暂不做完整 Timeline Editor。

## 14. P0 Out of Scope

明确不在 P0：
- 抖音自动抓取
- 完整 Research Engine
- Evidence Store 全能力
- SAM2/GroundingDINO 产品锁
- OCR 产品 QC
- 自动重生成
- 自动 BGM
- 自动字幕
- 花字
- CTA 动画
- 多轨时间线编辑
- FFmpeg 发布级自动剪辑
- 16:9/1:1 重构
- 多账号/权限/计费
- SaaS

这些进入 P1/P2。

## 15. P0 验收标准

给系统：
- 1 个真实产品名称
- 3 张真实产品图片
- 一段功能介绍

必须完成：
1. 创建项目并保存原始素材
2. 生成 Product Truth 并让用户确认
3. 生成至少 4 个创意卡
4. 用户选择 1 个创意
5. 生成 60–120 秒脚本并确认
6. Product Director 输出完整 Scene/Clip/Segment
7. 所有 Clip 均为 4–15 秒
8. 每个 Segment 有机位、运镜、时长、动作、声音、产品状态
9. 编译出可审计的 Seedance Prompt
10. Preflight 展示任务与消耗信息
11. 通过国内 `dreamina` CLI 提交至少 1 个真实 Seedance 任务
12. 成功轮询并下载至少 1 个真实视频
13. 原始输入、JSON、Prompt、任务日志、视频全部落入同一项目目录
14. 任一步失败可恢复，不要求从项目第一步重来

满足以上条件，P0 PASS。

---

# Product Video Studio — 技术架构

## 1. 架构目标

核心原则：
- Headless Core 与 UI 分离
- Provider 可替换
- Agent 输出必须结构化
- 项目状态可恢复
- 原素材不可破坏
- 第三方依赖许可可审计

## 2. 总体架构

```
Web Workbench
     │
     ▼
Application API
     │
     ▼
Workflow Orchestrator
     │
     ├── ProductTruthService
     ├── CreativeService
     ├── ScriptService
     ├── ProductDirectorService
     ├── PromptCompiler
     ├── PreflightService
     └── GenerationService
                │
                ▼
        VideoProvider interface
                │
                ▼
     DomesticJimengCliProvider
                │
                ▼
        official dreamina CLI
                │
                ▼
           Seedance 2.0
```

## 3. 建议技术栈

P0 建议：
- Frontend: Next.js + TypeScript
- Backend/API: Next.js server routes 或独立 Node/TypeScript service
- Schema: Zod + JSON Schema 导出
- DB: SQLite + Prisma（P0）
- Job state: DB 持久化，不只放内存
- Files: 本地项目目录
- Process execution: Node child_process/execa
- Video metadata: ffprobe（只读检测）
- Testing: Vitest + integration tests

P0 不引入：
- Redis
- Kubernetes
- 多租户
- 消息队列集群

## 4. 项目文件结构

```
projects/<project_id>/
  input/
  product_truth/
  creative/
  script/
  director/
  prompts/
  generation/
    clip-001/
      request.json
      stdout.log
      stderr.log
      result.json
      clip-001.mp4
  assets/
  logs/
  project.json
```

## 5. 服务边界

### ProductTruthService
输入原始资料，输出唯一权威 ProductTruth。

### CreativeService
只读 ProductTruth，输出 CreativeConcept[]。

### ScriptService
只读 ProductTruth + selected CreativeConcept，输出 ScriptDraft。

### ProductDirectorService
输入 confirmed Script + ProductTruth，输出 ProductionPlan。

### PromptCompiler
禁止自由创作，只把 ProductionPlan 与约束编译为 Seedance 可执行 Prompt。

### PreflightService
不生成媒体，只检查：
- CLI
- 账号/登录
- 模型能力
- Clip 参数
- 预计任务量
- 可恢复性

### GenerationService
只负责已批准的 GenerationRequest，不参与创意决策。

## 6. Provider 契约

```ts
interface VideoProvider {
  id: string;
  probe(): Promise<ProviderCapability>;
  accountStatus(): Promise<AccountStatus>;
  estimate(req: GenerationRequest[]): Promise<CostEstimate>;
  submit(req: GenerationRequest): Promise<GenerationHandle>;
  status(handle: GenerationHandle): Promise<GenerationStatus>;
  download(handle: GenerationHandle, outputPath: string): Promise<DownloadedAsset>;
}
```

正式 P0 仅实现：
- DomesticJimengCliProvider

未来可增加其他 Provider，但业务层不得直接调用 CLI。

## 7. dreamina CLI 适配原则

- CLI 是外部 runtime，不把官方二进制提交到仓库。
- 首次使用时 probe。
- 运行时解析当前版本 help，而不是假定永久固定参数。
- 命令构造必须集中在 Provider 内。
- stdout/stderr 原样留档。
- 敏感凭据、Cookie、Token 不写入 project.json。
- 不自动登录或绕过账号权限；需要用户操作时明确停在 WAITING_FOR_USER。

## 8. 恢复设计

每个阶段输出不可覆盖历史：
- ProductTruth v1/v2
- Script v1/v2
- ProductionPlan v1/v2
- Prompt v1/v2

任务记录必须包含：
- input_hash
- provider
- provider_version
- request
- task_id
- status
- submitted_at
- completed_at
- output_path
- error

应用重启后根据 DB + 文件系统恢复。

## 9. 安全与成本

生成属于有成本动作：
- Preflight 与 Submit 分离。
- 用户确认前禁止 submit。
- 一次 Submit 后必须立即持久化 task id。
- 禁止失败后无限自动重试。
- P0 默认自动重试次数为 0；失败交给用户再次确认。

## 10. P1 扩展点

预留接口：
- ResearchProvider
- EvidenceStore
- ProductQCProvider
- TimelineEngine
- RenderEngine
- PublishProvider

P0 不实现，但 Schema 和模块边界不得阻断后续扩展。

---

# Product Video Studio — 核心数据模型

## 1. Project

```ts
type ProjectStatus =
  | "DRAFT"
  | "PRODUCT_TRUTH_REVIEW"
  | "CREATIVE_REVIEW"
  | "SCRIPT_REVIEW"
  | "DIRECTOR_REVIEW"
  | "READY_TO_GENERATE"
  | "GENERATING"
  | "GENERATION_REVIEW"
  | "COMPLETED"
  | "FAILED";

interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  targetPlatform: "douyin";
  targetDurationSec: number; // 60-120
  aspectRatio: "9:16";
  createdAt: string;
  updatedAt: string;
  currentProductTruthVersion?: string;
  selectedCreativeId?: string;
  confirmedScriptVersion?: string;
  confirmedProductionPlanVersion?: string;
}
```

## 2. AssetRef

```ts
interface AssetRef {
  id: string;
  type: "image" | "video" | "audio" | "logo" | "document";
  source: "user_upload" | "generated" | "external";
  path: string;
  sha256: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSec?: number;
}
```

## 3. ProductTruth

```ts
interface ProductTruth {
  id: string;
  projectId: string;
  version: number;
  status: "DRAFT" | "CONFIRMED";
  productName: string;
  brand?: string;
  category?: string;

  referenceImages: AssetRef[];
  canonicalImageId: string;
  logoAssetId?: string;

  standardColors: string[];
  confirmedFeatures: ProductFact[];
  sellingPoints: ProductFact[];
  forbiddenChanges: ForbiddenChange[];
  uncertainClaims: UncertainClaim[];

  evidenceRefs: string[];
  confirmedAt?: string;
}
```

```ts
interface ProductFact {
  id: string;
  statement: string;
  sourceType: "user" | "official" | "external";
  evidenceRef?: string;
}

interface ForbiddenChange {
  field: "logo" | "color" | "shape" | "packaging" | "text" | "model" | "proportion" | "other";
  description: string;
  severity: "HARD" | "SOFT";
}

interface UncertainClaim {
  statement: string;
  reason: string;
  status: "UNVERIFIED" | "REJECTED" | "CONFIRMED";
}
```

## 4. CreativeConcept

```ts
interface CreativeConcept {
  id: string;
  projectId: string;
  title: string;
  targetAudience: string;
  painPoint: string;
  hook: string;
  coreSellingPoint: string;
  narrativePattern: string;
  expectedDurationSec: number;
  productShowcaseStrategy: string;
  generationRisk: "LOW" | "MEDIUM" | "HIGH";
  requiredFactIds: string[];
  selected: boolean;
}
```

## 5. ScriptDraft

```ts
interface ScriptDraft {
  id: string;
  projectId: string;
  version: number;
  targetDurationSec: number;
  status: "DRAFT" | "CONFIRMED";
  beats: ScriptBeat[];
}

interface ScriptBeat {
  id: string;
  order: number;
  purpose: "HOOK" | "PAIN" | "PRODUCT" | "FEATURE" | "PROOF" | "RESULT" | "CTA" | "OTHER";
  text: string;
  estimatedDurationSec: number;
  requiredFactIds: string[];
}
```

## 6. ProductionPlan

```ts
interface ProductionPlan {
  id: string;
  projectId: string;
  version: number;
  status: "DRAFT" | "CONFIRMED";

  visualDirection: string;
  soundDirection: string;
  productShowcaseRules: string[];
  continuityLock: ContinuityLock;

  scenes: Scene[];
}
```

## 7. Scene

```ts
interface Scene {
  id: string;
  order: number;
  purpose: string;
  location: string;
  timeOfDay?: string;
  visualState: string;
  clips: Clip[];
}
```

## 8. Clip

Clip 是一次 Seedance 任务的最小生成单位。

```ts
type ClipStatus =
  | "PLANNED"
  | "READY"
  | "SUBMITTED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "NEEDS_REVIEW"
  | "ACCEPTED";

interface Clip {
  id: string;
  sceneId: string;
  order: number;

  durationSec: number; // hard: 4-15
  purpose: string;

  openingState: string;
  closingState: string;

  referenceAssetIds: string[];
  productVisibility: "NONE" | "PARTIAL" | "CLEAR" | "HERO";
  strictProductIdentity: boolean;

  segments: Segment[];

  promptVersion?: number;
  generationTaskId?: string;
  status: ClipStatus;
}
```

验证：
- 4 <= durationSec <= 15
- Segment 时间必须覆盖 Clip 时间且不得重叠非法
- Segment.endSec <= Clip.durationSec

## 9. Segment

```ts
interface Segment {
  id: string;
  order: number;

  startSec: number;
  endSec: number;

  shotSize: string;
  cameraPosition: string;
  cameraAngle: string;
  cameraMovement: string;
  composition: string;

  subjectAction: string;
  productState: string;

  dialogueOrNarration?: string;
  ambientSound?: string;

  lighting: string;
  continuityIn: string;
  continuityOut: string;
}
```

## 10. ContinuityLock

```ts
interface ContinuityLock {
  product: {
    stableAttributes: string[];
    forbiddenChanges: string[];
  };
  characters: Array<{
    name: string;
    stableAppearance: string;
    wardrobe: string;
  }>;
  environments: Array<{
    sceneId: string;
    stableElements: string[];
  }>;
}
```

## 11. CompiledPrompt

```ts
interface CompiledPrompt {
  id: string;
  clipId: string;
  version: number;

  provider: "domestic-jimeng-cli";
  model: "seedance-2.0";

  promptText: string;
  inputAssetManifest: Array<{
    assetId: string;
    role: string;
    path: string;
  }>;

  durationSec: number;
  aspectRatio: "9:16";
  generateAudio: boolean;

  constraints: string[];
  createdAt: string;
}
```

## 12. ProviderCapability

不要假定 CLI 参数永久固定。

```ts
interface ProviderCapability {
  provider: "domestic-jimeng-cli";
  cliFound: boolean;
  cliVersion?: string;
  authenticated?: boolean;
  supportedOperations: string[];
  supportedModels: string[];
  supportedDurations?: number[];
  rawProbePath: string;
}
```

## 13. GenerationTask

```ts
interface GenerationTask {
  id: string;
  projectId: string;
  clipId: string;
  compiledPromptId: string;

  provider: "domestic-jimeng-cli";
  providerVersion?: string;

  status:
    | "CREATED"
    | "SUBMITTED"
    | "PROCESSING"
    | "SUCCEEDED"
    | "FAILED"
    | "WAITING_FOR_USER";

  externalTaskId?: string;
  requestSnapshotPath: string;
  stdoutLogPath: string;
  stderrLogPath: string;
  resultSnapshotPath?: string;
  outputAssetId?: string;

  submittedAt?: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}
```

## 14. PreflightReport

```ts
interface PreflightReport {
  id: string;
  projectId: string;
  providerCapability: ProviderCapability;

  clipCount: number;
  totalGeneratedSeconds: number;
  highRiskClipIds: string[];

  creditKnown: boolean;
  estimatedCredits?: number;
  estimatedCostText?: string;

  blockers: string[];
  warnings: string[];

  requiresUserApproval: true;
}
```

## 15. P1 预留 Schema

P0 只预留 ID/接口，不实现：
- ResearchBrief
- Evidence
- ProductQCResult
- ReviewDecision
- Timeline
- RenderJob

原则：P0 schema 不得迫使 P1 大迁移。

---

# Product Video Studio — P0 页面与交互流程

## 1. 页面流

```
/projects
   ↓
/projects/:id/product
   ↓
/projects/:id/truth
   ↓
/projects/:id/creative
   ↓
/projects/:id/script
   ↓
/projects/:id/director
   ↓
/projects/:id/generate
```

## 2. Projects

功能：
- 新建项目
- 项目名称
- 状态
- 最近更新时间
- 继续项目

P0 不做：
- 团队权限
- 分享
- 计费
- 搜索高级筛选

## 3. Product Input

字段：
- 产品名称*
- 产品功能介绍*
- 品牌
- 类别
- 产品图片*（至少1张）
- Logo
- 禁止修改项

上传后显示缩略图。

提交按钮：
`生成 Product Truth`

## 4. Product Truth Review

必须让用户看清楚：
- Canonical Product Image
- 标准颜色
- 已确认功能
- 卖点
- Logo
- 禁止修改项
- 不确定信息

操作：
- 编辑
- 添加禁改项
- 删除错误事实
- 确认 Product Truth

未确认不得继续 Creative。

## 5. Creative Selection

显示 4–6 个创意卡。

每张卡：
- 名称
- 目标人群
- 痛点
- 3秒 Hook
- 核心卖点
- 结构
- 时长
- 产品展示策略
- 生成风险

操作：
- 选择
- 重新生成全部
- 查看依据

P0 只允许选 1 个。

## 6. Script Review

显示：
- 预计总时长
- Beat 列表
- Hook
- 产品事实引用
- CTA

操作：
- 直接编辑
- 针对单 Beat 重写
- 整体重写
- 确认剧本

确认后锁版本。

## 7. Director / Clip Planner

左侧：Scene 列表  
中间：Clip 卡片  
右侧：Segment / Prompt Inspector

Clip 卡片至少显示：
- Clip ID
- 4–15s
- 用途
- 产品是否清晰出现
- 严格产品身份开关
- Segment 数量
- 风险标签

Segment 编辑：
- 时间
- 景别
- 机位
- 角度
- 运镜
- 构图
- 动作
- 产品状态
- 对白/旁白
- 环境声
- 光线

操作：
- 修改 Clip
- 修改 Segment
- 重新生成 Director Plan
- 确认 Production Plan

## 8. Generate / Task Monitor

生成前先显示 Preflight：

```
CLI: dreamina <version>
账号状态: ...
模型: Seedance 2.0
Clip: 8
总生成秒数: 86s
高风险 Clip: 2
预计积分/成本: 可获取则展示
```

按钮：
`确认并开始生成`

生成期间每个 Clip 单独显示：
- READY
- SUBMITTED
- PROCESSING
- SUCCEEDED
- FAILED

成功：
- 直接播放
- 打开本地文件位置
- 查看 Prompt
- 查看 CLI 日志

失败：
- 显示错误
- 修改 Prompt
- 再次提交（必须用户点击）

P0 禁止无限自动重试。

## 9. WAITING_FOR_USER

以下情况必须暂停：
- CLI 未安装
- 未登录
- VIP/权益不足
- CLI 版本能力不满足
- 需要用户扫码/授权
- 付费/积分提交尚未确认

页面给出明确操作，不伪装成“处理中”。

## 10. UI 原则

- 中文优先。
- 不用大数据驾驶舱风格。
- 核心是“做视频”，不是“看报表”。
- 每一步都应回答：现在完成了什么、下一步是什么。
- 高风险/耗费操作必须显式确认。

---

# Product Video Studio — 第三方依赖与授权策略

## 1. 目标

项目未来可能闭源、商业化或 SaaS 化，因此从 P0 起执行依赖白名单。

任何 Codex/Agent 在加入第三方代码前都必须检查：
- 仓库 LICENSE
- SPDX 标识
- 是否包含额外商业条款
- 是否有第三方 NOTICE
- 是否复制源码还是仅调用外部 runtime
- 模型/平台服务条款与代码许可证是否为两回事

## 2. 默认允许

优先：
- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause

仍需保留对应版权与许可声明。

## 3. 默认禁止直接进入闭源核心

未经专项批准不得复制、vendor、修改并嵌入：
- GPL-2.0/3.0
- AGPL-3.0
- SSPL
- 未知/自定义限制许可证
- 没有 LICENSE 的公开仓库

这些项目可以阅读、学习架构、重新独立实现思想，但不得复制实质源码。

## 4. 当前白名单候选

### s1dashu/director
- License: MIT
- 用途：Director 工作流、15秒片段、镜头设计方法
- 策略：允许基于许可吸收；保留上游版权/License
- 注意：不要整体照搬不适合产品广告的 Mode

### 62656456/ai-film-skills
- License: Apache-2.0
- 用途：摄影、轴线、机位、运镜、时长、连续性方法
- 策略：允许复用 Apache 覆盖的原创内容
- 必须阅读其 THIRD_PARTY_NOTICES 与文件级声明

### facebookresearch/sam2
- License: Apache-2.0；部分组件另有 BSD
- P1 用途：产品视频目标分割/跟踪

### IDEA-Research/GroundingDINO
- License: Apache-2.0
- P1 用途：产品定位

### PaddlePaddle/PaddleOCR
- License: Apache-2.0
- P1 用途：Logo/包装文字 QC

### AcademySoftwareFoundation/OpenTimelineIO
- License: Apache-2.0
- P1/P2 用途：Timeline 交换格式

### MoviePy / editly
- License: MIT
- 辅助参考，不作为 P0 核心

## 5. 仅参考，不直接复制

### StoryMind
- AGPL-3.0
- 只研究流水线/Provider/一致性/渲染设计

### Relo-video/SynthCut
- GPL-3.0-or-later
- 只研究 AI Timeline / MCP 编辑器设计

### Algovate/jimeng-cli
- GPL-3.0
- 不进入核心

### juspay/director
- 当前无 LICENSE
- Product consistency critic / cost preflight 思想值得重写
- 禁止复制源码

### AtlasCloudAI/atlas-marketing-studio
- 当前 GitHub 无可依赖的标准 LICENSE 标识
- 只参考工作流/UI

### deluxebear/jimeng-cli
- 当前无 LICENSE
- 只参考，不复制

## 6. 国内即梦官方 CLI

`dreamina` CLI 作为外部 runtime 处理。

规则：
- 不把官方 CLI 二进制提交到本仓库
- 不反编译/修改官方二进制
- 不把账号凭据写进项目文件
- 安装、登录、VIP/额度由用户自己的官方账号承担
- 我们只实现 Process Adapter

可参考：
- xiaozhichao2025/JimengCli_api：其 wrapper 代码标注 MIT
- 但正式实现仍建议自己写最小 Adapter，减少不必要依赖

## 7. FFmpeg

P1 引入 FFmpeg 时：
- 固定构建来源和版本
- 记录 configure flags
- 优先 LGPL-compatible build
- 不静默引入导致整体 GPL 化的组件
- THIRD_PARTY_NOTICES 中记录

## 8. Remotion

不是 P0 依赖。

如果未来采用，必须单独核验当时的商业许可与 Automator/Company 条款，不能按传统 MIT 开源库处理。

## 9. 仓库必须维护

未来增加：
- THIRD_PARTY_NOTICES.md
- third_party/licenses/
- dependency-allowlist.json

CI 后续可做 License Gate：
发现 GPL/AGPL/UNKNOWN → fail。

---

# Codex /goal — Product Video Studio P0

## Goal

在 `C:\Users\Administrator\AgentDock\Product-Video-Studio` 中实现 Product Video Studio P0 的最小可运行纵向闭环。

唯一目标：

> 用户输入真实产品名称、产品说明和产品图片后，系统能够建立并确认 Product Truth，生成多个创意，生成并确认 60–120 秒脚本，通过 Product Director 生成 Scene → Clip → Segment 生产计划，编译 Seedance Prompt，执行国内即梦官方 dreamina CLI 的 capability/preflight，经过用户确认后提交至少一个真实 Seedance 2.0 Clip，轮询任务并下载结果到项目目录。

不要扩展到 P1。

## Authoritative docs

开始编码前必须完整读取：

1. `README.md`
2. `docs/P0-PRD.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SCHEMAS.md`
5. `docs/UX-FLOW.md`
6. `docs/THIRD-PARTY-POLICY.md`

这些文档共同构成 P0 的唯一需求基线。

## Hard constraints

### Scope
不得实现或擅自扩大：
- 抖音爬虫
- Research Engine 完整版
- SAM2/GroundingDINO/PaddleOCR
- Product QC 自动化
- Timeline Editor
- BGM/字幕/花字/CTA
- FFmpeg 最终成片
- SaaS、多租户、支付

### Video generation
- 只实现 `DomesticJimengCliProvider`
- 目标是国内即梦官方 `dreamina` CLI
- 不切换国际 Dreamina
- 不把第三方逆向 CLI 作为核心 runtime
- 不把官方 CLI 二进制提交进仓库
- CLI 参数不得散落在业务层
- 首先实际探测本机 CLI、版本和 help/capability
- 如果未安装/未登录，进入 WAITING_FOR_USER，不伪造成功

### Clip model
- 一个 Clip = 一次 Seedance 生成任务
- Clip 时长 4–15 秒
- 一个 Clip 内有多个 Segment
- 每个 Segment 必须有：
  - start/end time
  - shot size
  - camera position
  - camera angle
  - camera movement
  - composition
  - action
  - product state
  - dialogue/narration
  - ambient sound
  - lighting
  - continuity in/out

### Product truth
- Product Truth 是下游权威输入
- 未确认 Product Truth 不得进入 Creative
- 禁改项必须进入 Prompt Compiler
- 不允许 AI 擅自添加未确认产品事实

### Paid/cost action
- Preflight 和 submit 必须分开
- 用户确认前不得执行真正生成
- P0 自动重试次数 = 0
- 失败后展示错误并等待用户决定

### Licensing
严格执行 `docs/THIRD-PARTY-POLICY.md`。
禁止静默引入 GPL、AGPL 或无 LICENSE 源码。
任何新增第三方依赖先记录许可证与用途。

## Recommended implementation

建议但不是强制：
- Next.js + TypeScript
- Zod
- Prisma + SQLite
- Vitest

优先保证可恢复的后端状态和真实 CLI 集成，不优先做视觉装修。

## Required deliverables

### 1. App skeleton
可运行的 Web 应用/工作台。

### 2. Core schemas
至少实现：
- Project
- AssetRef
- ProductTruth
- CreativeConcept
- ScriptDraft
- ProductionPlan
- Scene
- Clip
- Segment
- CompiledPrompt
- ProviderCapability
- GenerationTask
- PreflightReport

### 3. Persistent project store
- SQLite 保存结构化状态
- 项目文件目录保存输入、prompt、logs、output
- app restart 后可恢复

### 4. Product flow
页面至少：
- Projects
- Product Input
- Product Truth Review
- Creative Selection
- Script Review
- Director / Clip Planner
- Generate / Task Monitor

### 5. Product Director
基于当前项目规则实现，不直接复制无许可项目。
可合法参考 MIT `s1dashu/director` 和 Apache `62656456/ai-film-skills` 的导演方法。

### 6. Prompt Compiler
输入结构化数据，输出可审计 Prompt。
必须把 Product Truth / forbidden changes / continuity / segments 编译进去。

### 7. DomesticJimengCliProvider
必须提供：
- probe
- accountStatus
- estimate（无法准确估算时显式 unknown）
- submit
- status
- download

保存：
- CLI version
- stdout
- stderr
- task id
- request snapshot
- output path

### 8. Integration test
至少验证：
- Clip 时长非法时阻止
- Segment 时间非法时阻止
- Product Truth 未确认时阻止进入 Creative
- 未通过 Preflight/用户确认时禁止 submit
- CLI 不存在时进入 WAITING_FOR_USER
- CLI command failure 被持久化
- 任务恢复不丢 task id

## Real-world acceptance

在开发机上做真实验证，不只跑 mock。

最终必须提供一份 `docs/P0-ACCEPTANCE.md`，记录：
- 本机 dreamina CLI 是否存在
- 版本
- 可发现命令/能力
- 登录/账号状态
- 实际提交的 Clip
- Prompt
- task id
- 轮询结果
- 下载文件路径
- 失败项与原因

如果因为账号、VIP、登录或外部服务导致无法真实提交：
- 不绕过
- 不伪造
- 把系统停在 WAITING_FOR_USER
- 完成其余可验证项
- 明确记录唯一阻塞点

## Definition of done

P0 完成必须同时满足：

1. 文档约束未被破坏
2. 核心测试通过
3. UI 能走完整 P0 流程
4. 状态可恢复
5. dreamina CLI 真正被探测
6. 若账号环境允许，至少一个真实 Clip 成功生成并下载
7. 若账号环境不允许，系统正确停在 WAITING_FOR_USER
8. git status 清晰
9. 不 merge
10. 不 publish
11. 不进入 P1

完成后输出：
- 实现摘要
- 测试结果
- 实际 CLI 验证结果
- 剩余风险
- 下一阶段建议

---

# P0 Environment Check

检查时间：2026-09-26

## Project

Path:
`C:\Users\Administrator\AgentDock\Product-Video-Studio`

Git:
- repository initialized
- implementation not started
- specification files present

## Domestic Jimeng CLI

Result:
`DREAMINA_NOT_FOUND`

当前 Windows PATH 中未发现 `dreamina`。

P0 实现要求：
- Provider 必须能识别此状态
- UI/API 进入 `WAITING_FOR_USER`
- 不得伪造登录、额度或生成结果
- 安装完成后重新 probe，不需要修改业务层

## Codex / WebCodex

Attempted to start coding workflow.

Result:
`Tunnel-client has not been seen for 300 seconds`

因此当前没有启动 Codex 实现。

这不是 P0 规格阻塞；恢复 WebCodex tunnel-client 后可直接使用：
`docs/CODEX-GOAL.md`

作为开发任务基线。

## Next executable action

1. 恢复 AgentDock-company-2 对应的 WebCodex tunnel-client。
2. 重新启动 Codex project session，工作目录指向本项目。
3. 让 Codex 完整读取 docs/CODEX-GOAL.md 和其中列出的权威文档。
4. 开始 P0 实现。
5. 到真实视频生成阶段，如果 dreamina CLI 仍不存在，停在 WAITING_FOR_USER。