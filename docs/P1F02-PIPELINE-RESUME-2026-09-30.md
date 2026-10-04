# P1F-02 pipeline 断点恢复与阶段验证记录

记录日期：2026-09-30。唯一总目标仍为 `docs/P1-FINAL-OPTIMIZATION-PLAN.md`。本文是实施证据，不替代总目标。

主任务：`tsk_64b596d359821bcb`；批量任务：`tsk_f61fb52424d218a7`；创作素材池任务：`tsk_48d1703c63b3f2e3`。

## 当前结论

本轮恢复公司连接后，确认上次中断前的已有代码保留；`smart-generation-service.ts` 当时不存在，随后新增并完成阶段验证。

已接入真实应用服务的可恢复编排、中文工作台、独立付费范围、批量提交、轮询下载和等待审片。自动剪辑回调尚未接入，实际集成测试在 `AUTO_EDIT_NOT_READY` 明确暂停，没有伪造最终成片。

**主任务 pipeline 仍为 in_progress。auto-edit、创作参考素材池、长参考素材分段以及真实付费完整成片验收均未完成。不得据此关闭 P1 Final / P1.5。**

## 1. 接手与数据保护

- AgentDock-company-2 已恢复。执行会话/系统进程与两次源码摘要交叉检查，未发现同目录并行开发写入。
- 接手目录没有额外 AGENTS.md 规则；继承已核对的 P1 Final 总目标和四份基线文档。
- Git 仍没有提交，保留所有未跟踪源文件；未 reset/clean/commit/push。
- 接手快照：`C:\Users\Administrator\AgentDock\Product-Video-Studio-Checkpoints\P1F02-pipeline-reconnect-1790751312215`。
- 最终源码差异与接手快照相比为 19 个预期代码/测试/脚本文件；无删除、无依赖版本变动、无本轮新增数据库迁移。上一轮已写入的第 20 个迁移保留。
- 正式 3090 服务保持原 PID 23064，没有重启，没有加载本轮新编译模块。第 20 个迁移没有应用到正式数据库。
- 第一遍继续使用原有 `npm.cmd test` 确认 172 项原基线；随后新建 `scripts/test-isolated.mjs`，所有新增代码全量回归显式使用独立 SQLite，避免旧测试套件默认使用 dev.db。没有修改用户既有业务项目、素材或审批。
- P0 source ZIP SHA256：`01F7B2678484D058A87F25D5964F011E7E1F5963E35617A6D71443AFA5775C3A`。
- P0 runtime ZIP SHA256：`117282505061104070B2610868D7A5FC9994C590A185D6E2535DB77B8A128485`。收尾只读复核仍与冻结记录一致。

## 2. 实际实现

### 编排与检查点

新增 SmartGenerationService / ApplicationSmartProduction / SmartGenerationWorker。

编排复用已有 ProductFlow、AI、Director、Preflight、Approval、GenerationExecution、Review 和 Render 接口，不重写 P1。独立 SQLite 事务保存当前运行记录及追加式检查点；同项目只允许一个未结束的编排，同创建请求键不能更换输入。

生成结果先持久化，再按 pendingInstall 接入既有版本链。业务版本已落盘而编排检查点尚未保存时，可识别已安装版本，不重复创建。检查点保存有 revision 与执行锁双校验，不能覆盖更新进度。锁只在确认持有进程不存在时回收，不靠超时抢占活跃任务。

### 审核与付费

默认 MANUAL 保留创意选择、脚本和分镜三道人审。用户显式选择 AUTO 后可自动创作，仍不能自动确认产品事实、未审核研究参考、真实付费或最终成片。

付款确认绑定计划、每条请求、每份预检和费用快照的 hash。未知成本必须额外明确接受风险。确认先保存，随后创建每镜头独立审批和 Attempt；页面重复点击不扩大范围，恢复已有相同授权不重复创建尝试。整批预校验失败时不先授权其中一部分。

研究新候选需先审核；创作素材池没有完成接入时明确暂停，不把 Evidence 图片直接用于视频生成。产品事实、素材、研究、参考视频或标准流程版本漂移都会阻止旧任务覆盖新工作。

### 批量与执行安全

批量预览只纳入当前已确认计划中最新、有效、CREATED 且有匹配独立审批的尝试；过滤已提交、完成、跳过、过期、旧计划和被替代记录。提交按导演顺序执行，每镜头再次校验，单镜头失败不阻断其他独立授权镜头。

底层提交共享队列并使用数据库 CREATED→SUBMITTING 原子领取；慢探测后再次检查有效请求与审批，用户已跳过的镜头不执行付费提交。Attempt 的项目、镜头、请求及审批 hash 也在执行服务中复核。平台已返回结果但本地落盘失败时进入未知提交恢复，不当作安全可重试失败。

同一尝试的查询/下载/调和串行化；已存在 READY 下载结果时返回原 Artifact，避免后台与页面同时下载产生重复记录。提交时保留此前 PROBE 命令审计，不用陈旧 Attempt 对象覆盖。

### 页面与后台

新增 `/projects/:id/smart` 中文编排工作台及 `/api/projects/:id/smart-runs` 系列接口。旧智能生成入口仍保留单视频直出。

新增 `/api/projects/:id/generation-batch` 与“一键提交全部待生成镜头”按钮。逐条展示结果，提交结束后自动刷新到已有查询/下载流程；不重试失败或未知提交。

GET 状态轮询无生成副作用，不自动授权。应用后台 worker 才推进持久化任务，与浏览器标签解耦；这是应用执行器，不是后台软件开发进程。正式服务未切换，本轮只在隔离验收服务运行此 worker。

## 3. 验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 接手原代码基线 | 172/172 PASS | `.tmp/p1f02-pipeline-reconnect-baseline.log` |
| 新代码全量回归与构建 | 190/190 PASS，0 fail/skip | `.tmp/p1f02-pipeline-isolated-regression.log` |
| 独立数据库迁移 | 全部 20 个成功应用到隔离库 | 同上 |
| 最终类型检查 | PASS | `.tmp/p1f02-pipeline-final-typecheck.log` |
| License Gate | PASS，35 packages / 4 external runtimes | AgentDock 输出 |
| 实际服务 + SQLite + HTTP 集成 | 15 项 PASS | `.tmp/p1f02-smart-http-smoke.json` |
| 智能编排浏览器 | 8 项 PASS，pageErrors=[] | `.tmp/p1f02-pipeline-browser-evidence.json` |
| 批量按钮浏览器 | 6 项 PASS，pageErrors=[] | 同上 |
| 页面截图 | 已查看，无控件遮挡 | `.tmp/p1f02-smart-browser.png`、`.tmp/p1f02-batch-browser.png` |
| 源码差异 | 19 个预期变更，无删除 | `.tmp/p1f02-pipeline-source-audit.json` |

HTTP 集成使用真实应用服务和 Prisma SQLite；AI 与视频 Provider 是明确标识的测试替身，下载的是本地 FFmpeg 编码的灰色视频夹具。付费按钮点击仅针对隔离测试 Provider。**真实 AI 调用 0，真实 Dreamina 付费提交 0，真实完整成片 E2E 未执行。**

重点集成验证包含：30 秒两镜头规划、精确费用确认、重复点击、独立授权、实际原子领取、防审批篡改、用户跳过后阻断提交、批量重复请求跳过、下载幂等、人工审片暂停和自动剪辑未接入时的真实阻塞。

## 4. 重跑

```powershell
node scripts/test-isolated.mjs
npm.cmd run typecheck
npm.cmd run license:gate
node scripts/smoke-smart-generation.mjs
# 需要实际浏览器操作时：
node scripts/smoke-smart-generation.mjs --serve
# 输出独立随机端口；完成后向打印的 LAB_CONTROL + /stop 发 POST。
```

这些脚本不应用生产数据库迁移、不读取业务密钥、不调用付费 Dreamina。浏览器服务最多运行 20 分钟；本轮已通过控制端点关闭。

## 5. 下一检查点

1. 主任务继续 pipeline：检查新增版本链和项目导出/恢复的完整集成，衔接下游，不把本轮局部 Gate 当作全链路完成。
2. 依总目标继续创作素材池 `tsk_48d1703c63b3f2e3`；现有未确认来源不进入生成。
3. 接 AutoEditPlan、可编辑 Timeline、字幕、BGM、旁白/音效和当前模型画幅下的最终 Render；缺音轨时应明确暂停或让用户决定，不伪造声音。
4. 批量原任务 api/ui/tests 已有实现及隔离验证，正式环境验收在受控部署后完成。
5. 正式切换前检查所有活跃研究/生成/渲染工作，做一致性备份后应用第 20 个增量迁移，再受控重启服务；不能直接覆盖数据库或中断未知提交。
6. 真实付费完整 E2E 必须取得覆盖具体镜头及成本范围的明确授权，当前授权不包含此操作。
