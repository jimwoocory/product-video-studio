# PVS 剧本→分镜→视频提示词 V8 交叉评审（2026-10-09）

> 状态：**REVIEW / NO CODE IMPLEMENTATION / NO PAID GENERATION**。本文件是基于用户上传《出分镜--V8（含配音指令版）.docx》、公开资料及 PVS 当前源码的编剧、导演、声音、模型工程、QA、制片六个专业视角的交叉审查记录。**当前 AgentDock-company-2 连接器不具备可核实的多独立模型/真人参会会议接口，六种视角不能冒称已有六位独立成员签字或达成正式团队决议。** 如需独立团队签核，另行启动明确的外部会审，不得伪报。
>
> 本轮不得改业务代码、不得重启 3090、不得调用用户 API 模型、Seedance/Seedream 付费生成或抖音写入；需获得用户后续授权才能实施 POC。

## 一、源材料与证据分层

**用户原始 V8 文档提供的生产约束：**
1. 「视觉资产流」锁定人物/道具/场景的稳定外观；「动态分镜流」负责站位、动作、镜头、灯光、台词、现场声及跨镜首尾状态；
2. 禁止分镜修改原剧情/原台词/人物关系/事件结果；剧情、镜头、台词原文需要覆盖清单；从分镜原文来源向下跟踪；
3. 同一视频编号可有多个有功能的短镜头，视频编号时长**不超过**对应模型上限，不能为了凑 15 秒而强行拉长；
4. 时长先核算原台词的说话者、语速、气息、必要停顿和听者反应，再安排动作/镜头；长台词可跨镜继续说，不能切词或吞尾音；
5. 视频提示词显式写「场景和连续状态」「人物站位」「光线」「逐镜时长」「画面」「配音指令：角色|声线|表演状态|声音执行参数」及原台词；BGM 默认关闭、保留所需现场声与音效；
6. 2.5s 等单镜阈值属于**导演节奏参考和审核触发线**，不能无证据宣布 Seedance 会逐帧严格遵守；
7. 原文优先于镜头花活；不得为增加镜头数机械加入没有信息价值的镜头。

**V8 内部需要归一化的冲突：** 开头默认真人写实/9:16，后面输出样例写默认 3D 国漫/16:9；必须服从用户/项目已选择的视觉类型和画幅，不直接把样例值写成 PVS 的默认。V8 的「视频编号最多15s」也仅是 2.0 Mini 场景上限，不能代替能力注册表；Seedance 2.5 等其它能力须按实时登记验证。

**公开参考：**
- BBC Writersroom 剧本 PDF： https://downloads.bbc.co.uk/writersroom/scripts/screenplay.pdf
- StudioBinder screenplay components： https://support.studiobinder.com/en/articles/2941370-understanding-screenplay-elements
- StudioBinder script line→shot 追踪： https://support.studiobinder.com/en/articles/10330842-how-to-use-the-shot-tagger-feature-in-shot-lists
- 火山引擎剧创 short-play-creation： https://docs.volcengine.com/docs/drama-creation/short-play-creation?lang=zh
- 火山方舟 Seedance 2.0 提示词指南： https://docs.volcengine.com/docs/ark/seedance-2-0-prompt-guide?lang=zh
- 火山方舟生成时长接口教程： https://docs.volcengine.com/docs/ark/video-generation-tutorial?lang=zh
- 字节 Seedance 2.0 官方发布： https://seed.bytedance.com/zh/blog/official-launch-of-seedance-2-0

公开商业平台关于短剧“3秒钩子”“每集钩子”的经验可用于候选方向，不视为普适统计结论，也不得强制所有产品广告使用连载剧的悬念结尾。趋势研究须分清「可验证平台样本」与「通用写作模式」。

## 二、PVS 实际问题证据（2026-10-09 当期真实 60s 项目）

项目：`21a89ce0-599e-4840-8a5d-53156a6d64cc`；SmartRun `576430e9-bcb2-459e-ae0e-06c09a072b76`，用户诉求「采用短剧的方式展示产品」。原项目数据：ScriptDraft v4，6 Beats，时长依次 9/10/10/13/9/9 秒，总 60 秒；DirectorV3Plan 四个 Clip Contract；ProductionPlan 四个 15 秒 Clip；四份 Seedance 2.0 Mini Prompt。脚本含人物/对白/事件顺序，分镜主题一致但导演表达存在真实损失。

实际代码根因与定位：
- `src/application/services/ai-generation.ts:516+` 仍以「Return ScriptBeat data only」为主，缺少详细、可直接表演的「场次→动作→人物动机→逐句对白→可视信息与情绪转折」的权威 Script Scene 结构；
- `src/application/services/script-feasibility-service.ts` 主要检测 Beat 数、动作和场景密度、剪辑指令，并不验收观众能否理解谁要什么、悬念何时揭晓；
- `src/application/services/director-v3-planner-service.ts` 的 `initialGroups` 和 `normalizeDurations` 对复杂度、总时长进行分组与归一化；`cameraFor` 基于 Beat 类型分配「围绕产品和手部的稳定机位」通用模板，而非依据剧情反应/信息揭晓决定镜头；
- `src/application/services/smart-production-adapter.ts:460+` 先建 `DirectorV3Plan`，再调用 `ProductDirector` 产出完整 `ProductionPlan`，两者虽然要求 Clip 一一对应，但不强制最终所有镜头构图/站位/状态/配音都同源；
- `src/adapters/ai/hermes-product-director-generator.ts:493+` 对正式 ProductionPlan 生成有自己的 Segment 规划；`src/application/services/seedance-model-prompt-v3.ts:239+` 仍主要采用 `contract.purpose/actions/camera/audio` 编译，不完整消费详细的 ProductionPlan Segment；
- 真实 Prompt 四份都列了两人参考资产，但没有显式锁定「资产A=主人公」「资产B=提问室友」的说话者与表演归属；正式分镜具体构图与听者反应未完整进入 Prompt；
- Script v3 与 v4 Beat 内容实际一致，v3 QA PASS 不能误当本次文案漂移；但报告可追溯/按最终版本再签核应增强；
- Script/Director 到后期 `postProductionText` 部分丢失；在“不让视频模型生成文字”的要求下，如果后期字幕清单没留下，会造成成片信息遗漏；
- 当前所有四段15s并非业务上的唯一正确方案；模型只规定单次能力区间。

## 三、六个审查视角：争议、结论、取舍

### A. 编剧视角
**要求**：模糊 brief → 识别目标平台、总时长、产品事实、广告类型/真人短剧类型、情绪和允许的卖点；当用户没有详细想法，读取可追溯的研究证据与经评估的通用叙事模式，生成 2～3 个原创创意方向并择优（允许用户随时编辑）。
**剧本格式**：`StoryIntent`（用户意图和边界）→ `StoryOutline`（角色欲望/目标/阻碍/信息差/价值变化/结尾类型）→ `BeatSheet` → `ScriptScene`（场号、内外/地点/日夜、出场人物/位置、可见动作、角色名及原台词、表演意图、关联 Fact ID/产品展示、预计表演时长、观众何时得知什么）。
**反对**：把「详细剧本」写成带精确机位的混合 Prompt；也反对把“用户没想法”理解为默认生成安全平淡的营销 Q&A。广告 30/60 秒和多集竖屏短剧的结尾策略不应强制相同。

### B. 导演 / 分镜视角
**要求**：先建立人物左右/朝向/眼神/道具/空间/机位轴线；再按行动、台词、反应、焦点变化拆成具体 Shot。分镜必填可拍内容、每镜 start/end、关键动作起落点、发声角色、完整台词片段/画外承接、表演与声音参数、视觉焦点和视听功能。
**三级时间结构**：`ScriptScene/Beat`（故事）→ `Shot`（镜头）→ `GenerationClip/视频编号`（模型单次生成）→ `Timeline`（后期组接）。Clip 可含多个 Shot，且不必统一 15 秒。
**反对**：以 PRODUCT/FEATURE 标签硬套机位，也反对 V8 的“6–8 镜/15s”不问场景就强制执行。应对镜头切点进行叙事证明：不切也能让观众理解的，应合并；镜头隐藏/揭示重要信息时必须明确观众知情时机。

### C. 声音 / 表演视角
**要求**：从 Script 保存稳定的 `DialogueLineId`、`speakerCharacterId`、完整原文、`delivery`（语气、气息、音量、语速、尾音）、`voiceRefId` 和开口/画外/OS 模式。按语言与语速估算发音时长，再给反应/情绪停顿预算。
**反对**：按字数粗算后将动作、反应、完整对白硬压在一个15s片段；也不能仅提供两个角色 reference 却不指定各台词属于谁。音效与动作帧绑定，BGM 按用户不生成配置关闭。

### D. 模型 / Prompt 工程视角
**要求**：真实模型能力从 provider registry 读取，2.0 Mini 当前项目 Clip 上限15秒；不以15秒作为默认目标。保留模型独立 profile（多镜头指令/整数秒 API 时长/参考图片数/原生声音/角色和语音可靠性）。
**实现**：`DirectorPlan` 为唯一权威：`ProductDirector` 可充实镜头方案但不得独立改变 Beat 或 Clip 的主意图；`PromptCompiler` 必须读取最终正式分镜 `Shot` 和角色/声音/连续性数据，并输出逐视频编号可复制单元；不允许把重要画面指令丢给“合成时模型自行脑补”。
**反对**：盲目堆叠长 Prompt/复杂镜头。内部 Shot timecode 可精确到毫秒，但生成时对 Seedance 2.0 多镜头的子秒切镜只能作软约束；达不到稳定可控时用更多短 Clip 生成、Timeline 硬剪、必要时模型首尾帧/延长而不是幻想百分百严格遵循。

### E. QA / 版本审计视角
**强制 Gate**：
1. 每个 Scene、Beat、DialogueLine、可视关键动作都有不可变 ID；从剧本至 Shot→Clip→Prompt→Timeline 覆盖映射 **100%**，无无源剧情新增或重要原文删除。
2. 台词逐字一致、说话角色/画外/OS 和声音版本精确绑定；自动检查字幕 cue 不丢失、BGM 和原生音轨策略无互斥。
3. Shot 时间连续，总和＝GenerationClip 时长，总 Clip 时长＝项目目标，全部处于所选模型能力范围；每一段完整对白需要可朗读的预算（换镜可跨台词，不能丢句）。
4. 首尾状态、焦点、道具、站位、观众揭晓时机必须逐段相接；产品事实有可追踪来源，未确认营销/医疗功效不得宣称。
5. 画面/演员关系/叙事可懂性为 AI 辅助与人工质量门禁，不允许用技术格式 PASS 冒充效果 PASS。
6. 版本引用一致：ScriptHash、DirectorPlanHash、PromptHash、ProductionPlanHash、audio/text cue，修改某段只失效正确的下游内容；历史成功素材和已授权付费范围不能隐式更改。

### F. 制片 / 成本视角
**要求**：POC 必须零付费视频生成起步，先审核剧本朗读、导演 Shot 时间表、导演动画脚本/文字 animatic，再决定1～2个镜头样片是否值得花积分；当短 Clip 变多，必须展示预计调用次数、价格未知状态和复用资产，不为凑镜头付费。
**反对**：一口气为全片执行所有生成；必须先验证模型生成多镜头是否稳定，减少无效镜头和不可控的模型抽卡。

## 四、拟调整的数据权威和代码职责（先提案、待授权实施）

- `ai-generation.ts`：新增详细 `ScreenplayScene/DialogueLine/ActorIntent/AudienceKnowledge` 输入输出；从用户很模糊的 brief 构建原创创意，不直接进入均匀 Clip 规划。
- `script-feasibility-service.ts`：区分「技术可生成」和「故事/表演完整」两类报告；新增对白时长、观众知情时机、情节因果及戏剧推进检查。
- `director-v3-planner-service.ts`：从“按技术时间均匀分组 + beat 类型摄影模板”升级为“ScriptScene→Shots/Scene→GenerationClip 按观众知情与表演变化分组”，先确定镜头语义与每镜表演时长，最后核算模型合法 Clip 时长。不足上限如实输出，过长就拆分，不补无意义画面。
- `hermes-product-director-generator.ts` 和 `product-director.ts`：以单一 DirectorPlan 为权威，ProductDirector 作为镜头丰富/表演/光线的约束执行器，不再成为能独立更改故事节拍的第二导演。保持已有生成请求/API 兼容。
- `smart-production-adapter.ts`：串接新中间格式及 Gate，保持历史 Director V3/V2 项目只读/兼容。
- `seedance-model-prompt-v3.ts`：改为由完整正式 Shot 产生 V8 兼容的多镜头内容，明确视频编号、场景状态、人物方位、镜头、动作、声音台词/配音指令。每个生成单元独立携带必需上下文，但公共硬约束仍只出现一次；模型过载时通过能力感知降级而非删除原文。
- `Timeline`：对接 exact `postProductionText`、音轨/字幕、逐镜预期切点与实际可剪点；生成结果不符合多镜头指令时进行镜头级人工或半自动重剪，必要时局部重生成。

## 五、最小可验证 POC（保留稳定生产基线）

固定真实60秒《卧室里的草本味，谁的？》现有 ScriptDraft v4、ProductTruth、人物/场景参考、原设计四段15秒方案作为 A 组，**不修改原 SmartRun 或资产/授权**。B 组只读新方案：
1. 固定剧情不扩写，按同一6个 Beat 做 Shot 时间表和可见动作/表情/对白拆解；先用原 9/10/10/13/9/9s 作为有效分段候选（总60s、每段在4–15s），再比较适当合并成4或5段的可行性，绝不预设最终固定6段。
2. 为每个 GenerationClip 输出完整 V8 风格提示词：演员对应关系、视觉/声线绑定、每镜目的、台词原文、时长预算、首尾状态、后期文字清单；用户原剧本与台词逐字一致。
3. A/B 自动对照：关键剧情映射百分百、对白台词与角色映射百分百、后期文字不丢、镜头/Clip/全片时长可校验、不得早揭悬念、不得复制竞品画面/台词；保留不通过原因并阻止付费。
4. 有真实人工朗读和粗剪/卡片 Animatic 审核后，再由用户决定是否授权一段代表性的 Seedance Mini 付费样片，验证多镜头和配音执行稳定性。
5. 本期仅输出方案，不改代码。若开始实施，优先完成领域数据结构/两个 Gate + 1条真实60s shadow POC，再安排任何广泛重构。

## 六、待外部独立团队确认的争议（不能宣称已有多人签字）

1. 默认广告类短剧是否采用 `Storybeat 先确认，再展开详细剧本`，无想法的用户系统自动提供2–3原创备选；非广告类短剧是否采用另一套结尾策略。
2. 单生成任务的子镜头最多建议多少条：先按真实案例可视化分组，交给小样评测确定，而不是提前固定“每15s六镜”。
3. 是否增加 `ActorVoiceRegistry` 和可选配音参考，对 2.0 Mini 原生发音无法稳定的场景是否走声音后期链。先验证再决定。
4. 是否在 PVS 工作台同页向用户呈现三层结构「剧本（Scene）—导演分镜（Shot）—生成视频编号（Clip）」和一键跳回原任务。必须满足此前“工作流内可自主修改”的用户决策。
5. 旧 V2/V3 是否仅保持兼容基线，不全量重跑；新格式建议独立版本 `DirectorV3.1` 或新特性开关，名称在方案批准后确定。

## 七、反对意见总结

- **反对“剧本越长越好”**：要细到可以拍、可以演、能保留观众知情节点，但不能变成大量抽象心理文字；持续分镜和台词精度比篇幅更重要。
- **反对“每15秒固定6–8镜头”**：导演层可审查节奏，模型层实际能力决定生成策略；不要人为强制高密度动作/多说话人超过视频模型控制力。
- **反对“只复制V8原始文档为系统Prompt”**：存在默认视觉/画幅样例冲突，还需要 PVS 字段规范、版本关系、类型安全、素材引用和失败降级。
- **反对“DirectorV3和ProductDirector并行二次创作”**：必须一套权威拍摄决策，一套执行器落实细节，任何变更可追溯。
- **反对“技术 PASS 等于成片好看”**：需要读本、导演审核和真正的模型产物对照三层证据。

## 结论与授权边界

**建议优先开展一个零付费的真实60s影子 POC，严格复用已有剧本/产品事实/资产，比较当前四段15s旧链路与新V8导演链路的差别。先使脚本、逐镜分镜和编译提示词在不付费条件下达到可验证一致，再决定是否继续开发和付费验证。**

本轮仅建立跨专业评审记录并核对源码，不修改任何业务源文件、不运行用户付费模型，不触碰现有审批和任务状态。需独立编剧/导演/视频工程/QA 参会签核时应另行确认实际人员与执行路径。
