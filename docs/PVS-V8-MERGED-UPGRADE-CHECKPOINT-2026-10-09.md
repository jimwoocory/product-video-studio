# PVS V8 统一导演 × 既有UX修复 · 合并执行检查点

日期：2026-10-09（16时段），本机 AgentDock-company-2 任务 `tsk_85baac1d2a85b3fc`

**状态：开发进行中，不是整项完成，不得替代用户真实成片验收。**

## 0. 基线与禁止事项

- 开始时工作树已有 161 个左右的历史未提交变更；没有重置、清空、覆盖或大范围 commit，所有变更需逐文件归属核查。
- 3090 正式 PVS 没有在本轮重启或更新服务；任务 `576430e9-bcb2-459e-ae0e-06c09a072b76` 在最初只读查询时为 `PREFLIGHT / READY_FOR_PAID_CONFIRM`，revision 30，视频生成尝试 0、consent 无。**不得自动点击费用确认或把本轮代码测试冒充成已部署。**
- 修改前已备份 8 个关键源码文件至 `.runtime/pvs-v8-merged-baseline-20261009-152729`；此前恢复任务有数据库备份，禁止在当前迭代更改生产 DB。
- 单元、E2E 只在隔离数据库 / 3190 浏览器服务或纯内存下运行；禁运行真实图片/视频付费、文本模型真调用、抖音写入/发布/登录脚本。
- P0/旧 V2/V3 脚本、导演/Prompt/Preflight/审核与支付 Gate 保留兼容。

## 1. 本轮新增及验证过的内容

### PVS 下一步 / 研究 / 事实审核 UX

- `src/web/smart-generation-ui.ts`：当前工作流「下一步」链接改深蓝色文字、透明背景，保留 hover/focus 与可点击，Chrome E2E 确认 CSS 计算色和背景。
- `src/web/douyin-research-preflight-ui.ts` 以及 Research 独立页、同任务研究面板：深度+抖音时 GET `/api/douyin/ops/status`，必须 Bridge 与账号均 READY；用户显式点击才启动现有 `/api/douyin/ops/launch`；SITE_OFFLINE/RISK_CONTROL/超时区别提示，可取消抖音分支继续普通研究，不能自动绕过平台限制。
- `src/web/server.ts`：新项目 `product-input/generate-truth` 新增 opt-in `deferTruth=true`，仅保存产品输入，不运行模型/自动确认产品事实；已有 ProductTruth 的项目不允许绕过原审核。研究可使用用户原始产品名称/品牌/类别作为搜索关键词（**未确认，只用于发现，不是商品事实**）。
- `src/web/workbench-ui.ts`：产品输入允许先存资料→可选研究→生成待确认事实；事实独立页增加主图和简化状态/隐藏技术字段，研究含候选时引导显式选择后发送到事实审核，不能自动提升竞品卖点。
- `src/web/workflow-inline-panels.ts`：同项目的待确认事实界面显示当前产品主参考图和研究状态，确认操作仍受旧后端门禁保护。
- `src/application/services/workflow-next-action.ts`：只有保存了原始资料且尚无任何事实草稿时，统一「下一步」导向研究（可跳过）；已有旧草稿照旧导向事实审核。

### V8 影子剧本/分镜/提示词与强检查

- `src/application/services/v8-screenplay-shadow.ts`：旧 ScriptDraft→逐场次、逐句角色台词的**只读源文本转写**，明确列出未确定人物目标/观众揭晓时机，绝不假装是已改好的详细剧本。
- `src/application/services/v8-detailed-screenplay-service.ts`：独立、未接正式工作流的 V8 详细剧本 AI 生成器，支持模糊 Brief→人物目标/阻碍/场次/可见动作/台词及语气、配音执行、观众知情节点；只引用已确认 Fact IDs，要求准确时长并能生成兼容 ScriptDraft；**仅假模型离线测试，未调用用户 API。**
- `src/application/services/v8-shot-first-shadow.ts`：从源 Beat 原句估算台词与表演时间，先分 Shot 再按模型真实 4～15 秒上下限分 Clip；无法保证合理时不截句、不给假 PASS，正式用户 60s 案例得到 9+10+10+13+9+9 秒影子备选。
- `src/application/services/v8-shot-prompt-shadow.ts`：从正式 ProductionPlan 的 Segment 生成自包含的 V8 逐镜可读提示词，对照源剧本检查说话人、台词、Beat 覆盖、3 条后期文字丢失、角色资产映射等。当前 60s 项目旧正式分镜的结果 `BLOCKED`：原 Beat 6/6、对白 11/11、后期文字 1/4。
- `src/application/services/v8-director-decision.ts`：从真实 V8 详细剧本与兼容 ScriptDraft 建立镜头/发声与揭晓时机约束，保留模型能力和不等长 Clip 决策。
- `src/application/services/v8-director-conformance.ts`：限制 ProductDirector 不能修改 V8 镜头时长、角色发声、原句、源动作 hash、观众知情时间；只有新链路显式传 `v8DirectorDecision` 时 `ProductDirectorService` 才启用此 Gate，V3 不会受影响。
- `src/application/services/v8-authoritative-prompt.ts`：从冻结 V8 决策 + 带 `v8` 来源元数据的正式 Segment 编译多镜头提示词，音频说话者/音色/OS/画外声逐句保留，后期 copy 放独立 manifest 而不交给生成模型写像素。
- `src/domain/schemas.ts`：在 Segment 添加可选 `v8` 结构化来源字段；老数据无需迁移、不补假值。
- `src/adapters/ai/hermes-product-director-generator.ts`、`src/application/ports/product-director-generator.ts` 与 `src/application/services/product-director.ts`：新增互斥、可选的 V8 导演权威输入，对 V8 镜头细化提出强约束和失败关闭 Gate；原 V3 输入逻辑保留。
- `src/web/smart-generation-http.ts`：`GET /api/projects/:id/smart-runs/:runId/v8-shadow`，只读、按项目/任务隔离；修复了动作路由原先不允许数字导致 `v8-shadow` 404 的问题。
- `src/web/director-v3-ui.ts`、`src/web/smart-generation-ui.ts`：原任务中展开「V8 只读对照」，展示旧新时长、详细剧本源转写、缺少的声音/后期文字、显式角色绑定与逐镜文本。**没有采纳按钮、没有自动新付费。**

## 2. 已证实的检查

- 本轮 `npm.cmd run build` 多次通过。
- 新 V8 单测：详细剧本生成、剧本源转写、导演约束、ProductDirector 防冲突 Gate、独立完整提示词编译、可变时长分镜和只读 HTTP 路由，通过 Fake runtime/纯内存运行。
- Chrome 3190 E2E：原 UX-R5 与新 V8 合并回归首批 8/8 通过；随后额外新增「新项目仅保存产品输入→研究可选→事实审核前置」真实浏览器测试，V8 合并用例 5/5 通过；UI 计算样式及 Bridge/账号双 Gate 均受测。
- 大型 `npm.cmd test` 已启动于隔离运行环境，**需在关闭本轮任务之前读取真实退出状态**；不得先写 PASS。
- 未进行实际 Seedance/Seedream 新付费生成和抖音真实外发；所以音频/口型/多镜头成片质量仍不能报告 PASS。

## 3. 仍未完成（不得误报全部升级完成）

1. **正式 SmartRun 新版采用**：新详细剧本与 V8 决策、ProductionPlan/Prompt/Preflight 的版本化 adopt 流程尚未贯通，当前 V8 只能预览或在纯服务层被显式调用；需要 Feature Flag、用户变更确认和旧付费授权自动失效控制。
2. **最终真实模型效果**：Seedance 2.0 Mini 的多镜头、中文对白音轨、音色和 Timeline 成片节奏，没有新增付费样片验证；不可声称视觉质量提高已经实证。
3. **研究候选融合的真实路径**：新项目选择研究候选→Fact DRAFT→人工确认的隔离证据与 UI 还需专门 E2E；脚本 Token/Bridge SITE_OFFLINE 的原始本机配置问题未改密钥或扩展，预检 UX ≠ 真正修复登录注入。
4. **模型能力自动验证/路由**：`docs/TODO-AI-MODEL-CAPABILITY-AUTO-ROUTING-2026-10-08.md` 为独立、需要模型测试授权的工程任务，本轮未做真实 API 模型探针或自动分流。
5. **Director A/B 采纳、抖音运营准实时指标**：均有独立待办，本轮只有 V8 影子比较，没有安全地把改动写入正式生成链；直播指标长时同步未启用。
6. **所有旧页面真实真人 UX 验收**：虽然有浏览器自动回归，仍须实际走通所有高阶专业编辑/重做流程，不能以 200 和可点击代替完成。
7. **全量回归与正式部署**：需取得完整测试日志、License Gate、`git diff --check` 及正式 3090 安全重启点验证；在此之前不能宣称正式程序已升级。

## 4. 后续执行原则

- 先完成当前全量测试和 E2E，标注发现的回归并修正；只在安全人工审批节点、无活租约时才允许正式服务 reload；不得释放活租约/触发远端重复提交。
- 新系统正式切换需要先冻结 `ScreenplayV8→DirectorDecisionV8→ProductionPlanV8→PromptPackageV8` 和用户反馈的叙事/视觉可靠性评价，采用后必须对旧 Preflight/Approval 做准确版本失效，禁止挪用旧授权。
- 需要真实文本/视频模型 API 调用时必须受控预算/清楚提示，没有授权不进行；涉及抖音则严守用户账号操作和发布确认分离。
- 用户旧项目继续使用 V3，直到新版本拥有可回退的完整闭环。

## 5. 16:45–16:48 验证与安全部署结果（后续补录）

- 正式测试：`npm.cmd test` **525/525 PASS**（隔离数据，不触发用户外部付费调用）；之后的最终版 `npm.cmd run build`、`npm.cmd run license:gate`（`LICENSE_GATE_PASS packages=38 external_runtimes=7`）、`git diff --check` 均通过。新版相关单元定向测试 43 项通过，V8 长对白检查后 15/15 通过。
- 隔离 Chrome Playwright 完整 **44/44 PASS**，最后 UX-R5+V8 定向 **9/9 PASS**；不包含真实 Seedance/Seedream 付费视频生成。
- 3090 原服务由已核实的 `.runtime/pvs-safe-launch.mjs` 安全启动，升级时确认目标 Run `PREFLIGHT/READY_FOR_PAID_CONFIRM/revision30`、租约空、consent=false、视频尝试0。完整数据库备份存放 `.runtime/pvs-v8-merged-predeploy-20261009-164446.db`（55.7MB，仅本机内部恢复）。
- 已于安全人工确认关卡退出旧 Session 并启用新版 `session-65fb947ac745bdf9644062a8`。启动日志仍为 **Global SmartRun worker disabled，唯一 scoped run**；正式 3090 `/health`、智能生成工作台、V8只读 HTTP API 均 200。
- 正式瑶药护颈枕 60s 项目的只读 V8 影子结果：源 Beat **6/6**、对白 **11/11**，后期文字只映射 **1/4（遗漏3条）**；旧正式方案 **4×15s**，新 Shot-first 时长候选 **9+10+10+13+9+9s**。两者目前分别因后期文本丢失、>4.2秒连续台词需要语义切镜而 **BLOCKED**；不能以生成候选表当作已满足导演约束。
- Chrome headless 对正式 3090 页面真实点击：V8 展开、2名角色与固定素材显式绑定、剧本源数据与逐镜提示词均可查看；“下一步”CSS深蓝 `rgb(22,69,123)`、背景透明；**0 意外POST、0页面脚本错误**。
- 升级前后 SQLite 只读完整对比：**11 条 SmartRun 逐字段一致**，所有 Project 状态一致；目标 Run 费用范围哈希一致、无 consent、0 视频生成尝试；GenerationRequest/Attempt/Preflight/Approval 的全库数量分别保持 **33/23/33/23**。本轮没有改变产品授权或重提旧视频。
- **结论：首轮 UX/安全恢复与 V8影子研发已经部署并回归；V8正式创作–导演–视频生成闭环、长台词语义自动跨镜、视频实拍质量验证、模型路由、抖音Bridge真实修复、A/B采用和准实时指标仍未收口。任务必须继续保持进行中，不得标记整体完成。**

## 6. 17:11 起：新会话接手继续开发（本次新增）

- **接管点**：`v8-semantic-dialogue.ts` 于 16:59 生成，但尚未在 `v8-shot-first-shadow.ts` 或导演层引用。本轮已完成两者接线，不改变旧 V3/正式 SmartRun 决策。
- **长台词逻辑**：在标点语义边界拆分，全部原文逐字可拼接，语速估算时长总和不变；无安全断句/语速超时必须 BLOCKED。修复旧规划器错误把“可见动作/听者反应”等剩余表演时间累加到台词 Shot 上导致的假超时。
- **导演闭环**：`v8-director-decision.ts` 新增原句/分句号/分句总数来源；每句只有按序拼接完整后才算覆盖一次，所有说话人、OS 与原情绪声线指令沿用源剧本。非法分段明确失败，不得自动变更剧本。
- **ProductDirector Gate**：`src/domain/schemas.ts` 的 V8-only 元数据允许携带原句来源与序号；`v8-director-conformance.ts` 校验视觉导演不得丢弃/偷换。Hermes 视觉导演输入与输出契约也明确复制分句信息，不影响无 V8 决策的旧 V3 调用。
- **Prompt/保真**：`v8-shot-prompt-shadow.ts` 逐片段核验演员、真实台词、时序和原文重组，漏说/换词/丢失后期 Cue 继续阻塞；`v8-authoritative-prompt.ts` 音频 manifest 明确原句/序号。V8 只读界面展示自然语义分句数量及其独立结构状态，不把影子 PASS 宣称为已正式采用。
- **验证**：`npm.cmd run build` 已通过；`dist/tests/v8-*.test.js` 全部 34/34 PASS（后来另补 1 个跨镜元数据防冲突测试）；`npm.cmd run license:gate` = `LICENSE_GATE_PASS packages=38 external_runtimes=7`；Git diff whitespace 无实际错误。本轮未执行付费文本/图片/视频模型、抖音写入、真实 GenerationRequest 提交。
- **进行中**：`npm.cmd test` 全量隔离测试日志在 `.runtime/pvs-v8-resume-fulltest-20261009.log`；**只有查到最后 EXIT_CODE=0 与最终统计才能宣称全量回归通过**。之后检查 3193 隔离 Chrome E2E、安全状态并决定是否可部署至正式 3090。
- **未完成**：正式 V8 创作和分镜版本 Adopt/人工确认/旧 Preflight 失效/Feature Flag、真实模型试听出片、模型能力探针与自动路由、抖音指标等仍是后续独立工作；本次不默认触发任何外部费用。旧 V3/用户授权/资产保持不变。

## 7. 17:31–17:39：全量回归与安全部署完成

- 全量单元/集成测试 `npm.cmd test`：**534/534 PASS，退出码 0**；日志 `.runtime/pvs-v8-resume-fulltest-long-20261009.log`。原先 180s 测试命令曾因时间上限中断，不是断言失败，已延长并完整跑完。
- Playwright 全站隔离浏览器测试：**44/44 PASS，退出码 0**；日志 `.runtime/pvs-v8-resume-all-e2e.log`。另有 V8+UX 定向 5/5 PASS。
- `npm.cmd run build`、`npm.cmd run license:gate`（`LICENSE_GATE_PASS packages=38 external_runtimes=7`）、`git diff --check` 全 PASS。无外部计费生成，也没有抖音发布/互动写入。
- 在正式服务 3090 原进程停止前，执行只读 SQLite 原始记录指纹/授权状态检查：**11 Run、8 Project**，目标 `PREFLIGHT / READY_FOR_PAID_CONFIRM / revision30`，无视频 consent，`attemptIds=0`，全库无活租约。只读快照保存在 `.runtime/pvs-v8-resume-snapshot-before-restart-20261009.json`。
- 使用 Python SQLite Online Backup 生成 `.runtime/pvs-v8-resume-predeploy-20261009-1735.db`（55.7MB），**integrity_check=ok**；保留此前 `.runtime/pvs-v8-merged-predeploy-20261009-164446.db`，均不对外分享。
- 仅结束既有 3090 会话 `session-65fb947ac745bdf9644062a8` 后，沿用原安全启动脚本 `.runtime/pvs-safe-launch.mjs`（全局 Worker 禁用、只开放原项目/原 Run 的 scoped 执行）启动新版会话 **`session-357f196c8ea309223a933d42`**。
- 新服务 3090 `/health`、`/projects`、项目 `/smart`、原 Run `/v8-shadow` **全部 HTTP 200**。部署前后审计脚本 `.runtime/pvs-v8-resume-compare.mjs` 输出 `PVS-V8-ROLLOUT-DATA-GATE_PASS`：**11 Run 逐条 dataSha256 一致、8 Project 状态一致**；GenerationRequest/Attempt/Preflight/Approval 数量分别保持 **33/23/33/23**，目标 revision30、未授权、0 视频生成尝试、无活租约。
- 正式 60s 项目新 V8 `v8-shadow` 只读结果：**Shot-first PASS**，备选视频总长为 **9+10+10+13+9+9 秒**，**31 Shot**，含 **4 个按自然语义分句的对白镜头**；`readOnly=true`，`paidSubmissions=0`。**原正式 ProductionPlan 保真核查仍 BLOCKED**（对白覆盖11/11；后期文本仅1/4、漏3条），不能直接采用旧正式 Prompt。
- **范围说明**：此次是“恢复开发 + 语义分镜到 ProductDirector/Prompt 的新链路修复 + 影子预览安全部署”，不是完整 V8 正式采用。要进一步实现 V8 `Screenplay→DirectorDecision→ProductionPlan→PromptPackage` 持久版本化、前端人工编辑采纳、逐依赖失效/费用授权复核、真实模型样片效果，需要后续实施；保留用户现有 V3 任务、资产及发布 Gate，不能在影子 PASS 后自动付费生成。



