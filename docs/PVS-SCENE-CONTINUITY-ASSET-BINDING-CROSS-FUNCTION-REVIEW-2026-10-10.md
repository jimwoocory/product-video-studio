# Product Video Studio · Scene Continuity Engine 与资产@图片绑定实施评审

- 日期：2026-10-10（北京时间）
- AgentDock-company-2 任务：tsk_03cdde51a63c691d
- 状态：评审建议稿，等待用户确认实施；本轮**不改业务代码、不付费生成、不发布抖音**
- 评审性质：基于仓库、现有测试和已交付V3/V8方案的**六个专业职能视角交叉评审**。当前 AgentDock-company-2 的已连接能力未提供可核实的多名独立代理/真人会议与签字接口；不能将此文件描述为已经召开独立多人会议。

## 1. 用户已明确的目标与边界

不只修“上一段尾帧 + 下一段提示词”。目标是 Scene/Clip/Shot 全流程连续性：
1. 剧本事件、人物目标、动作、道具和观众知情节点进入导演决策；
2. Clip 内多 Shot 连贯；Clip 间按强连续/同场景切镜/时空跳切分别继承状态；
3. 用户可写“县令@图片1；场景@图片3；上一个视频尾帧@图片5”，程序明确绑定对应图文件和预期模型输入槽，而不只存文本；
4. 必须区分“PVS程序能严格保证引用一致”与“Seedance一定执行外观/运动/跨片无缝”，后者必须按真实输出质检；
5. 输出默认遵守用户项目的9:16等规格；生成原生对白/环境声/物理音效而不生成BGM（具体受模型能力限制）；
6. 能处理依赖调度、版本失效、逐镜质检和只返工受影响的片段；
7. 原 V2/V3、V8、历史项目、已生成视频、审批与运营流程完全保留。

## 2. 仓库与真视频证据

| 证据 | 已经存在 | 缺口与误判风险 |
| --- | --- | --- |
| docs/PVS-V8-FORMAL-DIRECTOR-PROMPT-CLOSEOUT-2026-10-10.md | V8 正式链可从确认剧本 → DirectorDecision → ProductionPlan Segments → V8PromptPackage → Preflight/Timeline，功能开关默认OFF | 非真实Seedance连贯性验收；不能重做第二条导演链 |
| src/domain/schemas.ts 的 clipSchema/segmentSchema | clip内部Segment连续性Hash和首尾一致校验；参考资产按role+priority组织 | 跨Clip计划状态契约、真实生成结束状态和角色/物件级结构化状态不足 |
| src/application/services/v8-authoritative-prompt.ts | 保留原对白、机位、声线、镜头时序，引用已确认的ProductionPlan Segments | 角色/场景/控制帧只靠文字资产说明，不存在当前Clip的图片序号→文件与提供商槽位完整可验绑定 |
| src/application/services/agent-mode-service.ts:543+ | 单视频任务按素材顺序记录assetManifest，原样提交promptText | 未建立“县令 → 图片1 → assetId+hash → 实际传参槽位”同源强绑定 |
| src/adapters/video/verified-dreamina-runtime-loader.ts:225+ | text2video/image2video/frames2video/multimodal2video分支，frames2video使用--first/--last，多模态使用--image | “参考图片列表首位”不等于“强制首帧”；必须核验不同模式可同时支持哪些控制 |
| .runtime/continuity-test-20261010/REPORT.md | A、B、C1、C2四组网页真实出片，各140积分、合计560积分；视频可回读 | B/C1从预期竖屏变16:9；C1 A尾帧作为普通多模态图未硬接续；C2近静态且无音轨；B图像影响角色但@原生特殊绑定未证实 |
| src/application/services/generated-audio-qc.ts | 有原生音轨与BGM检测路径 | 音轨存在≠对白、归属、时序正确；首尾帧模式可能不支持音频 |

注意真实测试使用合成角色示意图，仅证明输入与样式影响，不是高保真人脸身份锁定测试。当前 Git 有大量旧改动，禁止 reset/clean、混合提交或自动重启3090。

## 3. 六个专业视角交叉评审

### A. 架构/技术负责人

**主张**：不新建能独立改写剧情/镜头的“Continuity Director”。Scene Continuity Engine 只负责从已确认导演/分镜提取、核验、传递状态，**不**自创剧情事件。权威链：确认Screenplay → V8DirectorDecision → ProductDirector受约束完善 → 确认ProductionPlan Segments → Continuity Contract/Asset Manifest/PromptPackage → Preflight → GenerationAttempt → Actual Observation/Review → Timeline。

**反对**：在Agent单视频页私下修一套图片绑定、在V8再建另一套，或直接把V3/V8数据结构整体替换。建议共享新的typed binding/operation planner、两个入口适配，版本扩展默认关闭。

### B. 编剧/导演/分镜

**主张**：对一个Clip内部多Shot维护镜间 continuityIn/Out；对相邻Clip必须明确关系：
- HARD_CONTINUITY：同动作紧接，站位、手中物件、方向、衣服、场景状态连续，需要真实输出尾帧作为下一段硬首帧候选；
- SAME_SCENE_CUT：允许景别/机位变，但道具归属、人物/空间与动作因果一致；
- SCENE_OR_TIME_JUMP：允许时空状态切换，但必须由明确剧情事件/时间跳转说明，不能隐式瞬移。

**反对**：把所有转场都要求“最后帧=最初帧”，这样会错误禁止正常反打和切机位。模型无法保证强连续时，提议切点微调/Timeline桥接/重生成片段，不能直接伪报通过。

### C. 资产/Prompt工程

**主张**：引入每Clip版本化 AssetBindingManifest：
- `clipId, logicalName, subjectKey/assetType, imageIndex, assetId, artifactId, sha256, required, purpose, providerInputRole, approvedVersion`
- `imageIndex`是用户界面序号；`providerInputRole`明确普通多图、FIRST_FRAME、LAST_FRAME、角色/场景/道具，**不是**假定所有`@图片N`都自动转换为提供商原生绑定。
- 用户点击资产卡/插入引用后自动形成`县令@图片1`等文本；确认后锁定顺序。修改素材/重排/替换尾帧需同步重编译、旧批准版本必须失效。
- 生成前核验所有引用编号、重复与缺失、实际asset hash和CLI发送槽位；网页展示缩略图与资产名对应，修改只影响当前Clip及依赖后续。

**反对**：直接用priority给角色绑定、只改提示词不校验后端传参；把`上一段尾帧@图片5`当普通图传入多图参考不能满足首帧强控。

### D. Seedance/生成调度

**主张**：建立OperationCapabilityMatrix，针对每模型/模式验证是否能同时满足：多图身份参考、硬首帧/尾帧、明确比例、时长、音频。对HARD_CONTINUITY优先真实`--first`或等效专用槽；如首帧模式不支持同时提供多个角色/场景独立参考，显示明确冲突并选可行替代（镜头拆分、可审的合成参考帧、Timeline衔接、重规划），不可静默降级为普通多图。
- 竖屏9:16从用户/项目+模型能力确定。如果只支持AUTO且无法证明会产9:16，阻止“已严格锁定”的宣称；试点通过后新增结果ffprobe尺寸Gate。
- HARD依赖Clip必须等实际前片生成、提取尾帧、人工/AI接受其Ending Observation后才提交下一段；无依赖Clip可并行。
- 费用未知/远端提交不确定状态仍沿用既有人工门禁与幂等防护；改动后重新授权受影响的下游。

**反对**：把两张普通参考图强行认为首尾帧；给不支持声音的frames2video模式硬塞原生音频参数；因失败自动付费抽卡直到成功。

### E. 视频QC/声音/剪辑

**主张**：分三层质检：
- G0 前置确定性：剧本/Shot覆盖、人物和物件结构化状态、引用表/Hash/顺序、能力/比例/时长/音频支持；
- G1 真实媒体确定性：ffprobe检查实际比例、时长、音轨是否存在、与所需原生音频能力一致；超差异不得自动采用；
- G2 画面/听感：视频A末尾与B开头抽帧/短窗口对照，角色服装与位置、手持道具变化、镜头轴线、情节动作与有无口型/真实对白，且识别“正常切镜”与“强连贯”使用不同阈值；AI不确定时人工审核。动作不足的近静态产物须标出，不能只用首尾图一致判PASS。
- 对声音：有AAC≠配音正确；要实际听审或转写比对原句/归属/环境交互。原生能力不足则阻断或在用户选定的既有后期音频链补足，不擅加新Ark API Key。

### F. 产品UX/测试/制片

**主张**：不要新建一个和V3 Prompt分离的顶部视频页。采用已经交付的“视频播放器+对应Prompt同卡、默认折叠Prompt”的布局，在卡内加「本段引用资产」面板（名称、编号、图、用途、可编辑）和「前后衔接」面板（计划/实际状态、是否需要上一尾帧、差异）；“重新进行视觉质检”继续在当前任务底部「停止后续编排」上方。只提供一个当前任务和明确下一步。
- 质量失败只重做受影响的Clip；如果更改了作为下一片段前置条件的结尾，后续依赖失效但不直接删原视频、自动重做或再扣费。
- 案例覆盖县衙卷宗两段强连续、同一公堂正常切机位、真正场景跳转、单视频页5张图片带稀疏引用、9:16多图、首尾帧无声/近静态和模型能力不支持。

## 4. 方案争议与选择

| 方案 | 优点 | 关键缺陷 | 意见 |
| --- | --- | --- | --- |
| P-A 仅延长Prompt并附尾帧 | 快 | 不检验真实槽位、跨片状态无结构、正是C1失败路径 | 否决 |
| P-B 单独重写Director/Workflow | 可彻底设计 | 冲突V3/V8、风险巨大、历史Run迁移不可控 | 否决 |
| **P-C 现有V8权威分镜+状态契约+统一资产绑定/Provider Adapter+真实反馈/QC** | 可非破坏升级、覆盖单视频与V8、数据和权限可控 | 需新数据版本和多模式能力实测 | **推荐** |

重要取舍：强连续优先级高时，首帧槽位不兼容多图参考的情形，不接受“硬首帧+多角色参考同时严格成立”的虚假承诺；让用户选择控制优先级并明确说明限制。正常不同机位不能一律首尾帧相同。

## 5. 建议的数据契约与接线

`ContinuityContractV1`:
- `sceneId, predecessorClipId?, clipId, relationship, approvedProductionPlanHash, plannedOpening, plannedClosing, requiredAnchorAssets[], blocking/axis, actors{actorKey,side,position,facing,wardrobe,heldProps}, props{propKey,owner,location,state}, environment{location,timeOfDay,lighting,layout}, invariants[], hash`。
- 计划状态来自已采用的Director/ProductionPlan；只补约束不替代源剧情/镜头。
- `ActualClipObservationV1`：`clipId, attemptId, resultMediaSha256, tailFrameSha256, tailFrameTimestamp, actualActor/Prop/Scene, confidence, evidenceRefs, humanDisposition?`；跟计划状态分开保存，不能AI观察失败就将推测当事实。
- `TransitionReviewV1`：`sourceAttempt, targetAttempt, relationship, testResults, issues[], decision`。依赖源片采用版本，一旦源视频改版须标记下游风险。

`AssetBindingManifestV1`: `clipId, imageIndex, label, subjectKey, assetId, artifactHash, role, providerSlot, required, createdFrom, versionHash`；ControlFrame独立字段显式连接`firstFrameArtifact/lastFrameArtifact`，图片编号仍可为用户可读别名。模板文本`县令@图片1`、`场景@图片3`只是视图，提交前用manifest确定实际文件与CLI参数。

`ProviderInputPlanV1`: `operation, model, duration, aspectRatio, resolution, nativeAudio, orderedReferenceImages[], controlFrames, preflightCapabilitySnapshot, sourceBindingHash, cliPreviewRedacted`；预检一致才可转换GenerationRequest。用共享适配器覆盖single-video agent-mode和standard V3/V8路径。

## 6. 分阶段实施任务（等待单独授权）

**P0：保护与冻结证据**
- 保存只读黄金样例：四个已生成样片、现有公堂两段错误、V3六条旧审片、V8一条Shot→Clip链；备份正式数据库，工作区脏文件所有权快照；
- 对CLI真实支持的`--first/--last/--ratio/--image`模式做非付费能力核验；禁止推测能力；
- 定义回滚开关与验证检查表。

**P1：统一资产引用引擎（可先单独验收）**
- domain新增版本化AssetBindingManifest与ProviderInputPlan；前端资产卡/引用插入编辑；
- 共享编译器覆盖单视频页和正式V8生产链；覆盖角色、场景、道具、产品、上一尾帧，保留已有role字段兼容；
- 错位、丢图、改顺序、修改确认后的asset/ratio、旧hash全都在提交前阻断；
- 无费fixture验证包括`县令@图片1`、`公堂@图片3`、`上一尾帧@图片5`，对不同image slot的文件哈希精确匹配。

**P2：连续性契约与导演融合**
- 为Scene/Clip/Shot新增可选结构化锚点；v8-authoritative-prompt从已确认Segment继承，Clip内/跨Clip按relationship校验；
- 建立计划状态/实际观察状态两层及快照哈希、源Clip依赖图；
- 保留权威Screenplay→Director→ProductionPlan，不新建第二导演；老V2/V3只读无迁移。

**P3：模型适配+依赖调度**
- 强连续使用被实证支持的first-frame等专用槽；多图reference和硬首帧能力冲突时Gate阻断或显式人工选择；
- 比例固定与能力匹配、生成后ffprobe检查；无原生音轨的模式不能宣称保留对白；
- 抽取真实尾帧、记录SHA及actualState，只有依赖就绪才允许下一Clip付费提交；保留费用门禁和远端不确定拒绝重复提交。

**P4：连续性质检+局部返工+同卡UI**
- QC分前置、媒体、画面与听感，按转场类别判定；不得“AI觉得一致”直接自动采用；
- 采用已交付的V3提示词/播放器同卡审片；新增绑定面板与首尾对照；定位出错Clip并只撤销正确的下游采用/费用许可，用户可决定是否重做；
- 桌面/手机Chrome真实流程与V3/V8旧项目回归。

**P5：真实试片验收（需要用户另行确认预算与范围）**
- 先验证最小必要的两段强连续样片，A+B至少两个Clip，再验证一组同场景切机位，不一次把长片全部送去付费；
- 逐项验证绑定/输出比例/台词声音/动作/跨片道具与首尾状态，失败记录原因和模型限制，不自动重试付费；
- 满足样片人工审片后才考虑默认开启。

## 7. 实际验收矩阵与失败样例

| 验收场景 | 自动判定 | 人工/感知验收 |
| --- | --- | --- |
| 5张图片，不全在提示词提及，引用1、3、5 | 对应三文件sha与最终CLI槽位一致，错位0；改顺序后版本失效 | 浏览器缩略图可见且名称正确 |
| 多图或首帧9:16 | 有能力且可传显式9:16；无法保证则提示阻断；实际分辨率不符不得自动采用 | 画面构图适配而非拉伸变形 |
| 2个Clip卷宗交接强连续 | A真实尾帧来源SHA准确，B的专用首帧槽位被确认；依赖严格串行 | 卷宗是否还在同一人手里、动作是否合理延续 |
| 同场景反打/机位切换 | Scene/角色/道具连续，允许角度变化 | 合理镜头轴线与视线方向 |
| 场景/时间跳切 | 有明示Scene变化和剧情时间依据，不错误要求逐帧一致 | 跳切观众能理解 |
| 剧情语音和动作 | 检查视频实长/音轨/静帧异常/原句覆盖 | 逐镜听审口型、语气、环境音，缺失音轨明确失败 |
| 修改上一段视频或资产 | 后继依赖被标记STALE，旧视频不删、旧付费授权不复用 | 用户确认再局部生成 |
| 旧V2/V3与V8 OFF | 原项目不迁移、不变更现有Prompt/审批/视频记录 | 工作台页面仍能正常审片 |

严格区分**系统可保证的输入绑定/编译/门禁**与**模型输出只可通过样片验证的实际画面连续性**。QA通过不等于生成成功，测试样片通过也不等于以后每次都百分百一致。

## 8. 需要用户确认的工程决策

D1（推荐）：批准P-C方案，复用V8单权威导演链，用共享AssetBinding+Continuity Engine覆盖Agent单视频与正式V8，不重写V3/V8。

D2（推荐）：先实施非付费P0→P2及P3能力探针/离线Gate，再做P4浏览器闭环；用户正式批准后才启动P5真实付费小样。现在无需批准额外扣费。

D3（推荐）：当模型不能同时满足“硬首帧+多图角色参考+原生音频+9:16”，系统须明确列出不支持项并让用户选择改生成模式/镜头编排，不允许自动隐藏问题。

## 9. 交付与安全核查

- 本评审仅创建 docs 中的设计评审记录与AgentDock任务状态；不改 src/tests/prisma，不重启3090，不调用用户API、不点击积分确认、不上传素材、不触发抖音写操作。
- 评审没有独立多代理/真人签字，属于基于真实源码证据的职能交叉方案；若要求独立六人会审，应另行启用可核实的Agent/参与者协作渠道。
- 等用户确认D1-D3后，再拆实际工程开发子任务/验收门禁，不把“会议任务已完成”称作“功能已修复”。
