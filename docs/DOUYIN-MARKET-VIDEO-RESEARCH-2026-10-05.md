# 抖音竞品 / 爆款视频研究实现记录（2026-10-05）

## 1. 目标

把“当前产品事实研究”和“市场 / 竞品视频研究”拆成两条独立链：

- Product Evidence：继续执行严格产品身份校验，只能进入 Product Truth 候选。
- Market Video Research：按同品类关键词发现公开视频，优先高点赞候选；只有用户明确选择后才获取素材并生成 ReferenceVideoProfile。
- 竞品视频不得升级为当前产品事实，只允许学习结构、节奏、镜头语言、卖点组织、音频组织和 CTA 方法。

## 2. 当前 Provider

### DouyinCliMarketVideoSearchProvider

当前本机开发环境使用外部运行时：

- upstream: https://github.com/Youhai020616/douyin/tree/v0.2.2
- tag: v0.2.2
- commit: 15d5818d3d75edf19b266263539bcd0b7fb46423
- license: MIT
- 安装位置由外部 AgentDock 环境维护，不随 Product Video Studio 分发。

支持：

- 关键词视频搜索
- 综合 / 高点赞优先 / 最新发布
- 不限 / 一天内 / 一周内 / 半年内
- 点赞、评论、分享、播放等字段按实际返回展示；缺失字段显示不可用，不推算
- 未登录、验证码、风控、运行时缺失均 fail closed

### MarketVideoMediaFetcher

媒体获取通过独立接口 MarketVideoMediaFetcher 完成。当前实现只在用户明确点击“拆解为创作参考”后调用 dy-cli 获取媒体链接，再由 Product Video Studio 做 URL 安全检查、重定向复检和大小限制后写入不可变 Artifact。

搜索阶段不会自动下载全部候选。

## 3. 官方 OpenAPI 评估

抖音开放平台当前存在“抖音视频搜索”接口：

- HTTP: GET https://open.douyin.com/dy_open_api/v1/search/video/
- Scope: aweme.dy.video_search
- API 文档: https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/douyin-search-capability/
- 能力说明: https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/search-management/item-search
- 产品页: https://developer.open-douyin.com/product/search

2026-10-05 核查结果：

1. API 参考页仍列出 aweme.dy.video_search，并标注“抖音视频垂搜（对外）”。
2. 能力说明页同时写明“该能力为实验能力，现不对外开放”。
3. 产品页写“抖音搜索能力正式开放”，但入口仍是“申请内测”，需要审批。
4. 因官方页面本身存在开放状态表述不一致，当前不能把它视为无需申请即可稳定获得的基础能力。
5. 官方搜索能力使用规范明确限制对平台资源进行爬取、存储、缓存、下载、镜像等行为。因此即便未来拿到 aweme.dy.video_search，也只能把它评估为“发现 / 展示候选”的可选 Search Provider，不能据此推导出“允许下载并做深度素材分析”的权限。

结论：

- 官方 aweme.dy.video_search 保留为未来可插拔 Search Provider。
- 当前核心研究链不依赖该权限。
- 正式生产启用任何 Douyin Search / MediaFetcher Provider 前，需要按当时平台规则再次做权限与合规核查。
- 搜索权限、视频公开指标权限、媒体下载 / 缓存权限、深度分析权限必须分别判断，禁止混为一谈。

## 4. 数据流

```text
Deep Research
  ├─ Product Evidence
  │    ├─ 官网 / 商品页 / 公开资料
  │    ├─ 产品身份 Gate
  │    └─ Evidence → Product Truth Review
  │
  └─ Market Video Research
       ├─ 品类 / 同类关键词
       ├─ Douyin Search Provider
       ├─ 高点赞 / 时间筛选
       ├─ 用户明确选择
       ├─ MarketVideoMediaFetcher
       ├─ immutable video Artifact
       └─ existing ReferenceVideoAnalysisService
             → ReferenceVideoProfile
             → Creative / Script / Director
```

## 5. 失败隔离

- 当前产品 Evidence = 0，不得取消已发现的竞品视频候选。
- 抖音未登录 / 风控，不得拖垮官网和公开网页 Product Evidence。
- 竞品视频分析失败，只更新该候选状态，不污染其他候选或 Product Truth。
- 未选择的候选不得下载。
- ReferenceVideoProfile 仍受 STRUCTURE_AND_METHOD_ONLY copy guard 约束。

## 6. 当前开发验证

已完成：

- TypeScript typecheck PASS
- Research / Research UI 定向测试 PASS
- 全量单元测试 300/300 PASS
- License Gate PASS（packages=38，external_runtimes=7）
- 本机真实 dy-cli Provider 探测正确返回 LOGIN_REQUIRED（当前账号尚未登录），没有伪造搜索成功

尚需：

- 完成一次正常抖音账号登录后的真实搜索 E2E
- 选择一条公开视频并跑通 MediaFetcher → ReferenceVideoProfile 的真实 E2E
- 最终 License Gate / build / E2E 回归
