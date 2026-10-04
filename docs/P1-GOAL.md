# Product Video Studio P1 Goal

版本：0.3.0-p1-final
启动日期：2026-09-28
P0 冻结基线：docs/P0-FREEZE.md
P1 路线图：docs/OPTIMIZATION-ROADMAP.md
P1 正式方案：docs/P1-PLAN.md
P1 Final 唯一后续执行基线：docs/P1-FINAL-OPTIMIZATION-PLAN.md

## 1. P1 产品目标

把已经跑通真实生成闭环的 P0，升级为第一次接触也能使用的 AI 视频生产系统。

P1 不重做 P0 底层链路。P0 已有 Artifact、Preflight、GenerationAttempt、恢复、审片、成片和发布能力继续复用。

## 2. P1 范围

### P1-01 易用性与时长
- 状态：已完成（2026-09-28）
- 中文优先 / 新手模式
- 技术字段默认折叠
- 页面明确“当前要做什么”
- 生成任务自动刷新状态
- 目标整片时长由用户选择 10–120 秒
- Creative / Script / Director 全链读取 targetDurationMs

### P1-02 模型设置中心
- 状态：已完成（2026-09-28）
- 网页设置第三方 OpenAI-compatible API
- Base URL / API Key / Test Connection / Models
- API Key 安全存储与掩码
- 全局默认模型
- 项目默认模型
- Product Truth / Creative / Script / Director 分步骤模型覆盖
- 历史结果记录实际 provider/model/config version

### P1-03 Agent 模式
- 状态：已完成（2026-09-28）
- 标准模式 + Agent 模式双入口
- Skill Registry
- 第一阶段接入 Dreamina 官方 Skill
- 材料完整性检查
- 智能选择 text2video / image2video / frames2video / multiframe2video / multimodal2video
- 付费前一次确认
- 确认后自动 Submit → Poll → Download → Review

### P1-04 参考视频
- 状态：已完成（2026-09-29）
- 上传 MP4/MOV
- ReferenceVideoProfile
- 钩子、节奏、镜头、运镜、产品露出、旁白、CTA 等结构化分析
- Creative / Script / Director 使用参考分析
- Dreamina multimodal2video 直接接收视频/音频参考
- 后续支持抖音链接

### P1-05 Research
- 状态：已完成（2026-09-29）
- 关闭 / 基础 / 深度联网研究
- ResearchProvider
- Evidence / ResearchBrief
- 官网、指定网页、公开商品页、竞品、内容趋势
- Playwright 浏览器研究
- 网络信息不能未经确认直接升级为 ProductFact

### P1-06 Timeline / 剪辑
- 状态：已完成核心 Gate（2026-09-29）
- Timeline Editor
- Clip 重排
- Trim in/out
- 转场
- 字幕
- BGM / 音量
- 花字 / CTA
- 多轨
- 最终 RenderEngine

### P1-07 成片与抖音发布
- 状态：已完成核心 Gate（2026-09-29）
- 发布层统一为可插拔 PublishProvider
- 默认路径：Douyin SDK 唤起发布，由用户在抖音完成最终编辑/确认
- Web 增加 Mobile Publish Bridge，通过一次性 PublishPackage 将成片安全交给手机端
- OpenAPI 直发仅在应用确实取得相应权限时作为可选 Provider
- 永久保留“下载 MP4 / 手动发布”兜底
- SDK 已唤起不等于已发布；无可验证结果时不得把状态写成 PUBLISHED

## 3. P1 开发顺序

1. P1-01 中文化、新手模式、10–120 秒时长
2. P1-02 大模型 API 设置中心与分步骤模型
3. P1-03 Agent 模式 + Dreamina Skill
4. P1-04 参考视频
5. P1-05 Research
6. P1-06 Timeline / 剪辑
7. P1-07 Douyin SDK Publish Bridge

每一阶段必须：
- 保持 P0 冻结包不变
- 不破坏现有真实 Seedance 生成链
- 增加回归测试
- 更新 License Gate / third-party governance
- 通过真实页面验证后再进入下一阶段
