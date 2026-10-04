# Product Video Studio 当前不足与新优化评审（不沿用旧 P2）

日期：2026-10-04  
评审基线：P1 Final / 0.3.0-p1-final  
原则：只看当前真实代码、当前真实页面和最近真实使用暴露的问题；不沿用旧 P2，不重复已经记录的任务，不进入 SaaS / 多租户 / 团队计费等旧扩展方向。

---

## 1. 当前基线核对

本轮实际核对结果：

- P1 Final 当前测试：250/250 PASS
- TypeScript typecheck：PASS
- License Gate：PASS
- Prisma schema validate：PASS
- 当前本机 Web 服务：http://127.0.0.1:3090 可访问
- 已完成真实浏览器主流程走查
- 已存在真实 Seedance 2.0 Mini 生成与最终成片验收记录

因此，本轮不是“补 P1 功能”，而是处理 P1 已经能跑之后暴露出的产品化、研究质量、可观察性、工程治理和最终质量控制问题。

---

## 2. 已经记录的任务——本轮不重复计算

以下属于已经明确记录或正在推进的任务，本轮只保留为依赖，不算“新增优化”：

1. 联网研究自动发现模式继续升级。
2. 抖音高点赞 / 爆款视频发现、拆解与参考。
3. 登录抖音网页后的 Playwright / 浏览器研究路线，不依赖抖音官方 API。
4. 找到视频 URL 后通过可插拔 MediaFetcherProvider 获取可分析素材。
5. 产品图片 / Logo 选择按钮点击无反应问题。
6. 自动剪辑完成后，对“实际生成视频”与“程序自己的剪辑方案”进行逐项对比验收。
7. Dreamina / Seedance 能力一致性与真实生成链继续保持。

---

# 3. 六角色评审结论

## 3.1 产品 / UX 负责人

### 核心判断

当前系统“功能完整度”已经高于“用户旅程完整度”。

真实页面走查发现：

- 用户进入“产品输入”“联网研究”“产品事实”“创意方案”等页面时，顶部仍可能显示“推荐下一步：完成生成前检查并开始视频生成”或“当前要做：运行生成前检查并确认本次生成”。
- 说明页面提示主要读取了项目全局状态，而不是当前页面真实任务。
- 未满足 Timeline 条件时，点击“视频剪辑”会直接看到 HTTP 400、JSON VALIDATION_ERROR 和英文报错。

### 建议

新增统一的 Workflow Navigation State Resolver：

- 当前页状态
- 已完成步骤
- 下一可执行步骤
- 不可进入步骤原因
- 推荐动作
- 恢复动作

全部从同一个状态机生成，禁止每页自己拼提示。

同时新增 Blocked Step 页面：

- 不再暴露原始 400 JSON
- 显示“为什么现在不能进入”
- 告诉用户缺什么
- 提供“一键返回正确步骤”
- 技术错误只放到“高级信息”

---

## 3.2 Research / 数据负责人

### 核心判断

当前研究模块已经有 Evidence、ResearchBrief、Usage Rules 和来源安全边界，但发现质量不足。

真实项目“瑶药护颈枕”的深度研究中出现：

- 哔哩哔哩首页聚合页
- 与产品无关的卡通图
- 与产品无关的游戏宣传图
- 多个失败来源
- 最终没有获得真正可用的产品证据

代码核对发现当前 PublicSearchResearchProvider 的主要逻辑仍是：

- 每个 query 搜索
- 取搜索结果前几条
- 按 URL / query 规则粗分类
- 没有真正的相关性重排
- 没有产品身份分数作为“进入 Evidence 前”的硬阈值
- 没有来源质量与目标产品匹配的综合评分

### 建议新增 Research Quality Pipeline

搜索结果不能直接进入正式研究池，应先经过：

1. Query Reformulation
   - 品牌
   - 型号
   - 产品类别
   - 官方 / 说明书 / 售后 / 商品页 / 平台内容
   - 同义词与中文商品名

2. Candidate Scoring
   - 产品名匹配
   - 品牌 / 型号匹配
   - 标题相关度
   - URL host 可信度
   - 页面正文相关度
   - 是否仅平台首页
   - 是否为列表页 / 聚合页
   - 发布时间 / 新鲜度

3. Semantic Re-rank
   - 对候选结果做语义相关性重排
   - 低于阈值不进入 Evidence

4. Product Identity Gate
   - 图片 / 视频帧 productIdentityMatch != CONFIRMED 时，不得作为产品演示证据
   - 仅可进入“创作氛围参考”候选池

5. Source Quality Gate
   - 官方 / 说明书 / 售后 / 官方商品页优先
   - 平台首页、频道首页、泛资讯聚合页默认降权
   - 同一站点最多保留有限条数，避免证据集中

6. Search Recovery
   - 首轮命中质量低时自动改写关键词再搜
   - 连续两轮仍低质量时再要求用户接管，而不是产出“看起来有研究结果但其实没内容”的报告

---

## 3.3 AI 视频 / 导演负责人

### 核心判断

当前已经解决很多模型能力一致性问题，但缺少一个面向用户的生产预算与质量策略层。

当前真实生成前检查仍会显示：

- 成本信息：暂无法确定
- COST_ESTIMATE_UNKNOWN

对实际生产来说，这意味着用户无法在生成前比较：

- 1 个 15 秒镜头
- 2 个 15 秒镜头
- 不同模型
- 不同分辨率
- 是否值得生成多个版本

### 建议

新增 Generation Budget / Quality Planner：

- 每个镜头预计积分：已知 / 未知
- 项目预计总成本区间
- 已实际消耗积分
- 重试 / 重做累计成本
- 用户可设置本项目预算上限
- 超预算必须再次确认
- 模型之间显示速度、质量等级、最大时长、分辨率、参考素材能力、原生音频能力和已知成本信息

不能自己猜价格，必须明确区分：

- 官方可知
- 历史实测
- 当前未知

---

## 3.4 剪辑 / 音频负责人

### 核心判断

当前 Timeline 技术能力已经比较完整，但还是偏“参数编辑器”，离真正好用的视频工作台还有距离。

现状：

- 有 Trim / 重排 / 音量 / 转场 / 字幕 / CTA / BGM
- 有实时视频预览
- 基础转场和 BGM 最终混音仍需要等最终渲染
- 本机配音依赖 Windows 系统音色
- 当前代码未看到完整 Loudness 标准化工作流

### 建议新增

A. 时间线可视化：

- 视频缩略图轨道
- 音频波形
- 字幕时间块
- 当前播放头
- 吸附 / snapping
- 拖拽 Trim Handle
- 转场可视化

B. 真正的预览合成：

尽可能让以下内容在预览阶段可听 / 可看：

- 转场
- BGM
- ducking
- 旁白
- 字幕
- CTA

避免“页面看起来对，最终 Render 才发现不对”。

C. 音频质量控制：

- VoiceProvider 抽象，不绑定 Windows TTS
- 可插拔高质量 TTS
- LUFS Loudness normalization
- True Peak 检查
- 旁白 / BGM ducking 保留
- 静音段检测
- 音轨缺失提醒
- 最终试听 Gate

---

## 3.5 发布 / 增长负责人

### 核心判断

当前发布中心的能力边界是正确的：

- handoff 不等于 published
- Manual Export 永久兜底
- 外部权限不可用不会伪装成成功

下一步不应该先做复杂运营后台，而应该扩展 PublishProvider 覆盖范围。

### 建议

在已完成当前抖音路线研究后，评估并逐步加入：

- 小红书发布 Provider
- Bilibili 发布 Provider
- 视频号发布 Provider

Provider 必须统一实现：

- capability status
- 登录状态
- human takeover
- upload
- title / description
- cover
- submit
- platform receipt
- publish verification

优先复用浏览器自动化能力；不能确认平台发布结果时，仍只能标记 HANDOFF / SUBMITTED，不能写 PUBLISHED。

---

## 3.6 工程 / QA 负责人

### 核心判断

这里有一个目前最不应该忽略的问题：

当前公司电脑上的 Product-Video-Studio Git 仓库 master 还没有任何 commit，git remote 也为空。

虽然 P0 Freeze 和 Checkpoint 文件夹存在，但当前工作目录本身缺少正常版本基线。

这对继续优化风险很高：

- 无法可靠 diff
- 无法正常回滚
- 无法做 feature branch
- 无法确认“本次优化到底改了什么”
- Checkpoint 文件夹不能替代 Git 历史

### 建议立即建立工程基线

1. 核对当前目录与 GitHub jimwoocory/product-video-studio 的关系
2. 保留 P0 Freeze 不动
3. 当前 0.3.0-p1-final 建立正式 commit / tag
4. 配置 remote
5. 后续每个优化任务单独 branch
6. 合并前必须通过：
   - npm test
   - typecheck
   - License Gate
   - Prisma validate
   - Browser E2E

---

# 4. 新增优化清单

下面这些是本轮真正新增的优化，不包含第 2 节已经记录的任务。

## 优先级 A：建议最先做

### A-01 主流程状态机与导航提示统一

解决：

- 当前页提示错误
- 推荐下一步错误
- 已完成 / 当前 / 下一步状态不一致

验收：

- 任意步骤打开都显示与该页一致的“当前要做”
- 所有 CTA 来自统一 Workflow State
- 回退查看旧步骤时，不把项目最终状态误当成当前页任务

### A-02 所有阻塞步骤改成产品化阻塞页

解决：

- Timeline 直接返回 400 JSON
- 其他深链 URL 未来也可能出现同类问题

验收：

- 浏览器用户看不到原始 API 错误 JSON
- 显示原因、缺失条件、返回正确步骤按钮
- 高级信息中才显示 reasonCode / technical detail

### A-03 Research 搜索结果相关性重排与证据质量门禁

解决：

- 平台首页
- 无关商品
- 无关图片
- 低相关页面进入 Evidence

验收：

- Product Identity / Relevance 不达阈值的候选不得进入主 Evidence
- 至少两级自动搜索改写
- ResearchBrief 中明确显示“有效证据数 / 被淘汰候选数 / 淘汰原因”
- 官方 / 说明书 / 商品页优先排序

### A-04 浏览器级完整 E2E 测试

当前 250 个测试非常强，但代码搜索中几乎没有真正的浏览器旅程测试。

新增 Playwright E2E：

1. 新建项目
2. 上传产品资料
3. 联网研究
4. Product Truth
5. Creative
6. Script
7. Director
8. Generate
9. Review
10. Timeline
11. Render
12. Final
13. Publish fallback

必须额外覆盖：

- 无生成结果时进入 Timeline
- 旧计划 / stale
- provider unavailable
- file upload
- 长任务恢复
- 重复点击

### A-05 正式 Git / Release 基线

当前工作目录必须先建立正常版本历史，再继续大规模优化。

验收：

- 当前 P1 Final 有正式 commit
- 有 tag
- 有 remote
- 工作树可确认 clean / dirty
- 每次优化都可以准确 diff 与 rollback

### A-06 全局任务中心 / 运行状态中心

当前任务状态散在不同页面。

新增统一 Task Center：

- Research
- AI 生成 Product Truth / Creative / Script / Director
- Dreamina 视频生成
- 下载
- 视觉审片
- Auto Edit
- Render
- Publish

每个任务显示：

- 当前阶段
- 进度
- 开始时间
- 已运行时间
- provider
- model
- 是否付费
- 实际成本（若已知）
- 最后一次日志
- Retry / Resume / Cancel
- 是否可安全重试

这样可以彻底减少“点了之后到底有没有在做”的问题。

---

# 5. 优先级 B：第二轮实用性升级

## B-01 项目管理能力

当前项目首页基本只有“继续项目”。

新增：

- 重命名
- 复制项目
- 归档
- 删除
- 导出项目
- 导入项目
- 最近活动时间
- 当前阶段
- 总成本
- 最终成片数量

## B-02 项目诊断 / Health 页面

统一显示：

- AI Provider
- API Key 是否可用
- 当前模型
- Dreamina CLI
- Dreamina 登录状态
- CLI capability fingerprint
- ffmpeg / ffprobe
- 数据库
- Browser Research Provider
- 当前浏览器登录状态
- Publish Providers
- 最近一次真实验证时间

用户不用在不同页面猜“到底哪里没连上”。

## B-03 生成预算与积分账本

新增：

- 每次 Attempt 实际积分变化
- 每个镜头累计成本
- 每个项目累计成本
- 未知成本明确标记
- 历史实测成本
- 预算上限 / 二次确认

## B-04 Timeline 工作台升级

新增：

- 缩略图
- 波形
- 播放头
- 拖拽裁剪
- snapping
- 转场预览
- BGM 预览
- Undo / Redo
- 保存版本
- 与自动剪辑方案 diff

其中“自动剪辑方案 vs 实际成片”已经是已记录任务，本项负责提供可视化基础。

## B-05 音频生产链升级

新增：

- 可插拔 TTS Provider
- 高质量中文音色
- LUFS 标准化
- True Peak 检查
- 静音检测
- 旁白 / BGM / 原声冲突检测
- 自动 ducking 参数可视化
- 最终音频 QC

## B-06 Final QC / 发布前质量检查

在“最终确认”之前自动检查：

- 实际时长
- 分辨率
- 画幅
- 是否有音轨
- 是否异常长静音
- 黑帧
- 冻结帧
- 字幕越界
- CTA 是否被安全区裁切
- 文案乱码
- 产品身份明显变化
- 免责声明是否按规则出现
- 文件可播放性

给出 PASS / WARN / BLOCK。

---

# 6. 优先级 C：完成 A/B 后再考虑

## C-01 多平台 PublishProvider

优先评估：

1. 小红书
2. Bilibili
3. 视频号

不做“假自动发布”，每个平台必须保留 Human Takeover 和真实发布回执边界。

## C-02 创作版本效果比较

对多个 Creative / Script / Generation Variant：

- 钩子强度
- 产品出现时间
- 卖点覆盖率
- 信息密度
- 视频完整度
- 视觉稳定性
- 最终人工选择

用于以后做 A/B 创意，不直接自动决定营销效果。

## C-03 项目数据导出 / 灾备

一键导出：

- Product Input
- Product Truth
- Evidence
- ResearchBrief
- Creative
- Script
- Director Plan
- Prompt
- Generation Attempts
- Reviews
- Timeline
- Final output metadata

用于换电脑、NAS、版本迁移和长期归档。

---

# 7. 团队一致优先顺序

六角色最终一致排序：

1. 先建立 Git / Release 基线
2. 修主流程状态与阻塞页面
3. 升级 Research 结果质量
4. 建立真实 Browser E2E
5. 增加统一任务中心
6. 增加项目 Health / 诊断中心
7. 增加生成成本 / 积分账本
8. 升级 Timeline 可视化与音频
9. 增加 Final QC
10. 再扩展小红书 / Bilibili / 视频号发布 Provider

---

# 8. 本轮不建议做的事情

当前不建议：

- 重做 P1 已经通过的底层架构
- 为了“更 AI”继续增加多个没有闭环的 Agent 页面
- 在 Research 质量没解决前继续扩大抓取数量
- 直接把所有平台发布能力同时开工
- 重新进入旧 P2 的 SaaS / 多租户 / 计费方向
- 用 Checkpoint 文件夹替代 Git 正常版本管理
- 把 HTTP/API 错误直接暴露给普通用户

---

# 9. 建议的新一轮目标

不命名为 P2。

建议暂时叫：

P1 Final · 实用化优化轮

目标不是增加多少新页面，而是：

把已经能跑通的 Product Video Studio，变成用户可以连续使用、看得懂状态、知道下一步、研究结果可信、生成成本可控、剪辑可检查、最终成片可验收的真正生产工具。

建议先执行 A-01 ～ A-06，通过真实浏览器 Gate 后，再进入 B 组。
