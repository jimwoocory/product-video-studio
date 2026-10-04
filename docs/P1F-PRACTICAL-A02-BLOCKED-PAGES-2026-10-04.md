# P1 Final 实用化优化 A-02 — Blocked Step 页面

日期：2026-10-04  
状态：PASS

## 目标

把普通网页深链的“条件未满足”从原始 HTTP JSON / 英文内部异常，改成可理解、可操作、可恢复的中文状态页；API JSON 契约保持不变。

## 实现

新增：

- `src/application/services/workflow-step-access.ts`
- `src/web/blocked-step-ui.ts`
- `tests/workflow-step-access.test.ts`

修改：

- `src/application/services/timeline-service.ts`
- `src/web/server.ts`
- `src/web/workbench-ui.ts`

核心规则：

- Timeline 提供只读 `readiness()`，不创建 Timeline 即可检查当前可进入性。
- Timeline 深链未满足条件时显示中文阻塞页和明确返回动作。
- Final 深链先复用 Timeline readiness，避免被历史/旧 DRAFT Timeline 误导。
- 已知的阻塞状态页返回 HTTP 200，避免浏览器把正常状态页记录为资源加载错误。
- `/api/**` 仍保留 JSON 4xx/5xx。
- 其他浏览器 GET 的 DomainValidationError / 未知异常由安全 HTML fallback 接管，不直接裸露 JSON。
- 技术 reasonCode / detail 只放高级信息。

## 自动验证

- `npm test`: **262/262 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
- `npx prisma validate`: **PASS**

## 真实浏览器验证

项目：广西金秀康瑶堂瑶药

### /timeline

确认：

- 页面标题：视频剪辑
- 状态：视频剪辑暂时不能打开
- 原因：当前还没有已采用的视频可进入剪辑
- 动作：返回视频生成页，至少采用 1 个生成结果
- “返回正确步骤” href 指向当前项目 /generate
- 页面不存在 `VALIDATION_ERROR`
- Browser Console：0 error / 0 warning

### /final

项目存在历史 DRAFT Timeline，但不符合当前可用剪辑条件。

确认：

- Final access 不采用历史 DRAFT Timeline 作为当前真值
- 页面提示“当前还没有可用于最终渲染的有效剪辑方案”
- 直接要求回到视频生成 / 审片
- “返回正确步骤” href 指向当前项目 /generate
- Browser Console：0 error / 0 warning

## 结论

A-02 Gate 通过。下一项进入 A-03：Research 搜索候选相关性重排、Product Identity Gate、两轮恢复搜索和淘汰审计。
