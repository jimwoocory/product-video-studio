# P1F-03 创作参考素材池：断点接续与部署记录

日期：2026-09-30。唯一总目标仍为 `docs/P1-FINAL-OPTIMIZATION-PLAN.md`。
原任务：`tsk_48d1703c63b3f2e3`；主任务：`tsk_64b596d359821bcb`。不重建任务，不重做已完成的 P0/P1。

## 1. 本轮状态

素材池数据模型、候选分析与留存、审核界面、下游引用链和安全门禁已完成本轮实现与隔离验证，并已加载到正式 3090 服务。任务最后的真实素材池 E2E 仍在进行中：没有执行真实网络产品资料加真实视觉模型的完整验收，不能将本轮测试替身判断宣称为真实产品识别效果。

主任务和整个 P1 Final/P1.5 均未关闭。长参考分段的模型分配、视觉 AI 最佳片段/切点评估、整体发布收口和明确授权后的真实即梦完整成片验收仍需继续。

## 2. 接手与代码保护

先读取 AgentDock 上下文、任务、目标及基线，核对执行会话与命令进程；两次源码 SHA256 扫描一致后保存 221 文件快照：

`C:\Users\Administrator\AgentDock\Product-Video-Studio-Checkpoints\P1F03-reference-recovered-1790761024160`

本轮公司连接曾间歇返回 502。每次不明确的写入都先重新读文件确认；未落盘的仓储/测试文件核对不存在后才重试。没有根据工具失败猜测文件已完成，没有用旧任务状态替代实际验证。Git 原有全部未跟踪状态保留，未 reset、clean、commit、push。

## 3. 已实现链路

### 独立素材与审核记录

补齐四个 Prisma 模型及对应增量迁移：ResearchMediaCandidateRecord、CreativeReferenceSetRecord、ReferencePoolHead、ReferenceReviewRecord。新表使用参数化 SQL，避免替换正在被 Windows 应用使用的 Prisma 引擎。

候选与普通 Evidence 分开保存，原始图片/视频及采样帧写入不可变 Artifact。保存来源 URL、原始媒体哈希、候选帧哈希、尺寸、产品主图及事实版本、模型执行元数据（运行时可提供时）、分类、身份/清晰度/水印/使用规则结果。

审核 revision 与参考集合 version 分离。忽略未使用候选不会作废原集合；改变已确认集合会原子保存新版本并使下游标准创意、分镜、请求、审批、时间线及成片失效。独立单视频 Agent 请求的审批不因素材池变化误失效。历史事实、素材、尝试和审核记录不删除。

### 图片和视频帧分析

通过现有研究模型路由发送两张图片：用户确认的产品主图和研究候选，禁止仅依据形似或来源自称官方判定同款。未确认身份、竞品、模糊、水印、规则冲突、未知规则 ID 或模型失败均不可加入参考；纯无产品场景只能采用场景角色。

视频通过显式 seek 目标采样，记录采样序号和目标时间。该时间是定位目标，不冒充原视频逐帧 PTS 或原始帧序号。SHA256 加小尺寸 RGB 相似指纹过滤高度重复帧，保留重复关系与来源，不删除原媒体。

已有深度研究媒体分析器接入候选留存 Sink；普通 Evidence 分析仍保留。可从已有媒体 Evidence 明确发起候选提取，或针对失败/事实变化候选重新分析成新记录。每次有数量、大小及视频时长边界；媒体正文读取也有超时，不绕过登录、验证码、网站限制或私网保护。

### 中文审核界面

研究页新增“创作参考素材池”入口。支持缩略图、分类过滤、来源查看、视频时间定位、单条与批量加入/移出/忽略/标记不可信、重新分析。加入前必须明确确认素材使用权。

正式页面核验发现历史 P0 测试项目缺少确认主图。现改为页面可打开并显示具体阻塞说明，保留候选预览，不允许绕过主图检查加入参考；未修改或伪造该历史项目主图。

### 生成引用与来源审计

已确认集合通过版本/哈希绑定进入 Creative、Script、Director、Prompt、Preflight、SmartRun 来源和提交前校验。手动与智能链路使用同一个集合校验服务，实际 Provider 素材解析可找到对应不可变 Artifact。

区分 PRODUCT_ANGLE、WEARING_REFERENCE、USAGE_ACTION_REFERENCE、SCENE_REFERENCE、LOGO_REFERENCE。研究参考不能静默改用途，不能把视觉描述提升为 ProductFact；展示产品且使用研究参考的镜头必须同时绑定确认主图为 PRIMARY_PRODUCT。Prompt 和 GenerationRequest 记录实际使用的候选及来源，生成页可展开查看。

## 4. 验证及边界

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 补齐模型后的原基线 | 209/209 PASS | `.tmp/p1f03-recovered-baseline.log` |
| 最终全量隔离回归 | 218/218 PASS，0 fail / skip | `.tmp/p1f03-reference-final-regression.log` |
| 新增专项测试 | 9 项通过，覆盖数据/审核、图片帧、HTTP、完整创作到 Preflight 链 | `tests/creative-reference*.test.ts` |
| 类型检查及构建 | PASS | typecheck、全量脚本编译前置 |
| License Gate | PASS，35 packages / 5 external runtimes | license:gate 输出 |
| SQL 与 Prisma 结构一致性 | empty migration | `.tmp/p1f03-migration-diff.log` |
| 隔离浏览器操作 | 9 项 PASS，0 pageerror | `.tmp/p1f03-reference-browser-evidence.json` |
| 正式只读页面 | 两项目入口均可达，4 项浏览器检查 PASS | `.tmp/p1f03-production-smoke.json` |

真实执行的是 SQLite、不可变文件留存、FFmpeg 抽帧/像素指纹、页面操作、审核事务、P1 服务编排与编译/预检。视觉 AI 和视频上游均为测试替身；测试图片是本地合成夹具，不是产品识别质量样本。

本轮真实 AI API 请求 = 0，真实即梦付费提交 = 0。生产素材池仍为空，没有代替用户抓取后自动确认研究图片。真实产品资料和当前配置视觉模型的效果验收尚未执行，也未伪造完成。

## 5. 正式环境更新与保护

更新前确认无运行中生成、研究、渲染和 SmartRun。使用 SQLite VACUUM INTO 制作一致性私有备份，位置：

`C:\Users\Administrator\AgentDock\Product-Video-Studio-Checkpoints\P1F03-before-runtime-update-1790762639498`

备份数据库属于私有恢复材料，不作为下载附件，不复制到公开报告。没有发布任何凭据、字体、音色或系统二进制。

生产库只应用 `20260930093000_research_reference_pool`，从 20 增为 21 个迁移。原有 **32 张业务表行数与内容摘要完全相同**；外键错误为 0，完整性检查通过。最终重启后再次核对，2 个项目、21 条生成尝试、31 条请求、21 条审批保持不变，新候选和审核记录均为 0；旧待生成记录没有自动提交。

正式服务 `http://127.0.0.1:3090`；当前会话 `session-0f63ed6d0fc336199de5b3a5`，PID 22400，2026-09-30 18:09:27 启动。仍为最长 24 小时的应用托管会话，不是永久 Windows 服务，也不是持续开发进程。

P0 两份冻结 ZIP SHA256 与冻结记录一致。

## 6. 重跑与下一断点

```powershell
node scripts/test-isolated.mjs
npm.cmd run typecheck
npm.cmd run license:gate
node scripts/smoke-creative-reference.mjs
```

浏览器脚本仅启动隔离测试环境；结束后对其打印的独立测试 base 的 `/stop` 发 POST，不操作生产服务。

下一断点：真实产品来源及真实配置视觉模型的素材池验收，确认官网/产品多角度/佩戴使用/视频帧候选质量；用户审核确认后复核实际下游引用。不要把已有 Evidence 分析、隔离测试或空页面可用当作这一真实 Gate 已完成。之后继续长参考分段与模型适配、视觉 AI 剪辑判断以及剩余最终收口。
