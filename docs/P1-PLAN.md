# Product Video Studio P1 正式开发方案

版本：0.3.0-p1-final-rc.1  
方案日期：2026-09-28  
P0 冻结基线：docs/P0-FREEZE.md  
P1 目标：docs/P1-GOAL.md  
优化路线图：docs/OPTIMIZATION-ROADMAP.md
P1 Final 唯一后续执行基线：docs/P1-FINAL-OPTIMIZATION-PLAN.md

> 状态说明（2026-09-30）：P1-01～P1-07 核心阶段均已完成 Gate。本文件保留为 P1 设计与历史验收依据；后续开发顺序、遗留项和优化 Gate 以 P1 Final 文档为准。

## 1. P1 定位

P0 已证明“产品资料 → AI 结构化创作 → 即梦真实生成 → 审片 → 成片”的技术闭环可运行、可恢复、可审计。

P1 的目标不是重写 P0，而是把它升级为普通用户第一次打开也能完成创作的 AI 视频生产系统：

- 默认中文、默认新手友好
- 用户决定视频目标时长
- 用户可管理自己的大模型 API 与模型
- 同时提供“标准模式”和“Agent 模式”
- 支持参考视频与即梦多模态参考
- 支持可控联网研究与 Evidence
- 支持 Timeline 剪辑与最终渲染
- 支持面向个人抖音账号的“唤起发布”链路
- 保留可插拔 Provider，以便以后增加 OpenAPI 直发和其他平台

P1 的所有新功能必须建立在 P0 已验证的 Artifact、Preflight、GenerationAttempt、恢复、审片与安全门之上。

---

## 2. P1 核心用户流程

### 2.1 标准模式

```text
新建项目
→ 产品资料
→ 可选：联网研究
→ 可选：参考视频分析
→ 产品事实确认
→ 创意方案
→ 脚本
→ 导演分镜
→ 视频生成
→ 审片/选片
→ Timeline 剪辑
→ 成片
→ 发布
```

### 2.2 Agent 模式

```text
选择 Skill / 智能选择
→ 说明“我要做什么”
→ 上传图片 / 视频 / 音频 / Logo
→ Agent 检查缺失材料
→ Agent 检查 Dreamina 当前能力
→ 自动选择生成方式与参数
→ 用户一次确认
→ Submit
→ Auto Poll
→ Download
→ 播放 / 审片
→ 可选进入 Timeline
→ 成片
→ 发布
```

标准模式和 Agent 模式只共享一套底层任务、Artifact、审计、恢复和发布系统。

---

## 3. P1 信息架构

顶部主导航建议：

1. 项目
2. Agent
3. 资产
4. 设置

项目内部步骤：

1. 产品资料
2. 产品事实
3. 创意方案
4. 脚本
5. 导演分镜
6. 视频生成
7. 剪辑
8. 成片与发布

默认页面不展示 UUID、hash、Artifact ID、ProviderIdentityHash、CommandAttempt 等技术字段。

技术信息统一进入：

`高级信息 / 技术详情`

---

## 4. P1-01：中文化、新手模式、自由时长与自动任务状态

### 4.1 中文优先

内部对象名保留英文，用户界面使用中文：

- Product Truth → 产品事实
- Creative → 创意方案
- Director → 导演分镜
- GenerationAttempt → 视频生成记录
- ACCEPT → 采用
- REDO → 重新生成
- SKIP → 不使用
- WAITING_FOR_USER → 需要你处理
- FINAL_REVIEW → 成片确认

页面顶部固定出现：

`当前要做什么`

每页只突出一个主要下一步。

### 4.2 简洁模式 / 高级模式

默认：简洁模式。  
高级模式：显示完整版本、hash、Provider、Artifact 与命令审计。

### 4.3 目标视频时长

项目级目标时长改为：

`10–120 秒`

快捷值：

`10 / 15 / 30 / 45 / 60 / 90 / 120 秒`

也允许自定义整数秒。

必须贯穿：

`Project → Creative → Script → Director → ProductionPlan`

规则：
- Creative 的 expectedDurationMs 与项目时长一致或接近
- Script 各 Beat 总时长接近项目目标
- Director 根据总时长自动拆 Clip
- Generate 显示目标时长 / 已生成 / 已采用
- Timeline/Final 显示目标时长 / 实际时长
- 用户允许采用不足目标时长的素材并继续，只显示明确提示

### 4.4 自动任务状态

SUBMITTED / PROCESSING 自动轮询。

终态：
- 成功：自动下载并展示播放器
- 失败：停止轮询并显示原因
- 未知提交结果：进入 reconcile，不自动重复付费提交

普通用户不再反复点击 Poll / Download。

### P1-01 验收

- 新用户不展开高级信息即可完成项目
- 可创建 10 秒与 120 秒项目
- Creative/Script/Director 均读取真实 targetDurationMs
- 生成任务可自动刷新到成功/失败终态
- P0 87 项回归测试保持通过，新增测试通过

---

## 5. P1-02：大模型 API 设置中心

### 5.1 设置页

新增：

`设置 → 大模型服务`

支持 OpenAI-compatible Provider：

- Provider 名称
- Base URL
- API Key
- 测试连接
- 获取模型列表
- 手工添加模型 ID
- 默认模型
- 超时
- 有限技术重试参数

### 5.2 API Key 安全

API Key：
- 不进入 LocalStorage
- 不进入 project.json
- 不进入 Artifact
- 不进入普通业务日志
- UI 永不回显明文
- 只能替换/删除
- 服务端使用独立 Secret Store

### 5.3 分步骤模型

分别可选模型：

- 产品事实
- 创意方案
- 脚本
- 导演分镜
- 参考视频分析
- Research

优先级：

```text
项目 + 当前步骤覆盖
→ 项目默认模型
→ 系统默认模型
```

历史产物记录：
- providerId
- modelId
- modelConfigVersion

模型切换只影响后续生成，不改历史。

### 5.4 LLM 与视频模型严格分离

LLM：文本、推理、结构化分析。  
Video Model：Dreamina / Seedance 视频生成。

两个模型池不得混在一个下拉框。

### P1-02 验收

- 网页可修改第三方 Base URL / Key
- 可自动获取或手工录入多个模型
- 四个核心步骤可选择不同模型
- 日志与快照中无 API Key 明文
- 历史结果可追溯实际模型

---

## 6. P1-03：Agent 模式 + Dreamina Skill

### 6.1 Agent 模式目标

用户可以只描述：

“用这 3 张产品图和这个参考视频，做一个 9:16、10 秒的手机支架广告，外观不要改变。”

系统自动完成任务规划。

### 6.2 Skill Registry

首个 Skill：

`Dreamina 官方 Skill`

Agent 执行真实任务前必须动态检查：

```text
dreamina -h
dreamina <subcommand> -h
```

Skill 是 Agent 的能力说明，不代替真实 CLI capability check。

### 6.3 智能生成方式

Agent 根据素材选择：

- 只有文字 → 文生视频
- 单张主图 → 图生视频
- 首尾帧 → 首尾帧视频
- 多张连续图 → 多图故事
- 图片 + 视频/音频 → 全能参考

当前本机官方 CLI 已确认 `multimodal2video` 支持图片、视频、音频混合输入；实际限制每次仍以当前 CLI help 为准。

### 6.4 材料检查

在调用 CLI 前先告诉用户：

- 还缺什么
- 为什么缺
- 哪些素材是可选的

禁止把 CLI 参数错误直接暴露给普通用户作为主要交互。

### 6.5 付费安全门

Agent 可以自动规划，但真实消耗积分前必须显示：

- 生成方式
- 模型
- 时长
- 画幅 / 分辨率
- 素材数量
- 可获取的额度/成本信息

用户一次明确确认后：

`Submit → Auto Poll → Download → Review`

### P1-03 验收

- Agent 模式可完成至少 text2video / image2video / multimodal2video 的能力规划
- 缺材料时能中文提示而不是直接提交失败
- 真实付费动作前存在一次确认
- Agent 不绕过 ProviderIdentity / Preflight / GenerationAttempt
- 成功后自动显示视频

---

## 7. P1-04：参考视频

参考视频有两条独立用途。

### 7.1 AI 分析参考

上传 MP4/MOV，生成：

`ReferenceVideoProfile`

至少提取：
- 前 3 秒钩子
- 节奏
- 镜头数量
- 平均镜头时长
- 景别
- 机位
- 运镜
- 产品首次出现
- 卖点植入
- 旁白/对话结构
- BGM/环境声结构
- CTA

作为 Creative / Script / Director 的可选输入。

原则：

只学习结构与方法，不直接复制原视频文本、镜头内容或受版权保护表达。

### 7.2 Dreamina 直接参考

在全能参考模式下，允许把视频和音频素材直接传给 Dreamina CLI。

ReferenceVideoProfile 与 Dreamina direct reference 是两条不同数据链，可单独或同时启用。

### 7.3 链接输入

第二阶段支持用户粘贴抖音或其他合法可访问链接。

如果需要登录、验证码或平台授权：
- 暂停
- 提示用户接管
- 完成后继续

### P1-04 验收

- 至少 1 个上传视频能生成结构化 Profile
- Profile 可被 Creative / Script / Director 引用
- multimodal2video 可接收参考视频 Artifact
- 视频输入限制以 CLI 实时 help 校验

---

## 8. P1-05：Research 与 Evidence

### 8.1 用户控制

研究模式：

- 关闭
- 基础
- 深度

默认关闭。

### 8.2 基础研究

- 官方网站
- 用户指定网页
- 品牌公开资料
- 公开商品页

### 8.3 深度研究

- 竞品
- 行业信息
- 内容趋势
- 参考视频
- 登录后可访问的平台内容

### 8.4 EvidenceStore

每条 Evidence 至少保存：

- sourceUrl
- title
- fetchedAt
- sourceType
- excerpt/summary
- contentHash
- confidence
- relatedClaims

Research 输出：

`ResearchBrief + Evidence[]`

网络信息不得直接成为 ProductFact。

流程：

`Evidence → AI proposal → Product Truth Review → 用户确认 → ProductFact`

### 8.5 浏览器研究

使用 Playwright/浏览器层时：
- 登录状态独立管理
- 验证码必须人工接管
- 平台风控不伪装为“处理中”
- 抖音研究层失败不得影响官网/公开网页研究

### P1-05 验收

- 基础研究可生成带来源 ResearchBrief
- Product Truth 能追溯到 Evidence
- 无来源推断不能静默升级为事实
- 浏览器阻塞有明确恢复入口

---

## 9. P1-06：Timeline / 剪辑

状态：**已完成核心 Gate（2026-09-29）**。

剪辑明确属于 P1。

### 9.1 MVP Timeline

第一阶段：
- 已采用 Clip 自动进入时间线
- 拖拽排序
- Trim in/out
- 删除 / 恢复
- 硬切
- 原声音量
- 总时长
- 实时预览

第二阶段：
- 转场
- 字幕
- BGM
- 音量关键帧
- 花字 / CTA
- 多轨

### 9.2 数据原则

不修改原 GENERATED_VIDEO。

Timeline 保存编辑决策：
- sourceArtifactId
- inMs
- outMs
- track
- order
- transition
- audio settings
- captions

### 9.3 RenderEngine

Timeline 确认后创建 RenderJob。

输出：
- FINAL_VIDEO
- 输入 Timeline hash
- 输入 Artifact hashes
- Render config
- 输出 hash

### P1-06 验收

- 两个以上 Clip 可重排并裁剪
- 原素材保持不变
- 项目重启可恢复 Timeline
- 最终 Render 输出与 Timeline 一致

---

## 10. P1-07：成片与抖音发布

状态：**已完成核心 Gate（2026-09-29）**。

### 10.1 发布能力重新定义

P1 不把“服务器 OpenAPI 全自动发布”作为默认抖音方案。

抖音开放平台当前公开能力表明，“投稿到抖音”面向第三方应用创作内容同步到抖音，作品支持用户进入抖音后继续二次编辑；抖音 SDK 的视频能力面向移动应用，可录制/投稿并发布到抖音。

因此 P1 默认策略：

`Douyin SDK 唤起发布`

而不是默认后台静默直发。

### 10.2 PublishProvider

P1 定义统一接口：

```text
PublishProvider
├─ DouyinSdkHandoffProvider      # P1 默认
├─ DouyinOpenApiDirectProvider  # 仅在账号/应用获得相应权限时启用
└─ ManualExportProvider         # 永久兜底
```

Provider 可替换，业务层不得写死抖音实现。

### 10.3 Web 与移动端桥接

Product Video Studio 当前为 Web，移动 SDK 需要移动端容器，因此 P1 增加：

`Mobile Publish Bridge`

建议最小实现：

```text
Web Final Video
→ 创建一次性 PublishPackage
→ 页面显示二维码 / 手机打开链接
→ 轻量移动端 Companion App 获取成片
→ 调用 Douyin SDK
→ 拉起抖音发布/编辑界面
→ 用户编辑标题、封面、话题
→ 用户在抖音完成最终发布
```

Web 负责生产和资产管理；移动端只负责安全交接和 SDK 调起。

### 10.4 PublishPackage

建议保存：
- id
- projectId
- finalArtifactId
- finalArtifactHash
- providerType
- titleDraft
- descriptionDraft
- coverArtifactId?
- expiresAt
- singleUseTokenHash
- status

一次性 token：
- 只存 hash
- 短时有效
- 成功领取后失效
- 不进入普通日志

### 10.5 SDK 发布状态

SDK 唤起不等于已发布。

P1 禁止在“已交给抖音”时直接显示 PUBLISHED。

建议状态：

```text
READY_TO_PUBLISH
PACKAGE_READY
HANDOFF_STARTED
AWAITING_USER_ACTION
PUBLISHED_CONFIRMED   # 只有获得可验证确认时
HANDOFF_COMPLETED     # 已完成交接，但无法确认最终发布
FAILED
```

如果平台/SDK不能返回最终发布确认，则 UI 显示：

`已交给抖音，请在抖音完成发布`

而不是：

`已发布`

### 10.6 OpenAPI 直发

现有 P0 的 OfficialDouyinOpenApiProvider 保留为可插拔实现，但 P1：

- 默认关闭
- 只有管理员确认应用权限可用后才显示
- 用户仍需明确发布确认
- 不允许把企业开发者认证等同于用户账号类型

### 10.7 手动发布兜底

任何时候都保留：

- 下载 MP4
- 手机扫码下载/获取
- 手动上传抖音

SDK 或 OpenAPI 不可用不能阻止用户拿到成片。

### P1-07 验收

- 发布设置页可选择 Provider
- 默认 Provider 为 SDK 唤起发布
- Web 可生成一次性 PublishPackage
- 手机端可获取指定最终成片
- 能拉起抖音 SDK 发布流程
- 无最终确认时 UI 不错误显示“已发布”
- OpenAPI 与手动导出均可独立替换

---

## 11. P1 核心数据模型新增

建议新增/扩展：

### AiProviderConfig
- id
- name
- baseUrl
- secretRef
- enabled
- configVersion

### AiModel
- providerId
- modelId
- displayName
- enabled
- discoveredAt

### StepModelOverride
- projectId
- step
- providerId
- modelId

### AiExecutionRecord
- projectId
- step
- providerId
- modelId
- configVersion
- inputHash
- outputEntityRef

### ReferenceVideoProfile
- artifactId
- sourceHash
- structured analysis
- analyzer provider/model
- contentHash

### ResearchBrief / Evidence
- source refs
- source hash
- claims
- confidence
- fetchedAt

### Timeline / TimelineItem / RenderJob
- non-destructive edit decisions
- input/output hashes

### PublishProviderConfig
- providerType
- enabled
- secret refs / app refs

### PublishPackage / PublishAttempt
- final Artifact binding
- handoff state
- platform result evidence

---

## 12. P1 非功能要求

### 12.1 恢复

任何外部副作用都必须可恢复：
- LLM 请求
- Dreamina submit
- 下载
- Render
- Publish handoff

### 12.2 安全

Secret 永不进入：
- Project Artifact
- project.json
- 前端 LocalStorage
- 普通日志
- Git

### 12.3 审计

任何 AI 生成结果必须知道：
- 使用哪个模型
- 使用哪个配置版本
- 输入 hash
- 输出 hash

任何视频生成必须知道：
- Dreamina runtime identity
- model
- request hash
- approval
- external task id

### 12.4 License Gate

P1 新引入：
- 浏览器自动化
- Timeline
- 渲染
- 移动端 SDK

均必须先完成许可证与服务条款审查。

---

## 13. P1 开发阶段与 Gate

### Milestone 1 — P1-01
中文化 + 新手模式 + 10–120 秒 + 自动任务状态。

Gate：普通新用户能完成生成，不需要理解 UUID/hash。

实施状态：**PASS（2026-09-28）**
- 10–120 秒项目级校验已生效，快捷值与自定义整数秒已接入
- Creative / Script / Director 已读取项目 targetDurationMs
- 默认简洁模式隐藏技术 ID/hash，并可切换“高级信息”
- SUBMITTED / PROCESSING 自动轮询，成功后自动下载；手动按钮保留为兜底
- Generate 显示目标 / 计划 / 已生成 / 已采用时长，Final 显示目标与实际成片时长
- 自动化测试 91/91 PASS，License Gate PASS，build PASS

### Milestone 2 — P1-02
模型设置中心。

Gate：第三方 API 可网页配置，核心步骤可独立选模型，Secret 不泄露。

实施状态：**PASS（2026-09-28）**
- 新增“设置 → 大模型设置”页面，支持 OpenAI-compatible Provider 的 Base URL / API Key / 默认模型 / 超时 / 重试
- 支持“测试连接”“获取模型列表”，兼容 `/models`；无法发现时可手工登记模型 ID
- API Key 使用 Windows CurrentUser DPAPI 独立存入 `.runtime-secrets/ai-providers/`，前端不回显明文，SQLite/Artifact/project.json/普通日志不保存 Key
- 新增系统默认、项目默认与 Product Truth / Creative / Script / Director / Reference Video Analysis / Research 分步骤覆盖
- 运行时解析顺序：步骤覆盖 → 项目默认 → 系统默认 → Hermes 兼容回退
- Product Truth / Creative / Script / Director 历史结果持久化实际 providerId / modelId / configVersion / executionId
- 新增 AiExecutionRecord 审计记录，保存 input/output hash，不保存 Prompt 密钥或 Authorization
- 当前已登记 AIHubMix / `deepseek-v4.1-flash` 元数据，但未自动迁移或读取任何旧 API Key；用户需在设置页录入/替换 Key
- 自动化测试 96/96 PASS，License Gate PASS，build PASS；真实设置页与项目模型页、内嵌脚本均验证通过

### Milestone 3 — P1-03
Agent + Dreamina Skill。

Gate：一段自然语言 + 必要素材，可经过一次确认完成真实生成。

实施状态：**PASS（2026-09-28）**
- 新增全局 Agent 入口与项目 Agent 工作台；标准模式继续保留，两种模式共享 Artifact / Preflight / Approval / GenerationAttempt / 下载与成片底层链
- 首个 Skill Registry 条目为 `dreamina-cli`；执行前读取官方 SKILL.md，并动态执行 `dreamina -h` 与对应子命令 `-h`
- 智能选择已覆盖 text2video / image2video / frames2video / multiframe2video / multimodal2video，也允许高级用户手工指定
- 图片 / Logo / 视频 / 音频均可作为 Agent 材料；视频与音频上传后用 ffprobe 读取时长，在付费前按当前 CLI help 校验输入数量、参考媒体时长、输出时长和多图转场约束
- 当前真实 CLI 再验证：Seedance 2.0 Mini 的 text/image/frames 输出 4–15 秒；multiframe 支持 2–20 图、单转场 1–8 秒；multimodal 支持图片≤9、视频≤3、音频≤3、总输入≤12、输出 4–15 秒
- 付费动作只有 Agent 卡片中的一次“确认并开始生成”；确认前展示生成方式、模型/固定模型、时长、9:16、720p、素材数、可获取的余额/成本信息
- 确认后自动 Submit → Poll → Download → Review；提交结果未知时进入 RECONCILE_REQUIRED，不自动重复扣费提交
- Provider 身份/能力和所选 Dreamina 子命令 help 在提交前再次核验；help hash 变化会使旧审批链失效并阻止提交
- 审片采用后生成不可变 FINAL_VIDEO / FinalAssembly 并进入 FINAL_REVIEW；Agent 直出与标准模式成片共用最终确认/发布链
- 自动化测试 101/101 PASS，License Gate PASS，build PASS；真实 Agent/Final 页面和内嵌脚本验证通过；验证过程中未触发任何付费 Dreamina 生成

### Milestone 4 — P1-04
参考视频。

Gate：上传参考视频既可分析，也可作为 Dreamina 全能参考输入。

实施状态：**PASS（2026-09-29）**
- 新增项目“参考视频”页面，支持 MP4/MOV 上传并以不可变 USER_INPUT Artifact 保存
- FFprobe 读取时长、分辨率、帧率、音轨，FFmpeg 抽取最多 10 张采样帧并进行 scene-cut 辅助分析
- 新增 ReferenceVideoProfile 与 Prisma 持久化，保存源视频 artifact/hash、媒体元数据、钩子、节奏、镜头语言、产品露出、卖点结构、旁白/BGM、CTA 与复用原则
- OpenAI-compatible runtime 支持将采样帧作为 multimodal image_url 输入；Reference Video Analysis 可独立选择模型并记录 providerId/modelId/configVersion
- 明确 copyGuard=STRUCTURE_AND_METHOD_ONLY：只学习结构/方法，不复制源视频台词、字幕、具体镜头内容、人物身份或品牌表达
- Creative / Script / Director 在后续新生成时读取当前 ACTIVE ReferenceVideoProfile，并持久化 referenceVideoProfileRef
- 分析参考与 Dreamina 生成直参为两条独立链；当前参考视频 Artifact 可一键带入 Agent multimodal2video
- 隔离数据库 + 本地 Mock OpenAI-compatible Provider 完成真实 Web E2E：4s MP4（带音轨）上传 → 10 帧采样 → Profile ACTIVE → 模型/视频 hash 记录 → 页面展示 → Agent 直参预填 → project.json snapshot
- 自动化测试 107/107 PASS，License Gate PASS，build PASS；P0 source/runtime 冻结 ZIP SHA256 完全未变化

### Milestone 5 — P1-05
Research。

Gate：能产生带 Evidence 的 ResearchBrief，并安全进入 Product Truth 审核。

实施状态：**PASS（2026-09-29）**
- 新增项目 Research 页面，提供关闭 / 基础 / 深度三档；默认关闭
- 基础研究只抓取用户明确给出的公开网页，支持 OFFICIAL / USER_URL / PUBLIC_PRODUCT / COMPETITOR / INDUSTRY / TREND / PLATFORM 来源分类
- HttpWebResearchProvider 实现 URL/协议校验、私网/localhost/元数据地址阻断、重定向复检、正文大小限制与正文 hash；私网仅可通过 PVS_RESEARCH_ALLOW_PRIVATE=1 在本地/E2E 显式开启
- 新增 ResearchRun / ResearchEvidence / ResearchBrief Prisma 持久化；Evidence 保存 URL、标题、抓取时间、sourceType、excerpt/summary、contentHash、confidence、relatedClaims
- ResearchBrief 只能引用当前 Run 中真实 Evidence ID；AI 引用不存在的 Evidence 会 fail closed，不保存 Brief
- ResearchBrief 保存实际 AI providerId / modelId / configVersion / input-output 审计；Research 模型可通过 P1-02 的 RESEARCH 步骤独立覆盖
- Evidence → Research candidate → Product Truth uncertainClaim：研究候选只进入“未验证”区，用户必须在 Product Truth Review 再次明确 PROMOTE 才升级为 ProductFact；升级后 sourceType=external 且保留 research-evidence 引用
- 深度研究通过可插拔 Browser/Playwright Provider 接口工作；LOGIN_REQUIRED / CAPTCHA_REQUIRED / RISK_CONTROL / SESSION_EXPIRED 等状态明确进入 BLOCKED + Human Takeover，不伪装成“处理中”
- 浏览器 Provider 未配置时稳定层仍可完成官网/指定网页 Evidence；平台层失败不拖垮基础研究
- 隔离 SQLite + 本地 Mock OpenAI-compatible Provider + 本地 Web/Browser Provider 完成真实 E2E：Product Truth → BASIC Evidence/Brief → 候选送入事实审核 → DEEP LOGIN_REQUIRED → 人工接管恢复 → COMPETITOR Evidence → project.json snapshot
- 自动化测试 113/113 PASS，License Gate PASS，build PASS；P0 source/runtime 冻结 ZIP SHA256 完全未变化

### Milestone 6 — P1-06
Timeline / RenderEngine。

Gate：可进行非破坏式基础剪辑并输出最终 MP4。

### Milestone 7 — P1-07
Douyin Publish Bridge。

Gate：默认 SDK 唤起发布可用；无确认不宣称已发布；OpenAPI/手动发布可替换。

---

## 14. P1 完成标准

P1 不以“代码写完”为完成。

P1 完成至少要求：

1. 新用户可在简洁中文界面完成项目。
2. 10–120 秒目标时长全链生效。
3. 用户可自行配置第三方 LLM API 与步骤模型。
4. Agent 模式可真实调用 Dreamina Skill/CLI 完成生成。
5. 参考视频可分析并可进入全能参考。
6. Research 有来源、有 Evidence、有事实确认门。
7. Timeline 可完成非破坏式剪辑并渲染成片。
8. 抖音默认走 SDK 用户确认发布链，状态不造假。
9. P0 冻结包保持不变且可独立恢复。
10. 全量回归、License Gate、真实 E2E 均通过。

---

## 15. P1 明确不做

建议留到 P2：

- 多租户 SaaS
- 支付 / 套餐 / 计费
- 团队组织与复杂 RBAC
- 大规模批量生产调度
- 大规模多账号矩阵运营
- 全平台自动发布
- 高级专业 NLE 级剪辑
- 企业级媒体资产 DAM
