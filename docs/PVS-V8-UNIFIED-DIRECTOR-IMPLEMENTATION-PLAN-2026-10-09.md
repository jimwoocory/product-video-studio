# Product Video Studio · V8 统一导演生产链实施讨论与工程拆解
版本：讨论稿 v0.1 ｜日期：2026-10-09 ｜状态：**只讨论、记录，未授权开发**

## 0. 讨论边界与独立性

本方案综合用户上传《出分镜--V8（含配音指令版）.docx》、`docs/PVS-SCRIPT-TO-VIDEO-V8-CROSS-FUNCTION-REVIEW-2026-10-09.md`、现有 PVS 代码（`src/application/services/`、`src/domain/`、`src/web/`）。以下“编剧/导演/音频/模型工程/QA/制片审查”是专业角色对照讨论，**不是已经召开的六名独立真人或多代理签字会议**。AgentDock-company-2 尚无可核实的独立多代理会议工具，不能报告不存在的签核。

**本轮绝不改业务代码、数据库、运行进程、历史 Run、模型配置、生成请求、付费授权或抖音账号。** 本文件交付实现级任务分解，后续需用户确认才允许启动影子 POC。

## 1. 最重要的设计选择

### 方案对比与最终推荐

| 方案 | 优点 | 不足 | 结论 |
| --- | --- | --- | --- |
| A. 把 V8 整份文档贴到现有模型 Prompt | 改动很小 | 原结构/导演重复问题未解决；无法版本跟踪与精确验证；容易过长和冲突 | 不采用 |
| B. 废弃 Director V3 / ProductDirector / ProductionPlan，从零开发 | 理论上自由度大 | 破坏 V2/V3 兼容、资产与付费状态、测试及成熟模型接口，成本高 | 不采用 |
| **C. 扩展既有 Scene→Clip→Segment，新增“详细剧本+镜头约束+一致性门禁”并以功能开关影子运行** | 改动有限，可逐步验证，可保留原始资产及历史项目 | 需要认真做版本和文档字段映射 | **推荐** |

**权威规则**：
- 上游 `Screenplay` 决定不可擅改的剧情事件、台词、角色关系、观众知情节点；不能将“短剧”简化为营销问答。
- `DirectorDecision` 决定 Shot 及 Clip 的剧情覆盖、时长预算、空间/角色/动作/声音的硬约束。
- `ProductionPlan.scenes[].clips[].segments[]` 是**正式且唯一权威的详细分镜**：ProductDirector 只能按 DirectorDecision 限制完善表演、构图、灯光，不能改写上游剧情、台词或揭晓顺序。
- `PromptPackage` 完全基于**已确认** ProductionPlan Segment 编译，引用 Script/Director/ProductionPlan/Asset/Voice 的精确版本和哈希；不得从较粗的 Clip Contract 重新“概括剧情”。
- `Timeline` 使用同源 shot、audio、postProductionText cue，字幕交给后期，Seedance 输出默认不烧字、不加 BGM；创作+资产审核+付费各自保持原人工 Gate。

**V8 需要规范化的点**：一处默认真人写实 9:16，一处示例默认 3D 国漫 16:9；采用**用户本轮明确指令 > 项目设置 > 文档示例**（用户未明确指定时沿用项目配置）。V8 “15 秒编号”指 Seedance 2.0 Mini 此版本的模型能力上限；新能力以实时注册表为准。V8 的 2.5 秒、6–8镜/15秒是审查参考，不是机械 KPI。

## 2. 当前实际根因与代码复用范围

| 文件或数据 | 现在已有 | 必须新增/改变 |
| --- | --- | --- |
| `src/application/services/ai-generation.ts` | 自动生成 Beat、videoIntent 和产品事实引用 | 模糊 Brief 标准化、原创创意规划；可演的 Scene/动作/逐句对白/人物目标/观众知情节点，不再仅“Return ScriptBeat data only” |
| `src/domain/schemas.ts` | ScriptDraft Beat；ProductionPlan Scene→Clip→Segment，Segment 已有时间/对白/构图/连续性、Fact IDs | **新增非破坏式版本**的 Scene/DialogueLine/Shot 扩展，具体 speaker/voice/情绪/信息 reveal/不可变来源绑定 |
| `src/application/services/script-feasibility-service.ts` | Beat 数、动作和状态变更等基础复杂度校验 | 人物动机/因果/完整原文/讲话时间和表演时间/关键事件表现 Gate；故事质量以独立报告呈现 |
| `src/application/services/director-v3-planner-service.ts` | initialGroups、normalizeDurations、cameraFor 按模型上下限或类型模板分镜 | 不再用“PRODUCT/FEATURE→近景产品手部”的机位决定法；先拆 Shot 并做时间/空间分配，再将 Shot 打包到 Clip，时长可变 |
| `src/adapters/ai/hermes-product-director-generator.ts` | AI 产出正式 ProductionPlan；现有 V3 Clip Contract 只锁粗粒度 Beat/Clip | 限制为执行已签核的 Shot 约束；拒绝更改原台词、人物归属、揭晓顺序及 Shot→Beat 映射；不再独立“导演一套” |
| `src/application/services/smart-production-adapter.ts` | 旧串接为 V3 ClipContract → ProductDirector 详细 Segment → SeedancePrompt(V3 合同) | 改成有条件的新串接 `Screenplay → ShotDecision → final ProductionPlan → PromptFromSegments → Narrative/Compile Gate`，原 V2/V3 默认不变 |
| `src/application/services/seedance-model-prompt-v3.ts` | 参考资产 + 粗粒度目的/动作/通用摄影 + 声音 + 全局约束 | 新编译器从最终 Shot 构图/走位/视线/动作/灯光/音轨/台词原文等输出 **V8 格式**，区分导演硬约束与模型软时间码 |
| `src/web/director-v3-ui.ts`/Smart 工作台 | 可编辑 Beat/原 Prompt，但缺少逐镜/逐台词关系查看 | 同一个工作流里展示详细剧本、导演镜头表、生成编号和 Prompt；支持局部修改、人工采纳和失败原因展示 |
| `GenerationPreflight` 和 `Timeline` | 已有能力、原资产/付费 Gate、后期剪辑 | 新增语义一致性 Gate 和字幕/配音 Cue 传递；保持旧预检、配额、费用与远端提交未知保护不变 |

注意：当前 `clipSchema` 已把单 Clip 限定在 4–15 秒（`src/domain/schemas.ts`）。**新方案最先适配 2.0 Mini 4–15 秒能力**；不能在未定义版本迁移规则时把旧全局 schema 无条件改成支持任意时长。

## 3. 统一数据契约（新增字段只对新方案要求，旧数据不补假值）

### 3.1 用户和剧本层
`CreativeBrief`: `userText`, `intent`, `targetSeconds`, `format` (短剧/广告/口播/演示), `preferredStyle`, `factsRef`, `sourceEvidenceRefs`, `assumptions[]`（用户未给而程序推断，标“推测”），`forbiddenClaims[]`。

`StoryBlueprint`: `storyPromise`, `characters[]`(身份/目标/阻碍/关系), `conflict`, `turningPoints[]`, `hook`, `audienceKnowledgeEvents[]`（观众何时知道哪个事实，是否准许提前露出产品），`endingType`。模糊 brief 提供 2–3 个重点候选供用户选；当前 CreativeBatch 有 4–6 约束，可先复用其内部批次，在 UI 优先展示三种推荐方向并可展开全部候选，不直接破坏旧 schema。

`ScreenplayScene`: `sceneId`, `slugline`(内外/地点/日夜), `characters`, `space/props`, `storyEvents[]`, `actorObjectives[]`, `actions[]`(能看/能听/可表演), `dialogueLineIds[]`, `reveals[]`, `factRefs[]`, `estimatedDurationMs`。Beat 是细分节拍/兼容视图，而不是唯一完整剧本。

`DialogueLine`: `lineId`, `speakerActorId`, `exactText`, `mode`(ONSCREEN/OFFSCREEN/OS/NARRATION), `emotion`, `voiceStyle`, `delivery`(语速/音量/气息/尾音), `estimatedSpeechMs`, `locked`, `sourceBeatId`。台词已确认后只准显式编辑并触发下游重算，不因镜头时长裁剪字句。

### 3.2 导演与视频层
`DirectorDecision`: `scriptRef+hash`, `blocking/180Axis`, `characterPositions`, `audienceRevealPlan`, `shotRequirements[]`, `modelCapabilityRef`, `shotCoverageReport`。

在现有 `ProductionPlan.scenes[].clips[].segments[]` 中，Segment 作为 Shot 的正式表示；新版本的 Shot 元数据必须包含 `shotId`, `sceneId`, `sourceBeatIds[]`, `sourceActionIds[]`, `dialogueLineRefs[]`, `startMs/endMs`, `shotFunction`, `actorPosition/eyeLine`, `subjectAction`, `composition/focus/camera`, `lighting`, `continuityIn/Out`, `voiceInstructions`, `audio/SfxCues`, `postProductionTextCues`。旧字段不删除，按新子版本额外验证。

`GenerationClip/视频编号`: 用现有 Clip 承载 **1~N 个 Shot**。Clip ID、`shotIds[]`、`durationMs`, `model/ratio/resolution`, `referenceAssets`, `first/last states`, `costScope`, `promptManifestHash`。**Clip 不等于 Shot**。Shot 时间码精确到毫秒，但模型若无法保证单个视频里的 0.5 秒切镜，Timeline 必须能二次硬切或改为更短独立 Clip。

`PromptPackage`: 完整、单 Clip 自包含的 V8 格式文本 + `sourceScriptHash`, `directorDecisionHash`, `productionPlanHash`, `shotIds[]`, `dialogueLineIds[]`, `voiceRefHash`, `assetSetHash`, `compilerVersion`。可读 Markdown/文本只是投影，可靠性由结构化字段和 hash 验证。

## 4. 核心算法与职责

### 4.1 创意与详细剧本
- 用户可以只输入“用短剧方式展示产品”；系统补问**仅阻塞性信息**（如产品资料缺失、项目时长未知），其他通过产品事实与已验证素材自动提出原创方案，页面可选/可改。
- 「联网研究（可选）→ 产品事实确认」遵守现有待办决定：研究只提供**结构/节奏参考**，不能把竞品卖点/原话/角色/具体故事当成产品事实或直接复制；抖音 Bridge 不可用时应显示已降级为现有研究与体裁模板，不能冒充“最新爆款”。
- 正式剧本先明确人物目标/障碍/时间与悬念，再展开 Scene/Dialogue；详细但避免抽象情绪长文；必须写清可见动作、谁在何处、谁听到了什么。若是生活化广告短剧，不强迫套用强冲突爽剧结构。

### 4.2 Shot-first 时长计算，不再“4×15s”
1. 从 Scene 逐事件、完整台词和必要反应拆 Shot（改变观众信息/人物目标/物理动作才切镜）；确定每个 Shot 的最少表演时间（对白长度与语气、动作起止/反应）。
2. 用 V8 的中文台词语速**作为初始估算范围**，真实语音样本校准；声音允许 OFFSCREEN 跨镜，不许截词、吞字，配音角色必须有明确 asset identity 和参考音色。
3. 将相邻 Shot 按相同空间、动作连续性、模型参考输入限制、模型支持时长和预算打包为 Clip。采用**有约束的分段优化**：不得跨破坏剧情时机的边界；避免单 Clip 内人物数量/台词/动作过密；适当合并真正可以连续拍出的镜头，比较 4/5/6 段风险与预计调用次数。
4. 整数秒上限校验：本项目 2.0 Mini 每 Clip 4–15 整秒；Shot 可小数秒但组内和必须等于 Clip 整秒，Clip 总长等于用户目标；没有意义的填充或加速台词不能用于凑总时长，无法调和时给出人工可理解的提示和重新编排建议。
5. V8 的“若干短镜头/15秒”不作固定数量；如果模型一次多镜头不稳定，编译器必须提示“多镜头软约束”及建议改成短 Clip+Timeline 拼接，而不是虚报模型能保证逐帧遵守。

### 4.3 DirectorV3 × ProductDirector 冲突消解
- 新链路 DirectorV3 成为**叙事导演约束制定者**，Output 为 `DirectorDecision`，包含锁定的 `Beat/Dialogue/Shot` 映射、场景、时间窗、角色、动作、观众揭晓节点。
- ProductDirector 作为**镜头实现与视觉细化执行器**，只填写受约束 Shot 的 `composition/lighting/focus/camera/body blocking` 等；可提出“改切镜/改时长”的 proposal，但一旦影响剧本、时长、台词或信息揭晓，必须返回给 DirectorDecision 批准并重建 hash，不能直接覆盖。
- `ProductionPlan` 正式确认后才是**唯一被 PromptCompiler 使用的完整镜头事实源**。V3 Clip Contract 可用于检验原剧情覆盖、生成时长与参考资产，但不再作为最终镜头内容的简化替身。
- 冲突处理必须 fail-closed：来源对应不上、台词删改、提前曝光谜底、角色归属不明、费用范围改动时，不进入 paid Preflight，返回具体哪一行、哪一镜冲突。

### 4.4 Prompt/声音/后期
每个 Clip 编译一个自包含 V8 单元：项目规格 → 全局画风/唯一硬约束 → 场景空间与前一 Clip 连续状态 → 主光 → 角色/voice registry → 逐镜「start/end、景别与焦点、画面动作、台词角色与原文、配音指令、物理音效」→ 后期 Cue 对照清单。禁止仅写“同上”。

多人物话语要显式连接 `CHARACTER_A/CHARACTER_B` 等资产与 speaker id，区分角色开口、画外继续、OS、旁白。禁止“室友：...主人公：...”作为单一语音文本让视频模型自行猜分配。尽量不生成 BGM，声音策略在模型原生音频和明确授权的后期配音之间可选，不会自动添加独立音频计费 API Key。

模型专属 PromptProfile 决定长度、镜头数量/多模态上限和模型能力，**逐镜导演表不等于必须塞进模型的所有文本**。不能可靠压缩的部分改进 Timeline 或多次生成；不允许压缩删除事件/台词/角色/关键画面。后期字幕、标签、原料信息、合规声明必须在 `postProductionText` 有独立 Cue ID 并流向 Timeline，不烧进生成画面。

## 5. 三层 QA / Gate：技术合法、语义一致、实际效果

| Gate | 自动检查 | 不通过处理 |
| --- | --- | --- |
| **G0 Story/Script** | 目标时长、事实/产品身份、每个 Scene 可见动机/事件与结尾、台词说话者/文字哈希、观众知情节点 | 剧本修改后重审；不能用单一“技术 PASS”冒充故事质量 |
| **G1 Shot/Director** | Beat/DialogueLine/Action→Shot **100%** 覆盖；Shot→Clip 无遗漏/重复；台词时间预算；角色位置/动作连续；先不曝光秘密，旧授权引用不漂移 | 标出具体 ScriptScene/Shot/Line，返修对应镜头，不覆写已有正式 Plan |
| **G2 Prompt/Preflight** | Prompt 继承确认 Shot 的必要字段/角色发声/对白/声线/灯光与 Cue；PromptPackage hashes 匹配；模型真实时长与资产数能力；费用/同意票据绑定正确 | 禁止产生正式 GenerationRequest、禁止沿用过期付费确认；继续保留现有远端不明重提保护 |
| **G3 Pilot/User** | 真人读本能否看懂角色目标与揭晓、无付费文字 storyboard / 简易 Animatic、后续 Seedance 小样跟导演 Shot 的真实一致性 | 技术 Gate 通过仍可判创作不达标，先改善上游而非盲目增加提示词 |

G0/G1/G2 的核心字段为确定性检查，不能只交给 AI 自评分。G3 才有人类判断“好不好看”，不能误称为确定性程序已经证明质量。

## 6. P0→P3 任务拆解（预估工作包，不是已排期）

| 工作包 | 建议先后 | 工程交付 | 对应代码/验收 |
| --- | --- | --- | --- |
| **P0 备份与黄金样例** | 第1 | 当前 V3 真实60s的只读 fixture、V8规范机读清单、旧单测/浏览器回归基线 | 只读保存原 Script v4 / 4×15s / 4 prompts；不可改变项目正式状态 |
| **P1-A 域模型/兼容层** | 第2 | `StoryBlueprint / ScreenplayScene / DialogueLine / DirectorDecision / ShotManifest / PromptPackage` 的 Zod TS schema，版本与来源 hash，现有结构扩展适配器 | 老 V2/V3 Run 读取与编辑回归 PASS；新字段仅对新版本强制 |
| **P1-B 模糊意图→详细剧本** | 第3 | 简明 Brief 解析、原创创意、正式 Scene screenplay、Story QA、同页脚本编辑 | “采用短剧方式展示产品”等简短输入可产生可读/可演剧本，含全句台词与角色绑定 |
| **P1-C V8导演/Shot-first 时间编排** | 第4 | Shot 细分、speaker/voice/eyes/blocking、动态 Clip packing 和覆盖/连续 Gate | 同一60s有合理4/5/6段候选，时间合法，Beat/对白100%覆盖、无统一15s强塞 |
| **P1-D ProductDirector 统一** | 第5 | 约束内丰富正式 ProductionPlan、diff 审核、拒绝剧情/角色/时长非法变化 | 故意让 ProductDirector 改台词/提前揭晓的测试必须失败 |
| **P1-E Seedance V8 Prompt/声音后期** | 第6 | 逐镜自包含提示词、角色/声音清单、Cue/Timeline、模型Profile 和 Prompt Gate | 最终 Prompt 以 Segment为准，逐行保留重要表达，无字幕/后期卖点丢失 |
| **P2 影子预演与同页 UX** | 第7 | 用户项目里的新旧方案 side-by-side（原正式方案不可变）、脚本/分镜/Prompt 可修改/局部采纳、精确费用估计/未知提示 | 原 Run 与原素材0写入；A/B比较真实60s并用读本/无费Animatic人工核查 |
| **P3 试点开关与真实模型样片** | **用户另行授权后** | 先1条短 Clip 的付费小样，比较模型执行“多镜头/口型/声音”的实际可靠性，再讨论推广 | 用户明确具体图片/视频生成范围/积分风险；失败不自动重投、不默认批准全片 |

任何阶段不得随意删去既有确定性 ProductionPreflight、Asset Gate、Clip Review、FinalQC、Timeline 和抖音独立发布 Gate。

## 7. 当前60秒案例的具体验收设计

为隔离变量，不把“修改详细剧本、修改导演、修改提示词”混成同一次不可归因的试验，采用逐层对照：

| 组别 | 固定什么 | 唯一主要变化 | 验证目的 |
| --- | --- | --- | --- |
| **A0 旧基线** | 当前 Script v4、4个15s Clip、现有 Prompt 全部不变 | 无 | 保留历史问题样本 |
| **B1 仅编译修复** | 同一 Script v4、同一 4×15s、同一正式 ProductionPlan Segment | 将 Segment 的构图/动作/角色发声/配音/Cue 真正编进 Prompt | 判断主要损失是否发生在 ProductionPlan→Prompt |
| **B2 导演与时长修复** | 同一 Script v4 / 台词原文 / 产品事实与资产 | Shot-first 分镜及 Clip grouping 改用有效时长 | 判断悬念节奏和镜头变化是否得以保留 |
| **C 详细剧本试验** | 相同的模糊用户意图、产品事实与安全约束 | 增加可表演场次、人物动机、完整创意与台词优化；镜头链路沿用已验证 B2 | 判断上游编剧能力能否带来增益；不得与 B1 混淆 |

B2 的初始参考是原 6 个 Beat 的 9/10/10/13/9/9s，可逐 Beat 对应 GenerationClip，**每个 Clip 仍可包含多个按 V8 分解的 Shot**；同时按剧情与模型能力比较有依据的 4 或 5 Clip 备选，不能预设最终一定 6 段，也不能强行全部 15 秒。

A0/B1/B2 仅使用同一版 Script v4，不扩写任何剧情。C 是单独的脚本创作实验，改台词或故事必须明确标识，不得无声覆盖已经确认的正式 Script。

示例“开场”: 先室友持香水注意到不同气味→追问→主人公卖关子→回收室友反应；在应当揭晓之前，产品可存在于场景但**不得让观众提前清楚识别为谜底**。该揭晓边界为剧情意图约束，不是为了追求镜头数量而新增事件。所有演员声线和台词按当前已确认素材/脚本锁定。

**自动通过阈值（强约束）**：源 Beat/DialogueLine/可视动作覆盖完整；原对白逐字零差异；演员归属零错误；现有事实零越界；Scene/Shot/Clip总时长及模型输入均合法；后期 Cue 不丢；不隐式扩增生成次数与旧付费授权。**人工判定项**：观众能理解冲突与揭示、角色动机清楚、视觉镜头对话不拖沓、提示词难度落在模型能力内。若不达标先停止升级，不冒称“技术通过=可以出片”。

## 8. 接线、兼容、风险与回退

- 首轮使用 **影子目录 / 独立版本产物 + 功能开关**（建议 `V8_UNIFIED_DIRECTOR_SHADOW`，默认OFF）；不能让用户当前正在费用确认或已生成视频的 Run 自动变成新版本。
- 保留旧 `directorVersion=2|3`、旧 `DirectorV3Plan` 与旧 Prompt 文本完整可读。选择新方案用独立 `directorPipeline`/`manifestVersion` 标识，不直接强改现有数据库的 mandatory 字段；运行时按来源精确绑定，不同版本可并存。
- 新版正式采用时要先让用户确认改动范围、Clip数量、费用范围和下游失效，再采用新 Plan；旧 `paidScope/consent` 必须自动失效，不能把旧授权移植过去。
- 旧项目关键编辑（Script修改、角色资产修正、某个 Shot/Prompt 修改）只失效其正确的下游依赖，不重复生成无关镜头/图片。
- 即梦/Seedance 模型能力不可验证时，必须让用户知道具体缺少的功能（参考图、声线、配音、多镜头、分辨率等），不能静默改用能力弱的模型；第三方文本 API 模型如需联网调用需按路由和预算控制。
- 不引入任何对外真实生成、账号发布或扣费操作作为非付费 POC 的条件。回退只需关闭新 Feature Flag，历史 V3/工作区原数据保持不变。
- PVS 当前 Git 工作区约 150+ 未提交修改，实施时必须**先盘点并隔离**并行任务，不用 reset/clean、不把其他人代码混提交。建议新 worktree 或独立分支；影子实验不要连接生产 SQLite 的可写接口。

## 9. 开发角色分工与跨组集成顺序（建议）

| 工作组 | 负责什么 | 必须交付的可验证证据 | 开始依赖 |
| --- | --- | --- | --- |
| **架构/Tech Lead** | 确认权威数据结构、类型版本、可恢复检查点、Feature Flag 与向后兼容 | 一份 TypeScript/Zod 合同 + 字段到真实项目的映射 + 老 Run 解码回归 | 首先开工，冻结后其他组同步 |
| **编剧/创意与研究** | 模糊 Brief→原创 StoryBlueprint→详细 Screenplay、观众知情节点、产品事实引用 | 同一 brief 的三类候选、清晰完整剧本、故事朗读审核、不可编造爆款来源 | 读取已冻结合同 |
| **导演与分镜** | Shot-first 设计、镜头时间/对白/站位/道具连续、Clip packing，提供 V8 执行表 | 镜头覆盖/前后状态证明、可变时长备选和叙事说明 | 读取已冻结合同及示例剧本 |
| **模型/提示词/声音** | Seedance Prompt Manifest、角色/语音绑定、后期 Cue、CapabilityProfile、失败降级 | Prompt 逐镜编译测试、speaker/台词/音效一致、超限按能力拆分 | 导演字段/Shot 合同冻结 |
| **QA/回归** | G0–G3，黄金测试、故意出错样例、真实只读 A0/B1/B2/C 对照及兼容 | 每次通过/失败的明确证据；不能只凭结构 PASS 就允许扣费 | 从 Day 1 介入，不等生成后才测 |
| **前端/产品 UX** | 唯一智能工作台内脚本、Shot、Clip、Prompt 逐层可看可改，一次处理一个主任务 | 桌面/手机可用；编辑局部下游失效正确；人工确认/费用门禁仍清楚 | 数据接口稳定后并行 |

**集成规则**：架构先冻结共享合同；编剧、导演和模型组可依据稳定接口并行使用隔离 fixture，严禁各自生成互不兼容的数据格式；QA 从第一天加入；每个 PR 带独立的失败样例与回归。统一集成者只接受已过 Gate 的工作包，不把“大家各自说通过”误当成集成通过。当前并未实际召集可独立签字的多名成员，分工为建议。

## 9. 本轮需要产品负责人拍板的仅两项

**D1**：是否原则同意“沿用现有 ProductionPlan/Segment 作为权威逐镜分镜，旧 Director V3 保留，新 V8 作为影子功能开关”的方案 C（推荐同意）。

**D2**：POC 是否使用当前60s《卧室里的草本味，谁的？》作为第一个只读样例，**保留原剧本和所有已确认资产，先不修改剧情**（推荐同意）。若同意，随后才能明确授权启动 P0/P1 的非付费工程开发；真实 Seedance 试片另行申请许可。

**其他细节（音频原生/后期备用、镜头最大密度、一次视频多镜头稳定性）必须由样片证据和生产成本决定，不应在今天凭空定死。**

---

讨论稿保存后，本次对业务程序不做任何修改。
