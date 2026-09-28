# Product Video Studio

AI 产品营销视频生产系统。P0 的目标是验证一条真实纵向链路：

`产品资料 → Product Truth → Creative → Script → Product Director → Scene/Clip/Segment → Prompt Compiler → 国内即梦 dreamina CLI → Seedance 2.0 → 视频下载`

## 当前阶段

- 状态：P0 规格冻结前
- 目标平台：抖音
- 成片目标：V1 为 60–120 秒，9:16 发布级视频
- 视频生成：国内即梦官方 `dreamina` CLI，Seedance 2.0
- 产品真实性：Product Truth + Continuity + QC + 人工审核
- 编辑：非破坏式 Timeline，最终 FFmpeg 渲染

## 文档

- [P0 PRD](docs/P0-PRD.md)
- [技术架构](docs/ARCHITECTURE.md)
- [核心数据模型](docs/SCHEMAS.md)
- [页面与流程](docs/UX-FLOW.md)
- [第三方依赖与授权策略](docs/THIRD-PARTY-POLICY.md)
- [Codex /goal](docs/CODEX-GOAL.md)
- [P0 环境检查](docs/P0-ENV-CHECK.md)

## 设计原则

1. 产品事实高于生成效果。
2. Product Truth 是下游所有 Agent 的权威输入。
3. 一个 Seedance 生成任务对应一个 Clip；Clip 时长 4–15 秒。
4. 一个 Clip 内可包含多个 Segment，每个 Segment 必须有时间、景别、机位、运镜、动作、声音和产品约束。
5. 生成视频出现风险时必须展示给用户，由用户决定是否接受或重做。
6. 原素材永不破坏，编辑只修改工程与 Timeline。
7. 第三方依赖必须通过许可证白名单；GPL/AGPL/无许可证代码不得静默进入闭源核心。
