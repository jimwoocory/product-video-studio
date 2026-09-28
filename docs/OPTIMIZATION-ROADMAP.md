# Product Video Studio 后续优化路线图

更新时间：2026-09-28  
定位：P1 正式开发路线图。P0 当前主闭环保持可用，P1 在不破坏现有生成、审片、成片与发布链的基础上，完成产品可用性、Agent、Research、模型管理与剪辑能力。

## P1 高优先级能力

### 1. 参考视频分析（Reference Video）

目标：允许用户提供抖音/其他平台参考视频，学习其创作结构，而不是照搬内容。

第一阶段：
- Product Input 增加“参考视频（可选）”
- 支持上传 MP4/MOV
- 自动提取并结构化：
  - 前 3 秒钩子
  - 总时长与节奏密度
  - 镜头数量与平均镜头长度
  - 景别、机位、运镜
  - 产品首次露出时间
  - 卖点植入方式
  - 旁白/对话结构
  - BGM/环境声风格
  - CTA 收尾方式
- 生成 ReferenceVideoProfile
- ReferenceVideoProfile 作为 Creative、Script、Director 的可选输入
- 明确标记“可借鉴结构”与“禁止直接复制内容”

第二阶段：
- 支持粘贴抖音视频链接
- 用户登录/授权后获取可分析视频
- 下载失败、登录失效或平台风控时允许人工接管
- 单独核实 dreamina/Seedance 是否支持视频作为生成参考；未确认前不得假定支持

### 2. 中文优先与新手模式

目标：第一次使用的人不需要理解开发术语、UUID、hash 或英文状态。

默认“简洁模式”：
- 全部主要状态中文化
- 页面顶部增加“当前要做什么”
- 每页只突出一个主要下一步
- UUID、hash、Artifact、Provider、Preflight、CommandAttempt 等默认收进“高级信息/技术详情”
- ReviewDecision 等内部术语转为“采用 / 重新生成 / 不使用”
- GenerationAttempt 转为“视频生成记录”
- WAITING_FOR_USER 转为“需要你处理”
- FINAL_REVIEW 转为“成片确认”
- READY_TO_PUBLISH 转为“待发布”

增加“高级模式”：
- 开发/排错时展开完整 ID、hash、Provider、Artifact 与命令审计信息

### 3. 用户自定义目标视频时长

目标：整片时长由用户决定，不再固定 60–120 秒。

要求：
- 项目目标时长范围：10–120 秒
- 快捷选项：10 / 15 / 30 / 45 / 60 / 90 / 120 秒
- 支持 10–120 秒自定义整数秒
- 保存为 project.targetDurationMs
- Creative、Script、Director 必须读取目标时长
- Director 根据总时长自动规划 Clip 数量与单 Clip 时长
- ProductionPlan 规划总时长尽量等于目标时长
- Generate 页面显示：目标时长 / 已生成时长 / 已采用时长
- Final 页面显示：目标时长 / 实际成片时长
- 允许“实际采用时长 < 目标时长”继续成片，但必须清楚提示，不强制生成所有 Clip

### 4. 轻量联网研究（P1 Research 基础层）

目标：让用户主动开启联网研究，为 Product Truth 和创作提供有来源的外部信息。

交互：
- 联网研究：关闭 / 基础 / 深度
- 默认关闭，避免无意义联网和不可控信息污染

基础研究：
- 产品官网
- 用户指定网页
- 商品公开页面
- 品牌公开资料

深度研究：
- 竞品
- 行业资料
- 内容趋势
- 参考视频
- 可访问的平台内容

输出：
- ResearchBrief
- Evidence
- URL / 标题 / 获取时间 / 摘要 / 来源类型 / 可信度
- 网络信息不得自动升级为 ProductFact；必须经过来源规则或用户确认

### 5. 大模型 API 设置与分步骤模型切换

目标：把当前依赖外部环境/命令行配置的大模型接入，改造成用户可在网页中管理的模型设置中心；同一个第三方 OpenAI-compatible API 下可发现并选择多个模型，并允许不同生产步骤使用不同模型。

#### 5.1 设置页

新增“设置 → 大模型”页面，至少包含：
- Provider 名称（自定义，例如第三方聚合平台）
- Base URL
- API Key（只允许写入/替换，不回显明文）
- “测试连接”按钮
- “获取模型列表”按钮；优先调用兼容的 `/models` 接口，无法发现时允许手工添加模型 ID
- 默认模型
- 请求超时、最大重试次数等基础参数
- 保存后显示“已连接 / 连接失败 / 未配置”

安全约束：
- API Key 不进入浏览器 LocalStorage、project.json、Artifact、日志或普通 SQLite 业务快照
- 服务端仅保存加密/受保护凭据或使用系统 secret store；UI 只显示掩码
- 所有错误信息必须脱敏，禁止输出 Authorization header 或完整 Key

#### 5.2 分步骤模型配置

为以下步骤增加模型选择：
- Product Truth / 产品事实
- Creative / 创意方案
- Script / 脚本
- Director / 导演分镜
- Reference Video Analysis / 参考视频分析（加入后）
- Research / 联网研究摘要（加入后）

每个步骤支持：
- “使用全局默认模型”
- 手动选择该 Provider 下的任意已启用模型
- 页面上直接切换当前步骤模型
- 显示当前实际使用模型
- 生成记录必须持久化 providerId + modelId + 配置版本，以便复现和审计

#### 5.3 配置优先级

模型解析顺序：
1. 当前项目当前步骤的显式模型覆盖
2. 当前项目默认模型
3. 系统全局默认模型

模型切换只影响后续新生成，不覆盖历史结果；历史 Creative/Script/Director 必须保留当时实际模型信息。

#### 5.4 与视频模型分离

界面必须把“大语言模型”和“视频生成模型”明确分开：
- LLM：Product Truth / Creative / Script / Director / Research 等推理与文本结构化步骤
- Video Model：Seedance / dreamina 等最终视频生成模型

禁止把第三方 LLM 模型列表与 Seedance 视频模型混在同一个下拉框中，避免新用户误解。

### 6. Agent 模式 + Dreamina Skill 直达生成

目标：在保留“标准模式”的同时，增加一个面向快速创作的 Agent 模式。用户不需要理解 Product Truth / Creative / Script / Director 全流程，只需选择能力、提供必要素材和生成要求，即可由 Agent 自动规划并调用即梦官方 CLI 完成视频生成。

#### 6.1 双模式入口

- 标准模式：继续保留 Product Truth → Creative → Script → Director → Generate 的完整生产链
- Agent 模式：选择 Skill → 提交素材与要求 → Agent 自动检查 → 一次确认 → 自动生成 → 自动查询 → 自动下载 → 展示结果
- 两种模式共享 Artifact、GenerationAttempt、Preflight、任务恢复、审片和成片能力，不做两套底层系统

#### 6.2 Skill Registry

第一阶段注册：
- Dreamina / 即梦官方 Skill

Agent 应读取官方 Skill 作为能力说明，并在每次真实执行前动态检查当前 `dreamina -h` / `dreamina <subcommand> -h`，不把模型、参数和能力永久硬编码。

后续 Skill 可扩展：
- 参考视频分析 Skill
- Research Skill
- 商品视频导演 Skill
- 剪辑 Skill（P1）
- 发布 Skill

#### 6.3 用户输入

Agent 模式页面至少包含：
- Skill 选择
- “我要做什么”自然语言输入
- 产品图 / 人物图 / 场景图等图片素材
- 参考视频
- 参考音频
- Logo / 其他附件
- 画幅
- 目标时长
- 视频生成模型
- 额外要求 / 禁止修改项
- 生成方式：智能选择 / 手动指定

#### 6.4 材料完整性检查

Agent 在提交前先解析任务和 Skill 能力，判断当前任务最少需要什么素材。

例如：
- 只有文字 → 可候选 text2video
- 单张主图 → 可候选 image2video
- 首帧 + 尾帧 → 可候选 frames2video
- 多张连续图片 → 可候选 multiframe2video
- 图片 + 参考视频/音频 → 可候选 multimodal2video / 全能参考

缺少关键素材时，不直接报 CLI 参数错误，而是用中文明确告诉用户“还缺什么、为什么需要”。

#### 6.5 智能能力选择

默认让用户选择“智能选择”。Agent 根据素材类型、目标时长、模型和要求自动决定 Dreamina 子命令。

高级用户可手动选择：
- 文生视频
- 图生视频
- 首尾帧视频
- 多图故事视频
- 全能参考视频

UI 显示中文能力名称，CLI 子命令与参数默认隐藏在“高级信息 / 技术详情”。

#### 6.6 付费提交安全门

Agent 可以自动完成检查、规划和参数准备，但真实消耗积分的提交前仍必须有一次明确用户确认，至少显示：
- 生成方式
- 视频模型
- 时长
- 画幅 / 分辨率
- 使用素材数量
- 当前可获取的额度/成本提示

确认后由系统自动完成 submit → poll/query_result → download，不要求用户反复点击“提交/查询/下载”。

#### 6.7 Dreamina 当前确认能力

当前官方 CLI 已确认 `multimodal2video` 支持图片、视频、音频混合参考。Agent 模式应把它包装成“全能参考”，而不是要求用户理解 CLI 参数。

对 Seedance 2.0 系列 / seedance2.0mini，运行时能力以当前 CLI help 为准；现阶段已确认可使用图片和参考视频，并应在执行前再次动态校验输入数量、时长、分辨率、画幅与模型约束。

#### 6.8 Agent 执行链

目标执行结构：

User Request
→ Skill Selection
→ Task Understanding
→ Material Check
→ Capability / CLI Help Check
→ Command Plan
→ Preflight
→ User Confirmation
→ GenerationAttempt
→ Submit
→ Auto Poll
→ Download
→ Playback / Review

Agent 模式不得绕过现有的 ProviderIdentity、Preflight、显式付费确认、GenerationAttempt 和审计链。

## P1 深化能力

### 7. Research Engine

在 P1 轻量联网研究基础层之上扩展：
- ResearchProvider
- EvidenceStore
- 浏览器/Playwright 研究
- 抖音账号授权与平台研究
- 同行账号与视频研究
- 竞品研究
- 研究报告
- Evidence 生命周期与失效机制
- ResearchBrief → Product Truth 可追溯引用

架构原则：
- 稳定层：上传资料、指定网页、官网、用户提供链接
- 浏览器层：搜索与网页访问
- 平台层：抖音等登录态研究
- 平台层失败不得拖垮稳定层
- 登录、验证码、风控必须允许人工接管
- 不承诺大规模平台抓取永久稳定

### 8. Timeline / 剪辑（P1）

明确纳入 P1：
- Timeline Editor
- 裁剪 in/out
- Clip 重排
- 转场
- 字幕
- BGM
- 音量
- 花字/CTA
- 多轨
- 最终 RenderEngine

## 优先级建议

1. 中文优先 + 新手模式
2. 目标时长 10–120 秒
3. 大模型 API 设置页 + 分步骤模型切换
4. Agent 模式 + Dreamina Skill 直达生成
5. 参考视频上传与 ReferenceVideoProfile
6. P1 轻量联网研究
7. 参考视频链接输入
8. P1 Research Engine
9. P1 Timeline / 剪辑

## 统一生成前流程目标

产品资料
→ 可选联网研究
→ 可选参考视频分析
→ Research Evidence / ReferenceVideoProfile
→ Product Truth
→ Creative
→ Script
→ Director
→ Generate / Review
→ Final Video
→ Publish
