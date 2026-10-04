# Product Video Studio

AI 产品营销视频生产系统。P0 已冻结并保留为可恢复基线；当前工作目录正式进入 P1 开发。

`产品资料 → Product Truth → Creative → Script → Product Director → Scene/Clip/Segment → Prompt Compiler → 国内即梦 dreamina CLI → Seedance 2.0 → 视频下载`

## 当前阶段

- 状态：P1 开发启动（0.3.0-p1.0）
- P0 冻结基线：见 [P0 Freeze](docs/P0-FREEZE.md)
- P1 开发目标：见 [P1 Goal](docs/P1-GOAL.md)
- P1 路线图：见 [Optimization Roadmap](docs/OPTIMIZATION-ROADMAP.md)
- 目标平台：抖音
- 成片目标：P1 改为用户自选 10–120 秒，默认 9:16
- 视频生成：国内即梦官方 `dreamina` CLI，Seedance 系列
- 产品真实性：Product Truth + Continuity + QC + 人工审核
- P1 编辑：非破坏式 Timeline + 最终 RenderEngine

## 文档

- [P0 PRD](docs/P0-PRD.md)
- [技术架构](docs/ARCHITECTURE.md)
- [核心数据模型](docs/SCHEMAS.md)
- [页面与流程](docs/UX-FLOW.md)
- [第三方依赖与授权策略](docs/THIRD-PARTY-POLICY.md)
- [Codex /goal](docs/CODEX-GOAL.md)
- [P0 环境检查](docs/P0-ENV-CHECK.md)
- [P0 冻结清单](docs/P0-FREEZE.md)
- [P1 开发目标](docs/P1-GOAL.md)
- [P1 正式开发方案](docs/P1-PLAN.md)
- [P1 优化路线图](docs/OPTIMIZATION-ROADMAP.md)

## 设计原则

1. 产品事实高于生成效果。
2. Product Truth 是下游所有 Agent 的权威输入。
3. 一个 Seedance 生成任务对应一个 Clip；Clip 时长 4–15 秒。
4. 一个 Clip 内可包含多个 Segment，每个 Segment 必须有时间、景别、机位、运镜、动作、声音和产品约束。
5. 生成视频出现风险时必须展示给用户，由用户决定是否接受或重做。
6. 原素材永不破坏，编辑只修改工程与 Timeline。
7. 第三方依赖必须通过许可证白名单；GPL/AGPL/无许可证代码不得静默进入闭源核心。
