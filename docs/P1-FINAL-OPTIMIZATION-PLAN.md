# Product Video Studio P1 Final / P1.5 优化方案

版本：0.4.0-p1-final-execution  
方案日期：2026-09-30  
基线：P0 冻结不变；P1-01～P1-07 已完成核心 Gate  
状态：**唯一后续执行基线**（2026-09-30 完成 P1F-00 基线核对）  
定位：完成原 P1 遗留、修复真实使用暴露的问题，并把“智能生成”升级为真正的一键成片能力。  
本阶段不进入 P2 SaaS / 多租户 / 团队计费 / 云端规模化生产。

---

## 1. 总结论

团队一致建议：下一阶段不要继续按页面零散打补丁，而应以 **P1 Final / P1.5** 为统一版本，围绕以下 5 个主目标收口：

1. **Dreamina 能力统一**
   - 模型、命令、画幅、分辨率、时长、音频、素材数量全部来自同一能力注册表。
   - 禁止“UI 选 A，实际提交 B”。
   - 手动模式、标准模式、智能生成共用同一套能力真值。

2. **Research 从“证据”升级到“创作资产”**
   - 深度研究继续负责 Evidence / Product Usage Rules。
   - 新增创作参考素材池，识别产品外观、多视角、佩戴方式、使用动作、场景与视频关键帧。
   - 只有用户确认的素材才能进入后续创作。

3. **智能生成升级为“一键成片”**
   - 不只生成一个视频。
   - 可读取 Product Truth、Research、参考视频、创作参考素材和用户要求。
   - 自动完成创意、剧本、模型适配分镜、Prompt、多镜头生成、自动剪辑、字幕/音频和最终渲染。

4. **自动拆镜 + 自动剪辑成为默认智能能力**
   - 目标时长、参考视频时长超模型/命令限制时不只报错，而是自动拆镜、分段参考。
   - 生成结果自动进入 AutoEditPlan，再落地为可编辑 Timeline。

5. **把用户主流程彻底理顺**
   - 顶部 Stepper 连续编号。
   - 辅助工具与主流程分层。
   - 每页只有一个清晰主 CTA。
   - 所有“下一步按钮没反应、没有按钮、素材不能删除”等真实 UX 缺口统一收口。

---

# 2. 当前基线

## 2.1 已完成能力

### P1-01 易用性与时长
- 中文优先 / 简洁模式
- 10–120 秒项目目标时长
- 生成状态自动刷新

### P1-02 大模型设置
- OpenAI-compatible Provider
- API Key 安全存储
- 模型发现 / 手工录入
- 项目/步骤模型覆盖
- 实际 provider/model/configVersion 审计

### P1-03 Agent / 智能生成基础
- Dreamina Skill
- 动态 CLI help 检查
- text2video / image2video / frames2video / multiframe2video / multimodal2video
- 一次付费确认
- Submit → Poll → Download → Review

### P1-04 参考视频主体
- MP4/MOV 上传
- ffprobe / ffmpeg 抽帧
- ReferenceVideoProfile
- Creative / Script / Director 引用
- Dreamina 视频/音频直参

### P1-05 Research
- OFF / BASIC / DEEP
- Evidence / ResearchBrief
- 自动公开来源发现
- 图片多模态分析
- 视频抽帧多模态分析
- Product Usage Rules
- Research → Product Truth 审核
- Script / Director / Prompt / Preflight 使用规则 Gate

### P1-06 Timeline / Render
- 非破坏式 Timeline
- Trim / 重排 / 删除恢复
- 转场
- 字幕 / CTA
- BGM / 音量
- 基础多轨
- RenderJob
- FINAL_VIDEO 审计

### P1-07 Publish Bridge
- PublishProvider
- SDK/H5/OpenAPI/Manual capability-gated
- PublishPackage
- QR / 一次性 Token
- Mobile Publish Bridge
- handoff != published
- Manual Export 永久兜底

---

# 3. 原 P1 尚未完整落地的内容

## 3.1 参考视频链接输入
原 P1-04 第二阶段要求：
- 粘贴抖音/其他合法可访问视频链接
- 登录/验证码/风控时人工接管
- 获取后进入 ReferenceVideoProfile 或 Dreamina direct reference

当前主体仍以本地 MP4/MOV 上传为主。

## 3.2 真正的 Playwright Browser Research Provider
当前 Research 已具备：
- BrowserResearchProvider 接口
- BLOCKED / Resume
- 公开搜索与 HTTP 抓取

仍缺：
- 可工作的 Playwright 浏览器执行器
- JS 重度页面
- 登录后页面
- 平台内部搜索/详情页
- Human Takeover 完整浏览器会话恢复

## 3.3 Agent 原方案里的画幅可选
原 P1-03 已明确要求：
- 画幅
- 时长
- 视频模型

当前智能生成仍固定 9:16，属于原 P1 未完成项。

## 3.4 移动发布真实 SDK 落地
P1-07 的 Provider/Bridge/Token/状态已经完成。
仍取决于：
- 移动端 Companion 容器
- 抖音应用资质
- SDK capability READY

本阶段继续完善 Bridge 生产化，但不得把外部资质不可用伪装成已完成发布。

---

# 4. 最近真实使用暴露的问题

## 4.1 Dreamina 模型选择不一致
现象：
- UI 选择 Seedance 2.0 Mini
- AUTO 多图时切到 multiframe2video
- multiframe2video 官方命令模型固定，不支持 --model_version
- 最终用户看到的选择与实际运行模型不一致

结论：
这是 **模型一致性 Bug**，优先级 P0/Blocker。

## 4.2 Dreamina 模型列表不完整
官方 CLI 当前已暴露：
- seedance2.0
- seedance2.0fast
- seedance2.0_vip
- seedance2.0fast_vip
- seedance2.0mini
- seedance2.5

当前 UI 只开放 2.0 / Mini，必须改为动态 capability。

## 4.3 画幅与分辨率不可选
官方 CLI 当前可见画幅：
- 1:1
- 3:4
- 16:9
- 4:3
- 9:16
- 21:9

分辨率按模型动态约束：
- Seedance 2.5：480p / 720p / 1080p
- Seedance 2.0 VIP：720p / 1080p / 4K
- 其他模型：以实时 help 为准

## 4.4 生成视频没有声音
当前 GenerationRequest 中存在 generateAudio=true，但 CLI 提交命令没有真正的原生“生成声音”参数。

必须区分：
- 原生模型输出声音
- --audio 参考音频输入
- 后期 BGM / 旁白 / 音效

如果当前 CLI 未开放原生声音输出：
- UI 必须说明
- 一键成片通过 AutoEdit / Timeline 音轨补齐声音
- 不得假装已调用原生音频能力

## 4.5 时长超限只报错
目标时长或参考素材总时长超过命令限制时，应：
- 自动拆镜
- 自动分段参考
- 自动生成多个 Clip
- 后续自动剪辑合并
而不是只 BLOCKED。

## 4.6 素材上传不可管理
当前原生 file input：
- 不能单独删除
- 不可追加管理
- 无缩略图
- 上传失败不够细
- Logo 不能独立替换

## 4.7 生成页缺少批量提交
需要：
- 一键提交全部当前有效 CREATED Attempt
- 本地顺序提交
- 远端异步生成
- 单条失败不阻断其他提交
- 保留每镜头独立授权和审计

## 4.8 生成页完成后没有下一步 CTA
镜头全部“采用/跳过”后应显示：
- 进入视频剪辑

## 4.9 剪辑页底部 CTA 无响应
当前“进入后续检查”需要改为真实：
- 进入最终渲染
并保证：
- 状态变化
- RenderJob 创建/复用
- 重复点击幂等
- 失败中文可见

## 4.10 顶部步骤导航顺序不清晰
当前主流程与参考视频/联网研究/智能生成/模型设置混在一起。

应改为：

主流程：
1 产品输入
2 联网研究（可选）
3 产品事实
4 创意方案
5 脚本
6 导演分镜
7 视频生成
8 视频剪辑
9 成片与发布

辅助工具：
- 参考视频
- 智能生成
- 模型设置

---

# 5. 六角色评审结论

## 5.1 产品 / UX 负责人

### 结论
当前最大问题已不是“功能缺不缺”，而是：
- 用户不知道下一步是什么
- 同一能力在不同页面重复/分叉
- 智能生成名义上“智能”，实际上仍要求用户懂 CLI 限制

### 建议
1. 保留两条入口：
   - 标准流程
   - 智能生成

2. 智能生成再分：
   - 单视频直出
   - 一键成片

3. 所有页面遵守：
   - 一个主 CTA
   - 条件不满足时解释原因
   - 不暴露内部 UUID/枚举
   - 技术信息放高级区

4. 用户确认点固定为：
   - Product Truth / Usage Rules
   - CreativeReferenceSet
   - 真实付费生成
   - 最终成片/发布

5. 研究候选“送入审核”时不应立即打断当前生产链。
   - 推荐：只有用户真正确认新版 Product Truth 后才使旧 Creative/Script/Plan STALE。

---

## 5.2 架构 / 数据负责人

### 结论
下一阶段必须先统一数据源，否则继续堆 UI 会产生三套真值：
- Agent 自己一套
- 标准 Generate 自己一套
- Director/Prompt 又一套

### 建议新增核心模型

#### DreaminaCapabilityRegistry
当前官方 CLI 能力的唯一真值：
- cliVersion
- command
- models
- fixedModel / selectableModels
- ratios
- resolutions
- outputDuration
- input limits
- input media duration limits
- supportsImage / Video / Audio input
- nativeAudioOutput capability
- VIP requirements
- checkedAt
- capabilityFingerprint

#### GenerationProfile
某项目/某次生产计划选定：
- targetModel
- targetCommandStrategy
- aspectRatio
- resolution
- audioStrategy
- targetDuration
- capabilityFingerprint

Director / Prompt / Preflight / Agent / Manual Generate 全部绑定它。

#### ResearchMediaCandidate
研究发现的图片/视频帧候选。

#### CreativeReferenceSet
用户明确采用的创作参考素材版本。

#### SmartGenerationRun
一键成片编排状态：
- PLANNING
- WAITING_FOR_TRUTH_REVIEW
- WAITING_FOR_REFERENCE_REVIEW
- READY_FOR_PAID_CONFIRM
- GENERATING
- AUTO_EDITING
- RENDERING
- REVIEW_READY
- COMPLETED
- BLOCKED
- FAILED

#### AutoEditPlan
AI/规则生成的剪辑决策，最终转换成 Timeline。

### 原则
- 所有对象版本化
- 下游引用 hash
- 上游变化 → STALE
- 不修改历史产物
- 外部副作用必须幂等/可恢复

---

## 5.3 Dreamina / 视频模型负责人

### 结论
必须从“硬编码模型”改成“实时能力驱动”。

### 决策
1. CLI help 是运行时真值。
2. SKILL.md 是能力说明，不是参数真值。
3. UI 不得显示命令不支持的选择。
4. 固定模型命令必须明确显示“固定模型”。
5. 用户选择模型时，AUTO 只能选择能尊重该模型的命令。
6. 提交前强制校验：
   用户选择模型 = GenerationProfile = GenerationRequest = CLI --model_version
7. 不一致直接 BLOCKED。

### 自动拆镜
若：
- 目标成片时长 > 单次输出上限
- 参考视频/音频 > 输入总时长上限
- 单镜头复杂度超过目标模型能力

则创建 MultiClipPlan：
- 自动拆 Clip
- 总时长保持项目目标
- Clip 时长严格落到模型可接受整数/范围
- 长参考视频自动切关键片段或转关键帧

### 批量提交
- 本地 CLI 顺序提交
- Dreamina 后台异步运行
- 每个 Clip 独立 Approval/Attempt
- 批次只做编排，不复用单个授权

---

## 5.4 Research / 多模态负责人

### 结论
Research 目前已能产生“知识”，下一步必须产生“创作资产”。

### 两条数据链必须分开

#### Evidence 链
用于回答：
“这个产品事实/规则有什么证据？”

#### Creative Reference 链
用于回答：
“这个图片/视频帧是否适合给 AI 创作参考？”

不能混为一谈。

### ResearchMediaCandidate 至少包含
- media type
- source URL
- parent Evidence
- source trust
- productIdentityMatch
- clarity
- watermark risk
- duplicate group
- visual angle
- creative role recommendation
- usage/wearing relevance
- risk flags
- status

### 优先类别
- PRIMARY_PRODUCT
- PRODUCT_ANGLE
- WEARING_REFERENCE
- USAGE_ACTION_REFERENCE
- PRODUCT_DETAIL
- SCENE_REFERENCE
- LOGO_REFERENCE
- PACKAGING_REFERENCE
- VIDEO_KEYFRAME

### 视频关键帧
从“均匀抽帧”升级为：
- 均匀采样
- scene cut
- 产品首次出现
- 动作变化
- 使用步骤
- 多视角
- 关键状态
并去除高度重复帧。

### Playwright
作为原 P1 遗留补齐：
- 搜索
- JS 页面
- 登录态
- Human Takeover
- Resume
但平台阻塞不能拖垮官网/公开网页 Research。

---

## 5.5 剪辑 / 成片负责人

### 结论
Timeline 已具备执行能力，缺的是“自动决策层”。

### 新增 AutoEditPlan
输入：
- Script
- ProductionPlan
- Accepted GeneratedVideo
- ReferenceVideoProfile
- Product Usage Rules
- CreativeReferenceSet
- BGM / narration / captions

输出：
- clip selection
- sourceArtifactId
- inMs / outMs
- order
- transition
- source volume
- BGM
- captions
- CTA
- rationale

### 分两层

#### 规则层
确定性执行：
- 按导演顺序
- Trim
- 对齐目标时长
- 转场
- 字幕
- 音量
- BGM
- Render

#### AI层
判断：
- 一个生成视频哪几秒最好
- 多版本哪个更适合
- 动作是否完整
- 产品是否稳定
- 是否穿帮
- 切点是否更合理

AI 只能产出 AutoEditPlan，不直接改原视频。

---

## 5.6 QA / 发布 / 安全负责人

### 必须保留的硬 Gate
1. Product Truth 未确认 → 不进入事实型创作
2. Usage Rule 冲突 → BLOCKED
3. CreativeReferenceSet 未确认 → 研究素材不得自动用于生成
4. 模型/命令不一致 → BLOCKED
5. Provider capability drift → 旧授权 STALE
6. 真实扣费前 → 一次显式确认
7. Submission Outcome Unknown → 禁止自动重提
8. 发布 handoff != published

### E2E 原则
- 不使用伪任务 ID
- 不用 mock 替代最终真实 Gate
- 付费真实生成必须得到用户明确确认
- 所有生成/渲染/发布结果都有 Artifact/hash 审计
- P0 冻结包继续不变

---

# 6. 统一目标产品流程

## 6.1 标准模式

```text
1 产品输入
→ 2 联网研究（可选）
→ 创作参考素材池审核（可选）
→ 3 产品事实 / 使用规则审核
→ 4 创意方案
→ 5 脚本
→ 选择目标 Dreamina GenerationProfile
→ 6 导演分镜（模型感知）
→ 7 视频生成
→ 审片/采用/跳过
→ 8 视频剪辑
   ├─ 自动剪辑
   └─ 手工微调
→ 最终渲染
→ 9 成片与发布
```

辅助工具：
- 参考视频
- 智能生成
- 模型设置

---

## 6.2 智能生成：单视频直出

```text
选择 Skill / AUTO
→ 选择目标模型
→ 选择画幅 / 分辨率 / 声音策略
→ 上传/选择素材
→ 材料与 capability 检查
→ 自动选择可尊重目标模型的命令
→ 付费确认
→ Submit / Poll / Download
→ 审片
```

---

## 6.3 智能生成：一键成片

```text
用户一句自然语言要求
+ 当前 Product Truth
+ Usage Rules
+ ResearchBrief
+ CreativeReferenceSet
+ ReferenceVideoProfile
+ 用户素材

→ 任务理解
→ 必要 Research 增强
→ 如出现新事实候选：暂停等待事实审核
→ 创意
→ 剧本
→ 选择/确认 GenerationProfile
→ 模型感知 Director
→ 自动拆镜
→ 模型专用 Prompt
→ 一次付费确认
→ 批量顺序 Submit
→ 自动 Poll / Download
→ 自动审片辅助
→ AutoEditPlan
→ Timeline
→ 自动字幕 / BGM / 旁白 / 音效
→ RenderEngine
→ 最终成片预览
→ 发布
```

---

# 7. 正式开发阶段划分

## P1F-00：文档与状态收口

### 2026-09-30 实际核对结果
- P1F-00 首次核对时 migration 为 18 个；进入 P1F-02 后新增 `20260930041633_p1f02_generation_profile`，当前共 19 个且数据库 schema up to date。
- P1F-00 首次基线测试为 143/143 PASS；P1F-01 收口后的当前全量测试为 149/149 PASS。
- License Gate：PASS（packages=35，external_runtimes=4）。
- P0 冻结源码 ZIP SHA256：`01F7B2678484D058A87F25D5964F011E7E1F5963E35617A6D71443AFA5775C3A`。
- P0 冻结运行数据 ZIP SHA256：`117282505061104070B2610868D7A5FC9994C590A185D6E2535DB77B8A128485`。
- 上述两个 SHA256 与 `P0-FREEZE-CHECKSUMS.txt` 完全一致；冻结目录未修改。

### 目标
- 更新 P1-GOAL / P1-PLAN 状态
- 明确 P1-06 / P1-07 已完成
- 建立本 P1 Final 文档为唯一后续执行基线
- P0 Freeze 再校验

### Gate
- 文档无冲突
- 活跃任务映射清楚
- P0 hash 不变

---

## P1F-01：流程 UX 与高频 Bug 收口

### 2026-09-30 实施与验收结果
- 顶部导航已重构为 1～9 主流程；参考视频 / 智能生成 / 模型设置移入辅助工具区；联网研究明确标记“可选”。
- 当前页面、已完成、下一步、可选状态已区分；修复 `READY_TO_ASSEMBLE` 时误把“成片与发布”标为下一步的问题。
- 视频生成页在真实 `READY_TO_ASSEMBLE` 条件下显示“进入视频剪辑”，隔离副本实际点击已进入 Timeline。
- 视频剪辑页已使用“进入最终渲染”；实际点击会调用 `POST /api/projects/:id/final/render`，隔离副本真实渲染成功并进入成片页，生成可下载 MP4。
- 手动产品输入、智能生成新建任务、智能生成已有未付费任务已统一使用同一套素材管理组件：预览/类型图标、继续追加、上移/下移排序、单项替换、单项删除、清空；Logo 独立支持替换/删除。
- 已创建但尚未付费提交的 AgentTask（DRAFT / NEEDS_MATERIAL / READY_TO_CONFIRM）可编辑素材；保存后重新规划并创建新的 GenerationRequest/requestHash，旧 GenerationRequest/Preflight/ACTIVE Approval 按单 Request 精确置为 STALE；进入确认提交/生成后禁止修改素材。
- 智能生成与手动产品输入均在提交前显示具体文件名、中文错误原因并阻断不可用文件；服务端上传错误同样包含文件名与中文原因；视频/音频时长继续在付费提交前由 Dreamina capability 校验。
- 隔离 API 实测：旧 request `c9dd…1105` 从 CURRENT→STALE，旧 Preflight PASS→STALE；新 request `f08a…43c3` 为 CURRENT，requestHash 从 `2d453b…1597` 变为 `82875f…b2cd`，新 Preflight=PASS。该验收只执行 capability/account/estimate，不执行 Dreamina submit，不消耗积分。
- 全量测试：149/149 PASS；build PASS；License Gate PASS（packages=35，external_runtimes=4）；当前 19 个 migration 全部已应用。
- 页面验收使用真实 3090 页面与本地隔离 3091 副本完成；CTA / Render / 素材管理 / 排序 / 任务级素材重规划均已验证，不修改真实项目，不执行付费 Dreamina 生成。

### 内容
- 顶部流程导航重构
- 生成页“进入视频剪辑”
- 剪辑页“进入最终渲染”无响应修复
- 统一 CTA
- 素材上传卡片
- 单删 / 清空 / 追加 / 替换
- Logo 独立管理
- 错误逐文件中文显示

### 原因
这些都是高频阻塞，不需要等待智能生成 2.0 全部完成。

### Gate
- 真实页面逐项点击验收
- 不存在静默失败
- 上传错误有文件级定位
- 下一步 CTA 全部可达

---

## P1F-02：DreaminaCapabilityRegistry + GenerationProfile

### 内容
- 动态模型
- 动态命令
- 固定模型标识
- 画幅
- 分辨率
- 时长
- 素材数量
- 输入媒体时长
- VIP
- 音频输入
- 原生声音能力探测
- capability fingerprint

### 同步修复
- Mini → 固定模型错误
- AUTO 命令选择必须尊重用户选定模型
- 手动/智能/标准生成统一能力

### Gate
至少真实检查：
- seedance2.0mini
- seedance2.0
- seedance2.0fast
- seedance2.0_vip
- seedance2.0fast_vip
- seedance2.5
以当前 CLI help 为准。

不要求全部进行付费真实生成，但 capability/command 必须真实验证。

---

## P1F-03：Research 资产化

### 内容
- Playwright Browser Research Provider
- 参考视频链接输入
- ResearchMediaCandidate
- 视频关键帧抽取/去重
- 产品多视角识别
- 佩戴/使用动作识别
- 创作参考素材池 UI
- CreativeReferenceSet

### Gate
真实产品完成：
- 官网图片候选
- 视频抽帧候选
- 不同视角候选
- 佩戴/使用候选
- 用户确认 ReferenceSet
- Director/Prompt 能读取

---

## P1F-04：模型感知 Director + 自动拆镜

### 内容
- GenerationProfile 前置到 Director
- 不同模型的 Clip 数量/时长/复杂度策略
- Prompt 模板按模型
- 目标时长超限自动拆镜
- 参考视频超限自动分段/关键帧
- 模型切换触发 Plan/Prompt STALE

### Gate
至少验证：
- 15s
- 30s
- 60s
三个项目目标能在不同模型能力限制下自动得到可提交 Clip 计划。

---

## P1F-05：批量生成编排

### 内容
- 一键提交全部待生成镜头
- BatchGeneration orchestration
- 本地顺序 submit
- 远端异步执行
- 自动 poll / download
- 单镜头失败隔离
- 重做/跳过
- 统一一次总付费确认视图

### Gate
- 不重复扣费
- old/superseded Attempt 不提交
- partial failure 可恢复
- 页面显示逐镜头结果

---

## P1F-06：自动剪辑 / 一键成片

### 内容
- AutoEditPlan
- 自动选择最好区间
- 自动 Trim
- 自动镜头顺序
- 自动节奏
- 转场
- 字幕
- CTA
- BGM
- 旁白
- 音效
- Ducking
- Timeline 可人工微调
- RenderEngine 最终成片

### Gate
从 Product Truth 到 FINAL_VIDEO 完成一条完整一键成片 E2E。

真实 Dreamina 付费执行前必须再次得到用户确认。

---

## P1F-07：发布与最终产品收口

### 内容
- Mobile Publish Bridge 生产化
- 若 SDK/资质 READY：真实 Companion + Douyin SDK
- 若外部条件不具备：明确 capability blocker，Manual/H5 保持可用
- Final 页面流程收口
- 全站导航收口
- 文档与版本号收口

### Gate
- 成片一定可下载
- handoff 状态准确
- 不虚假标记 PUBLISHED
- 外部资质缺失不阻断成片生产

---

# 8. 依赖关系

```text
P1F-01 UX/Bug
       │
       ├─────────────────────────┐
       ▼                         ▼
P1F-02 Capability         P1F-03 Research Assets
       │                         │
       └────────────┬────────────┘
                    ▼
          P1F-04 Model-aware Director
                    │
                    ▼
          P1F-05 Batch Generation
                    │
                    ▼
          P1F-06 Auto Edit / One-click
                    │
                    ▼
          P1F-07 Final / Publish
```

P1F-01 可以先做，不需要等后面架构升级。

---

# 9. 活跃任务映射

| 当前任务 | 并入阶段 |
|---|---|
| 智能生成 2.0 全链路重构 | P1F-02 / 04 / 05 / 06 |
| 深度研究创作参考素材池 | P1F-03 |
| 修复素材上传与删除 | P1F-01 |
| 重构顶部流程导航 | P1F-01 / P1F-07 |
| 批量提交待生成镜头 | P1F-05 |
| 生成页补下一步按钮 | P1F-01 |
| 修复剪辑页下一步按钮 | P1F-01 |

避免重复开发：这些任务保留历史，但实施时由 P1 Final 主计划统一调度。

---

# 10. 必须新增/扩展的数据对象

## DreaminaCapabilityRegistry
- providerIdentity
- cliVersion
- command
- models
- fixedModel
- ratios
- resolutions
- outputDurationRange
- inputLimits
- inputMediaDuration
- supportsNativeAudioOutput
- capabilityFingerprint
- checkedAt

## GenerationProfile
- id
- projectId
- targetModel
- commandStrategy
- aspectRatio
- resolution
- audioStrategy
- targetDurationMs
- capabilityFingerprint
- status
- contentHash

## ResearchMediaCandidate
- sourceEvidenceId
- mediaArtifact/sourceUrl
- mediaType
- timestampMs?
- productIdentityMatch
- visualAngle
- clarity
- duplicateGroup
- watermarkRisk
- recommendedRoles
- riskFlags
- status

## CreativeReferenceSet
- version
- selected candidate refs
- role bindings
- userConfirmedAt
- contentHash

## SmartGenerationRun
- source refs
- currentStage
- blockers
- generationProfileRef
- truthRef
- creativeReferenceSetRef
- scriptRef
- productionPlanRef
- generation batch refs
- autoEditPlanRef
- timelineRef
- finalOutputRef

## AutoEditPlan
- source videos
- selected ranges
- ordering
- transitions
- captions
- audio decisions
- rationale
- contentHash

---

# 11. 统一安全与真实性约束

## 11.1 Product Truth
Research 不得静默提升为事实。

## 11.2 Usage Rules
确认后的：
- 佩戴位置
- 使用方法
- 注意事项
- 防水/充电限制
- 功能作用
- 使用场景

必须贯穿：
Creative → Script → Director → Prompt → Generation → AutoEdit。

## 11.3 Creative Reference
Research 找到的图片/视频帧必须由用户确认才能进入生成参考。

## 11.4 模型一致性
禁止：
UI Seedance A → Plan B → CLI C。

## 11.5 付费
任何真实积分消耗必须存在用户明确确认。

## 11.6 幂等
Submit / Download / Render / Publish 都不得因刷新或重复点击产生重复副作用。

---

# 12. P2 明确不进入本阶段

以下继续保留给 P2：

- 多租户 SaaS
- 团队 Workspace
- RBAC 权限
- 套餐/订阅/计费
- 多客户隔离
- 云端 Worker 集群
- 大规模批量生产
- 多品牌并发
- 多账号内容运营
- 企业级审批流
- 云对象存储/CDN
- 运营数据分析平台
- 多平台规模化发布

P1 Final 目标仍然是：

> **单用户在一台机器/单一项目工作区内，能稳定地从真实产品资料直接得到高质量、可审计、可修改、可发布的最终视频。**

---

# 13. P1 Final 最终验收定义

P1 Final 只有同时满足以下条件才能关闭：

1. 标准模式全流程可用。
2. 智能生成单视频直出可用。
3. 智能生成一键成片可用。
4. Dreamina 模型/命令/画幅/分辨率/时长一致。
5. 不再存在静默模型替换。
6. 超时长自动拆镜。
7. 长参考自动分段/关键帧化。
8. Research 可形成用户确认的 CreativeReferenceSet。
9. Product Usage Rules 全链强约束。
10. 多镜头可一键批量提交。
11. 自动剪辑可生成 AutoEditPlan + Timeline。
12. 用户仍可手工修改 Timeline。
13. 最终 Render MP4 可播放、可追溯。
14. 生成/剪辑页面下一步 CTA 全部可达。
15. 素材可预览、追加、删除、替换。
16. P0 Frozen 基线不变。
17. 全量测试通过。
18. License Gate 通过。
19. 至少完成一次真实完整 E2E。
20. 真实付费 E2E 必须在用户明确批准后执行。

---

# 14. 开发顺序决策

正式顺序：

1. **P1F-00 文档/状态收口**
2. **P1F-01 UX + Bug 收口**
3. **P1F-02 Dreamina 能力注册表**
4. **P1F-03 Research 创作资产**
5. **P1F-04 模型感知 Director + 自动拆镜**
6. **P1F-05 批量生成**
7. **P1F-06 自动剪辑 + 一键成片**
8. **P1F-07 发布/产品收口**

原则：

> 先统一能力真值，再做自动化；  
> 先保证真实性和可恢复，再追求“一键”；  
> AI 负责规划和判断，确定性服务负责真正执行。

---

# 15. 2026-09-30 断点接续执行记录

主任务 `tsk_64b596d359821bcb` 的 `prompt` 子步骤已完成本轮实现与代码验证：模型选择前置、GenerationTarget 绑定、模型时长拆镜、Prompt/GenerationProfile 一致性、能力漂移及旧授权保护、导演/生成页面联动；另修复浏览器发现的导演编辑器换行转义错误。

验证：接手基线 153/153；更新后全量 172/172 PASS；License Gate PASS；Prisma 19 个迁移只读检查一致；隔离 HTTP 8 项和浏览器 8 项 PASS；本机真实 CLI 能力只读适配 PASS。未执行真实付费视频生成，也未执行完整真实成片验收。

执行证据与重跑方法见 [模型感知导演与 Prompt 接续记录](./P1F02-PROMPT-RESUME-2026-09-30.md)。源码/编译产物已更新，正式 3090 服务保留原进程，尚未切换加载新实现。

下一断点为主任务 `pipeline`。创作参考素材池 `tsk_48d1703c63b3f2e3`、批量提交 `tsk_f61fb52424d218a7` 均继续保留，不重复建任务。`pipeline`、`auto-edit` 和任务级最终 `tests` 未完成；本记录不关闭 P1F-02 主任务，不变更第 14 节的整体收口顺序，也不宣告 P1 Final / P1.5 完成。

### 2026-09-30 公司连接恢复后：pipeline / 批量的阶段实现

- 已新增持久化编排状态机、实际 P1 服务适配、中文一键成片工作台、只读状态轮询和应用后台 worker。
- 规划/产品事实与研究审核/创意和脚本分镜审核/独立费用范围均保留；AUTO 创作不代替事实、付费和最终成片确认。
- 批量原任务已接实际 API 和生成页按钮，逐镜头独立审批、顺序提交、过期/旧/替代/跳过过滤；实际提交使用 SQL 原子领取，重复请求不重复提交。查询下载串行化与已下载产物幂等复用已补。
- 最终隔离全量回归 **190/190 PASS**，类型检查/build/License Gate PASS；20 个迁移已在独立 SQLite 应用。生产数据库仍未应用新增第 20 个迁移。
- 实际应用服务 + 隔离 SQLite + HTTP 集成 **15 项 PASS**；智能工作台浏览器 **8 项 PASS**、批量生成页浏览器 **6 项 PASS**。AI/视频 Provider 均为测试替身，视频是本地编码夹具，真实付费提交 **0**；不等同真实完整成片 E2E。
- 流程在缺少 AutoEdit 回调时明确停在 `AUTO_EDIT_NOT_READY`，未伪造 FINAL_VIDEO。`pipeline` 仍 in_progress；`auto-edit`、素材池、长参考分段及最终真实 Gate 未完成。正式 3090 服务未重启，现有页面尚未加载本轮实现。
- 执行详情、证据、重跑及下一断点见 `docs/P1F02-PIPELINE-RESUME-2026-09-30.md`。P0 两份冻结包 SHA256 复核不变，未重复创建任务。

### 2026-09-30 17:07：规则自动剪辑 / 音轨 / 正式环境更新

- 已复核并接续之前未收口的 AutoEditPlan、非破坏式 Timeline、字幕/CTA、多音轨、本机中文配音及 FFmpeg 渲染。局部替换原声、连续语音背景音乐包络、决策缓存版本、旧计划画幅继承、旧成片实际完整性复核已补强。
- 浏览器发现“开始规划”被默认音量 0.22 与 step=0.05 冲突阻断，已修复并增加原生表单数值约束回归。
- 最终隔离全量 **209/209 PASS**；类型检查、构建、License Gate（35/5）通过。实际 SQLite + 本地中文 TTS + FFmpeg 的 **30 秒、1280×720、有音轨和字幕**渲染集成 24 项通过；浏览器从创建、付费边界、审片、缺声暂停、配音设置到播放、最终确认和 COMPLETED 全程通过，0 页面脚本错误。
- 上游 AI 和即梦视频均为隔离测试替身，**真实即梦付费提交为 0**。这不是总目标所要求的真实付费完整 E2E，也不代表视觉 AI 已完成最佳片段选择。
- **正式 3090 页面现在已加载本轮更新。** 在确认没有运行中生成/研究/渲染后，先做一致性私有备份，再应用第 20 个新增迁移。原有 30 张业务表迁移前后内容摘要完全相同；2 个项目及原审批、生成、审片和研究记录保留，9 条 CREATED 和 2 条 QUEUED 未自动执行。正式智能/自动剪辑页面与本机音色读取只读验收通过。
- 备份目录为 `Product-Video-Studio-Checkpoints/P1F02-before-runtime-update-1790758793135`。当前服务会话 `session-57789b2e9f2c5aaa548b12fa`，PID 23200，工具托管上限 24 小时；不是永久 Windows 服务，也不是后台持续开发进程。P0 两份冻结 ZIP 校验不变。
- 仍需继续素材池 / CreativeReferenceSet、长参考素材分段、视觉 AI 剪辑判断、整体 UX / 发布和用户明确授权后的真实最终 Gate。**不关闭 P1F-02、P1F-06 或 P1 Final / P1.5。** 详细边界、证据与重跑方式见 `docs/P1F02-AUTOEDIT-RESUME-2026-09-30.md`。

### 2026-09-30 18:12：P1F-03 素材池实现、引用链与部署

- 原任务 `tsk_48d1703c63b3f2e3` 的 schema/analyze/ui/flow/gate 已完成本轮实现与隔离验证；tests 保持进行中，真实产品来源及真实视觉模型的素材池 E2E 尚未完成。
- 已补齐四个增量数据模型，留存原始媒体与候选帧，加入主图双图比对、身份/水印/清晰度/使用规则门禁、显式 seek 时间定位和高度重复帧过滤。候选不混入普通 Evidence 或产品事实。
- 中文素材池支持单条和批量审核，只有明确确认使用权及角色的素材进入版本化 CreativeReferenceSet。引用贯穿创意、脚本、导演、Prompt、Preflight、提交前校验和 SmartRun；集合变化使旧标准链失效，不自动重用旧付费确认，也不误作废独立单视频 Agent 请求。
- 最终全量隔离 **218/218 PASS**，类型检查/build/License Gate PASS（35/5）；新增 9 项专项测试；隔离真实浏览器 9 项 PASS，正式页面只读浏览器 4 项 PASS，0 pageerror。视觉模型和视频上游使用测试替身，真实 AI 请求和即梦付费提交均为 0。
- 正式 3090 已加载素材池与研究页入口。备份后只应用第 21 个迁移，原有 **32 张业务表的行数和内容摘要完全不变**。历史测试项目缺少主图时显示可读阻塞，不修改旧资料或绕过检查。
- 本轮正式会话 `session-0f63ed6d0fc336199de5b3a5`，PID 22400；仍是 24 小时应用托管，不是持续开发进程。P0 两个 ZIP 校验不变。
- 详细实现、证据、测试边界和下一断点见 `docs/P1F03-REFERENCE-POOL-RESUME-2026-09-30.md`。剩余真实素材池 Gate、长参考分段/模型分配、视觉 AI 剪辑层、最终发布与授权后的真实成片验收继续保留，不宣告整个 P1 Final/P1.5 完成。

### 2026-10-04：P1F-07 Final / Publish 产品收口

- Final 页面新增最终交付状态，最终 MP4 必须存在、READY、hash 与 FinalAssembly 一致且 Assembly 已 ACCEPTED，才允许进入发布包流程；项目状态本身不能替代真实文件完整性。
- Publish Center 增加 Provider 能力总览与模式标签；SDK/H5/OpenAPI 不可用时明确显示 capability blocker，但 Manual Export 仍作为不依赖平台资质的成片交付兜底。
- 当当前外部 Provider 不可用时提供切换到“下载 MP4 / 手动发布”的入口；HANDOFF / 扫码 / 唤起继续明确不等于 PUBLISHED，只有可信 PUBLISHED_CONFIRMED 回执可标记发布完成。
- 新 Publish Center 可用时，Final 页面只隐藏旧式 `publish.douyin.oauth` Provider blocker 的重复展示，不删除历史记录；Artifact 完整性等真实 blocker 继续保留。
- 主流程导航与 Final 下一步提示已按真实状态收口；版本升级为 **0.3.0-p1-final-rc.1**。由于真实完整 E2E 尚未完成，保持 RC，不标为正式 Final。
- P1F-07 专项 **20/20 PASS**；最终全量隔离 **237/237 PASS**，TypeScript typecheck/build/Prisma validate/License Gate（35/5）均通过。
- 正式 3090 已加载 RC，`/health` 返回 `P1-0.3.0-p1-final-rc.1`；真实浏览器只读验收 0 error / 0 warning。旧 P0 测试项目缺失 Final Artifact 时现在明确禁止创建发布包，并只保留真实 Artifact blocker。
- P0 source/runtime 冻结 ZIP SHA256 复核不变。
- 详细证据见 `docs/P1F07-FINAL-PUBLISH-RESUME-2026-10-04.md`。
- **P1 Final 仍不关闭。** 剩余 Gate 为真实产品来源 + 实际视觉模型的素材池 E2E，以及用户明确批准后使用真实 Dreamina 完成一次完整付费成片 E2E。

### 2026-10-04：真实 Dreamina E2E / RC2 文字后期化

- 真实素材池 Gate 已完成并关闭独立任务：Tonemay 官方来源实际调用 AIHubMix → `gpt-6-luna` 视觉模型；不合格 150×178 / 身份不确定候选被正确 BLOCKED，未进入 CreativeReferenceSet 或生成链。
- 用户对精确 paidScope 明确授权后，Tonemay Smart Run `173d2ead-7480-478e-91fd-9101efae19cf` 使用 Seedance 2.0 Mini / 720p / 9:16 / 15 秒 / 1 请求执行真实 Dreamina E2E。
- 首次提交暴露 OAuth 失效检测与失败分类缺陷：`user_id=0` 曾被旧账号正则误判已登录；明确的 `current account is not allowed to use dreamina_cli` 曾被误归为 UNKNOWN。RC2 已改为非零 user_id 才是 AUTHENTICATED，并将该权限拒绝分类为终态 FAILED，补真实格式回归。
- 使用官方 `dreamina relogin --headless` 完成 CLI OAuth；恢复后 user_id `4121392829182957`、maestro、积分 14252。严格核对首次 UNKNOWN 没有 submit_id/provider handle/submittedAt/output 后，仅复用同一 Attempt/consent/scope 重试一次，没有创建第二个付费范围。
- 真实提交成功：submit_id `c5745cdd-e68e-40f4-b55c-e80cc0d23264`；平台 `gen_status=success`；实际输出 720×1280、15.042 秒；实际扣费 **90 积分**；当前余额 14162。输出 Artifact `f2e45c34-5a26-4f83-8c07-bd592cd5fd94` READY，SHA256 `48d4c9d755d78234491ef5dfc53beaf4ade7beb4ad60e82cc82cbed288c34c84`。
- 视觉 AI 正确停在 `WAITING_FOR_CLIP_REVIEW`，未自动 ACCEPT/REDO：产品外形总体相符、后段稳定，但字幕重复。人工抽帧还确认收尾品牌被生成成 `Tonmay Q8` 而非 `Tonemay Q8`，因此该成片不能作为质量 Gate 通过。
- 真实 E2E 证明视频模型不应直接烧录准确文案。RC2 新增 Segment `postProductionText`（LABEL/LEGAL/CAPTION/CTA），精确文字、时间、位置、字号和 Beat/Fact 引用进入后期文字轨；Director 与 Prompt Compiler 共同阻断“屏幕文字/字幕打出/型号文字”等视觉烧字指令。
- 模型感知 Prompt 模板升级为 `v2-posttext`，写入 `readable_text_policy=POST_PRODUCTION_ONLY`；Dreamina 只接收预留干净文字安全区，不接收 cue 精确文案。AutoEdit 精确渲染 LABEL/LEGAL；CAPTION/CTA 分别遵守用户开关，并避免重复 CTA。
- RC2 相关专项 **38/38 PASS**；最终全量隔离 **242/242 PASS**，0 fail/skip/todo；typecheck/build/License Gate（35/5）均通过。无新增数据库迁移。正式 3090 已加载 **0.3.0-p1-final-rc.2**。
- 当前第一次真实付费请求已经完成，但内容质量 Gate 未通过。任何 REDO 都属于新的付费范围，原授权明确不含重做/新增镜头，因此 P1 Final 继续保持未关闭，等待用户对重做决定和新 paidScope 的明确授权。
- 详细证据见 `docs/P1F08-REAL-DREAMINA-E2E-2026-10-04.md`。

### 2026-10-04：P1 Final 正式关闭 / 0.3.0-p1-final

- RC3 真实收尾任务 `b122fd88-904a-42f5-8f7c-77c0619f79ce` 在用户明确付费授权后，使用 Seedance 2.0 Mini / multimodal2video / 720p / 9:16 / 15s 执行真实 Dreamina 请求；Attempt `912d0d90-d595-4f3c-825b-9e3c9075f73c` 成功，submit id `a7db9694-73fe-4907-bb71-7e90a6e2844d`，实际扣费 90 积分。
- 视觉 AI 未将低置信且末帧有错误文字/图标的源视频自动 ACCEPT；用户人工确认采用后，RC4 增加 hash 绑定的非破坏式 `repairMasks` 与 segment-scoped `textPositionOverrides`。原始 Dreamina Artifact 保留不变，RenderEngine 对 mask 源 Artifact ID/SHA256 再校验。
- 最终 Timeline `timeline-3cf812a6d9bd355e87ac79e0b38df564475e476c3896c03bd331b9967155d6b0`，Final Artifact `96913ad7-8df1-46c2-b1e7-8fb34932fb48`，SHA256 `e376ae5d72782f198be32669a1e03047b4ae429a01eabd1d47069b27b670e4ea`；实际媒体 15.000s、720×1280、H.264 + AAC。
- 用户已在 Final 页面明确接受最终成片；FinalAssembly 为 ACCEPTED，项目状态为 READY_TO_PUBLISH，Smart Run 已同步为 COMPLETED。
- RC4 全量隔离回归 **244/244 PASS**，0 fail/skip/todo；遮罩/Render 专项 **20/20 PASS**；typecheck/build/Prisma validate/License Gate（35/5）均通过。
- P0 冻结 source/runtime ZIP SHA256 再次只读复核，与冻结基线完全一致。
- 版本从 RC4 正式提升为 **0.3.0-p1-final**。**P1 Final Gate 已全部满足并正式关闭。**
- 最终证据：`docs/P1F09-P1-FINAL-CLOSEOUT-2026-10-04.md`。
