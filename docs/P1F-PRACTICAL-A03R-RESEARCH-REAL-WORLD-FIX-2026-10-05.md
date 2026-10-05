# P1 Final 实用化优化 A-03R — Research Real-World Fix

日期：2026-10-05  
状态：PASS

## 触发原因

“广西金秀康瑶堂瑶药 / 瑶药护颈枕”真实深度研究测试暴露出以下问题：

- 新一轮 ResearchRun 失败时，页面仍会读取项目最近一次 READY ResearchBrief，导致“本轮 0 Evidence”却显示旧的“3 条 Evidence”报告。
- 产品身份只依赖 productName / brand / category，未利用型号、公司主体等强身份信息。
- 自动关键词仍带有耳机/电子产品模板痕迹，枕头类会出现“佩戴、安装、防水、充电”等无关搜索词。
- Public Search 在前几个 query 达到 maxTotal 后提前停止，强型号/SKU query 可能根本没有执行机会。
- 来源分类过度依赖 query 文案；“官网”query 可能使电商/普通页面获得错误来源语义。
- 同类/竞品候选和当前产品事实候选没有明确分池，失败反馈也过于原始。

## 本次修复

### 1. Research Brief 与 ResearchRun 强绑定

Research 页面数据改为：

- Evidence：latestRun.id
- ResearchBrief：findBriefByRun(latestRun.id)

失败轮次不再复用上一轮成功 Brief。UI 明确提示“本轮未生成研究报告”，历史报告不会冒充本轮结果。

### 2. Research Identity Fingerprint

在原 productName / brand / category 基础上加入：

- modelTerms：从已确认 Product Truth 文本中提取“型号 / SKU / model”等强身份词。
- organizationTerms：在项目名称符合公司/主体特征时作为主体身份词。
- aliasTerms：从 category 中提取可用别名。

“瑶药护颈枕”真实回归可识别：

- KYTYYZ001
- 广西金秀康瑶堂瑶药
- 瑶药护颈枕
- 草本养生寝具等辅助词

### 3. 强身份门禁

当存在型号、品牌或公司主体等强身份时：

- 只命中通用产品名/品类：最多进入 MARKET_REFERENCE。
- 命中型号，或“公司主体 + 产品名”，或“品牌 + 产品名”：才可确认当前产品。
- 同类商品不会因为标题也叫“瑶药护颈枕”就进入当前产品事实 Evidence。

### 4. 品类自适应 Query Generator

电子/耳机类继续生成：

- 使用方法 / 操作方法
- 佩戴位置 / 安装位置
- 防水 / 充电 / 使用限制
- 参数规格 / 说明书

枕头/寝具/草本类改为：

- 使用方法
- 材质 / 填充 / 配方 / 成分
- 清洗 / 保养 / 注意事项
- 规格 / 型号
- 功能 / 使用场景
- 商品详情

同时优先插入型号和公司主体强身份查询。

### 5. Public Search 均衡执行

旧逻辑：

前几个 query 搜索并不断填满 maxTotal，达到上限后后续 query 不再执行。

新逻辑：

1. 先执行全部 selected queries。
2. 每个 query 保存自己的候选桶。
3. 按 rank 做 round-robin 合并。
4. 最后统一去重并应用 maxTotal。

因此型号/SKU query 不会再因为排在后面而被跳过。

### 6. Host 优先来源分类

来源类型优先根据 URL Host 判断：

- 抖音 / TikTok / YouTube / Bilibili / 小红书 → PLATFORM
- 1688 / 淘宝 / 天猫 / 京东 / Amazon 等 → PUBLIC_PRODUCT

query 中出现“官网”不再覆盖真实 Host 类型。

### 7. 产品事实池 / 市场参考池分离

Discovery Audit 新增：

- PRODUCT_FACT
- MARKET_REFERENCE
- REJECTED

竞品、趋势和只命中通用产品名但未命中强身份的候选进入 MARKET_REFERENCE，不参与当前产品事实抓取和候选事实生成。

Research UI 新增“市场 / 竞品候选”统计和列表。

### 8. 失败反馈

NO_EVIDENCE 不再把大量原始 URL 错误直接堆到主提示中。

现在会说明：

- 是否没有找到可确认属于当前产品的公开证据。
- 找到多少条同类/竞品候选，并明确它们没有写入产品事实。
- 系统已经自动使用产品名、型号、公司主体进行恢复搜索。
- 下一步建议补充官方/商品页 URL，或检查型号/品牌/公司主体。

## 回归覆盖

新增/更新测试包括：

- 强身份存在时，同名同类产品不得成为当前产品 Evidence。
- KYTYYZ001 命中可通过产品身份门禁。
- “瑶药护颈枕”自动生成枕头/寝具关键词，不生成防水、充电、佩戴位置。
- “广西金秀康瑶堂瑶药 + 瑶药护颈枕”进入强身份搜索词。
- Public Search 即使 maxTotal 很小，也必须先执行全部 query。
- 1688 在“官网”query 下仍必须分类为 PUBLIC_PRODUCT。
- 新失败 Run 不得显示旧成功 Run 的 Brief。
- 竞品/趋势 Evidence 不得支撑 Product Truth 候选或使用规则。

## Gate

- npm run typecheck：PASS
- npm test：292 / 292 PASS
- npm run license:gate：PASS
- npx prisma validate：PASS
- git diff --check：PASS

本轮未触发真实 Dreamina 付费生成，也未为通过测试而放宽 Product Identity Gate。
