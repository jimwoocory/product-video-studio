# P1 Final 实用化优化 B-06 — Final QC / 发布前质量检查

日期：2026-10-05  
状态：PASS

## 目标

在“接受成片”和“创建发布包”之前，对当前最终 MP4 做自动发布前质检。

规则：

- BLOCK：不能接受成片、不能创建发布包
- WARN：允许继续，但必须显示风险
- PASS：自动检查项通过

质检主要使用 FFprobe / FFmpeg + Timeline / Review 持久化元数据，不新增 LLM 调用，不消耗 Dreamina 积分。

## 自动检查项

- Artifact SHA256 完整性
- 文件可播放性
- 视频轨
- 时长
- 分辨率
- 画幅比例
- 音轨
- 长静音
- 黑帧 / 黑屏
- 冻结帧
- 字幕 / CTA 文字完整性与时间边界
- 字幕 / CTA 安全区风险
- 产品视觉一致性既有审片证据

## Gate

新增：

- `GET /api/projects/:id/final/qc`
- `POST /api/projects/:id/final/qc`

并接入：

- `POST /api/projects/:id/final/accept`
- `POST /api/projects/:id/publish/packages`

即使绕过网页直接调 API，QC BLOCK 也不能发布。

## 持久化

每次 QC 生成独立、不可变的 JSON Artifact：

`final-qc/<assembly>-<report-hash>.json`

报告绑定：

- assemblyId
- final artifact id
- final artifact SHA256
- timeline id/hash
- evaluator version

换成片后旧报告不会误用于新成片；重复 QC 不覆盖历史报告。

## 自动测试

最终 Gate：

- `npm test`: **287/287 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
- `npx prisma validate`: **PASS**
- `npm run test:e2e`: **9/9 PASS**

Browser E2E 使用隔离 SQLite / PROJECTS_ROOT，本地 FFmpeg 现场生成带音轨 MP4，实际走通：

未 QC → 运行 QC → WARN → 接受成片 → 发布设置开放。

## 真实 Tonemay 成片验证

项目：
`3b11fd7e-29d0-48ba-8dd6-1a6477cf37bc`

结果：

- overall: **WARN**
- BLOCK: **0**

### PASS

1. 文件完整性
2. 文件可播放
3. 视频轨
4. 时长：15.00s / 预期 15.00s
5. 分辨率：720×1280
6. 画幅：9:16
7. 音轨存在
8. 无明显黑屏
9. 无明显冻结
10. 无明显长静音
11. 7 条字幕/CTA 无异常字符或时间越界

### WARN

1. 字幕 / CTA 安全区
   - 1 条 9:16 底部 CTA
   - 建议人工确认短视频平台底部 UI 遮挡区

2. 产品视觉一致性
   - 0/1 入选镜头有持久化视觉审片证据
   - 需要人工确认产品身份与外观一致性

因此该真实成片不会被 QC 阻断，但发布前会持续显示这两个风险。

Browser Console：

- 0 error
- 0 warning

## 结论

B-06 PASS。

下一步：B-03 积分 / 预算账本。
