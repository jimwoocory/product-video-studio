# P1 Final 实用化优化 A-04 — Browser E2E

日期：2026-10-05  
状态：PASS

## 目标

增加真实浏览器级回归，覆盖单元测试无法发现的页面交互、深链阻塞、素材选择和 Research 审计展示问题，同时保证测试不会调用真实付费 Dreamina。

## 实现

新增 / 修改：

- `playwright.config.mjs`
- `tests/e2e/support/e2e-server.mjs`
- `tests/e2e/project-navigation.spec.mjs`
- `tests/e2e/blocked-steps.spec.mjs`
- `tests/e2e/research-quality.spec.mjs`
- `tests/e2e/material-picker.spec.mjs`
- `package.json`
- `package-lock.json`
- `dependency-allowlist.json`
- `THIRD_PARTY_NOTICES.md`

新增依赖：

- `@playwright/test@1.63.0`
- transitive: `playwright@1.63.0`, `playwright-core@1.63.0`

## 隔离策略

- 独立 SQLite：`prisma/e2e.db`
- 独立 PROJECTS_ROOT：`.tmp/e2e-projects`
- `NODE_ENV=test`
- Smart Worker disabled
- Local TTS disabled
- 使用系统已安装 Chrome，不下载 Playwright 浏览器
- Playwright video recording 关闭，保留 trace + screenshot
- Dreamina Provider：
  - `probe` 返回测试态 NOT_FOUND
  - `submit` / `status` / `download` / `reconcileSubmission` 全部硬阻断为 `E2E_EXTERNAL_CALL_BLOCKED`
- 不读取生产项目数据库
- 不提交真实付费任务

## 浏览器用例

### 1. Workflow Navigation

验证：

- 历史产品输入页保持“本页任务：检查或更新产品资料”
- 全局恢复位置独立指向视频生成
- 联网研究打开后只改变当前页，不篡改恢复位置
- 每页只有一个 CURRENT

### 2. Blocked Steps

验证：

- Timeline 深链在条件不足时显示中文可操作状态页
- Final 深链使用相同产品化 Gate
- 页面 HTTP 200，不产生浏览器资源错误
- 页面不出现 `VALIDATION_ERROR` 或内部英文异常
- API 同类错误继续保持 JSON 400 契约

### 3. Research Quality

验证：

- 显示“搜索质量与淘汰记录”
- 显示 2 轮恢复搜索审计
- Bilibili 首页显示为淘汰候选
- 淘汰原因“平台首页且未命中产品身份，直接淘汰”可见
- 第二轮加强搜索 query 可追溯

### 4. Material Picker

真实浏览器执行：

- 新建项目
- 进入产品输入页
- 点击“选择产品图片”
- FileChooser 返回并选入 PNG
- 图片进入待上传预览
- 删除图片恢复空状态
- 再次选择图片成功
- 点击“选择 Logo”
- Logo 进入预览
- 删除 Logo 恢复空状态

该用例专门覆盖此前“选择产品图片 / Logo 点击无反应”的浏览器级回归风险。

## Gate

最终执行：

- `npm test`: **271/271 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
  - packages=38
  - external_runtimes=5
- `npx prisma validate`: **PASS**
- `npm run test:e2e`: **6/6 PASS**

## 结论

A-04 PASS。

下一步：A-06 Task Center。任务中心 V1 只聚合现有持久化真值，不建立第二套 TaskRecord，不提供会导致重复付费或重复发布的通用 Retry。
