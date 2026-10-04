# P1F-02 主任务断点接续：模型感知导演与 Prompt 验证记录

记录日期：2026-09-30。唯一总目标仍为 `docs/P1-FINAL-OPTIMIZATION-PLAN.md`；本文仅为执行证据，不替代总目标。

主任务：`tsk_64b596d359821bcb`，智能生成 2.0 全链路重构。

## 1. 本轮结论与边界

本轮完成 `prompt` 子步骤的实现、自动化回归、隔离 HTTP 与浏览器验证，并对本机真实即梦 CLI 能力做只读适配检查。**这不是整个 P1F-02 主任务完成，更不是 P1 Final / P1.5 完成。**

`pipeline`、`auto-edit`、任务级最终 `tests` 仍未完成。真实 AI 创作、真实付费视频生成、自动剪辑成片的完整端到端验收均未执行。当前正式 3090 服务保留原 PID 23064，未重启；源码和编译产物更新不等于现有正式进程已加载新功能。隔离验收服务与浏览器标签已关闭。

## 2. 接手核查

- AgentDock 实测可用；WebCodex `runtime_status` 重新核验返回 `404 tunnel_client_not_seen`，因此使用 AgentDock 完成编辑和测试，而非沿用旧会话的离线假设。
- 已读取唯一总目标及 P1-GOAL、P1-PLAN、P0-FREEZE、OPTIMIZATION-ROADMAP。连接器未提供 `workspace_context`，改为读取本地目录、规则和文档恢复工作区上下文；没有绕过未授权接口。
- AgentDock 会话、系统命令进程和三次源码摘要交叉核查，未发现同目录并行开发写入。服务存活和任务 active 未作为开发正在继续的证据。
- 本地 Git master 尚无提交，源码处于未跟踪状态；未执行 reset、clean、回滚、提交或推送。接手快照为 `C:\Users\Administrator\AgentDock\Product-Video-Studio-Checkpoints\P1F02-resume-20260930-134607`。
- P0 两份冻结包在接手和收尾均核验一致：source SHA256 `01F7B2678484D058A87F25D5964F011E7E1F5963E35617A6D71443AFA5775C3A`；runtime-data SHA256 `117282505061104070B2610868D7A5FC9994C590A185D6E2535DB77B8A128485`。
- 源码对照快照审计共 15 个预期代码/测试/脚本文件改动，未发现额外来源的改动。依赖文件、Prisma schema、迁移文件保持不变。后续新增本文与总目标执行日志为有意文档更新。

## 3. 已落地内容

### 模型选择前置

新增 `director-generation-target.ts`，从同一 DreaminaCapabilityRegistry 解析目标模型、命令、画幅、分辨率、原生声音开关、时长与素材限制。新建导演计划前必须明确选模型，不允许用 AUTO 或未验证能力静默决定。目标快照写入 ProductionPlan 及版本 Hash；旧计划仍可读取，不改写历史。

脚本确认后进入导演页选择视频模型。`/production-plan/generate` 要求 `generationSettings`；导演页新增动态控件、拆镜预览及“重新适配为新分镜草稿”。生成页继承绑定参数，修改需返回导演页重新适配并审核，不复用不兼容的旧请求与授权。

### 自动拆镜与约束

模型限制与已有 4–15 秒 Clip 合约取交集。15/30/60 秒项目按已验证模型上限规划整秒槽位；过长 AI 镜头在代码中拆分，保留产品事实引用、HARD 约束、连续性与完整台词。无法精确拼接的时长、跨镜头长台词、原分段间隙/重叠会明确报错，不假装修复、不截断、不重复台词。

### Prompt 与生成前检查

Prompt 使用模型及命令版本标识、GenerationProfile 与能力指纹；正文画幅、分辨率、时长和声音策略与参数一致，修复原先正文固定 `9:16` 的问题。参考音频输入与原生声音输出分开；没有原生输出时只保留后期音轨提示，**未宣称后期音轨已经生成**。

Preflight 从绑定目标继承参数；参数被改动时在写入前阻断。能力表漂移时旧生成链失效，并禁止创建基于旧目标的新请求。产品事实、使用规则审核、生成审批和未知提交结果保护继续保留。

### 浏览器发现的原有缺陷

完整导演页的结构化编辑器将 `split('\n')` 渲染成 JavaScript 字符串内的实际换行，导致 SyntaxError。已修正模板转义，并新增完整脚本页/导演页的所有内联脚本解析测试，避免仅测试新控件而遗漏页面级错误。

## 4. 验证证据

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 接手原始基线 | 153/153 PASS | `.tmp/p1f02-resume-baseline-tests.log` |
| 本轮最终全量测试及 TypeScript 构建 | 172/172 PASS，0 fail/skip | `.tmp/p1f02-model-aware-regression.log` |
| 类型检查 | PASS | `.tmp/p1f02-model-aware-typecheck.log` |
| License Gate | PASS，35 packages / 4 external runtimes | AgentDock 命令输出 |
| Prisma 只读状态 | 19 migrations，schema up to date | `prisma.cmd migrate status` 输出 |
| 隔离 HTTP | 8 项 PASS | `.tmp/p1f02-model-aware-http-smoke.json` |
| 隔离浏览器 | 8 项 PASS，pageErrors=[] | `.tmp/p1f02-model-aware-browser-smoke.json` |
| 浏览器截图 | 已查看，无控件遮挡/溢出 | `.tmp/p1f02-director-browser.png` |
| 本机真实 CLI 能力只读适配 | PASS，提交次数 0 | `.tmp/p1f02-model-aware-live-capability.json` |
| 快照差异审计 | 15 个预期文件，unexpected=[] | `.tmp/p1f02-model-aware-source-audit.json` |

隔离 HTTP/浏览器使用内存测试项目、假 AI 响应和测试能力表，不访问生产数据库，不调用真实付费视频端口。浏览器测试中的 1080p 选项属于测试能力数据，不能据此宣称本机 Mini 支持 1080p。

真实 CLI 只读检查中，Mini 的文生视频及全能参考均验证到 4–15 秒、720p；当前命令未暴露原生声音输出开关。15/30/60/120 秒可分别规划 1/2/4/8 个 15 秒 Clip。该结果只证明本机当前能力表适配通过，不证明真实视频画质、音轨或最终成片已经验收。

复现：

```powershell
npm.cmd test
npm.cmd run license:gate
.\node_modules\.bin\prisma.cmd migrate status
node scripts/smoke-model-aware.mjs
# 浏览器人工/自动验收时可用 --serve，生成独立随机端口，最多运行20分钟。
# 完成后 POST /lab/stop；该服务不连接生产数据库或真实付费生成。
node scripts/smoke-model-aware.mjs --serve
```

## 5. 下个断点与尚未完成事项

下一主任务子步骤为 `pipeline`：在现有单视频直出之外接入持久化的一键成片编排、用户审核暂停点和恢复机制。不能把本轮的导演拆镜直接视为“一键成片”已经完成。

必须继续保留并统筹原任务：创作参考素材池 `tsk_48d1703c63b3f2e3`、批量镜头提交 `tsk_f61fb52424d218a7`。依总目标顺序完成已确认 CreativeReferenceSet、批量请求及覆盖本次镜头集合的费用授权，再接 AutoEditPlan、Timeline、字幕/音频和最终渲染。不得另建重复任务或跳过这些依赖。

本轮没有覆盖真实付费生成的用户授权，因此不得执行真实即梦视频提交，也不得关闭任务级真实端到端验收条件。正式服务切换到新编译产物之前，仍应核查当前研究/生成/渲染任务和其他写入会话，再进行受控更新。
