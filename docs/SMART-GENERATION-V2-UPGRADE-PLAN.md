# Product Video Studio · 智能生成主链升级方案

版本：0.1 讨论决议稿  
日期：2026-10-06  
状态：评审通过，待进入实施拆解  
目标：不另起“短剧模式”，不保留独立手动生产链；以产品输入/产品事实为基础，把创意选择、动态制作策略、资产准备、脚本、导演、Seedance、审片、剪辑、成片收敛为一条可恢复的智能生成主链。

---

## 1. 会议结论摘要

本轮按产品/UX、工作流架构、AI/Prompt、资产一致性、音视频后期、QA/迁移六个职能评审。

一致决议：

1. 产品输入和产品事实必须保留，它们是智能生成的输入层与事实约束层。
2. 不再保留“标准手动流程”和“智能生成”两条并行生产主链；用户侧只保留一条智能生成主链。
3. 不增加“短剧模式”按钮。用户提出创作想法，系统先生成创意；用户选择创意后，由 Production Planner 自动决定后续制作方式。
4. 短剧、主播、产品演示、CG、UGC 等不是用户选择的工作流模式，而是 Planner 的生产策略结果。
5. 角色、场景、关键道具、产品状态参考等资产由系统按创意需要自动规划和准备；只有高影响不确定项才找用户确认。
6. 创意选择保留为默认人工 Gate；脚本、导演分镜默认自动继续，但允许在智能生成页面内查看/修改。
7. Seedance Prompt 必须与内部审计 Contract 分离。UUID、hash、Fact ID、Segment ID、capability fingerprint、estimator 等不得进入模型提示词。
8. BGM 永远属于成片后期层。Seedance 分镜禁止生成 BGM；纯画面镜头不请求原生音轨；模型违规返回的音轨必须在正式素材入库前清除。
9. 保留现有精确付费授权、幂等提交、下载恢复、低置信审片、人工作为最终 Gate 等安全边界。
10. 旧手动页面先退出正常导航，不立即删除底层 Service；新智能编排器继续复用这些能力。
11. 现有进行中的 SmartRun 不做中途数据迁移。新任务使用新的 workflowVersion；旧任务按旧状态机完成。

---

## 2. 产品目标

### 2.1 用户真正需要做的事情

理想情况下，产品事实已经准备完成后，用户只需要：

1. 说自己想做什么。
2. 从系统生成的创意中选择一个，或修改后选择。
3. 在真实付费发生前确认精确付费范围。
4. 当自动资产检查或自动审片置信度不足时介入。
5. 最终确认成片。

其余动作由系统自动执行。

### 2.2 不再要求用户理解的内部概念

正常 UI 不再要求用户理解或操作：

- CreativeBatch / ScriptDraft / ProductionPlan 的版本链；
- GenerationProfile / capability fingerprint；
- Fact ID / Segment ID / hash；
- Asset binding；
- Preflight 内部字段；
- Submit / Poll / Download；
- Timeline 技术实现；
- Continuity hash；
- Prompt compiler 技术模板。

这些继续作为内部审计与恢复机制存在。

---

## 3. 产品输入与产品事实

### 3.1 产品输入继续保留

产品输入负责原始材料：

- 产品主图与多角度图；
- Logo；
- 产品名称、类别、型号、规格；
- 卖点与说明；
- 用户上传文档；
- 其他产品相关素材。

### 3.2 产品事实继续保留

Product Truth 继续承担：

- 产品身份；
- 可确认卖点；
- 规格型号；
- 使用场景；
- Usage Rules；
- HARD Forbidden Changes；
- 事实来源；
- 未确认候选；
- 禁止夸大和不可推断内容。

### 3.3 融入智能生成

智能生成页面顶部新增“产品准备状态”，展示：

- 产品资料是否完整；
- 产品主图是否可用；
- 产品事实是否已确认；
- Usage Rules 是否存在未处理项；
- 当前参考视频；
- 当前联网研究；
- 当前创作参考素材。

缺失时直接在当前页面补充或打开内联审核，不要求用户手工跑完多页再回来。

Product Truth 首次生成或发生实质变化时保留一次合并确认 Gate；不为每个低风险事实逐条强制点击。

---

## 4. 唯一智能生产主链

新任务目标状态机：

```text
PRODUCT_READY
    ↓
IDEA_INPUT
    ↓
CREATIVE
    ↓
CREATIVE_SELECT        ← 默认人工 Gate
    ↓
PRODUCTION_PLANNING
    ↓
ASSET_PREP             ← 默认自动；低置信或付费时 Gate
    ↓
SCRIPT
    ↓
DIRECTOR
    ↓
PREFLIGHT
    ↓
PAID_CONFIRM           ← 必须人工明确确认
    ↓
GENERATION
    ↓
CLIP_QC
    ↓
AUTO_EDIT
    ↓
RENDER
    ↓
FINAL_REVIEW           ← 人工最终确认
    ↓
PUBLISH
```

不再存在用户主流程中的“手动创意 → 手动脚本 → 手动导演 → 手动生成 → 手动剪辑”。

---

## 5. 创意驱动的 Production Planner

### 5.1 Planner 的职责

用户选定创意后，Planner 自动判断：

- 内容类型；
- 是否需要固定角色；
- 是否需要固定场景；
- 是否需要关键道具；
- 是否需要产品状态参考；
- 是否需要视觉风格参考；
- 哪些素材需要跨镜头复用；
- 哪些镜头可以直接生成；
- 哪些镜头需要强参考；
- 音频策略；
- 预计拆镜方式。

### 5.2 不暴露“模式选择”

Planner 可内部输出：

- SHORT_DRAMA
- PRODUCT_DEMO
- HOST
- UGC
- CG
- MIXED

这些值只用于系统决策，不要求用户先选择“短剧模式”。

### 5.3 示例

选中《我的枕头怎么在隔壁床上》后，Planner 应自动得到：

- CHARACTER_A：女主，跨多个镜头，需要身份锁定；
- CHARACTER_B：室友，跨多个镜头，需要身份锁定；
- SET_A：夜间合租卧室，两张单人床，需要空间连续性；
- PRODUCT_A：当前产品，必须使用确认产品主图作为强参考；
- 普通床品：非身份关键，不单独制作；
- 手机：非剧情关键，不单独制作；
- 视频策略：3 个 Seedance Clip；
- 第 1 Clip：对白原生音频；
- 第 2、3 Clip：纯画面，无原生模型音轨。

---

## 6. Production Asset Set

新增一层“制作资产”，与 Research CreativeReferenceSet 区分。

### 6.1 资产类型

- CHARACTER
- SET
- PROP
- PRODUCT
- PRODUCT_STATE
- STYLE

### 6.2 每个资产记录

至少包括：

- stable key；
- human label；
- purpose；
- source / provenance；
- reuse scope；
- reference artifacts；
- identity lock；
- generation status；
- consistency assessment；
- review status；
- content hash。

### 6.3 自动策略

角色只有在以下情况才生成固定资产：

- 同一角色跨两个及以上镜头；
- 人物身份对剧情有意义；
- 前后连续性重要。

场景只有在以下情况才生成固定资产：

- 同一空间跨镜头复用；
- 空间关系影响剧情；
- 后续镜头需要视角连续。

道具只有在剧情关键且跨镜头时单独制作。

产品始终优先复用确认产品主图，不重新设计产品。

### 6.4 用户 Gate

资产默认自动生成和一致性检查。

只有以下情况暂停：

- 两个主要角色辨识度不足；
- 核心场景布局冲突；
- 产品资产与主图不一致；
- 高影响资产置信度不足；
- 资产生成本身需要真实付费授权。

---

## 7. 脚本与导演

### 7.1 默认自动

选定创意且必要资产准备完成后：

- 自动生成正式脚本；
- 自动生成导演分镜；
- 自动根据实时 Seedance 能力拆镜；
- 自动校验时长和连续性。

不再强制用户逐页确认脚本和导演方案。

### 7.2 仍允许修改

智能生成页面提供：

- 查看创意；
- 修改创意；
- 查看/修改脚本；
- 查看/修改关键分镜；
- 查看角色与场景资产。

用户修改上游内容后，系统按依赖关系自动使下游版本失效并局部重算。

修改能力不等于恢复旧手动流程。

---

## 8. Seedance Prompt Compiler V2

### 8.1 必须拆成两个输出

#### Audit Contract

仅程序内部使用：

- Fact ID；
- Segment ID；
- UUID；
- hash；
- capability fingerprint；
- reference binding；
- Usage Rules；
- Continuity；
- model capability；
-版本映射；
- Preflight trace。

#### Seedance Model Prompt

实际通过 --prompt 提交给模型，只包含：

1. 镜头目标；
2. 场景与人物；
3. 按时间顺序的动作；
4. 产品/角色/场景连续性要求；
5. 摄影语言；
6. 声音要求；
7. 禁止项。

### 8.2 模型 Prompt 禁止出现

- UUID；
- SHA/hash；
- Fact ID；
- Segment ID；
- capability fingerprint；
- compiler_template；
- command_help_sha256；
- estimatorVersion；
- post_production_text_cues 数量；
- 内部 enum / workflow code。

### 8.3 Prompt 长度目标

建议：

- 普通 5–15 秒 Clip：600–1500 中文字符；
- 硬上限：约 1800–2200 字符，超出必须压缩；
- 只保留对当前镜头真正有视觉或声音影响的事实。

### 8.4 Prompt Linter

提交前新增自动检查：

- INTERNAL_ID_LEAK；
- HASH_LEAK；
- PROMPT_TOO_LONG；
- DUPLICATE_INSTRUCTION；
- AUDIO_CONTRADICTION；
- BGM_POLICY_CONTRADICTION；
- POST_TEXT_LEAK；
- NON_VISUAL_FACT_OVERLOAD；
- READABLE_TEXT_REQUEST。

发现问题时在 Preflight 阶段阻断，不把脏 Prompt 送给即梦。

### 8.5 UI 可审计

高级信息里提供：

> 查看“实际提交给即梦的提示词”

展示真正的 modelPromptText，而不是内部 Audit Contract。

---

## 9. 音频与 BGM

### 9.1 每个 Clip 独立 AudioIntent

建议枚举：

- SILENT
- DIALOGUE
- NARRATION
- AMBIENT
- MIXED

不再把整条视频的“原生声音开启”直接套到所有 Clip。

### 9.2 原生声音策略

- Clip 有对白/旁白/环境声需求，且用户允许原生声音：native audio = true；
- Clip 全部声音为 NONE：native audio = false；
- SILENT Clip 若模型仍返回音轨：入库前强制去除全部模型音轨。

### 9.3 BGM

- Seedance Clip 永远禁止 BGM；
- BGM 只在 Auto Edit / Final Mix 阶段加入；
- 一条成片使用一条连续主 BGM；
- 不允许每个 Clip 各自存在音乐床。

### 9.4 有对白 Clip 的音乐污染

新增 Audio QC：

- native dialogue 输出仍需检查是否存在明显音乐污染；
- 无法高置信判定“无音乐”时，不自动采用该原生音轨；
- 可回退为后期配音/环境声或人工确认；
- 不允许模型音乐与后期主 BGM 叠加。

---

## 10. 可靠性

现有机制继续保留：

- 精确 paidScope；
- 付费确认与请求集合绑定；
- Submit 不自动重复；
- status/download 可恢复；
- 下载失败不重新提交生成；
- provider handle 持久化；
- worker 可恢复；
- 每个 Stage 有不可变版本和 hash。

已验证的下载 fallback 纳入正式设计：

```text
CLI download timeout
    ↓
query same successful task
    ↓
obtain official result video_url
    ↓
direct HTTPS recovery download
    ↓
NO resubmit / NO extra generation cost
```

---

## 11. 自动审片

默认策略：

- 产品身份 HIGH；
- 连续性 HIGH；
- 使用规则 HIGH；
- 画质 HIGH；
- 裁切窗口确定；
- 音频策略通过；

全部满足才允许自动 ACCEPT。

任一项 MEDIUM / UNCERTAIN：

> 转人工完整播放确认。

AI 不得覆盖人工 REDO。

---

## 12. 自动剪辑与 Timeline

正常智能生成：

- 自动创建 AutoEditPlan；
- 自动生成 Timeline；
- 自动字幕；
- 自动 CTA；
- 统一 BGM；
- 自动混音；
- 自动 Render。

Timeline 不再是必须经过的用户主流程页面。

仅在以下情况作为“高级调整”进入：

- 用户明确要求微调；
- 自动剪辑阻塞；
- 用户最终成片后要求局部剪辑修改。

---

## 13. 用户 Gate 矩阵

| Gate | 默认是否出现 | 原因 |
|---|---|---|
| Product Truth 合并确认 | 首次/实质变化时 | 产品事实安全边界 |
| Creative Select | 是 | 用户决定创作方向 |
| Asset Review | 仅低置信 | 避免无意义点击 |
| Asset Paid Confirm | 仅真实付费素材生成时 | 费用边界 |
| Script Review | 否 | 默认自动，可随时修改 |
| Director Review | 否 | 默认自动，可随时修改 |
| Video Paid Confirm | 是 | 精确真实费用边界 |
| Clip Review | 仅低置信 | 高置信自动采用 |
| Final Review | 是 | 最终成片确认 |

---

## 14. UI 重构

### 14.1 用户侧主导航

建议收敛为：

1. 产品资料
2. 智能生成
3. 成片 / 发布

辅助入口：

- 联网研究；
- 参考视频；
- 模型设置；
- 高级诊断。

### 14.2 智能生成页面

页面本身承担：

- 产品准备状态；
- 用户创作想法；
- 创意卡选择；
- 当前 Production Strategy；
- 自动资产准备进度；
- 脚本/分镜可展开查看与修改；
- 付费确认；
- 生成进度；
- 审片 Gate；
- 自动剪辑；
- 最终成片。

用户不再被迫在多个页面跳转。

### 14.3 旧入口

从普通导航中移除：

- 创意方案；
- 脚本；
- 标准导演流程；
- 视频生成；
- 自动剪辑；
- Timeline。

旧 URL 暂不物理删除：

- legacy run / bookmark 可继续读取；
- 可重定向到 Smart 页对应 Stage；
- 高级诊断可保留深链；
- 底层 Service 继续复用。

---

## 15. 迁移策略

### 15.1 workflowVersion

SmartGenerationRun 新增：

- workflowVersion = 1 | 2

现有任务保持 V1。

新创建任务切 V2。

禁止在进行中的付费或生成任务上原地转换状态机。

### 15.2 reviewMode

V1 继续兼容 MANUAL/AUTO。

V2 产品层取消 MANUAL 主链概念：

- creative selection 为固定 Gate；
- script/director 默认自动；
- 结果仍可编辑。

### 15.3 底层 Service

保留并继续复用：

- ProductFlowService；
- AI Creative；
- Script Generator；
- ProductDirector；
- Preflight；
- Approval；
- GenerationExecution；
- Review；
- Timeline；
- AutoEdit；
- Render；
- Publish。

升级重点是重新编排，而不是重写全部底层实现。

---

## 16. 分阶段实施

### Phase A：主链与 UI 收口

- 新 workflowVersion；
- V2 状态机；
- 产品准备状态内嵌；
- 创意选择固定 Gate；
- 隐藏旧手动主导航；
- 保留旧 URL 兼容。

### Phase B：Production Planner

- ProductionStrategy schema；
- 创意分类；
- 资产需求分析；
- 自动跳过不需要的资产阶段。

### Phase C：Production Asset Set

- Character / Set / Prop / Product State；
- 自动生成；
- 一致性评估；
- 低置信 Gate；
- 跨 Clip 引用。

### Phase D：Prompt Compiler V2

- Audit Contract / Model Prompt 分离；
- Prompt 压缩；
- Prompt Linter；
- 实际提交 Prompt 预览。

### Phase E：Audio/BGM QC

- AudioIntent；
- per-clip native audio；
- silent strip；
- native music contamination gate；
- final-only BGM。

### Phase F：自动剪辑与最终 UI

- Timeline 后台化；
- 高级调整入口；
- Final review；
- Publish handoff。

### Phase G：旧流程退场

在 V2 E2E 通过之后：

- 旧手动入口彻底移出普通产品；
- 文档标记 legacy；
- 继续保留一段兼容期；
- 最后再评估是否物理删除 UI/HTTP handler。

---

## 17. 核心验收标准

1. 用户不需要进入创意/脚本/导演/生成/剪辑五个页面才能做完视频。
2. 已准备产品事实的用户，从“输入创作想法”到“视频付费确认”，正常只需选择一次创意。
3. 短剧创意自动产生角色/场景资产计划；简单产品展示自动跳过这些步骤。
4. 主角色跨 Clip 身份一致，核心场景跨 Clip 连续。
5. 实际发给 Seedance 的 Prompt 不包含 UUID/hash/Fact ID/内部模板字段。
6. 模型 Prompt 可在高级信息中直接查看。
7. SILENT Clip 不请求 native audio；即使模型违规返回音轨，正式素材无音轨。
8. BGM 只存在于最终后期主混音，不存在于各 Seedance Clip。
9. 下载超时恢复不得重新 submit。
10. 高置信审片自动继续；低置信必须人工确认。
11. 所有真实付费动作都有精确范围授权。
12. 现有 V1 SmartRun 和历史版本可继续读取，不因 V2 升级损坏。

---

## 18. 本轮暂不做的事情

- 不另建“短剧模式”；
- 不让用户手工创建每个角色/场景；
- 不删除 Product Truth；
- 不删除现有底层 Service；
- 不直接物理删除旧路由；
- 不降低付费授权安全边界；
- 不把研究结果直接提升为产品事实；
- 不用大量内部审计字段继续污染 Seedance Prompt。

---

## 19. 下一步

进入实施级拆解前，先完成：

1. V2 domain schema 设计；
2. ProductionStrategy / ProductionAssetSet schema；
3. V1→V2 兼容边界；
4. UI 信息架构草图；
5. Prompt V2 示例及 linter 规则；
6. E2E 场景矩阵。

完成后再开始修改生产代码。
