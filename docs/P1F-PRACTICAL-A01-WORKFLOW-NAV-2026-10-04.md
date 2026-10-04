# P1 Final 实用化优化 A-01 — Workflow Navigation State

日期：2026-10-04  
状态：PASS

## 目标

把“当前页面要做什么”和“项目应该从哪里继续”拆成两个独立概念，避免 Project.status 覆盖历史页面的真实任务。

## 实现

新增：

- `src/application/services/workflow-navigation.ts`
- `tests/workflow-navigation.test.ts`

主要修改：

- `src/web/workbench-ui.ts`
- `src/web/server.ts`
- `tests/review-actions-ui.test.ts`
- `tests/timeline-ui.test.ts`

核心规则：

- 当前页面使用 `CURRENT`。
- 全局恢复位置使用 `RESUME / 继续`。
- 联网研究保持可选，但打开时可成为当前页。
- 已确认 Timeline / FinalAssembly 优先于可能滞后的 Project.status。
- UI 不再自行维护第二套 `workflowProgressIndex / recommendedNextStep`。

## 自动验证

- `npm test`: **257/257 PASS**
- `npm run typecheck`: **PASS**
- `npm run license:gate`: **PASS**
- `npx prisma validate`: **PASS**

## 真实浏览器验证

### 广西金秀康瑶堂瑶药 · 产品输入页

确认：

- 当前位置：产品输入
- 本页任务：检查或更新产品资料
- 继续主流程：视频生成
- 恢复说明：运行生成前检查并确认本次生成
- 浏览器 Console：0 error / 0 warning

### Tonemay 耳机宣传 · 视频剪辑页

确认：

- 当前位置：视频剪辑
- 本页任务：调整并确认视频剪辑方案
- 当前 Timeline 已确认时，“成片与发布”标记为继续
- 继续主流程：成片与发布
- 浏览器 Console：0 error / 0 warning

## 结论

A-01 Gate 通过。下一项进入 A-02：将 Timeline / Final 等未满足条件的深链访问从原始 JSON 错误改为产品化阻塞页面。
