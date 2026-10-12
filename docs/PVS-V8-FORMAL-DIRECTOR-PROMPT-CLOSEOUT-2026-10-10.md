# Product Video Studio V8 正式导演与 Prompt 主链：工程收口报告

- 收口日期：2026-10-10（北京时间）
- 项目：`C:\Users\Administrator\AgentDock\Product-Video-Studio`
- AgentDock 主任务：`tsk_85baac1d2a85b3fc`
- 本次接管任务：`tsk_3ea7587fabd6998d`
- 范围：V8 新建人工审核 SmartRun 的详细剧本 → Shot-first 导演决策 → ProductDirector 正式分镜 → V8PromptPackage/声音/后期 Cue → Preflight/GenerationRequest/Timeline/Final 的技术链路和既有工作流 UX 兼容。

## 结论与验收边界

**工程实现、隔离自动化和 3090 安全恢复核验：PASS。** 本轮没有执行真实付费 Seedance/Seedream 生成、真实抖音发布或外部运营写入，故**不能**将技术 PASS 冒充为真实模型出片效果、音画/叙事一致性或产品负责人真人 UX 盲测已验收。

V8 保留明确试点开关 `PVS_V8_UNIFIED_DIRECTOR_AUTHORING` **默认关闭**；2026-10-10 恢复的正式 3090 安全进程显式保持为 `0`。不会将任何历史 V2/V3 Run 自动转换成 V8，也不会替旧任务重新申请费用许可。若进入真人/真实样片试点，必须单独批准实际调用范围、成本风险和工作器作用域。

## 交付内容

1. **详细剧本**：新建 V8（V2 工作流 + MANUAL 审核）可从模糊创意产出完整场次、可拍动作、角色目标、逐句对白与表演/声线信息，绑定同源 ScriptDraft、产品 Fact 和精确哈希。剧本修改形成新版本，原哈希失效，必须人工重新确认。
2. **统一导演**：`v8-director-decision.ts` 按 Shot-first 与模型能力限定生成非等长视频 Clip。每个 Shot 锁定源 Beat/可见动作/说话人/原话/语义分句/观众知情揭晓节点；支持受约束的视觉/站位提示词修改及再次采用。
3. **正式分镜**：ProductDirector 仅在已确认 V8DirectorDecision 约束内生成 `ProductionPlan.scenes[].clips[].segments[]`，对镜头数量、时长、真实对白、声音、动作、揭晓时机、来源哈希和后期 Cue 做确定性一致性核验。不能回退旧 V3 冒充 V8。
4. **Prompt 与配音**：`v8-authoritative-prompt.ts` 由已确认 Segment 编译逐 Clip 完整提示词，绑定角色资产/voice、OS/画外音/对白原句、环境音和音效，要求不生成 BGM。后期文字作为独立 Cue 传给 Timeline。支持修改正式视觉分镜和声线后重编译，不允许任意改写并丢失硬约束的自由文本 Prompt 直接通过。
5. **人工采纳与失效**：同一任务工作台包含“确认详细剧本→采用导演镜头表→确认正式分镜→采用逐镜 Prompt/固定声线”分阶段审核；所有审核带精确 revision/hash。修改导致依赖版本、旧 Preflight、PromptPackage、费用范围和旧 Consent 失效。
6. **生成请求安全**：`prompt-compiler.ts`、`generation-preflight.ts` 与 `v8-paid-request-guard.ts` 保证实际 `GenerationRequest.promptText` 等于确认版本，必须具有本轮 Run、Script、Director、PromptPackage 的精确绑定；原生音频/模型能力缺失和普通审批入口绕过均失败关闭，不自动复用任何旧付费批准。
7. **成片时间线**：`v8-timeline-conformance.ts` 在自动剪辑、手工时间线采用与渲染前检查源 Clip 顺序/时长、有效声音与每条后期文字 Cue 的文字和时间。删除、缩短、重排、静音或漏文案时阻断渲染。真实成片质量仍须人工验收。
8. **旧工作流与 UX**：保留 P0/V2/V3、研究入口、资产、浏览器页面与抖音运营 Gate；V8 试点不更改用户历史项目。

## 本轮真实验证（2026-10-10）

| Gate | 结果 | 证据 |
| --- | --- | --- |
| TypeScript 编译 | PASS，exit 0 | `npm.cmd run build` |
| V8 正式链路定向 | PASS，20/20 | `node --test dist/tests/v8-formal-production.test.js` |
| 全仓隔离单元/集成 | PASS，561/561，0 fail，exit 0 | `.runtime/pvs-v8-20261010-fulltest.log` / `.exit` |
| Chrome 全站 Playwright | PASS，46/46，exit 0 | `.runtime/pvs-v8-20261010-e2e.log` / `.exit` |
| License Gate | PASS，38 packages、7 external runtimes | `npm.cmd run license:gate` |
| Git diff whitespace | PASS，exit 0 | `git diff --check` |
| 3090 安全启动 | PASS，HTTP 200 | `/health`、`/projects`、原项目 `/smart`、原 Run `/v8-shadow` |
| 启动前后数据精确比较 | PASS，全部字段一致 | `.runtime/pvs-v8-resume-audit-20261010-before.json` 与 `-after.json` |
| SQLite 安全备份 | PASS，integrity=ok | `.runtime/pvs-v8-20261010-predeploy.db`（仅本机保留） |

**历史生产数据**：以 2026-10-09 19:22 的最近快照为基准，今日启动前确认 9 个 Project、11 个 SmartRun，GenerationRequest 33、Attempt 23、Preflight 33、Approval 23；目标 Run 为 `PREFLIGHT / READY_FOR_PAID_CONFIRM / revision 30`、未同意费用、视频尝试 0、无活动租约。3090 启动后，全部 Run、Project、计数、目标授权状态与启动前逐项完全一致。比 2026-10-09 17:37 的较早快照增加的一个 DRAFT 项目在昨晚 19:22 快照中已存在，不是今天的测试写入。

## 正式运行方式

3090 已使用原有、核验过的 `.runtime/pvs-safe-launch.mjs` 在本机恢复；全局 SmartRun worker 禁用，仅保留原始明确指定 Run 的 scoped worker，启动 recovery 跳过。安全启动没有执行任何外部付费生成或抖音发布。启动 Session：`session-f5238107c983ea58b24c36b1`。

本轮保留现有大量历史未提交工作树（约 193 项 Git 状态记录），不 reset/clean、不混合提交其他阶段的改动。新增报告与测试日志位于本机仓库，不上传真实用户数据库。

## 尚未执行的独立人工/授权门禁（非工程测试失败）

- **真实 Seedance/Seedream 试片及听看验收**：需用户独立确认积分范围、模型版本和样片数量，逐镜核实口型、原生对白、环境音、画面动作、叙事因果与剪辑爽点；技术通过不代表视频结果达标。
- **V8 试点开关上线**：默认 OFF。正式用户试点应按白名单/单一新任务、可撤回 Feature Flag、受限 worker 作用域另行安排，避免无审批全局恢复。
- **独立待办**：第三方 API 模型能力真实探针/智能路由、抖音准实时指标、Director A/B 正式采纳以及高阶专业页面真人盲测不是本次 V8 非付费主链 Gate 的已验证项目，不得报为已完成。
- **版本管理**：由于原工作树混有多个既有未提交工程阶段，尚未进行全仓 Git commit/push。任何合并/发布操作必须先核对文件归属，不能将其他改动混入 V8 提交。

## 下一次真人试点验收重点

按“同一创意与产品事实→完整剧本朗读→分镜逐镜可理解→Seedance 实际样片→Timeline 合成”的顺序核查。优先检查用户反复反馈的“台词说不清人物心情、动机与要求”“视频画面不表达同一导演意图”问题；不得将纯技术一致性测试替代真实可看性判断。
