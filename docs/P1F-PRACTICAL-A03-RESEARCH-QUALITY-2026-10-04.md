# P1 Final 实用化优化 A-03 — Research Quality Pipeline

日期：2026-10-04  
状态：PASS

## 目标

阻止“平台首页、无关网页、无关图片”等低质量候选直接进入 Research Evidence，并让搜索筛选过程可审计、可解释、可自动恢复。

## 实现

新增：

- `src/application/services/research-source-quality.ts`
- `tests/research-source-quality.test.ts`
- `tests/research-ui.test.ts`

修改：

- `src/application/ports/research-provider.ts`
- `src/application/ports/research-repository.ts`
- `src/adapters/research/public-search-research-provider.ts`
- `src/application/services/research-service.ts`
- `src/web/workbench-ui.ts`
- `tests/public-search-research.test.ts`
- `tests/research.test.ts`

## 质量链路

新的深度研究发现链：

1. Search Provider 保留 URL、标题、摘要、搜索引擎、原始排名和命中 query。
2. Deterministic Candidate Score：
   - 产品名 / 品牌 / 型号 / 类别命中
   - 官方 / 商品页加权
   - 平台首页 / 聚合首页降权
   - 同域名过多降权
   - 无产品身份命中降权
3. Semantic Re-rank：
   - 只判断“与当前产品研究目标的相关度”
   - 不生成产品事实
   - 输出 candidateId 必须来自输入候选
   - AI 失败时自动回退确定性评分
   - 硬拒绝候选不能被 AI 高分救回来
4. Pre-fetch Gate：
   - ACCEPT 直接进入抓取
   - HOLD 在有效候选不足时补位
   - REJECT 不抓取
5. Post-fetch Identity Gate：
   - 对公开发现页抓正文后再核对产品身份
   - 正文仍不匹配则不创建 Evidence
6. Media Identity Gate：
   - 明确 `UNCERTAIN / NOT_PRODUCT` 的媒体分析不再进入主 Evidence
7. Search Recovery：
   - 第一轮没有 ACCEPT 时，自动加强为“官方 / 说明书 / 售后支持 / 商品详情 / 型号参数”等查询再搜索一次
   - 最多两轮
8. Discovery Audit：
   - 保存在现有 `ResearchRun.browserStateJson`
   - 不新增数据库表
   - 记录候选、分数、决策、抓取结果和淘汰原因

## UI

Research 页面新增“搜索质量与淘汰记录”：

- 自动搜索轮次
- 搜索候选数
- 进入抓取数
- 形成证据数
- 淘汰 / 失败数
- 典型淘汰原因
- 高级信息中显示分数和逐轮审计

旧 ResearchRun 没有 `discoveryRounds` 时保持兼容，不显示该卡片。

## 关键回归

已验证：

- Bilibili 首页没有产品身份命中 → 抓取前 REJECT。
- 正确官方说明书 → ACCEPT。
- 泛类别文章不能伪装为强产品匹配。
- 同域名候选过多会降权。
- 抓取正文仍不匹配 → 不进入 Evidence。
- Bilibili 首页即使语义模型给 100 分仍保持硬 REJECT。
- 语义重排可以把真正相关的 HOLD 候选提升为 ACCEPT。
- 第一轮无 ACCEPT → 自动发起第二轮加强搜索。
- Resume / Human Takeover 恢复路径同样经过质量门禁。
- 搜索淘汰记录可以在 Research UI 中解释。

## 自动 Gate

- `npm test`: **271/271 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
- `npx prisma validate`: **PASS**

## 真实页面兼容检查

项目：广西金秀康瑶堂瑶药

- 原有旧 ResearchRun 页面正常打开
- Browser Console：0 error / 0 warning
- 历史 Bilibili Evidence 保留，不做静默删除
- 新质量门禁只作用于后续新 Run / Resume

本次未触发真实外部 AI Research 或付费 Dreamina 调用。

## 结论

A-03 Gate 通过。下一项进入 A-04：建立隔离的 Playwright Browser E2E，使用临时数据库与 Fake Provider，不使用真实 API Key、不产生真实 Dreamina 费用。
