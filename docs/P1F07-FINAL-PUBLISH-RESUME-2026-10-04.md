# P1F-07 Final / Publish 收口记录

日期：2026-10-04  
版本：0.3.0-p1-final-rc.1  
主任务：tsk_64b596d359821bcb

## 本轮目标

收口 Final 页面、主流程导航和 Publish Bridge 的产品语义，保证外部抖音资质或授权不可用时不阻断最终 MP4 交付，同时继续严格区分“发布交接”和“平台已发布”。

本轮不执行真实 Dreamina 付费生成，不替用户发起抖音真实发布。

## 实现结果

- Final 页新增“最终交付状态”，分别显示最终 MP4 完整性、成片确认状态和当前发布 Provider 能力。
- 只有 Final Artifact 为 READY、实际 hash 与 FinalAssembly 绑定 hash 一致，并且 Assembly 已 ACCEPTED 时，才允许创建发布包。
- 项目状态显示“已确认”不能替代实际文件完整性；旧项目 Final Artifact 缺失时明确要求恢复或重新渲染，不开放发布包。
- 发布设置和发布中心显示 Provider 模式（平台直发 / 手机或平台交接 / 手动导出）与 READY/DISABLED/NOT_CONFIGURED/AUTH_REQUIRED/UNAVAILABLE 状态。
- 当当前 SDK/H5/OpenAPI 通道不可用而 Manual Export READY 时，页面明确说明不会阻断成片交付，并提供切换到“下载 MP4 / 手动发布”的入口。
- Manual Export 不依赖平台 API；最终 MP4 下载始终作为产品交付兜底。
- HANDOFF_STARTED / AWAITING_USER_ACTION / HANDOFF_COMPLETED 均继续明确不等于 PUBLISHED；只有可信 PUBLISHED_CONFIRMED 回执可把项目标记为已发布。
- Final 页在新 Publish Center 可用时只隐藏旧式 publish.douyin.oauth Provider blocker 的展示，不删除数据库历史；Artifact 完整性等真实 blocker 继续展示。
- 主流程 Final 页的推荐下一步改为按项目状态动态显示，避免“已确认成片”和“实际文件缺失”产生错误引导。
- 产品版本升级为 RC：0.3.0-p1-final-rc.1。由于真实完整 E2E 尚未完成，不标记为正式 P1 Final。

## 验证

- P1F-07 Publish/Final 专项：20/20 PASS。
- 最终全量隔离回归：237/237 PASS，0 fail / 0 skip / 0 todo。
- TypeScript typecheck：PASS。
- build：PASS。
- Prisma validate：PASS。
- License Gate：PASS（packages=35，external_runtimes=5）。
- 全量测试使用隔离 SQLite，productionDatabaseUsed=false。
- 正式 3090 /health：P1-0.3.0-p1-final-rc.1。
- 正式浏览器只读验收：P1 Final RC 顶栏、Final 交付状态、缺失 Artifact 阻断、旧 OAuth blocker 展示收口均符合预期；浏览器 console 0 error / 0 warning。
- P0 冻结包复核：
  - source ZIP SHA256 = 01F7B2678484D058A87F25D5964F011E7E1F5963E35617A6D71443AFA5775C3A
  - runtime ZIP SHA256 = 117282505061104070B2610868D7A5FC9994C590A185D6E2535DB77B8A128485
  - 与冻结记录一致。

## 正式服务

最新 RC 已加载到 http://127.0.0.1:3090。启动前确认运行中生成、研究、渲染和 SmartRun 均为 0。当前服务由 AgentDock 异步会话托管，不是永久 Windows 服务。

## 尚未完成

P1 Final 仍不能关闭，剩余 Gate：

1. 深度研究创作参考素材池使用真实产品来源和实际配置视觉模型完成一次真实 E2E。
2. 使用真实产品资料完成一次完整端到端：研究/素材 → 创意 → 脚本 → Director → Dreamina 多镜头 → 视觉审片 → AutoEdit → 音频/字幕 → Render → Final。
3. 真实 Dreamina 付费执行必须在用户对该次具体操作明确授权后才能开始。

因此本版本保持 RC，不宣告 P1 Final / P1.5 完成。
